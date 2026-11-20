/**
 * build: build a program's Generated Schedule week, as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.19 to API-1.21). Web address /v1/build_week. The build
 * engine runs where the screen runs it, outside Salesforce (the connector runs the same engine
 * module the screen does), so this address has two halves:
 *   GET  ?season=&week=&program=  what Generate reads: Generated Schedule's own getInputs, the
 *        season's setup and the camp's words, exactly as the screen reads them
 *   POST {season, week, program, revision, option, days, engine_notes, action}  the week the engine
 *        built, saved by Generated Schedule's own save (Generate for a first build, Rebuild after,
 *        or the Build menu's action asked for, API-1.127 to API-1.130: TryAnother, FillOpen,
 *        StartOver, on a week already built), so locks, hand edits and "changed by someone else"
 *        behave as on screen
 * As on the screen, only the save's own version is kept (Rebuild, Try another and Start over
 * keep "Before Rebuild", "Before Try another" or "Before Start over"; Generate and Fill the open
 * cells keep none), and only Rebuild and Start over have an Undo: the screen's own, with the
 * version the save kept (AgentUndo, API-1.14).
 */
@RestResource(urlMapping='/v1/build_week')
global with sharing class AgentBuild implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'revision',
    'option',
    'days',
    'engine_notes',
    'action'
  };
  private static final Set<String> BUILD_MENU = new Set<String>{
    GeneratedSaves.TRY_ANOTHER,
    GeneratedSaves.FILL_OPEN,
    GeneratedSaves.START_OVER
  };

  @HttpGet
  global static void get() {
    AgentRequest.answer(new WhatGenerateReads());
  }

  /** The GET: what Generate reads for the week (readOf). */
  private with sharing class WhatGenerateReads implements AgentRequest.Read {
    public Set<String> fields() {
      return new Set<String>{ 'season', 'week', 'program' };
    }

    public String run(Map<String, Object> asked) {
      return JSON.serialize(AgentBuild.readOf(AgentWeeks.placeOf(asked)), true);
    }
  }

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentBuild());
  }

  public Set<String> fields() {
    return FIELDS;
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

  public String run(Map<String, Object> body) {
    AgentWeeks.Week week = AgentWeeks.placeOf(body);
    Boolean first = week.draft == null;
    String action = actionOf(body, first, week.name);
    String change = changeOf(action, week.name, optionOf(body));
    GeneratedWeek.Save request = requestOf(body, week, action);
    GeneratedWeek.Result saved = save(week, request);
    holdUndo(action, change, saved);
    // Notes the server couldn't keep are said, never hidden, as on the screen.
    return String.isBlank(request.engineNotes) || saved.engineNotes != null
      ? change + '.'
      : change +
        '. ' +
        week.name +
        ' was saved without the reasons for how it was built.';
  }

  /**
   * What the build leaves for its Undo, as the screen offers one: Rebuild and Start over undo
   * with the version their save kept; Generate, Try another and Fill the open cells have none
   * (naming the version the save kept, if it kept one).
   */
  private static void holdUndo(
    String action,
    String change,
    GeneratedWeek.Result saved
  ) {
    String kept = saved.versionId == null
      ? null
      : GeneratedSaves.VERSION_FIRST.get(action);
    Boolean undoable =
      saved.versionId != null &&
      (action == GeneratedSaves.REBUILD ||
      action == GeneratedSaves.START_OVER);
    Map<String, Object> undo = AgentUndoHeld.entry(
      saved.scheduleId,
      undoable ? 'build' : 'none',
      change
    );
    undo.put('seen', saved.revision);
    undo.put('version', saved.versionId);
    undo.put('version_name', kept);
    AgentUndoHeld.hold(undo);
  }

  /** The save's action: the Build menu's, asked for on a week built; else Generate or Rebuild. */
  private static String actionOf(
    Map<String, Object> body,
    Boolean first,
    String weekName
  ) {
    String asked = AgentFields.text(body, 'action');
    if (String.isEmpty(asked)) {
      return first ? GeneratedSaves.GENERATE : GeneratedSaves.REBUILD;
    }
    if (!BUILD_MENU.contains(asked)) {
      throw new ShoreshException('The Build menu has no ' + asked + '.');
    }
    if (first) {
      throw new ShoreshException(
        weekName + ' hasn\'t been built yet. Nothing was changed.'
      );
    }
    return asked;
  }

  /** The change, as its answer and its version's name say it. */
  private static String changeOf(
    String action,
    String weekName,
    Integer option
  ) {
    switch on action {
      when 'TryAnother' {
        return 'Option ' + option + ' of ' + weekName;
      }
      when 'FillOpen' {
        return 'Placed what fits in the open cells of ' + weekName;
      }
      when 'StartOver' {
        return 'Started ' + weekName + ' over';
      }
      when 'Generate' {
        return 'Built ' + weekName;
      }
      when else {
        return 'Rebuilt ' + weekName;
      }
    }
  }

  /** What the screen says first when a save fails: what didn't happen (then why). */
  private static String failedOf(
    String action,
    Integer option,
    String weekName
  ) {
    switch on action {
      when 'TryAnother' {
        return 'Option ' + option + ' wasn\'t saved. Nothing was changed. ';
      }
      when 'FillOpen' {
        return 'The open cells weren\'t filled. Nothing was changed. ';
      }
      when 'StartOver' {
        return weekName + ' wasn\'t started over. Nothing was changed. ';
      }
      when else {
        return weekName + ' was not built. ';
      }
    }
  }

  /** What the screen's save reads. */
  private static GeneratedWeek.Save requestOf(
    Map<String, Object> body,
    AgentWeeks.Week week,
    String action
  ) {
    GeneratedWeek.Save request = new GeneratedWeek.Save();
    request.programId = week.program.Id;
    request.weekId = week.weekId;
    request.scheduleId = week.draft?.Id;
    request.revision = AgentFields.text(body, 'revision');
    request.action = action;
    request.option = optionOf(body);
    request.days = daysOf(body);
    request.engineNotes = (String) body.get('engine_notes');
    return request;
  }

  /** The screen's own save; what it saved, or a conflict or refusal in its words. */
  private static GeneratedWeek.Result save(
    AgentWeeks.Week week,
    GeneratedWeek.Save request
  ) {
    GeneratedWeek.Result result;
    try {
      result = GeneratedScheduleController.saveWeek(request);
    } catch (Exception e) {
      throw new ShoreshException(
        failedOf(request.action, request.option, week.name) +
        ScreenErrors.words(e)
      );
    }
    if (result.conflict) {
      throw new AgentWeeks.ConflictException(result.message);
    }
    return result;
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
