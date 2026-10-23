/**
 * Campers per offering per elective time, for Assign seats' check (electives slice E7; repo ADR
 * 0018 choice 31): what locks already hold, and what Assign adds. Assign may not put more campers
 * in an offering than its seats leave free after the locks; locks alone may hold more (a move by
 * hand may go over, and the screen shows it).
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
      if (seat.Locked__c != true) {
        continue;
      }
      result.put(
        ElectiveSeatChecks.seatKey(
          seat.Camper__c,
          seat.Date__c,
          seat.TimeBlock__c
        ),
        seat
      );
      ElectivePeriod at = state.live.periodOf(
        state.groupOf(seat.Camper__c),
        seat.Date__c,
        seat.TimeBlock__c
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
      if (offering.NoSeatLimit__c == true) {
        continue;
      }
      Integer seats = offering.Seats__c == null
        ? 0
        : offering.Seats__c.intValue();
      Integer held = lockedCount.containsKey(key) ? lockedCount.get(key) : 0;
      if (addedCount.get(key) > Math.max(0, seats - held)) {
        throw new ShoreshException(
          '"' +
            offering.Activity__r.Name +
            '" has more campers than seats on ' +
            periods.get(key).words() +
            '. Assign again.'
        );
      }
    }
  }
}
