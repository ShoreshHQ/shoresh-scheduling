/**
 * rainy_day: one day of a program's Generated Schedule or Manual Build week switched to
 * its rain plans, as the screen's Edit > Rainy day… does, through an agent or the command line
 * (docs/protocol/api.md API-1.65). Web address /v1/rainy_day, POST {season, week,
 * program, schedule, change, said, runs, rain, seen, revision}. The switch is worked out where the screen
 * works it out, outside Salesforce: the connector runs the week editor's own rainy day
 * (c/shoreshWeekEditor rain.js) on the week as it read it and sends the runs and marks the screen
 * would send. They are saved as the screen saves them (Generated Schedule's hand-edit save, or
 * Manual Build's saveSlots, as AgentCells does), each run made only when its cells still hold what
 * the agent saw, and only while the day's marks are still the ones it read (seen), with the week
 * locked; otherwise refused (409), nothing changed. As on the screen, the week is kept first as
 * the version the screen keeps (RainyDayController: "Before rainy <day>", Auto-saved), and the
 * switch is one hand edit the connector can undo for the rest of the conversation, its marks too
 * (AgentUndo, API-1.14).
 */
@RestResource(urlMapping='/v1/rainy_day')
global with sharing class AgentRainyDay implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'change',
    'said',
    'runs',
    'rain',
    'seen',
    'revision'
  };

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentRainyDay());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  public String run(Map<String, Object> body) {
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    String change = AgentFields.text(body, 'change');
    SlotEdits.Edit edit = editOf(body, change);
    String seen = AgentSchedules.holdAsSeen(week, body, 'revision');
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(week.draft.Id);
    if (!sameMarks(days, edit.rain[0].day, (List<Object>) body.get('seen'))) {
      throw AgentWeeks.changedSince(change);
    }
    // The version the screen keeps first, under the name it gives: "Before rainy Monday".
    String kept = 'Before ' + change.uncapitalize();
    Id versionId = AgentScreenVersions.keepVersion(week, kept);
    // One edit, as the screen sends one step: made whole or not at all.
    SlotEdits.Result result = AgentSchedules.saveEdit(week, seen, edit);
    if (!result.conflicts.isEmpty()) {
      throw AgentWeeks.changedSince(change);
    }
    Map<String, Object> undo = AgentUndoHeld.entry(
      week.draft.Id,
      'edit',
      change
    );
    undo.put('seen', result.revision);
    undo.put('version', versionId);
    undo.put('version_name', kept);
    AgentUndoHeld.hold(undo);
    String said = AgentFields.text(body, 'said');
    return change +
      (String.isBlank(said) ? '.' : ': ' + said + '.') +
      ' The week as it was is kept in Versions as "' +
      kept +
      '".';
  }

  /** The switch as the connector sends it: its runs and one day's marks; refused otherwise. */
  private static SlotEdits.Edit editOf(
    Map<String, Object> body,
    String change
  ) {
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = AgentCells.runsOf(body.get('runs'));
    edit.rain = rainOf(body.get('rain'));
    if (
      String.isBlank(change) ||
      edit.rain == null ||
      edit.rain.size() != 1 ||
      !(body.get('seen') instanceof List<Object>)
    ) {
      throw new ShoreshException(
        'That change could not be read. Download Shoresh\'s connector again from Settings in Shoresh.'
      );
    }
    return edit;
  }

  /** The day's marks now are the ones the agent read (compared as RainMarks writes them). */
  private static Boolean sameMarks(
    List<ScheduleDays.DayGrid> days,
    Date day,
    List<Object> seen
  ) {
    List<String> said = new List<String>();
    for (Object mark : seen) {
      said.add(String.valueOf(mark));
    }
    for (ScheduleDays.DayGrid read : days) {
      if (read.day == day) {
        return RainMarks.normal(read.rain) == RainMarks.normal(said);
      }
    }
    // Not one of the week's days: the save refuses it in its own words.
    return true;
  }

  /** The marks the switch leaves, as the screen sends them (SlotEdits.RainDay); null if unreadable. */
  private static List<SlotEdits.RainDay> rainOf(Object sent) {
    if (!(sent instanceof List<Object>)) {
      return null;
    }
    try {
      return (List<SlotEdits.RainDay>) JSON.deserialize(
        JSON.serialize(sent),
        List<SlotEdits.RainDay>.class
      );
    } catch (Exception e) {
      return null;
    }
  }
}
