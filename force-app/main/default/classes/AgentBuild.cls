/**
 * build: build a program's Generated Schedule week, as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.19 to API-1.21). Web address /v1/build_week. The build
 * engine runs where the screen runs it, outside Salesforce (the connector runs the same engine
 * module the screen does), so this address has two halves:
 *   GET  ?season=&week=&program=  what Generate reads: Generated Schedule's own getInputs, the
 *        season's setup and the camp's words, exactly as the screen reads them
 *   POST {season, week, program, revision, option, days, engine_notes}  the week the engine
 *        built, saved by Generated Schedule's own save (Generate for a first build, Rebuild after),
 *        so locks, hand edits and "changed by someone else" behave as on screen
 * A version marked "Through an agent" is kept first (the blank week, for a first build), so the
 * person sees it in Versions and Undo brings the week back (AgentUndo).
 */
@RestResource(urlMapping='/v1/build_week')
global with sharing class AgentBuild implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'revision',
    'option',
    'days',
    'engine_notes'
  };

  @HttpGet
  global static void get() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      Map<String, Object> asked = new Map<String, Object>();
      for (String field : new List<String>{ 'season', 'week', 'program' }) {
        asked.put(field, RestContext.request.params.get(field));
      }
      Map<String, Object> read = readOf(AgentWeeks.placeOf(asked));
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(JSON.serialize(read, true));
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
    AgentWeeks.answer(new AgentBuild());
  }

  /**
   * What Generated Schedule reads for the week: its getInputs, the season's setup and the camp's
   * words, exactly as the screen reads them. Also what /v1/week_checks starts from (AgentChecks).
   */
  public static Map<String, Object> readOf(AgentWeeks.Week week) {
    Map<String, Object> read = setupOf(week);
    read.put(
      'inputs',
      GeneratedScheduleController.getInputs(week.program.Id, week.weekId)
    );
    return read;
  }

  /**
   * The season's setup and the camp's words, as both schedule screens read them (Manual Build's
   * checks start from them too, AgentChecks).
   */
  public static Map<String, Object> setupOf(AgentWeeks.Week week) {
    Id campId = [
      SELECT Camp__c
      FROM Season__c
      WHERE Id = :week.season.Id
      WITH USER_MODE
    ]
    .Camp__c;
    return new Map<String, Object>{
      'setup' => SeasonSetupController.getSeasonSetup(week.season.Id),
      'labels' => CampLabels.forCamp(campId).all()
    };
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentWeeks.placeOf(body);
    Boolean first = week.draft == null;
    String change = (first ? 'Built ' : 'Rebuilt ') + week.name;
    Id versionId;
    if (!first) {
      week.draft = GeneratedDrafts.lockedToEdit(week.draft.Id);
      versionId = AgentWeeks.keepBefore(
        week.draft,
        ScheduleDays.read(week.draft.Id),
        change
      );
    }
    Id draftId = save(week, requestOf(body, week));
    if (first) {
      // Before a first build the week was blank, as Generated Schedule showed it: that is kept.
      versionId = AgentWeeks.keepBefore(
        GeneratedDrafts.lockedToEdit(draftId),
        GeneratedInputs.daysOf(
          new GeneratedSetup(week.program.Id, week.weekId).blankWeek().days
        ),
        change
      );
    }
    AgentWeeks.changed(versionId, draftId);
    return change + '.';
  }

  /** What the screen's save reads: Generate for a first build, else Rebuild. */
  private static GeneratedWeek.Save requestOf(
    Map<String, Object> body,
    AgentWeeks.Week week
  ) {
    GeneratedWeek.Save request = new GeneratedWeek.Save();
    request.programId = week.program.Id;
    request.weekId = week.weekId;
    request.scheduleId = week.draft?.Id;
    request.revision = AgentFields.text(body, 'revision');
    request.action = week.draft == null
      ? GeneratedSaves.GENERATE
      : GeneratedSaves.REBUILD;
    request.option = optionOf(body);
    request.days = daysOf(body);
    request.engineNotes = (String) body.get('engine_notes');
    return request;
  }

  /** The screen's own save; the draft saved, or a conflict or refusal in its words. */
  private static Id save(AgentWeeks.Week week, GeneratedWeek.Save request) {
    GeneratedWeek.Result result;
    try {
      result = GeneratedScheduleController.saveWeek(request);
    } catch (Exception e) {
      throw new ShoreshException(
        week.name + ' was not built. ' + ScreenErrors.words(e)
      );
    }
    if (result.conflict) {
      throw new AgentWeeks.ConflictException(result.message);
    }
    return result.scheduleId;
  }

  private static Integer optionOf(Map<String, Object> body) {
    Object option = body.get('option');
    return option instanceof Integer ? (Integer) option : 1;
  }

  private static List<GeneratedWeek.Day> daysOf(Map<String, Object> body) {
    try {
      return (List<GeneratedWeek.Day>) JSON.deserialize(
        JSON.serialize(body.get('days')),
        List<GeneratedWeek.Day>.class
      );
    } catch (JSONException e) {
      throw new ShoreshException('The days built could not be read.');
    }
  }
}
