/**
 * assign_elective_seats: Assign seats (or Assign again) on the Elective seats screen, through an
 * agent or the command line (docs/protocol/api.md API-1.67). Web address
 * /v1/assign_elective_seats. GET ?season=&week=&elective_set= answers what the screen reads to
 * assign (its run, ElectiveSeatsController.openRun, and the camp's words); the seats are worked out
 * where the screen works them out, outside Salesforce (the connector runs the screen's own
 * modules, shoreshElectiveSeats seats.js and shoreshElectiveEngine). POST {season, week,
 * elective_set, seen, seats, dropped} then saves them through the screen's own save
 * (ElectiveSeatsController.assignSeats), only while the run is still as the agent read it (seen),
 * with the run locked; otherwise refused (409), nothing changed.
 */
@RestResource(urlMapping='/v1/assign_elective_seats')
global with sharing class AgentAssignElectiveSeats implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'elective_set',
    'seen',
    'seats',
    'dropped'
  };

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
          new Map<String, String>{
            'message' => ours ? e.getMessage() : ScreenErrors.loadingWords(e)
          }
        )
      );
    }
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentAssignElectiveSeats());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentElectives.Run run = AgentElectives.committed(body);
    Decimal seen = AgentElectives.seenOf(body, run);
    if (!(body.get('seats') instanceof List<Object>)) {
      throw new ShoreshException(
        'Those seats could not be read. Download Shoresh\'s connector again from Settings in Shoresh.'
      );
    }
    AgentElectives.holdAsSeen(run, seen);
    Map<String, Object> request = new Map<String, Object>{
      'runId' => run.id,
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
    return 'Seats assigned in ' + run.setName + ' in ' + run.weekName + '.';
  }
}
