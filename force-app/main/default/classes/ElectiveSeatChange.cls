/**
 * One seat by hand (electives slice E7; repo ADR 0018 choice 32; desktop setElectiveAssignment.js
 * and DraftRunView.jsx). A move ("Move to…", or a name dropped on another offering) is a hand move
 * and locked, as the desktop makes it ("A move made by hand is a manual, locked placement"); a
 * move into an offering already full then is refused, as the desktop refuses it. The padlock locks or unlocks a
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
      // Unlocked, a hand move is Assign's again (ElectiveSeatChecks.kept).
      seat.ByHand__c = seat.ByHand__c == true && request.locked;
    } else {
      throw new ShoreshException(nothingToChange(seat, request));
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

  /**
   * A move into an offering whose seats are all taken then is refused, as the desktop refuses it
   * (setElectiveAssignment.js OCCURRENCE_FULL: the seats taken, not counting the one moving).
   */
  private static void refuseIfFull(
    ElectiveRunState state,
    ChangeRequest request
  ) {
    Offering__c offering = [
      SELECT Seats__c, NoSeatLimit__c, Activity__r.Name
      FROM Offering__c
      WHERE Id = :request.offeringId
      WITH USER_MODE
    ];
    // Blank or 0 seats are no limit (ELECT-4.1).
    if (
      offering.NoSeatLimit__c == true ||
      offering.Seats__c == null ||
      offering.Seats__c == 0
    ) {
      return;
    }
    Integer taken = takenAt(state, request);
    if (taken >= offering.Seats__c) {
      throw new ShoreshException(
        offering.Activity__r.Name +
          ' is full then (' +
          taken +
          ' of ' +
          offering.Seats__c.intValue() +
          ' seats); nothing changed.'
      );
    }
  }

  /** The seats taken in the offering then, not counting the camper moving. */
  private static Integer takenAt(
    ElectiveRunState state,
    ChangeRequest request
  ) {
    Integer taken = 0;
    for (Assignment__c other : state.seats) {
      Boolean same =
        other.Offering__c == request.offeringId &&
        other.Date__c == request.day &&
        other.TimeBlock__c == request.blockId;
      if (same && other.Camper__c != request.camperId) {
        taken++;
      }
    }
    return taken;
  }

  /** Why nothing changed: the camper already holds that offering then, or the seat is gone. */
  private static String nothingToChange(
    Assignment__c seat,
    ChangeRequest request
  ) {
    return seat != null &&
      seat.Offering__c == request.offeringId
      ? alreadyIn(request.camperId, request.offeringId)
      : 'That seat is no longer there. Reload the page.';
  }

  /** "Ivy is already in Art then; nothing changed.": a move to the seat a camper holds. */
  public static String alreadyIn(String camper, String offering) {
    return camper + ' is already in ' + offering + ' then; nothing changed.';
  }

  private static String alreadyIn(Id camperId, Id offeringId) {
    return alreadyIn(
      [SELECT Name FROM Camper__c WHERE Id = :camperId WITH USER_MODE].Name,
      [
        SELECT Activity__r.Name
        FROM Offering__c
        WHERE Id = :offeringId
        WITH USER_MODE
      ]
      .Activity__r.Name
    );
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
    refuseIfFull(state, request);
    Assignment__c result = seat == null
      ? ElectiveSeatChecks.newSeat(state, wanted, at)
      : seat;
    result.Offering__c = request.offeringId;
    // Moved by hand, it is no longer one period of a linked choice taken as a set.
    result.LinkedChoice__c = null;
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
