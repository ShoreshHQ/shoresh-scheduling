/**
 * End-of-season Clear (electives slice E10; repo ADR 0018 choices 49 to 52; Greg's decisions
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
    return new Reading(seasonId).picture;
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
    Reading now = new Reading(request.seasonId);
    if (now.picture.stamp != request.stamp || now.runs.size() != held.size()) {
      throw new ShoreshException(
        'Something changed since this was drawn. Look again, then clear.'
      );
    }
    List<ElectiveRun__c> going = now.runsIn(request.weekId);
    List<Camper__c> campers = now.campersGoing(request.weekId);
    if (going.isEmpty() && campers.isEmpty()) {
      throw new ShoreshException('Nothing to clear.');
    }
    refuseWorking(now, request.weekId);
    Savepoint before = Database.setSavepoint();
    try {
      if (!going.isEmpty()) {
        Database.delete(going, AccessLevel.USER_MODE);
      }
      if (!campers.isEmpty()) {
        Database.delete(campers, AccessLevel.USER_MODE);
      }
      List<SObject> gone = new List<SObject>();
      gone.addAll(going);
      gone.addAll(campers);
      Database.emptyRecycleBin(gone);
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
    Result result = new Result();
    result.runs = going.size();
    result.campers = campers.size();
    result.picture = picture(request.seasonId);
    return result;
  }

  private static void refuseWorking(Reading now, Id weekId) {
    List<String> working = new List<String>();
    for (WeekCounts week : now.picture.weeks) {
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

  /** The season read once: its runs, who is in them, and the picture drawn from that. */
  private class Reading {
    Id seasonId;
    Picture picture = new Picture();
    List<ElectiveRun__c> runs;
    Map<Id, Camper__c> campers = new Map<Id, Camper__c>();
    // Each week's campers (by the runs of that week).
    Map<Id, Set<Id>> campersByWeek = new Map<Id, Set<Id>>();

    Reading(Id seasonId) {
      this.seasonId = seasonId;
      List<Season__c> seasons = [
        SELECT Name
        FROM Season__c
        WHERE Id = :seasonId
        WITH USER_MODE
      ];
      if (seasons.isEmpty()) {
        throw new ShoreshException(
          'That season is no longer there. Reload the page.'
        );
      }
      picture.seasonName = seasons[0].Name;
      Map<Id, WeekCounts> weeks = readWeeks();
      readRuns(weeks);
      readCampers();
      readChoices(weeks);
      readSeats(weeks);
      readStays();
      picture.stamp = stampOf();
    }

    Map<Id, WeekCounts> readWeeks() {
      Map<Id, WeekCounts> byId = new Map<Id, WeekCounts>();
      for (Week__c week : [
        SELECT Id, Name
        FROM Week__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
        ORDER BY SortOrder__c, StartDate__c, Id
      ]) {
        WeekCounts counts = new WeekCounts();
        counts.weekId = week.Id;
        counts.name = week.Name;
        picture.weeks.add(counts);
        byId.put(week.Id, counts);
        campersByWeek.put(week.Id, new Set<Id>());
      }
      return byId;
    }

    void readRuns(Map<Id, WeekCounts> weeks) {
      runs = [
        SELECT Id, Name, Week__c, Status__c, Revision__c, FinalizedAt__c
        FROM ElectiveRun__c
        WHERE Season__c = :seasonId
        WITH USER_MODE
        ORDER BY Id
      ];
      for (ElectiveRun__c run : runs) {
        WeekCounts week = weeks.get(run.Week__c);
        week.runs++;
        if (run.Status__c == COMMITTED) {
          week.working.add(run.Name);
          continue;
        }
        week.finals++;
        if (
          run.FinalizedAt__c != null &&
          (week.lastFinalized == null ||
          run.FinalizedAt__c > week.lastFinalized)
        ) {
          week.lastFinalized = run.FinalizedAt__c;
        }
      }
    }

    void readCampers() {
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

    /** Each week's campers and how many choices they made (one per activity named). */
    void readChoices(Map<Id, WeekCounts> weeks) {
      Map<Id, Id> weekOfRun = new Map<Id, Id>();
      for (ElectiveRun__c run : runs) {
        weekOfRun.put(run.Id, run.Week__c);
      }
      for (Preference__c pref : [
        SELECT ElectiveRun__c, Camper__c, Choices__c
        FROM Preference__c
        WHERE ElectiveRun__r.Season__c = :seasonId
        WITH USER_MODE
        ORDER BY Camper__c
      ]) {
        Id weekId = weekOfRun.get(pref.ElectiveRun__c);
        WeekCounts week = weeks.get(weekId);
        week.choices += String.isBlank(pref.Choices__c)
          ? 0
          : pref.Choices__c.countMatches('"a":');
        if (campersByWeek.get(weekId).add(pref.Camper__c)) {
          week.campers++;
          if (week.camperName == null && campers.containsKey(pref.Camper__c)) {
            week.camperName = campers.get(pref.Camper__c).Name;
          }
        }
      }
      for (WeekCounts week : picture.weeks) {
        week.campersOnlyHere = onlyIn(week.weekId).size();
      }
    }

    void readSeats(Map<Id, WeekCounts> weeks) {
      Map<Id, Id> weekOfRun = new Map<Id, Id>();
      for (ElectiveRun__c run : runs) {
        weekOfRun.put(run.Id, run.Week__c);
      }
      for (AggregateResult row : [
        SELECT ElectiveRun__c runId, COUNT(Id) seatCount
        FROM Assignment__c
        WHERE ElectiveRun__r.Season__c = :seasonId
        WITH USER_MODE
        GROUP BY ElectiveRun__c
      ]) {
        weeks.get(weekOfRun.get((Id) row.get('runId')))
          .seats += (Integer) row.get('seatCount');
      }
    }

    /** What stays: the sets, the offerings (by activity) and the linked choices. */
    void readStays() {
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

    /** A week's campers that no other week's run has. */
    Set<Id> onlyIn(Id weekId) {
      Set<Id> result = campersByWeek.get(weekId).clone();
      for (Id other : campersByWeek.keySet()) {
        if (other != weekId) {
          result.removeAll(campersByWeek.get(other));
        }
      }
      return result;
    }

    List<ElectiveRun__c> runsIn(Id weekId) {
      List<ElectiveRun__c> result = new List<ElectiveRun__c>();
      for (ElectiveRun__c run : runs) {
        if (weekId == null || run.Week__c == weekId) {
          result.add(new ElectiveRun__c(Id = run.Id));
        }
      }
      return result;
    }

    /** The whole season: every camper. One week: its campers no other week has. */
    List<Camper__c> campersGoing(Id weekId) {
      Set<Id> ids = weekId == null
        ? campers.keySet()
        : (campersByWeek.containsKey(weekId) ? onlyIn(weekId) : new Set<Id>());
      List<Camper__c> result = new List<Camper__c>();
      for (Id camperId : ids) {
        result.add(new Camper__c(Id = camperId));
      }
      return result;
    }

    String stampOf() {
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
}
