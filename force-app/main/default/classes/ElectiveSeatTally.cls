/**
 * Campers per offering per elective time, for Assign seats' check (electives slice E7; repo ADR
 * 0018 choice 31): what locks already hold, and what Assign adds. Assign may not put more campers
 * in an offering than its seats leave free after the locks; locks alone may hold more (a move by
 * hand may go over, and the screen shows it). Limits and counts are ElectiveSeatCounts'.
 */
public with sharing class ElectiveSeatTally {
  private ElectiveRunState state;
  private ElectiveSeatCounts lockedCounts;
  private ElectiveSeatCounts addedCounts;

  public ElectiveSeatTally(ElectiveRunState given) {
    state = given;
    lockedCounts = new ElectiveSeatCounts(state.live.periods);
    addedCounts = new ElectiveSeatCounts(state.live.periods);
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
      lockedCounts.seat(
        state.groupOf(seat.Camper__c),
        ElectiveTimes.slotOf(seat.Date__c, ElectiveSeatChecks.blockOf(seat)),
        seat.Offering__c
      );
    }
    return result;
  }

  /** A seat Assign adds. */
  public void add(ElectivePeriod at, Id offeringId) {
    addedCounts.add(at, offeringId);
  }

  /** More added than the seats locks leave free: refused, naming the offering and the time. */
  public void refuseOver() {
    for (ElectiveSeatCounts.Counted each : addedCounts.counted()) {
      Offering__c offering = state.offeringsById.get(each.offeringId);
      Integer free = freeSeats(
        offering,
        lockedCounts.at(each.period, each.offeringId)
      );
      if (free != null && each.count > free) {
        throw new ShoreshException(
          '"' +
            offering.Activity__r.Name +
            '" has more campers than ' +
            state.labels().pluralInSentence('Seats') +
            ' on ' +
            each.period.words() +
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
    Integer seats = ElectiveSeatCounts.limitOf(offering);
    return seats == null ? null : Math.max(0, seats - locked);
  }
}
