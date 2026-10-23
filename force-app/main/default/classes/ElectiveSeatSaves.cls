/**
 * Assign seats, and Assign again (electives slice E7; repo ADR 0018 choice 31; plan §5): the seats
 * the browser worked out (c/shoreshElectiveEngine) in place of the run's unlocked ones. The browser
 * does the arithmetic; the server never trusts it blindly, and checks what it saves
 * (ElectiveSeatChecks): the run is committed and at the revision the screen read; every seat's
 * camper is in the run, at a time their bunk holds the set on the run's schedule now, once per
 * camper per time, in an offering the set has confirmed and that is open then; no locked seat
 * changes (Assign keeps every one and fills only what is left); and no offering gets more campers
 * than its seats beyond what locks alone hold (ElectiveSeatTally). In user mode. No message names
 * a camper.
 */
public with sharing class ElectiveSeatSaves {
  // What worked the seats out (ElectiveRun__c.EngineVersion__c): ADR 0016's engine.
  public static final String ENGINE_VERSION = 'shoreshElectiveEngine 1';

  /** Assign seats: every seat the engine placed, and what did not run. */
  public class AssignRequest {
    public Id runId;
    public Decimal revision;
    public List<SeatIn> seats = new List<SeatIn>();
    public List<DroppedIn> dropped = new List<DroppedIn>();
  }

  /** One seat: a camper, a day and time block, and an offering. */
  public class SeatIn {
    public Id camperId;
    public Date day;
    public Id blockId;
    public Id offeringId;
  }

  /** An offering that did not run at a time (t): its activity (a), had (h) and needed (m). */
  public class DroppedIn {
    public String t;
    public Id a;
    public Integer h;
    public Integer m;
  }

  /** Replaces every unlocked seat with the ones sent, after checking them. */
  public static ElectiveSeats.RunView assign(AssignRequest request) {
    if (request == null || request.runId == null || request.seats == null) {
      throw new ShoreshException('The seats could not be sent. Try again.');
    }
    ElectiveRunState state = ElectiveRunState.held(request.runId);
    state.refuseUnlessCurrent(request.revision);
    refuseUnreadable(state);
    ElectiveSeatTally tally = new ElectiveSeatTally(state);
    Map<String, Assignment__c> locked = tally.addLocks();
    List<Assignment__c> added = new List<Assignment__c>();
    Set<String> seen = new Set<String>();
    for (SeatIn seat : request.seats) {
      String key = ElectiveSeatChecks.seatKey(
        seat.camperId,
        seat.day,
        seat.blockId
      );
      if (!seen.add(key)) {
        throw new ShoreshException(
          'Two seats were sent for one camper at one time. Assign again.'
        );
      }
      if (locked.containsKey(key)) {
        refuseLockChanged(locked.get(key), seat.offeringId);
        continue;
      }
      ElectivePeriod at = ElectiveSeatChecks.offeredAt(state, seat);
      tally.add(at, seat.offeringId);
      added.add(ElectiveSeatChecks.newSeat(state, seat, at));
    }
    tally.refuseOver();
    save(state, added, request.dropped);
    return ElectiveSeats.open(request.runId);
  }

  private static void save(
    ElectiveRunState state,
    List<Assignment__c> added,
    List<DroppedIn> dropped
  ) {
    List<Assignment__c> unlocked = new List<Assignment__c>();
    for (Assignment__c seat : state.seats) {
      if (seat.Locked__c != true) {
        unlocked.add(seat);
      }
    }
    Savepoint before = Database.setSavepoint();
    try {
      Database.delete(unlocked, true, AccessLevel.USER_MODE);
      Database.insert(added, true, AccessLevel.USER_MODE);
      state.bump(
        new ElectiveRun__c(
          TimesFingerprint__c = state.live.fingerprint(),
          EngineVersion__c = ENGINE_VERSION,
          Dropped__c = droppedText(state, dropped)
        )
      );
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  private static void refuseUnreadable(ElectiveRunState state) {
    if (!state.live.unreadable.isEmpty()) {
      throw new ShoreshException(
        'A day of the schedule could not be read (' +
          String.join(state.live.unreadable, '; ') +
          '), so no seats were assigned.'
      );
    }
  }

  private static void refuseLockChanged(Assignment__c held, Id offeringId) {
    if (held.Offering__c != offeringId) {
      throw new ShoreshException(
        'A locked seat was changed. Reload the page and assign again.'
      );
    }
  }

  /** What did not run, kept as sent when it names a time and an activity of this run. */
  private static String droppedText(
    ElectiveRunState state,
    List<DroppedIn> dropped
  ) {
    Set<Id> activities = new Set<Id>();
    for (Offering__c offering : state.offerings) {
      activities.add(offering.Activity__c);
    }
    List<DroppedIn> kept = new List<DroppedIn>();
    for (DroppedIn each : dropped == null ? new List<DroppedIn>() : dropped) {
      if (isKnown(each, state, activities)) {
        kept.add(each);
      }
    }
    return kept.isEmpty() ? null : JSON.serialize(kept, true);
  }

  private static Boolean isKnown(
    DroppedIn each,
    ElectiveRunState state,
    Set<Id> activities
  ) {
    return each != null &&
      state.live.periodAt(each.t) != null &&
      activities.contains(each.a) &&
      each.h != null &&
      each.h >= 0 &&
      each.m != null &&
      each.m >= 0;
  }
}
