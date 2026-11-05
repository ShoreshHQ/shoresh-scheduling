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

  /** What Assign does, said from the run as it is now (API-1.106). */
  public String preview() {
    heldAsSeen();
    Set<String> locked = new Set<String>();
    Integer replaced = 0;
    for (Assignment__c seat : [
      SELECT Camper__c, Date__c, TimeBlock__c, Locked__c
      FROM Assignment__c
      WHERE ElectiveRun__c = :held.id
      WITH USER_MODE
    ]) {
      if (ElectiveSeatChecks.kept(seat)) {
        locked.add(
          ElectiveSeatChecks.seatKey(
            seat.Camper__c,
            seat.Date__c,
            seat.TimeBlock__c
          )
        );
      } else {
        replaced++;
      }
    }
    Integer placed = 0;
    for (Object each : (List<Object>) body.get('seats')) {
      if (!locked.contains(keyOf(each))) {
        placed++;
      }
    }
    return said(placed, replaced, locked.size());
  }

  /** Assign said: the set, week and version, what it places and replaces, what stays. */
  private String said(Integer placed, Integer replaced, Integer locked) {
    return 'This assigns seats in ' +
      held.setName +
      ' in ' +
      held.weekName +
      ', in the version being worked on: ' +
      seats(placed) +
      ' placed from the campers\' choices' +
      (replaced == 0
        ? ''
        : ', replacing the ' +
          seats(replaced) +
          (replaced == 1
            ? ' there now that isn\'t locked'
            : ' there now that aren\'t locked')) +
      (locked == 0
        ? '.'
        : '; the ' +
          seats(locked) +
          (locked == 1 ? ' that is locked stays.' : ' that are locked stay.')) +
      ' There is no undo.';
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

  /** A seat sent, keyed as Assign keys it; refused when it can't be read. */
  private static String keyOf(Object sent) {
    try {
      Map<String, Object> seat = (Map<String, Object>) sent;
      return ElectiveSeatChecks.seatKey(
        (Id) seat.get('camperId'),
        Date.valueOf(String.valueOf(seat.get('day'))),
        (Id) seat.get('blockId')
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
