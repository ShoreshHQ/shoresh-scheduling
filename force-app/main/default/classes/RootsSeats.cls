/**
 * Roots' elective seats (repo ADR 0020): the offerings of the run Elective seats shows first for
 * the shown week (runOf; none when that week has no run, so another week's seats never pass as
 * this week's), each with its seats
 * and the most campers it holds at any one time; and, for the hand, every offering of that run
 * kept below its minimum at some time. Nothing when electives can't be read. Three queries. Runs
 * in user mode.
 */
public with sharing class RootsSeats {
  @TestVisible
  private static final Integer SEAT_ROWS = 4;
  // A set offers each activity once (ADR 0018), so this is far more than any set holds.
  private static final Integer MOST_OFFERINGS = 500;
  // A week's runs: a few versions per set and schedule, so far more than any week holds.
  private static final Integer MOST_RUNS = 500;

  public static void read(RootsTable.Table result, Id seasonId) {
    if (!canRead()) {
      return;
    }
    ElectiveRun__c run = runOf(seasonId, result.shownWeekId);
    if (run == null) {
      return;
    }
    result.seatsSetId = run.ElectiveSet__c;
    result.seatsWeekId = run.Week__c;
    result.seatsScheduleId = run.Schedule__c;
    result.seatsRunId = run.Id;
    Map<Id, Integer> taken = new Map<Id, Integer>();
    Map<Id, Integer> fewest = new Map<Id, Integer>();
    readCounts(run.Id, taken, fewest);
    for (Offering__c offering : [
      SELECT Id, Activity__r.Name, Seats__c, NoSeatLimit__c, MinimumToRun__c
      FROM Offering__c
      WHERE ElectiveSet__c = :run.ElectiveSet__c AND Proposed__c = FALSE
      WITH USER_MODE
      ORDER BY Activity__r.Name, Id
      LIMIT :MOST_OFFERINGS
    ]) {
      RootsTable.Seat seat = seatOf(offering, taken, fewest);
      if (result.seats.size() < SEAT_ROWS) {
        result.seats.add(seat);
      }
      if (
        seat.minimum != null &&
        seat.fewest > 0 &&
        seat.fewest < seat.minimum
      ) {
        result.shortSeats.add(seat);
      }
    }
  }

  /**
   * The run Elective seats opens on for the week (its pickSchedule): the latest run's set and
   * schedule, and on them the committed run, else the latest.
   */
  @TestVisible
  private static ElectiveRun__c runOf(Id seasonId, Id weekId) {
    List<ElectiveRun__c> runs = [
      SELECT Id, ElectiveSet__c, Week__c, Schedule__c, Status__c
      FROM ElectiveRun__c
      WHERE Season__c = :seasonId AND Week__c = :weekId AND Week__c != NULL
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT :MOST_RUNS
    ];
    if (runs.isEmpty()) {
      return null;
    }
    ElectiveRun__c latest = runs[0];
    for (ElectiveRun__c run : runs) {
      if (
        run.ElectiveSet__c == latest.ElectiveSet__c &&
        run.Schedule__c == latest.Schedule__c &&
        run.Status__c == ChoicesImport.COMMITTED
      ) {
        return run;
      }
    }
    return latest;
  }

  /**
   * Per offering, the most and the fewest campers seated in it at any one date and time block
   * it has campers at (as the Elective seats board counts each time: ADR 0018 choice 36).
   */
  private static void readCounts(
    Id runId,
    Map<Id, Integer> taken,
    Map<Id, Integer> fewest
  ) {
    for (AggregateResult row : [
      SELECT Offering__c offering, COUNT(Id) seated
      FROM Assignment__c
      WHERE ElectiveRun__c = :runId AND Offering__c != NULL
      WITH USER_MODE
      GROUP BY Offering__c, Date__c, TimeBlock__c
    ]) {
      Id offering = (Id) row.get('offering');
      Integer seated = (Integer) row.get('seated');
      Integer most = taken.get(offering);
      taken.put(offering, most == null ? seated : Math.max(most, seated));
      Integer least = fewest.get(offering);
      fewest.put(offering, least == null ? seated : Math.min(least, seated));
    }
  }

  private static RootsTable.Seat seatOf(
    Offering__c offering,
    Map<Id, Integer> taken,
    Map<Id, Integer> fewest
  ) {
    RootsTable.Seat seat = new RootsTable.Seat();
    seat.name = offering.Activity__r?.Name;
    Boolean noLimit =
      offering.NoSeatLimit__c == true ||
      offering.Seats__c == null;
    seat.seats = noLimit ? null : offering.Seats__c.intValue();
    seat.minimum = offering.MinimumToRun__c?.intValue();
    seat.taken = taken.containsKey(offering.Id) ? taken.get(offering.Id) : 0;
    seat.fewest = fewest.containsKey(offering.Id) ? fewest.get(offering.Id) : 0;
    return seat;
  }

  private static Boolean canRead() {
    return Schema.sObjectType.ElectiveRun__c.isAccessible() &&
      Schema.sObjectType.Assignment__c.isAccessible() &&
      Schema.sObjectType.Offering__c.isAccessible();
  }
}
