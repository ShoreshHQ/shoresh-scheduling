/**
 * Versions of a program's Generated Schedule week through an agent or the command line, as the
 * person (docs/protocol/api.md API-1.32 to API-1.35): web address /v1/versions, GET
 * ?season=&week=&program=, answers the Versions panel's own list (SchedulesController.getVersions)
 * for the connector to say in the panel's words (c/shoreshVersions words.js). Save, Restore,
 * rename and delete (AgentSaveVersion, AgentRestoreVersion, AgentRenameVersion,
 * AgentDeleteVersion) are the panel's own server actions; a version is found here by its name,
 * and by when it was saved when two share a name, never guessed.
 */
@RestResource(urlMapping='/v1/versions')
global with sharing class AgentVersions implements AgentRequest.Read {
  @HttpGet
  global static void get() {
    AgentRequest.answer(new AgentVersions());
  }

  public Set<String> fields() {
    return new Set<String>{ 'season', 'week', 'program' };
  }

  public String run(Map<String, Object> asked) {
    AgentWeeks.Week week = AgentWeeks.placeOf(asked);
    return JSON.serialize(
      new Map<String, Object>{
        'week' => week.name,
        'program' => week.program.Name,
        // A delete is on the panel once the week is built or started on Manual Build (API-1.41).
        'built' => week.draft != null ||
        ManualDrafts.find(week.program.Id, week.weekId) != null,
        // Its saved times are said on the camp's clock (CORE-6.11).
        'time_zone' => CampClock.zoneOfProgram(week.program.Id),
        'versions' => SchedulesController.getVersions(
          week.program.Id,
          week.weekId
        )
      }
    );
  }

  /**
   * The week's version called body's "version" (as camps type names); with two of that name, the
   * one saved when body's "saved" says (as list_versions gives it). Refused otherwise, naming the
   * versions there are, or when each of the two was saved (API-1.35).
   */
  public static ScheduleViews.VersionRow named(
    AgentWeeks.Week week,
    Map<String, Object> body
  ) {
    return named(
      week,
      body,
      SchedulesController.getVersions(week.program.Id, week.weekId)
    );
  }

  /** The same, among the rows given (the Saved versions page's, with its published schedule). */
  public static ScheduleViews.VersionRow named(
    AgentWeeks.Week week,
    Map<String, Object> body,
    List<ScheduleViews.VersionRow> rows
  ) {
    String asked = AgentFields.text(body, 'version');
    String saved = AgentFields.text(body, 'saved');
    String word = wordOf(week);
    if (String.isBlank(asked)) {
      throw new ShoreshException('Say which ' + word + ' (version).');
    }
    List<ScheduleViews.VersionRow> same = new List<ScheduleViews.VersionRow>();
    List<String> names = new List<String>();
    for (ScheduleViews.VersionRow row : rows) {
      if (!names.contains(row.name)) {
        names.add(row.name);
      }
      if (IncomingBatch.fold(row.name) == IncomingBatch.fold(asked)) {
        same.add(row);
      }
    }
    if (same.isEmpty()) {
      throw new ShoreshException(
        'There is no ' +
          word +
          ' called "' +
          asked.left(80) +
          '" in ' +
          week.name +
          '. ' +
          (names.isEmpty()
            ? 'It has none yet.'
            : 'Its ' + word + 's: ' + String.join(names, ', ') + '.')
      );
    }
    return oneOf(
      same,
      saved,
      week.name +
        ' has ' +
        same.size() +
        ' ' +
        word +
        's called "' +
        same[0].name +
        '".'
    );
  }

  /**
   * The one of those saved when saved says; refused, after twins (what there are two of), naming
   * when each was saved, otherwise.
   */
  private static ScheduleViews.VersionRow oneOf(
    List<ScheduleViews.VersionRow> same,
    String saved,
    String twins
  ) {
    if (same.size() == 1) {
      return same[0];
    }
    List<String> times = new List<String>();
    for (ScheduleViews.VersionRow row : same) {
      String at = savedOf(row);
      if (at == saved) {
        return row;
      }
      times.add(at);
    }
    throw new ShoreshException(
      twins +
        ' Say which by when it was saved (saved), as list_versions gives it: ' +
        String.join(times, ', ') +
        '.'
    );
  }

  /** When a version was saved, as list_versions gives it: 2026-10-31T19:40:12.000Z. */
  public static String savedOf(ScheduleViews.VersionRow row) {
    return JSON.serialize(row.savedAt).remove('"');
  }

  /** "version", in the camp's own words. */
  public static String wordOf(AgentWeeks.Week week) {
    return AgentSchedules.campWordsOf(week).singularInSentence('Version');
  }

  /**
   * The panel's action, refused as the panel says it (shoreshErrors failed()): what didn't
   * happen, then Shoresh's reason.
   */
  public static ShoreshException failed(String what, Exception e) {
    return new ShoreshException(what + ' ' + ScreenErrors.words(e));
  }
}
