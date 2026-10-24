/**
 * Roots' elective seats (repo ADR 0020): the offerings of the shown week's latest run (none when
 * that week has no run, so another week's seats never pass as this week's), each with its seats and the most campers it holds at any one time. Nothing when
 * electives can't be read. Three queries. Runs in user mode.
 */
public with sharing class RootsSeats {
  @TestVisible
  private static final Integer SEAT_ROWS = 4;

  public static void read(RootsTable.Table result, Id seasonId) {
    if (!canRead()) {
      return;
    }
    ElectiveRun__c run = runOf(seasonId, result.shownWeekId);
    if (run == null) {
      return;
    }
    Map<Id, Integer> taken = takenIn(run.Id);
    for (Offering__c offering : [
      SELECT Id, Activity__r.Name, Seats__c, NoSeatLimit__c, MinimumToRun__c
      FROM Offering__c
      WHERE ElectiveSet__c = :run.ElectiveSet__c AND Proposed__c = FALSE
      WITH USER_MODE
      ORDER BY Activity__r.Name, Id
      LIMIT :SEAT_ROWS
    ]) {
      result.seats.add(seatOf(offering, taken));
    }
  }

  private static ElectiveRun__c runOf(Id seasonId, Id weekId) {
    List<ElectiveRun__c> runs = [
      SELECT Id, ElectiveSet__c, Week__c
      FROM ElectiveRun__c
      WHERE Season__c = :seasonId AND Week__c = :weekId AND Week__c != NULL
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
    return runs.isEmpty() ? null : runs[0];
  }

  /** Per offering, the most campers seated in it at any one date and time block. */
  private static Map<Id, Integer> takenIn(Id runId) {
    Map<Id, Integer> taken = new Map<Id, Integer>();
    for (AggregateResult row : [
      SELECT Offering__c offering, COUNT(Id) seated
      FROM Assignment__c
      WHERE ElectiveRun__c = :runId AND Offering__c != NULL
      WITH USER_MODE
      GROUP BY Offering__c, Date__c, TimeBlock__c
    ]) {
      Id offering = (Id) row.get('offering');
      Integer seated = (Integer) row.get('seated');
      Integer before = taken.get(offering);
      taken.put(offering, before == null ? seated : Math.max(before, seated));
    }
    return taken;
  }

  private static RootsTable.Seat seatOf(
    Offering__c offering,
    Map<Id, Integer> taken
  ) {
    RootsTable.Seat seat = new RootsTable.Seat();
    seat.name = offering.Activity__r?.Name;
    Boolean noLimit =
      offering.NoSeatLimit__c == true ||
      offering.Seats__c == null;
    seat.seats = noLimit ? null : offering.Seats__c.intValue();
    seat.minimum = offering.MinimumToRun__c?.intValue();
    seat.taken = taken.containsKey(offering.Id) ? taken.get(offering.Id) : 0;
    return seat;
  }

  private static Boolean canRead() {
    return Schema.sObjectType.ElectiveRun__c.isAccessible() &&
      Schema.sObjectType.Assignment__c.isAccessible() &&
      Schema.sObjectType.Offering__c.isAccessible();
  }
}
