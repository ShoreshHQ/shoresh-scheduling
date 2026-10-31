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
global with sharing class AgentVersions {
  @HttpGet
  global static void get() {
    RestResponse response = RestContext.response;
    response.addHeader('Content-Type', 'application/json');
    try {
      Map<String, Object> asked = new Map<String, Object>();
      for (String field : new List<String>{ 'season', 'week', 'program' }) {
        asked.put(field, RestContext.request.params.get(field));
      }
      AgentWeeks.Week week = AgentWeeks.placeOf(asked);
      response.statusCode = 200;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, Object>{
            'week' => week.name,
            'program' => week.program.Name,
            // A delete is on the panel once the week is built or started on Manual Build (API-1.41).
            'built' => week.draft != null ||
            ManualDrafts.find(week.program.Id, week.weekId) != null,
            'versions' => SchedulesController.getVersions(
              week.program.Id,
              week.weekId
            )
          }
        )
      );
    } catch (Exception e) {
      Boolean ours =
        e instanceof ShoreshException || e instanceof AuraHandledException;
      response.statusCode = ours ? 400 : 500;
      response.responseBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, String>{
            'message' => ours ? e.getMessage() : ScreenErrors.words(e)
          }
        )
      );
    }
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
    String asked = AgentFields.text(body, 'version');
    String saved = AgentFields.text(body, 'saved');
    String word = wordOf(week);
    if (String.isBlank(asked)) {
      throw new ShoreshException('Say which ' + word + ' (version).');
    }
    List<ScheduleViews.VersionRow> rows = SchedulesController.getVersions(
      week.program.Id,
      week.weekId
    );
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
    return labelsOf(week).singularInSentence('Version');
  }

  /** The camp's own words. */
  public static CampLabels labelsOf(AgentWeeks.Week week) {
    Id campId = [
      SELECT Camp__c
      FROM Season__c
      WHERE Id = :week.season.Id
      WITH USER_MODE
    ]
    .Camp__c;
    return CampLabels.forCamp(campId);
  }

  /**
   * The panel's action, refused as the panel says it (shoreshErrors failed()): what didn't
   * happen, then Shoresh's reason.
   */
  public static ShoreshException failed(String what, Exception e) {
    return new ShoreshException(what + ' ' + ScreenErrors.words(e));
  }
}
