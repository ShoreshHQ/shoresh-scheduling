/**
 * What every seat saved is checked against (electives slice E7; repo ADR 0018 choices 31 and 32):
 * its camper is in the run, at a time their bunk holds the set on the run's schedule now, in an
 * offering the set has confirmed and that is open then. Shared by Assign seats and a change by
 * hand. No message names a camper.
 */
public with sharing class ElectiveSeatChecks {
  /** "camper|2027-07-06|block": one seat per camper per time (Assignment__c.Key__c's own). */
  public static String seatKey(Id camperId, Date day, Id blockId) {
    return camperId + '|' + String.valueOf(day) + '|' + blockId;
  }

  /**
   * The time the seat's camper takes there, refused when they have none there or its offering is
   * not one that time offers (not confirmed, not open to it, or not the set's).
   */
  public static ElectivePeriod offeredAt(
    ElectiveRunState state,
    ElectiveSeatSaves.SeatIn seat
  ) {
    Id groupId = state.groupOf(seat.camperId);
    ElectivePeriod at = seat.day == null ||
      seat.blockId == null
      ? null
      : state.live.periodOf(groupId, seat.day, seat.blockId);
    if (at == null) {
      throw new ShoreshException(
        'A seat is at a time when that camper has no ' +
          state.run.ElectiveSet__r.Name +
          ' on the schedule. Reload the page.'
      );
    }
    if (!at.offeringIds.contains(seat.offeringId)) {
      throw new ShoreshException(
        'A seat is in something not offered then. Reload the page.'
      );
    }
    return at;
  }

  /** A new seat for the run, at the time checked. */
  public static Assignment__c newSeat(
    ElectiveRunState state,
    ElectiveSeatSaves.SeatIn seat,
    ElectivePeriod at
  ) {
    return new Assignment__c(
      ElectiveRun__c = state.run.Id,
      Camper__c = seat.camperId,
      Group__c = state.groupOf(seat.camperId),
      Date__c = at.day,
      TimeBlock__c = Id.valueOf(at.blockId),
      Offering__c = seat.offeringId,
      LinkedChoice__c = seat.linkedChoiceId
    );
  }
}
