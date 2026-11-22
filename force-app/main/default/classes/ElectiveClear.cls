/**
 * End-of-season Clear (electives slice E10; repo ADR 0018 choices 55 to 58; Greg's decisions
 * 48.4 and 59; desktop purgeElectiveSeason.js and the Director Guide §11): the season's elective
 * runs go, with their choices and seats, and so does every camper no remaining run uses. Elective
 * sets, offerings and linked choices stay for next summer. The whole season, or one week.
 *
 * The screen draws the summer from picture(): each week's campers, choices, seats and runs, and
 * what stays. Clear is exact: it removes only what that picture showed. The picture carries a
 * stamp of every run's revision and the season's camper count; Clear holds the season's runs,
 * draws the picture again, and refuses if the stamp moved ("Something changed …"), so a save made
 * since is never cleared unseen. It also refuses while a run in what it would clear is still
 * Committed (being worked on, not final), naming it.
 *
 * In user mode. Deleted for good, out of the Recycle Bin too (plan §3, "Real deletion"; the
 * desktop's "Can't be undone"). A run's choices and seats go with it (master-detail), so the
 * rows written are the runs and the campers, whatever the number of seats.
 */
public with sharing class ElectiveClear {
  public static final String COMMITTED = 'Committed';

  public class Picture {
    @AuraEnabled
    public String seasonName;
    // Every camper in the season: what the whole season's Clear removes.
    @AuraEnabled
    public Integer campers = 0;
    @AuraEnabled
    public List<WeekCounts> weeks = new List<WeekCounts>();
    // What stays: the sets, offerings and linked choices, by name.
    @AuraEnabled
    public List<String> sets = new List<String>();
    @AuraEnabled
    public List<String> offerings = new List<String>();
    @AuraEnabled
    public List<String> linked = new List<String>();
    // Every run's revision and the season's camper count: Clear checks nothing moved since.
    @AuraEnabled
    public String stamp;
    // A Clear too big for one request, going on in the background (ElectiveBigSave): rows gone of
    // how many, and why it stopped, when it did. Blank when there is none.
    @AuraEnabled
    public Decimal saveDone;
    @AuraEnabled
    public Decimal saveTotal;
    @AuraEnabled
    public String saveProblem;
  }

  public class WeekCounts {
    @AuraEnabled
    public Id weekId;
    @AuraEnabled
    public String name;
    // Campers with choices this week; and those in no other week's run (what this week's Clear
    // removes).
    @AuraEnabled
    public Integer campers = 0;
    @AuraEnabled
    public Integer campersOnlyHere = 0;
    // One camper's name, for the picture ("Eli K. …").
    @AuraEnabled
    public String camperName;
    @AuraEnabled
    public Integer choices = 0;
    @AuraEnabled
    public Integer seats = 0;
    @AuraEnabled
    public Integer runs = 0;
    @AuraEnabled
    public Integer finals = 0;
    @AuraEnabled
    public Datetime lastFinalized;
    // Runs still Committed (being worked on): Clear refuses while one is in what it removes.
    @AuraEnabled
    public List<String> working = new List<String>();
  }

  public class ClearRequest {
    public Id seasonId;
    // Blank: the whole season.
    public Id weekId;
    public String stamp;
  }

  public class Result {
    @AuraEnabled
    public Integer runs = 0;
    @AuraEnabled
    public Integer campers = 0;
    @AuraEnabled
    public Picture picture;
  }

  /** What the season holds now, week by week, and what stays. Nine queries, any size. */
  public static Picture picture(Id seasonId) {
    Picture result = new ElectiveClearReading(seasonId).picture;
    readStays(result, seasonId);
    return result;
  }

  /** Clear the whole season, or one week: exactly what the picture with this stamp showed. */
  public static Result clear(ClearRequest request) {
    if (request == null || request.seasonId == null) {
      throw new ShoreshException('Nothing to clear.');
    }
    // Hold the season's runs: a save to one of them waits, and sees them gone.
    List<ElectiveRun__c> held = [
      SELECT Id
      FROM ElectiveRun__c
      WHERE Season__c = :request.seasonId
      WITH USER_MODE
      FOR UPDATE
    ];
    ElectiveClearReading now = new ElectiveClearReading(request.seasonId);
    refuseIfMoved(now, held.size(), request.stamp);
    List<ElectiveRun__c> going = now.runsIn(request.weekId);
    List<Camper__c> campers = now.campersGoing(request.weekId);
    if (going.isEmpty() && campers.isEmpty()) {
      throw new ShoreshException('Nothing to clear.');
    }
    refuseWorking(now.picture, request.weekId);
    refuseClearing(now.picture);
    Integer under = now.rowsUnder(going);
    // Every row counts twice: deleted, then emptied from the Recycle Bin.
    if (
      !ElectiveSeatSaves.fitsOneSave(
        2 * (under + going.size() + campers.size())
      )
    ) {
      // ADR 0018 choice 59: the choices and seats go in the background, then the runs and campers.
      ElectiveBigSave.begin(new ClearRows(going, campers, under));
      Result started = new Result();
      started.picture = picture(request.seasonId);
      return started;
    }
    deleteForGood(going, campers);
    Result result = new Result();
    result.runs = going.size();
    result.campers = campers.size();
    result.picture = picture(request.seasonId);
    return result;
  }

  /** The picture Clear was asked from is not the season now: refused, nothing removed. */
  private static void refuseIfMoved(
    ElectiveClearReading now,
    Integer held,
    String stamp
  ) {
    if (now.picture.stamp != stamp || now.runs.size() != held) {
      throw new ShoreshException(
        'Something changed since this was drawn. Look again, then clear.'
      );
    }
  }

  private static void refuseClearing(Picture picture) {
    if (picture.saveTotal != null && picture.saveProblem == null) {
      throw new ShoreshException(
        AgentRefusal.withFix(
          'Clearing is still going (' +
            picture.saveDone.intValue().format() +
            ' of ' +
            picture.saveTotal.intValue().format() +
            ').',
          'Look again when it\'s done.'
        )
      );
    }
  }

  /**
   * A large season's Clear in the background: each part deletes the next choices or seats of the
   * runs going and empties them from the Recycle Bin at once, so none are left there; the last
   * part removes the runs and campers as a small Clear does.
   */
  public with sharing class ClearRows extends ElectiveBigSave.Work {
    private List<Id> camperIds = new List<Id>();

    public ClearRows(
      List<ElectiveRun__c> going,
      List<Camper__c> campers,
      Integer under
    ) {
      for (ElectiveRun__c run : going) {
        runIds.add(run.Id);
      }
      for (Camper__c camper : campers) {
        camperIds.add(camper.Id);
      }
      total = under;
      emptiesRecycleBin = true;
    }

    public override Integer write(Integer most) {
      List<SObject> rows = new List<SObject>();
      rows.addAll(
        [
          SELECT Id
          FROM Assignment__c
          WHERE ElectiveRun__c IN :runIds
          WITH USER_MODE
          ORDER BY Id
          LIMIT :most
        ]
      );
      if (rows.size() < most) {
        Integer left = most - rows.size();
        rows.addAll(
          [
            SELECT Id
            FROM Preference__c
            WHERE ElectiveRun__c IN :runIds
            WITH USER_MODE
            ORDER BY Id
            LIMIT :left
          ]
        );
      }
      if (!rows.isEmpty()) {
        Database.delete(rows, AccessLevel.USER_MODE);
        Database.emptyRecycleBin(rows);
      }
      return rows.size();
    }

    public override void finish() {
      List<ElectiveRun__c> runs = new List<ElectiveRun__c>();
      for (Id runId : runIds) {
        runs.add(new ElectiveRun__c(Id = runId));
      }
      List<Camper__c> campers = new List<Camper__c>();
      for (Id camperId : camperIds) {
        campers.add(new Camper__c(Id = camperId));
      }
      deleteForGood(runs, campers);
    }
  }

  /** The runs (their choices and seats with them) and the campers, out of the Recycle Bin too. */
  private static void deleteForGood(
    List<ElectiveRun__c> going,
    List<Camper__c> campers
  ) {
    // Runs first: their seats and choices point at the campers.
    List<SObject> gone = new List<SObject>();
    gone.addAll(going);
    gone.addAll(campers);
    Savepoint before = Database.setSavepoint();
    try {
      Database.delete(going, AccessLevel.USER_MODE);
      Database.delete(campers, AccessLevel.USER_MODE);
      Database.emptyRecycleBin(gone);
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  private static void refuseWorking(Picture picture, Id weekId) {
    List<String> working = new List<String>();
    for (WeekCounts week : picture.weeks) {
      if (weekId == null || week.weekId == weekId) {
        working.addAll(week.working);
      }
    }
    if (!working.isEmpty()) {
      working.sort();
      throw new ShoreshException(
        '"' +
          String.join(working, '", "') +
          (working.size() == 1 ? '" is' : '" are') +
          ' still being worked on. Finalize first, then clear.'
      );
    }
  }

  /** What stays: the sets, the offerings (by activity) and the linked choices. */
  private static void readStays(Picture picture, Id seasonId) {
    for (ElectiveSet__c item : [
      SELECT Name
      FROM ElectiveSet__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Name, Id
    ]) {
      picture.sets.add(item.Name);
    }
    for (Offering__c offering : [
      SELECT Activity__r.Name
      FROM Offering__c
      WHERE ElectiveSet__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Activity__r.Name, Id
    ]) {
      picture.offerings.add(offering.Activity__r.Name);
    }
    for (LinkedChoice__c choice : [
      SELECT Name
      FROM LinkedChoice__c
      WHERE ElectiveSet__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Name, Id
    ]) {
      picture.linked.add(choice.Name);
    }
  }
}
