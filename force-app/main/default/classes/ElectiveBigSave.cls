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
 * is undone whole, so the end finds fewer rows written than the save had and stops it the same
 * way; a job Salesforce ends outright is found when the run is read (progressOf). In user mode, as
 * the person who saved.
 *
 * Everything about a save's progress is here: reading it (progressOf, clearingOf), whether it is
 * still saving, its "9,000 of 12,000", and ending it with the run's revision moved on (endOn).
 */
public with sharing class ElectiveBigSave implements Database.Batchable<Object>, Database.Stateful {
  // Rows one part writes: under 10,000 with room for the run's own updates. Rows emptied from the
  // Recycle Bin count twice (deleted, then emptied), so those parts write half as many.
  @TestVisible
  private static Integer part = 9000;
  // A test holds the save here instead of starting it, and runs its parts itself (a test can run
  // only one part of a batch).
  @TestVisible
  private static Boolean holdInTest = false;
  @TestVisible
  private static ElectiveBigSave held;

  private static final String PART_LOST = 'A part of it couldn\'t be saved, so the rest wasn\'t.';
  private static final String ENDED = 'Salesforce stopped it before the end.';
  // Salesforce's own word for a background job that is over, however it ended.
  private static final Set<String> JOB_OVER = new Set<String>{
    'Completed',
    'Failed',
    'Aborted'
  };

  private Work work;
  private Integer most;
  private Integer parts;
  private Integer done = 0;
  private Boolean stopped = false;

  /** What a big save writes. Each method runs inside one part's transaction. */
  public abstract class Work {
    /** The runs that carry the progress. */
    public List<Id> runIds = new List<Id>();
    /** How many rows in all. */
    public Integer total = 0;
    /** Its deletes are emptied from the Recycle Bin too, so its parts write half as many. */
    public Boolean emptiesRecycleBin = false;
    /** Writes up to most rows, the next in order; returns how many it wrote. */
    public abstract Integer write(Integer most);
    /** After every row is written, in the last part: the run's own fields, the save cleared. */
    public abstract void finish();
    /** A part failed and the save stopped (best effort: undo what the start made). */
    public virtual void stopped() {
      return;
    }
  }

  /**
   * How far a big save of a run has got (done of total rows), and why it stopped, when it did; as
   * the screen and an AI are given it. A run with no big save has none (null).
   */
  public class Progress {
    @AuraEnabled
    public Decimal done;
    @AuraEnabled
    public Decimal total;
    @AuraEnabled
    public String problem;

    private Progress(ElectiveRun__c run) {
      done = run.SaveDone__c;
      total = run.SaveTotal__c;
      problem = run.SaveProblem__c;
    }

    /** Still being written in the background: it has not stopped. */
    public Boolean isSaving() {
      return problem == null;
    }

    /** "9,000 of 12,000". */
    public String count() {
      return done.intValue().format() + ' of ' + total.intValue().format();
    }
  }

  private ElectiveBigSave(Work work) {
    this.work = work;
    this.most = work.emptiesRecycleBin ? part / 2 : part;
    this.parts = Math.max(1, (Integer) Math.ceil(work.total / (Decimal) most));
  }

  /**
   * Marks the runs as saving (0 of total, no problem) and starts the background save. The caller
   * has checked everything and holds the runs.
   */
  public static void begin(Work work) {
    ElectiveBigSave save = new ElectiveBigSave(work);
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
        // A part died without a word (a limit can't be caught): Salesforce undid its rows and
        // its count, so the parts ran out before the rows did. Never finished quietly.
        throw new ShoreshException(PART_LOST);
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
        throw new ShoreshException(PART_LOST);
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
          Revision__c = after(run.Revision__c)
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

  /**
   * The run moved on: saved with the changes given, its revision one past the one read, and a big
   * save's progress, or why it stopped, cleared. In user mode.
   */
  public static void endOn(ElectiveRun__c changes, Decimal revision) {
    changes.Revision__c = after(revision);
    changes.SaveDone__c = null;
    changes.SaveTotal__c = null;
    changes.SaveJob__c = null;
    changes.SaveProblem__c = null;
    Database.update(changes, AccessLevel.USER_MODE);
  }

  private static Decimal after(Decimal revision) {
    return (revision == null ? 0 : revision) + 1;
  }

  // ---------------------------------------------------------------- reading progress

  /**
   * A run's big save as it is read (null when none). The run was read with its SaveDone__c,
   * SaveTotal__c, SaveProblem__c and SaveJob__c.
   */
  public static Progress progressOf(ElectiveRun__c run) {
    if (run.SaveTotal__c == null) {
      return null;
    }
    Progress result = new Progress(run);
    if (result.isSaving() && run.SaveJob__c != null && ended(run)) {
      result.problem = ENDED;
    }
    return result;
  }

  /**
   * The season's Clear in parts, under way or stopped (null when none), from its runs: every run it
   * clears carries the same count. Only Clear saves a final run in parts; a committed run's is its
   * own Assign or Finalize.
   */
  public static Progress clearingOf(List<ElectiveRun__c> runs) {
    for (ElectiveRun__c run : runs) {
      if (
        run.SaveTotal__c != null &&
        run.Status__c != ElectiveClear.COMMITTED
      ) {
        return progressOf(run);
      }
    }
    return null;
  }

  /**
   * A run read as saving whose background job Salesforce has already ended (cancelled in Setup, or
   * stopped by a limit before it could say so): shown as stopped, so the run is never "still
   * saving" for ever and the next save goes ahead and clears it. The run is read again first, so a
   * save that just finished is never taken for one that stopped.
   */
  private static Boolean ended(ElectiveRun__c run) {
    // System mode: a job's status only, by the Id this save kept; AsyncApexJob has no user-mode
    // access a scheduler is granted.
    List<AsyncApexJob> jobs = [
      SELECT Status
      FROM AsyncApexJob
      WHERE Id = :run.SaveJob__c
      WITH SYSTEM_MODE
    ];
    if (jobs.isEmpty() || !JOB_OVER.contains(jobs[0].Status)) {
      return false;
    }
    List<ElectiveRun__c> now = [
      SELECT SaveTotal__c, SaveProblem__c, SaveJob__c
      FROM ElectiveRun__c
      WHERE Id = :run.Id
      WITH USER_MODE
    ];
    return !now.isEmpty() &&
      now[0].SaveTotal__c != null &&
      new Progress(now[0]).isSaving() &&
      now[0].SaveJob__c == run.SaveJob__c;
  }
}
