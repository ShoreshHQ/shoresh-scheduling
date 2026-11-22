/**
 * The season read once for end-of-season Clear (electives slice E10; repo ADR 0018 choices 55 to
 * 59): its weeks, runs, campers, choices and seats as ElectiveClear's picture, what the whole
 * season's or one week's Clear removes, and the stamp Clear checks. In user mode, in a fixed
 * number of queries whatever the season's size; never sorted or filtered on a camper's name. The
 * seats are counted by each run (SeatCount__c), never read: a large camp's season holds more seats
 * than one request may read.
 */
public with sharing class ElectiveClearReading {
  public ElectiveClear.Picture picture = new ElectiveClear.Picture();
  public List<ElectiveRun__c> runs = new List<ElectiveRun__c>();
  private Id seasonId;
  private Map<Id, Camper__c> campers = new Map<Id, Camper__c>();
  private Map<Id, ElectiveClear.WeekCounts> weeks = new Map<Id, ElectiveClear.WeekCounts>();
  // Each week's campers (by the runs of that week), and each run's week.
  private Map<Id, Set<Id>> campersByWeek = new Map<Id, Set<Id>>();
  private Map<Id, Id> weekOfRun = new Map<Id, Id>();
  // Each run's set, and the choices counted for each camper of a set's week: the same sheet
  // imported against two schedules of a week is one camper's choices, counted once.
  private Map<Id, Id> setOfRun = new Map<Id, Id>();
  private Map<String, Integer> countedChoices = new Map<String, Integer>();
  // Each run's rows under it: its choices and seats, what a Clear in parts deletes before it.
  private Map<Id, Integer> rowsOfRun = new Map<Id, Integer>();

  public ElectiveClearReading(Id seasonId) {
    this.seasonId = seasonId;
    List<Season__c> seasons = [
      SELECT Name
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ];
    if (seasons.isEmpty()) {
      throw new ShoreshException(
        AgentRefusal.withFix(
          'That season is no longer there.',
          'Reload the page.'
        )
      );
    }
    picture.seasonName = seasons[0].Name;
    readWeeks();
    readRuns();
    readCampers();
    readChoices();
    picture.stamp = stampOf();
  }

  private void readWeeks() {
    for (Week__c week : [
      SELECT Id, Name
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c, StartDate__c, Id
    ]) {
      ElectiveClear.WeekCounts counts = new ElectiveClear.WeekCounts();
      counts.weekId = week.Id;
      counts.name = week.Name;
      picture.weeks.add(counts);
      weeks.put(week.Id, counts);
      campersByWeek.put(week.Id, new Set<Id>());
    }
  }

  private void readRuns() {
    runs = [
      SELECT
        Id,
        Name,
        Week__c,
        ElectiveSet__c,
        Status__c,
        Revision__c,
        FinalizedAt__c,
        SeatCount__c,
        SaveDone__c,
        SaveTotal__c,
        SaveProblem__c
      FROM ElectiveRun__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Id
    ];
    for (ElectiveRun__c run : runs) {
      weekOfRun.put(run.Id, run.Week__c);
      setOfRun.put(run.Id, run.ElectiveSet__c);
      ElectiveClear.WeekCounts week = weeks.get(run.Week__c);
      week.runs++;
      Integer seats = run.SeatCount__c == null
        ? 0
        : run.SeatCount__c.intValue();
      week.seats += seats;
      rowsOfRun.put(run.Id, seats);
      if (run.SaveTotal__c != null && picture.saveTotal == null) {
        // A Clear in parts under way, or stopped: every run it clears carries the same count.
        picture.saveDone = run.SaveDone__c;
        picture.saveTotal = run.SaveTotal__c;
        picture.saveProblem = run.SaveProblem__c;
      }
      if (run.Status__c == ElectiveClear.COMMITTED) {
        week.working.add(run.Name);
      } else {
        week.finals++;
        week.lastFinalized = later(week.lastFinalized, run.FinalizedAt__c);
      }
    }
  }

  private static Datetime later(Datetime held, Datetime other) {
    return held == null || (other != null && other > held) ? other : held;
  }

  private void readCampers() {
    for (Camper__c camper : [
      SELECT Id, Name
      FROM Camper__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Id
    ]) {
      campers.put(camper.Id, camper);
    }
    picture.campers = campers.size();
  }

  /**
   * Each week's campers and how many choices they made (one per activity named), each camper's
   * choices for a set once however many of the week's schedules they were imported against.
   */
  private void readChoices() {
    for (Preference__c pref : [
      SELECT ElectiveRun__c, Camper__c, Choices__c
      FROM Preference__c
      WHERE ElectiveRun__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Camper__c
    ]) {
      Id weekId = weekOfRun.get(pref.ElectiveRun__c);
      ElectiveClear.WeekCounts week = weeks.get(weekId);
      rowsOfRun.put(
        pref.ElectiveRun__c,
        rowsOfRun.get(pref.ElectiveRun__c) + 1
      );
      countChoices(week, pref);
      if (campersByWeek.get(weekId).add(pref.Camper__c)) {
        week.campers++;
        if (week.camperName == null) {
          week.camperName = campers.get(pref.Camper__c)?.Name;
        }
      }
    }
    for (ElectiveClear.WeekCounts week : picture.weeks) {
      week.campersOnlyHere = onlyIn(week.weekId).size();
    }
  }

  /** Adds a camper's choices to their week, past what another run of that set there counted. */
  private void countChoices(ElectiveClear.WeekCounts week, Preference__c pref) {
    Integer made = CamperChoices.count(pref.Choices__c);
    String key =
      week.weekId +
      '|' +
      setOfRun.get(pref.ElectiveRun__c) +
      '|' +
      pref.Camper__c;
    Integer before = countedChoices.containsKey(key)
      ? countedChoices.get(key)
      : 0;
    if (made > before) {
      week.choices += made - before;
      countedChoices.put(key, made);
    }
  }

  /** A week's campers that no other week's run has. */
  private Set<Id> onlyIn(Id weekId) {
    Set<Id> result = campersByWeek.get(weekId).clone();
    for (Id other : campersByWeek.keySet()) {
      if (other != weekId) {
        result.removeAll(campersByWeek.get(other));
      }
    }
    return result;
  }

  /** The runs Clear removes: the whole season's (weekId blank), or one week's. */
  public List<ElectiveRun__c> runsIn(Id weekId) {
    List<ElectiveRun__c> result = new List<ElectiveRun__c>();
    for (ElectiveRun__c run : runs) {
      if (weekId == null || run.Week__c == weekId) {
        result.add(new ElectiveRun__c(Id = run.Id));
      }
    }
    return result;
  }

  /** The choices and seats under the runs Clear removes (runsIn). */
  public Integer rowsUnder(List<ElectiveRun__c> going) {
    Integer result = 0;
    for (ElectiveRun__c run : going) {
      result += rowsOfRun.get(run.Id);
    }
    return result;
  }

  /** The whole season: every camper. One week: its campers no other week has. */
  public List<Camper__c> campersGoing(Id weekId) {
    Set<Id> ids = new Set<Id>();
    if (weekId == null) {
      ids = campers.keySet();
    } else if (campersByWeek.containsKey(weekId)) {
      ids = onlyIn(weekId);
    }
    List<Camper__c> result = new List<Camper__c>();
    for (Id camperId : ids) {
      result.add(new Camper__c(Id = camperId));
    }
    return result;
  }

  private String stampOf() {
    List<String> parts = new List<String>();
    for (ElectiveRun__c run : runs) {
      parts.add(run.Id + ':' + run.Revision__c + ':' + run.Status__c);
    }
    parts.add('campers:' + campers.size());
    return EncodingUtil.convertToHex(
      Crypto.generateDigest('SHA-256', Blob.valueOf(String.join(parts, ',')))
    );
  }
}
