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
global with sharing class AgentAssignElectiveSeats implements AgentWeeks.Action, AgentAskFirst.Preview {
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
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      Map<String, Object> asked = new Map<String, Object>();
      for (
        String field : new List<String>{ 'season', 'week', 'elective_set' }
      ) {
        asked.put(field, RestContext.request.params.get(field));
      }
      AgentElectives.Run run = AgentElectives.committed(asked);
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(run.id);
      Id campId = [
        SELECT Season__r.Camp__c
        FROM ElectiveSet__c
        WHERE Id = :view.run.setId
        WITH USER_MODE
      ]
      .Season__r.Camp__c;
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, Object>{
            'view' => view,
            'labels' => CampLabels.forCamp(campId).all()
          },
          true
        )
      );
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          OutgoingRows.answered(
            ours ? e.getMessage() : ScreenErrors.loadingWords(e)
          )
        )
      );
    }
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentAssignElectiveSeats());
  }

  /**
   * What Assign does, said from the run as it is now (API-1.106): only the seats that change, as
   * its save writes only what differs (ElectiveSeatSaves.save).
   */
  public String preview() {
    heldAsSeen();
    Map<String, Assignment__c> now = new Map<String, Assignment__c>();
    for (Assignment__c seat : [
      SELECT Camper__c, Date__c, TimeBlock__c, Offering__c, Locked__c
      FROM Assignment__c
      WHERE ElectiveRun__c = :held.id
      WITH USER_MODE
    ]) {
      now.put(
        ElectiveSeatChecks.seatKey(
          seat.Camper__c,
          seat.Date__c,
          seat.TimeBlock__c
        ),
        seat
      );
    }
    Change change = new Change();
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
    return 'This assigns seats in ' +
      held.setName +
      ' in ' +
      held.weekName +
      ', in the version being worked on: ' +
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
          ? 'no seat changes'
          : String.join(changed, ', ')) +
        (kept.isEmpty() ? '' : '; ' + String.join(kept, ', and ')) +
        '.';
    }

    private List<String> changes() {
      List<String> parts = new List<String>();
      if (placed > 0) {
        parts.add(seats(placed) + ' placed from the campers\' choices');
      }
      if (moved > 0) {
        parts.add(seats(moved) + ' moved to another elective');
      }
      if (takenOut > 0) {
        parts.add(seats(takenOut) + ' taken out');
      }
      return parts;
    }

    private List<String> stays() {
      List<String> parts = new List<String>();
      if (same > 0) {
        parts.add(
          seats(same) + (same == 1 ? ' stays as it is' : ' stay as they are')
        );
      }
      if (locked > 0) {
        parts.add(
          'the ' +
            locked +
            (locked == 1 ? ' locked seat stays' : ' locked seats stay')
        );
      }
      return parts;
    }
  }

  public String run() {
    if (held == null) {
      heldAsSeen();
    }
    Map<String, Object> request = new Map<String, Object>{
      'runId' => held.id,
      'revision' => seen,
      'seats' => body.get('seats'),
      'dropped' => body.get('dropped') == null
        ? new List<Object>()
        : body.get('dropped')
    };
    try {
      // The screen's own Assign seats.
      ElectiveSeatsController.assignSeats(JSON.serialize(request));
    } catch (Exception e) {
      throw new ShoreshException(
        'Seats weren\'t assigned. ' + ScreenErrors.words(e)
      );
    }
    return 'Seats assigned in ' + held.setName + ' in ' + held.weekName + '.';
  }

  /** The run asked for, held while still as seen, with the seats sent. */
  private void heldAsSeen() {
    body = AgentFields.body(FIELDS);
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

  private static ShoreshException unreadable() {
    return new ShoreshException(
      'Those seats could not be read. Download Shoresh\'s connector again from Settings in Shoresh.'
    );
  }

  private static String seats(Integer count) {
    return count + (count == 1 ? ' seat' : ' seats');
  }
}
