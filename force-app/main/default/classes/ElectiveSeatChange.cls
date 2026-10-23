/**
 * One seat by hand (electives slice E7; repo ADR 0018 choice 32; desktop setElectiveAssignment.js
 * and DraftRunView.jsx). A move ("Move to…", or a name dropped on another offering) is a hand move
 * and locked, as the desktop makes it ("A move made by hand is a manual, locked placement"); it
 * may put an offering over its seats, which the screen then shows. The padlock locks or unlocks a
 * seat as it is, a lock that no longer fits included. Checked as Assign's seats are
 * (ElectiveSeatChecks), with the run's revision. In user mode.
 */
public with sharing class ElectiveSeatChange {
  /** The seat (a camper, a day and a time block), and the offering to move it to or its lock. */
  public class ChangeRequest {
    public Id runId;
    public Decimal revision;
    public Id camperId;
    public Date day;
    public Id blockId;
    public Id offeringId;
    public Boolean locked;
  }

  public static ElectiveSeats.RunView change(ChangeRequest request) {
    refuseIncomplete(request);
    ElectiveRunState state = ElectiveRunState.held(request.runId);
    state.refuseUnlessCurrent(request.revision);
    state.groupOf(request.camperId);
    Assignment__c seat = seatAt(state, request);
    if (movesTo(seat, request)) {
      seat = moved(state, seat, request);
    } else if (seat != null && request.locked != null) {
      seat.Locked__c = request.locked;
    } else {
      throw new ShoreshException(
        'That seat is no longer there. Reload the page.'
      );
    }
    Savepoint before = Database.setSavepoint();
    try {
      Database.upsert(seat, true, AccessLevel.USER_MODE);
      state.bump(new ElectiveRun__c());
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
    return ElectiveSeats.open(request.runId);
  }

  private static void refuseIncomplete(ChangeRequest request) {
    if (
      request == null ||
      request.runId == null ||
      request.camperId == null ||
      request.day == null ||
      request.blockId == null
    ) {
      throw new ShoreshException('The change could not be sent. Try again.');
    }
  }

  private static Boolean movesTo(Assignment__c seat, ChangeRequest request) {
    return request.offeringId != null &&
      (seat == null ||
      seat.Offering__c != request.offeringId);
  }

  /** The seat in its new offering, by hand and locked (a new seat when the camper had none). */
  private static Assignment__c moved(
    ElectiveRunState state,
    Assignment__c seat,
    ChangeRequest request
  ) {
    ElectiveSeatSaves.SeatIn wanted = new ElectiveSeatSaves.SeatIn();
    wanted.camperId = request.camperId;
    wanted.day = request.day;
    wanted.blockId = request.blockId;
    wanted.offeringId = request.offeringId;
    ElectivePeriod at = ElectiveSeatChecks.offeredAt(state, wanted);
    Assignment__c result = seat == null
      ? ElectiveSeatChecks.newSeat(state, wanted, at)
      : seat;
    result.Offering__c = request.offeringId;
    result.ByHand__c = true;
    result.Locked__c = true;
    return result;
  }

  private static Assignment__c seatAt(
    ElectiveRunState state,
    ChangeRequest request
  ) {
    String key = ElectiveSeatChecks.seatKey(
      request.camperId,
      request.day,
      request.blockId
    );
    for (Assignment__c seat : state.seats) {
      if (
        ElectiveSeatChecks.seatKey(
          seat.Camper__c,
          seat.Date__c,
          seat.TimeBlock__c
        ) == key
      ) {
        return seat;
      }
    }
    return null;
  }
}
