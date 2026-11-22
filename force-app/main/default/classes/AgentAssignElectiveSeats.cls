/**
 * assign_elective_seats: Assign seats (or Assign again) on the Elective seats screen, through an
 * agent or the command line (docs/protocol/api.md API-1.67). Web address
 * /v1/assign_elective_seats. GET ?season=&week=&elective_set= answers what the screen reads to
 * assign (its run, ElectiveSeatsController.openRun, and the camp's words); the seats are worked out
 * where the screen works them out, outside Salesforce (the connector runs the screen's own
 * modules, shoreshElectiveSeats seats.js and shoreshElectiveEngine). POST {season, week,
 * elective_set, seen, seats, dropped} then saves them through the screen's own save
 * (ElectiveSeatsController.assignSeats), only while the run is still as the agent read it (seen),
 * with the run locked; otherwise refused (409), nothing changed. It asks first (API-1.106): there is
 * no undo, and it replaces every seat that isn't locked.
 */
@RestResource(urlMapping='/v1/assign_elective_seats')
global with sharing class AgentAssignElectiveSeats implements AgentRequest.Change, AgentAskFirst.Preview {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'elective_set',
    'seen',
    'seats',
    'dropped'
  };

  // What the preview found and held: the request's Assign saves that, without reading it again.
  private AgentElectives.Run held;
  private Decimal seen;
  private Map<String, Object> body;

  @HttpGet
  global static void get() {
    AgentRequest.answer(new WhatAssignReads());
  }

  /** The GET: what the screen reads to assign: its run and the camp's words. */
  private with sharing class WhatAssignReads implements AgentRequest.Read {
    public Set<String> fields() {
      return new Set<String>{ 'season', 'week', 'elective_set' };
    }

    public String run(Map<String, Object> asked) {
      AgentElectives.Run run = AgentElectives.committed(asked);
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(run.id);
      ElectiveSet__c electiveSet = [
        SELECT Season__c, Season__r.Camp__c
        FROM ElectiveSet__c
        WHERE Id = :view.run.setId
        WITH USER_MODE
      ];
      return JSON.serialize(
        new Map<String, Object>{
          'view' => view,
          'labels' => CampLabels.forCamp(electiveSet.Season__r.Camp__c).all(),
          'dayNaming' => DayWords.namingOf(electiveSet.Season__c)
        },
        true
      );
    }
  }

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentAssignElectiveSeats());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  /**
   * What Assign does, said from the run as it is now (API-1.106): only the seats that change, as
   * its save writes only what differs (ElectiveSeatSaves.save).
   */
  public String preview(Map<String, Object> body) {
    heldAsSeen(body);
    Map<String, Assignment__c> now = new Map<String, Assignment__c>();
    for (Assignment__c seat : [
      SELECT
        Camper__c,
        Date__c,
        TimeBlock__c,
        SpecialBlock__c,
        Offering__c,
        Locked__c
      FROM Assignment__c
      WHERE ElectiveRun__c = :held.id
      WITH USER_MODE
    ]) {
      now.put(
        ElectiveSeatChecks.seatKey(
          seat.Camper__c,
          seat.Date__c,
          ElectiveSeatChecks.blockOf(seat)
        ),
        seat
      );
    }
    Change change = new Change();
    change.words = held.labels();
    for (ElectiveSeatSaves.SeatIn seat : sent()) {
      change.add(
        now.remove(
          ElectiveSeatChecks.seatKey(seat.camperId, seat.day, seat.blockId)
        ),
        seat
      );
    }
    for (Assignment__c left : now.values()) {
      change.leftOut(left);
    }
    return 'This assigns ' +
      held.labels().pluralInSentence('Seats') +
      ' in ' +
      held.setName +
      ' in ' +
      held.weekName +
      ', in the Draft: ' +
      change.said() +
      ' There is no undo.';
  }

  /** The seats Assign would change, keep and leave locked. */
  private class Change {
    Integer placed = 0;
    Integer moved = 0;
    Integer takenOut = 0;
    Integer same = 0;
    Integer locked = 0;
    // The camp's words: "3 spots placed".
    CampLabels words = CampLabels.modelTermsOnly();

    /** A seat sent, and the seat there now at that camper, day and time (null for none). */
    void add(Assignment__c there, ElectiveSeatSaves.SeatIn seat) {
      if (there == null) {
        placed++;
      } else if (ElectiveSeatChecks.kept(there)) {
        locked++;
      } else if (there.Offering__c == seat.offeringId) {
        // The camper keeps this elective, even when the save refreshes the seat's link or bunk.
        same++;
      } else {
        moved++;
      }
    }

    /** A seat there now that nothing was sent for: taken out, unless locked. */
    void leftOut(Assignment__c there) {
      if (ElectiveSeatChecks.kept(there)) {
        locked++;
      } else {
        takenOut++;
      }
    }

    String said() {
      List<String> changed = changes();
      List<String> kept = stays();
      return (changed.isEmpty()
          ? 'no ' + words.singularInSentence('Seats') + ' changes'
          : String.join(changed, ', ')) +
        (kept.isEmpty() ? '' : '; ' + String.join(kept, ', and ')) +
        '.';
    }

    private String counted(Integer count) {
      return count +
        ' ' +
        (count == 1
          ? words.singularInSentence('Seats')
          : words.pluralInSentence('Seats'));
    }

    private List<String> changes() {
      List<String> parts = new List<String>();
      if (placed > 0) {
        parts.add(counted(placed) + ' placed from the campers\' choices');
      }
      if (moved > 0) {
        parts.add(counted(moved) + ' moved to another elective');
      }
      if (takenOut > 0) {
        parts.add(counted(takenOut) + ' taken out');
      }
      return parts;
    }

    private List<String> stays() {
      List<String> parts = new List<String>();
      if (same > 0) {
        parts.add(
          counted(same) + (same == 1 ? ' stays as it is' : ' stay as they are')
        );
      }
      if (locked > 0) {
        parts.add(
          'the ' +
            locked +
            (locked == 1
              ? ' locked ' + words.singularInSentence('Seats') + ' stays'
              : ' locked ' + words.pluralInSentence('Seats') + ' stay')
        );
      }
      return parts;
    }
  }

  public String run(Map<String, Object> body) {
    if (held == null) {
      heldAsSeen(body);
    }
    Map<String, Object> request = new Map<String, Object>{
      'runId' => held.id,
      'revision' => seen,
      'seats' => body.get('seats'),
      'dropped' => body.get('dropped') == null
        ? new List<Object>()
        : body.get('dropped')
    };
    ElectiveSeats.RunView view;
    try {
      // The screen's own Assign seats.
      view = ElectiveSeatsController.assignSeats(JSON.serialize(request));
    } catch (Exception e) {
      throw new ShoreshException(
        held.labels().plural('Seats') +
          ' weren\'t assigned. ' +
          ScreenErrors.words(e)
      );
    }
    if (view.saveTotal != null) {
      // A large camp's: written in the background (ADR 0018 choice 59).
      return held.labels().plural('Seats') +
        ' in ' +
        held.setName +
        ' in ' +
        held.weekName +
        ' are being saved: ' +
        AgentSaveProgress.stillSaving();
    }
    return held.labels().plural('Seats') +
      ' assigned in ' +
      held.setName +
      ' in ' +
      held.weekName +
      '.';
  }

  /** The run asked for, held while still as seen, with the seats sent. */
  private void heldAsSeen(Map<String, Object> body) {
    this.body = body;
    held = AgentElectives.committed(body);
    seen = AgentElectives.seenOf(body, held);
    if (!(body.get('seats') instanceof List<Object>)) {
      throw unreadable();
    }
    AgentElectives.holdAsSeen(held, seen);
  }

  /** The seats sent, as Assign reads them; refused when they can't be read. */
  private List<ElectiveSeatSaves.SeatIn> sent() {
    try {
      return (List<ElectiveSeatSaves.SeatIn>) JSON.deserialize(
        JSON.serialize(body.get('seats')),
        List<ElectiveSeatSaves.SeatIn>.class
      );
    } catch (Exception e) {
      throw unreadable();
    }
  }

  private ShoreshException unreadable() {
    return new ShoreshException(
      'Those ' +
        held.labels().pluralInSentence('Seats') +
        ' could not be read. Download Shoresh\'s connector again from Settings in Shoresh.'
    );
  }
}
