/**
 * A save of elective seats too big for one Salesforce request (more than its 10,000 rows): a
 * large camp's Assign, Assign again, Finalize or end-of-season Clear (repo ADR 0018 choice 59).
 * Everything is checked first, in the request, exactly as a small save checks it; only the writing
 * goes on in the background, a part at a time (Batch Apex: a part is its own transaction with its
 * own limits, and there is no cap on how many parts, as chained jobs have on some orgs).
 *
 * The run carries the progress (SaveDone__c of SaveTotal__c), so the screen and an AI can show it,
 * and every other save of the run waits until it is done (ElectiveRunState.refuseUnlessCurrent).
 * The rows are written in a fixed order, so the same save writes the same rows. A part that fails
 * stops the save: the run keeps how far it got and why (SaveProblem__c), shown to the person, and
 * nothing after it is written. A part that died without a word (a Salesforce limit can't be caught)
 * is found by the next one, whose count no longer matches, and stops the save the same way. In user
 * mode, as the person who saved.
 */
public with sharing class ElectiveBigSave implements Database.Batchable<Object>, Database.Stateful {
  // Rows one part writes: under 10,000 with room for the run's own updates. Clear's rows count
  // twice (deleted, then emptied from the Recycle Bin), so its parts write half as many.
  @TestVisible
  private static Integer part = 9000;
  // A test holds the save here instead of starting it, and runs its parts itself (a test can run
  // only one part of a batch).
  @TestVisible
  private static Boolean holdInTest = false;
  @TestVisible
  private static ElectiveBigSave held;

  /** What a big save writes. Each method runs inside one part's transaction. */
  public abstract class Work {
    /** The runs that carry the progress. */
    public List<Id> runIds = new List<Id>();
    /** How many rows in all. */
    public Integer total = 0;
    /** Writes up to most rows, the next in order; returns how many it wrote. */
    public abstract Integer write(Integer most);
    /** After every row is written, in the last part: the run's own fields, the save cleared. */
    public abstract void finish();
    /** A part failed and the save stopped (best effort: undo what the start made). */
    public virtual void stopped() {
    }
  }

  private Work work;
  private Integer most;
  private Integer parts;
  private Integer done = 0;
  private Boolean stopped = false;

  private ElectiveBigSave(Work work, Integer most) {
    this.work = work;
    this.most = most;
    this.parts = Math.max(1, (Integer) Math.ceil(work.total / (Decimal) most));
  }

  /** How many rows one part of this kind of save writes. */
  public static Integer partSize(Boolean emptiesRecycleBin) {
    return emptiesRecycleBin ? part / 2 : part;
  }

  /**
   * Marks the runs as saving (0 of total, no problem) and starts the background save. The caller
   * has checked everything and holds the runs.
   */
  public static void begin(Work work, Boolean emptiesRecycleBin) {
    ElectiveBigSave save = new ElectiveBigSave(
      work,
      partSize(emptiesRecycleBin)
    );
    Id jobId;
    if (Test.isRunningTest() && holdInTest) {
      held = save;
    } else {
      // It starts once this request is saved, so it sees the marks below.
      jobId = Database.executeBatch(save, 1);
    }
    List<ElectiveRun__c> marks = new List<ElectiveRun__c>();
    for (Id runId : work.runIds) {
      marks.add(
        new ElectiveRun__c(
          Id = runId,
          SaveDone__c = 0,
          SaveTotal__c = work.total,
          SaveProblem__c = null,
          SaveJob__c = jobId
        )
      );
    }
    Database.update(marks, AccessLevel.USER_MODE);
  }

  // Salesforce's own word for a background job that is over, however it ended.
  private static final Set<String> JOB_OVER = new Set<String>{
    'Completed',
    'Failed',
    'Aborted'
  };

  /**
   * Runs read as saving whose background job Salesforce has already ended (cancelled in Setup, or
   * stopped by a limit before it could say so): shown as stopped (SaveProblem__c, in memory), so
   * the run is never "still saving" for ever and the next save goes ahead and clears it. A run is
   * read again first, so a save that just finished is never taken for one that stopped.
   */
  public static void settle(List<ElectiveRun__c> runs) {
    Set<String> jobIds = new Set<String>();
    for (ElectiveRun__c run : runs) {
      if (isSaving(run) && run.SaveJob__c != null) {
        jobIds.add(run.SaveJob__c);
      }
    }
    if (jobIds.isEmpty()) {
      return;
    }
    // System mode: a job's status only, by the Id this save kept; AsyncApexJob has no user-mode
    // access a scheduler is granted.
    Set<String> over = new Set<String>();
    for (AsyncApexJob job : [
      SELECT Id, Status
      FROM AsyncApexJob
      WHERE Id IN :jobIds
      WITH SYSTEM_MODE
    ]) {
      if (JOB_OVER.contains(job.Status)) {
        over.add(String.valueOf(job.Id).left(18));
      }
    }
    if (over.isEmpty()) {
      return;
    }
    Map<Id, ElectiveRun__c> now = new Map<Id, ElectiveRun__c>(
      [
        SELECT Id, SaveTotal__c, SaveProblem__c, SaveJob__c
        FROM ElectiveRun__c
        WHERE SaveJob__c IN :over
        WITH USER_MODE
      ]
    );
    for (ElectiveRun__c run : runs) {
      ElectiveRun__c fresh = now.get(run.Id);
      if (fresh != null && isSaving(fresh) && over.contains(fresh.SaveJob__c)) {
        run.SaveProblem__c = 'Salesforce stopped it before the end.';
      }
    }
  }

  private static Boolean isSaving(ElectiveRun__c run) {
    return run.SaveTotal__c != null && run.SaveProblem__c == null;
  }

  /** One item per part: a part's rows are the next ones in order, whichever item it is. */
  public Iterable<Object> start(Database.BatchableContext context) {
    List<Object> result = new List<Object>();
    for (Integer i = 0; i < parts; i++) {
      result.add(i);
    }
    return result;
  }

  public void execute(Database.BatchableContext context, List<Object> scope) {
    if (stopped) {
      return;
    }
    Savepoint before = Database.setSavepoint();
    try {
      List<ElectiveRun__c> runs = holdRuns();
      if (runs == null) {
        return;
      }
      Integer now = done + work.write(most);
      mark(runs, now, null);
      done = now;
    } catch (Exception e) {
      Database.rollback(before);
      stop(ScreenErrors.words(e));
    }
  }

  public void finish(Database.BatchableContext context) {
    if (stopped) {
      return;
    }
    Savepoint before = Database.setSavepoint();
    try {
      if (holdRuns() == null) {
        return;
      }
      if (done < work.total) {
        // The rows ran out early: something changed under the save. Never finished quietly.
        throw new ShoreshException('Something changed while it was saving.');
      }
      work.finish();
    } catch (Exception e) {
      Database.rollback(before);
      stop(ScreenErrors.words(e));
    }
  }

  /**
   * The runs, held; null when none is left (gone since). Refused when the count on a run isn't
   * this save's: a part died without a word, or another save took over.
   */
  private List<ElectiveRun__c> holdRuns() {
    List<ElectiveRun__c> runs = [
      SELECT Id, SaveDone__c, SaveTotal__c, SaveProblem__c
      FROM ElectiveRun__c
      WHERE Id IN :work.runIds
      WITH USER_MODE
      ORDER BY Id
      FOR UPDATE
    ];
    if (runs.isEmpty()) {
      stopped = true;
      return null;
    }
    for (ElectiveRun__c run : runs) {
      if (
        run.SaveTotal__c != work.total ||
        run.SaveDone__c != done ||
        run.SaveProblem__c != null
      ) {
        throw new ShoreshException(
          'A part of it couldn\'t be saved, so the rest wasn\'t.'
        );
      }
    }
    return runs;
  }

  private void stop(String why) {
    stopped = true;
    try {
      work.stopped();
    } catch (Exception e) {
      // Undoing the start is a courtesy; the problem below is what the person needs to see.
      ErrorCodes.said('', ErrorCodes.detailOf(e));
    }
    List<ElectiveRun__c> runs = [
      SELECT Id, Revision__c
      FROM ElectiveRun__c
      WHERE Id IN :work.runIds
      WITH USER_MODE
    ];
    List<ElectiveRun__c> marks = new List<ElectiveRun__c>();
    for (ElectiveRun__c run : runs) {
      // The rows written so far stay: the revision moves on, so a screen opened before can't
      // save over them unseen (SeenSaves).
      marks.add(
        new ElectiveRun__c(
          Id = run.Id,
          SaveDone__c = done,
          SaveProblem__c = why.left(255),
          Revision__c = (run.Revision__c == null ? 0 : run.Revision__c) + 1
        )
      );
    }
    Database.update(marks, AccessLevel.USER_MODE);
  }

  private void mark(List<ElectiveRun__c> runs, Integer count, String problem) {
    List<ElectiveRun__c> marks = new List<ElectiveRun__c>();
    for (ElectiveRun__c run : runs) {
      marks.add(
        new ElectiveRun__c(
          Id = run.Id,
          SaveDone__c = count,
          SaveProblem__c = problem
        )
      );
    }
    Database.update(marks, AccessLevel.USER_MODE);
  }

  /** The fields that end a big save on a run (set with the run's own in Work.finish). */
  public static ElectiveRun__c ended(ElectiveRun__c changes) {
    changes.SaveDone__c = null;
    changes.SaveTotal__c = null;
    changes.SaveJob__c = null;
    changes.SaveProblem__c = null;
    return changes;
  }

  // ---------------------------------------------------------------- rows given in advance

  /**
   * Rows known before it starts (Assign's difference, Finalize's names): deletes (emptied from the
   * Recycle Bin too), then updates, then inserts, each in the order given.
   */
  public abstract class GivenRows extends Work {
    private List<Id> deletes;
    private List<SObject> updates;
    private List<SObject> inserts;
    private Integer next = 0;

    public GivenRows(
      Id runId,
      List<Id> deletes,
      List<SObject> updates,
      List<SObject> inserts
    ) {
      runIds.add(runId);
      this.deletes = deletes;
      this.updates = updates;
      this.inserts = inserts;
      total = deletes.size() + updates.size() + inserts.size();
    }

    public override Integer write(Integer most) {
      Integer upTo = Math.min(next + most, total);
      List<SObject> gone = new List<SObject>();
      List<SObject> changed = new List<SObject>();
      List<SObject> added = new List<SObject>();
      for (Integer i = next; i < upTo; i++) {
        if (i < deletes.size()) {
          gone.add(deletes[i].getSObjectType().newSObject(deletes[i]));
        } else if (i < deletes.size() + updates.size()) {
          changed.add(updates[i - deletes.size()]);
        } else {
          added.add(inserts[i - deletes.size() - updates.size()].clone(false));
        }
      }
      ElectiveSeatSaves.deleteForGood(gone);
      Database.update(changed, true, AccessLevel.USER_MODE);
      Database.insert(added, true, AccessLevel.USER_MODE);
      Integer wrote = upTo - next;
      next = upTo;
      return wrote;
    }
  }
}
