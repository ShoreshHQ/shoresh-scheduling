/**
 * Assign seats, and Assign again (electives slice E7; repo ADR 0018 choice 31; plan §5): the seats
 * the browser worked out (c/shoreshElectiveEngine) in place of the run's unlocked ones. The browser
 * does the arithmetic; the server never trusts it blindly, and checks what it saves
 * (ElectiveSeatChecks): the run is committed and at the revision the screen read; every seat's
 * camper is in the run, at a time their bunk holds the set on the run's schedule now, once per
 * camper per time, in an offering the set has confirmed and that is open then; no locked seat
 * changes (Assign keeps every one and fills only what is left); no offering gets more campers
 * than its seats beyond what locks alone hold (ElectiveSeatTally); and a seat of a linked choice
 * is at one of its periods, for a division it applies to, with every other period of it
 * (ElectiveLinkedSeats, slice E8). In user mode. No message names
 * a camper.
 */
public with sharing class ElectiveSeatSaves {
  // What worked the seats out (ElectiveRun__c.EngineVersion__c): ADR 0016's engine.
  public static final String ENGINE_VERSION = 'shoreshElectiveEngine 1';

  // Below Salesforce's 10,000 rows a request may write, with room for the run's own update; a
  // save past it is written in the background (ElectiveBigSave).
  @TestVisible
  private static Integer rowBound = 9500;

  /** Whether a save of this many rows fits one request (else ElectiveBigSave writes it). */
  public static Boolean fitsOneSave(Integer rows) {
    return rows <= rowBound;
  }

  /** Assign seats: every seat the engine placed, and what did not run. */
  public class AssignRequest {
    public Id runId;
    public Decimal revision;
    public List<SeatIn> seats = new List<SeatIn>();
    public List<DroppedIn> dropped = new List<DroppedIn>();
  }

  /** One seat: a camper, a day and time block, an offering, and the linked choice it is part of. */
  public class SeatIn {
    public Id camperId;
    public Date day;
    // A time block's Id, or a special day's own time block ("b2", ELECT-4.8).
    public String blockId;
    public Id offeringId;
    public Id linkedChoiceId;
  }

  /** An offering that did not run at a time (t): its activity (a), had (h) and needed (m). */
  public class DroppedIn {
    public String t;
    public Id a;
    public Integer h;
    public Integer m;
  }

  /** Replaces the unlocked seats with the ones sent, after checking them, writing only what differs. */
  public static ElectiveSeats.RunView assign(AssignRequest request) {
    if (request == null || request.runId == null || request.seats == null) {
      throw ScreenRequests.notSent(
        'The seats',
        'ElectiveSeatSaves: a request missing its run or seats'
      );
    }
    ElectiveRunState state = ElectiveRunState.held(request.runId);
    state.refuseUnlessCurrent(request.revision);
    refuseUnreadable(state);
    ElectiveSeatTally tally = new ElectiveSeatTally(state);
    Map<String, Assignment__c> locked = tally.addLocks();
    List<Assignment__c> added = new List<Assignment__c>();
    ElectiveLinkedSeats linked = new ElectiveLinkedSeats(state);
    Set<String> seen = new Set<String>();
    for (SeatIn seat : request.seats) {
      String key = ElectiveSeatChecks.seatKey(
        seat.camperId,
        seat.day,
        seat.blockId
      );
      if (!seen.add(key)) {
        throw new ShoreshException(
          'Two ' +
            state.labels().pluralInSentence('Seats') +
            ' were sent for one camper at one time. Assign again.'
        );
      }
      if (locked.containsKey(key)) {
        refuseLockChanged(state, locked.get(key), seat.offeringId);
        continue;
      }
      ElectivePeriod at = ElectiveSeatChecks.offeredAt(state, seat);
      tally.add(at, seat.offeringId);
      added.add(ElectiveSeatChecks.newSeat(state, seat, at));
      linked.add(seat, at);
    }
    linked.refuseIncomplete();
    tally.refuseOver();
    save(state, added, request.dropped);
    return ElectiveSeats.open(request.runId);
  }

  /**
   * Writes only the difference: a seat already at a camper's day and time is kept (or its
   * offering changed in place), the rest inserted, and unlocked seats nothing was sent for deleted.
   * When even that is more rows than one save can take, it is written in the background.
   */
  private static void save(
    ElectiveRunState state,
    List<Assignment__c> added,
    List<DroppedIn> dropped
  ) {
    Map<String, Assignment__c> unlocked = new Map<String, Assignment__c>();
    for (Assignment__c seat : state.seats) {
      if (!ElectiveSeatChecks.kept(seat)) {
        unlocked.put(
          ElectiveSeatChecks.seatKey(
            seat.Camper__c,
            seat.Date__c,
            ElectiveSeatChecks.blockOf(seat)
          ),
          seat
        );
      }
    }
    List<Assignment__c> inserts = new List<Assignment__c>();
    List<Assignment__c> updates = new List<Assignment__c>();
    for (Assignment__c seat : added) {
      Assignment__c held = unlocked.remove(
        ElectiveSeatChecks.seatKey(
          seat.Camper__c,
          seat.Date__c,
          ElectiveSeatChecks.blockOf(seat)
        )
      );
      if (held == null) {
        inserts.add(seat);
      } else if (changes(held, seat)) {
        updates.add(
          new Assignment__c(
            Id = held.Id,
            Offering__c = seat.Offering__c,
            Group__c = seat.Group__c,
            LinkedChoice__c = seat.LinkedChoice__c,
            ByHand__c = false
          )
        );
      }
    }
    List<Assignment__c> deletes = unlocked.values();
    ElectiveRun__c finished = new ElectiveRun__c(
      TimesFingerprint__c = state.live.fingerprint(),
      EngineVersion__c = ENGINE_VERSION,
      Dropped__c = droppedText(state, dropped)
    );
    // A deleted seat counts twice: deleted, then emptied from the Recycle Bin (plan §3, "Real
    // deletion"), so Assign again at a large camp never fills the camp's Recycle Bin with seats.
    if (
      !fitsOneSave(inserts.size() + updates.size() + 2 * deletes.size() + 1)
    ) {
      // More than one request can write: in the background, a part at a time (ADR 0018 choice 59).
      AssignRows rows = new AssignRows(state.run.Id, finished);
      rows.deleting(deletes);
      rows.updates = updates;
      rows.inserts = inserts;
      rows.begin();
      return;
    }
    Savepoint before = Database.setSavepoint();
    try {
      deleteForGood(deletes);
      Database.update(updates, true, AccessLevel.USER_MODE);
      Database.insert(inserts, true, AccessLevel.USER_MODE);
      state.bump(finished);
    } catch (Exception e) {
      Database.rollback(before);
      throw e;
    }
  }

  /** Assign's rows in the background; the last part sets what the run was assigned with. */
  public with sharing class AssignRows extends ElectiveGivenRows {
    private ElectiveRun__c finished;

    public AssignRows(Id runId, ElectiveRun__c finished) {
      super(runId);
      this.finished = finished;
    }

    public override void finish() {
      finishRun(finished.clone(false));
    }
  }

  /**
   * Rows of one kind (seats no longer wanted; Clear's choices, runs and campers) deleted and
   * emptied from the Recycle Bin. One kind a call: Salesforce refuses a call whose rows switch kind
   * more than ten times, counted 200 rows at a time.
   */
  public static void deleteForGood(List<SObject> rows) {
    if (!rows.isEmpty()) {
      Database.delete(rows, true, AccessLevel.USER_MODE);
      Database.emptyRecycleBin(rows);
    }
  }

  private static Boolean changes(Assignment__c held, Assignment__c seat) {
    return held.Offering__c != seat.Offering__c ||
      held.Group__c != seat.Group__c ||
      held.LinkedChoice__c != seat.LinkedChoice__c ||
      held.ByHand__c == true;
  }

  private static void refuseUnreadable(ElectiveRunState state) {
    if (!state.live.unreadable.isEmpty()) {
      throw new ShoreshException(
        'A day of the schedule could not be read (' +
          String.join(state.live.unreadable, '; ') +
          '), so no ' +
          state.labels().pluralInSentence('Seats') +
          ' were assigned.'
      );
    }
  }

  private static void refuseLockChanged(
    ElectiveRunState state,
    Assignment__c held,
    Id offeringId
  ) {
    if (held.Offering__c != offeringId) {
      throw new ShoreshException(
        AgentRefusal.withFix(
          'A locked ' +
            state.labels().singularInSentence('Seats') +
            ' was changed.',
          'Reload the page and assign again.'
        )
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
