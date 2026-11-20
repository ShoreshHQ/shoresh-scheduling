/**
 * Roots' elective seats (repo ADR 0020): the offerings of the run Elective seats shows first for
 * the shown week (runOf; none when that week has no run, so another week's seats never pass as
 * this week's), each with its seats
 * and the most campers it holds at any one time; and, for the hand, every offering of that run
 * kept below its minimum at some time. Counted as Elective seats counts them (ElectiveSeatCounts,
 * ELECT-4.11), from the run read as that screen reads it (ElectiveRunState). Nothing when
 * electives can't be read. Runs in user mode.
 */
public with sharing class RootsSeats {
  @TestVisible
  private static final Integer SEAT_ROWS = 4;
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
    ElectiveRunState state = new ElectiveRunState(run.Id);
    Map<Id, Integer> taken = new Map<Id, Integer>();
    Map<Id, Integer> fewest = new Map<Id, Integer>();
    readCounts(state, taken, fewest);
    for (Offering__c offering : state.offerings) {
      if (offering.Proposed__c == true) {
        continue;
      }
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
   * Per offering, the most and the fewest campers seated in it at any one elective time it has
   * campers at, at the times Elective seats shows (ADR 0018 choice 36): a camper's seat at their
   * bunk's division's time, never two divisions added together.
   */
  private static void readCounts(
    ElectiveRunState state,
    Map<Id, Integer> taken,
    Map<Id, Integer> fewest
  ) {
    ElectiveSeatCounts counts = new ElectiveSeatCounts(state.shown.periods);
    for (Assignment__c seat : state.seats) {
      Preference__c camper = state.byCamper.get(seat.Camper__c);
      if (camper != null) {
        counts.seat(
          camper.Group__c,
          ElectiveTimes.slotOf(seat.Date__c, ElectiveSeatChecks.blockOf(seat)),
          seat.Offering__c
        );
      }
    }
    for (ElectiveSeatCounts.Counted each : counts.counted()) {
      Integer most = taken.get(each.offeringId);
      taken.put(
        each.offeringId,
        most == null ? each.count : Math.max(most, each.count)
      );
      Integer least = fewest.get(each.offeringId);
      fewest.put(
        each.offeringId,
        least == null ? each.count : Math.min(least, each.count)
      );
    }
  }

  private static RootsTable.Seat seatOf(
    Offering__c offering,
    Map<Id, Integer> taken,
    Map<Id, Integer> fewest
  ) {
    RootsTable.Seat seat = new RootsTable.Seat();
    seat.name = offering.Activity__r?.Name;
    seat.seats = ElectiveSeatCounts.limitOf(offering);
    seat.minimum = offering.MinimumToRun__c?.intValue();
    seat.taken = taken.containsKey(offering.Id) ? taken.get(offering.Id) : 0;
    seat.fewest = fewest.containsKey(offering.Id) ? fewest.get(offering.Id) : 0;
    return seat;
  }

  private static Boolean canRead() {
    return Schema.sObjectType.ElectiveRun__c.isAccessible() &&
      Schema.sObjectType.Assignment__c.isAccessible() &&
      Schema.sObjectType.Offering__c.isAccessible() &&
      Schema.sObjectType.Preference__c.isAccessible() &&
      Schema.sObjectType.LinkedChoice__c.isAccessible() &&
      Schema.sObjectType.ActivityEligibility__c.isAccessible();
  }
}
