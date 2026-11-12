/**
 * Campers per offering per elective time, for Assign seats' check (electives slice E7; repo ADR
 * 0018 choice 31): what locks already hold, and what Assign adds. Assign may not put more campers
 * in an offering than its seats leave free after the locks; locks alone may hold more (a move by
 * hand may go over, and the screen shows it). Blank or 0 seats are no limit (engine care PR 8;
 * Greg, 2026-10-26: an offering on the table needs seats; the engine places it and says so).
 */
public with sharing class ElectiveSeatTally {
  private ElectiveRunState state;
  private Map<String, Integer> lockedCount = new Map<String, Integer>();
  private Map<String, Integer> addedCount = new Map<String, Integer>();
  private Map<String, ElectivePeriod> periods = new Map<String, ElectivePeriod>();

  public ElectiveSeatTally(ElectiveRunState given) {
    state = given;
  }

  /** The run's locked seats, counted where they still are, by seat key. */
  public Map<String, Assignment__c> addLocks() {
    Map<String, Assignment__c> result = new Map<String, Assignment__c>();
    for (Assignment__c seat : state.seats) {
      if (!ElectiveSeatChecks.kept(seat)) {
        continue;
      }
      result.put(
        ElectiveSeatChecks.seatKey(
          seat.Camper__c,
          seat.Date__c,
          ElectiveSeatChecks.blockOf(seat)
        ),
        seat
      );
      ElectivePeriod at = state.live.periodOf(
        state.groupOf(seat.Camper__c),
        seat.Date__c,
        ElectiveSeatChecks.blockOf(seat)
      );
      if (at != null) {
        count(lockedCount, at, seat.Offering__c);
      }
    }
    return result;
  }

  /** A seat Assign adds. */
  public void add(ElectivePeriod at, Id offeringId) {
    count(addedCount, at, offeringId);
  }

  private void count(
    Map<String, Integer> counts,
    ElectivePeriod at,
    Id offeringId
  ) {
    String key = at.key + '|' + offeringId;
    periods.put(key, at);
    counts.put(key, (counts.containsKey(key) ? counts.get(key) : 0) + 1);
  }

  /** More added than the seats locks leave free: refused, naming the offering and the time. */
  public void refuseOver() {
    for (String key : addedCount.keySet()) {
      Offering__c offering = state.offeringsById.get(
        Id.valueOf(key.substringAfterLast('|'))
      );
      Integer free = freeSeats(
        offering,
        lockedCount.containsKey(key) ? lockedCount.get(key) : 0
      );
      if (free != null && addedCount.get(key) > free) {
        throw new ShoreshException(
          '"' +
            offering.Activity__r.Name +
            '" has more campers than ' +
            state.labels().pluralInSentence('Seats') +
            ' on ' +
            periods.get(key).words() +
            '. Assign again.'
        );
      }
    }
  }

  /**
   * The seats Assign may fill beside the locks, never below 0; null for no limit. The engine's
   * remainingCapacity; both pass staticresources/ShoreshSeatExamples.json.
   */
  @TestVisible
  private static Integer freeSeats(Offering__c offering, Integer locked) {
    if (noLimitUsed(offering)) {
      return null;
    }
    return Math.max(0, offering.Seats__c.intValue() - locked);
  }

  /** No seat limit, ticked, or seats blank or 0 (the engine's NO_SEATS_SET). */
  private static Boolean noLimitUsed(Offering__c offering) {
    return offering.NoSeatLimit__c == true ||
      offering.Seats__c == null ||
      offering.Seats__c == 0;
  }
}
