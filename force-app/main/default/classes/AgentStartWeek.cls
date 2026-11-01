/**
 * start_manual_week: start a program's week on Manual Build, as the person, through an agent or
 * the command line (docs/protocol/api.md API-1.46). Web address /v1/start_manual_week, POST
 * {season, week, program, from_week, from}. Without from_week it is the screen's "Start a blank
 * week" (ManualBuildController.startBlankWeek); with it, "Start from another week"
 * (ManualBuildController.getWeekSources, then startFromWeek), the source named as the screen's
 * list names it: the week, and Manual Build, the published schedule or a version's name. Answered
 * in the screen's words, with what it says was not placed or left out.
 */
@RestResource(urlMapping='/v1/start_manual_week')
global with sharing class AgentStartWeek implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'from_week',
    'from'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentStartWeek());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentWeeks.placeOf(body);
    if (ManualDrafts.find(week.program.Id, week.weekId) != null) {
      throw new ShoreshException(
        week.name +
          ' has already been started on ' +
          ManualDrafts.NAME +
          ' for ' +
          week.program.Name +
          '. Change it there (or restore a version) instead.'
      );
    }
    CampLabels labels = CampLabels.forCamp(campOf(week));
    String fromWeek = AgentFields.text(body, 'from_week');
    if (String.isBlank(fromWeek)) {
      ManualBuildViews.DraftView view = started(week, null);
      if (view.startedBySomeoneElse) {
        return someoneElse(labels);
      }
      return 'Started ' +
        week.name +
        '.' +
        linesOf('Not placed: the cell was taken', view.notPlaced);
    }
    ManualBuildViews.WeekSource source = sourceOf(
      ManualBuildController.getWeekSources(week.program.Id, week.weekId),
      body,
      labels
    );
    ManualBuildViews.DraftView view = started(week, source.id);
    if (view.startedBySomeoneElse) {
      return someoneElse(labels);
    }
    return 'Started ' +
      week.name +
      ' from ' +
      source.weekName +
      '.' +
      linesOf(
        'Left Open: it couldn\'t go there this ' +
        labels.singularInSentence('Week'),
        view.leftOut
      ) +
      linesOf('Not placed: the cell was taken', view.notPlaced);
  }

  /** Someone else started the week first: theirs is kept as they made it (API-1.46). */
  private static String someoneElse(CampLabels labels) {
    return 'Someone else started this ' +
      labels.singularInSentence('Week') +
      '; nothing was copied.';
  }

  /** The screen's start (blank, or from the source), refused in its own words. */
  private static ManualBuildViews.DraftView started(
    AgentWeeks.Week week,
    Id sourceId
  ) {
    try {
      return sourceId == null
        ? ManualBuildController.startBlankWeek(week.program.Id, week.weekId)
        : ManualBuildController.startFromWeek(
            week.program.Id,
            week.weekId,
            sourceId
          );
    } catch (AuraHandledException e) {
      throw new ShoreshException(e.getMessage());
    }
  }

  private static Id campOf(AgentWeeks.Week week) {
    return [
      SELECT Camp__c
      FROM Season__c
      WHERE Id = :week.season.Id
      WITH USER_MODE
    ]
    .Camp__c;
  }

  /** The source's name as the list says it: the published schedule in the camp's word. */
  private static String nameOf(
    ManualBuildViews.WeekSource source,
    CampLabels labels
  ) {
    return source.isPublished == true
      ? labels.singular('PublishedSchedule')
      : source.name;
  }

  /** "Week 2 · Manual Build", "Week 1 · Published schedule", "Week 1 · Before the trip (version)". */
  private static String labelOf(
    ManualBuildViews.WeekSource source,
    String name,
    CampLabels labels
  ) {
    Boolean version = source.isVersion == true && source.isPublished != true;
    return source.weekName +
      ' · ' +
      name +
      (version ? ' (' + labels.singularInSentence('Version') + ')' : '');
  }

  /** " <label>: a; b." or "" when there are none. */
  private static String linesOf(String label, List<String> lines) {
    return lines == null || lines.isEmpty()
      ? ''
      : ' ' + label + ': ' + String.join(lines, '; ') + '.';
  }

  /**
   * The one source the screen's list offers under that week and name ("Manual Build", the
   * published schedule, or a version's name; left out when the week has only one). Refused naming
   * the ones there are, as the list names them: never guessed.
   */
  private static ManualBuildViews.WeekSource sourceOf(
    List<ManualBuildViews.WeekSource> sources,
    Map<String, Object> body,
    CampLabels labels
  ) {
    String fromWeek = AgentFields.text(body, 'from_week');
    String fromName = AgentFields.text(body, 'from');
    List<ManualBuildViews.WeekSource> found = new List<ManualBuildViews.WeekSource>();
    List<String> offered = new List<String>();
    for (ManualBuildViews.WeekSource source : sources) {
      String name = nameOf(source, labels);
      offered.add(labelOf(source, name, labels));
      if (
        IncomingBatch.fold(source.weekName) == IncomingBatch.fold(fromWeek) &&
        (String.isBlank(fromName) ||
        IncomingBatch.fold(name) == IncomingBatch.fold(fromName))
      ) {
        found.add(source);
      }
    }
    if (found.size() == 1) {
      return found[0];
    }
    throw new ShoreshException(refusal(found.size(), body, offered));
  }

  /** Why no one source was found, naming what there is to start from. */
  private static String refusal(
    Integer found,
    Map<String, Object> body,
    List<String> offered
  ) {
    String fromWeek = AgentFields.text(body, 'from_week');
    String fromName = AgentFields.text(body, 'from');
    String said = offered.isEmpty()
      ? 'There is nothing to start from yet.'
      : 'What it can start from: ' + String.join(offered, '; ') + '.';
    if (found > 1) {
      return 'Say which of ' +
        fromWeek.left(40) +
        '\'s schedules to start from (from). ' +
        said;
    }
    return 'There is nothing called "' +
      (fromWeek + (String.isBlank(fromName) ? '' : ' · ' + fromName))
        .left(120) +
      '" to start from. ' +
      said;
  }
}
