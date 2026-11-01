/**
 * switch_to_rain_plans: one day of a program's Generated Schedule or Manual Build week switched to
 * its rain plans, as the screen's Edit > Rainy day… does, through an agent or the command line
 * (docs/protocol/api.md API-1.65). Web address /v1/switch_to_rain_plans, POST {season, week,
 * program, schedule, change, said, runs, rain, seen}. The switch is worked out where the screen
 * works it out, outside Salesforce: the connector runs the week editor's own rainy day
 * (c/shoreshWeekEditor rain.js) on the week as it read it and sends the runs and marks the screen
 * would send. They are saved as the screen saves them (Generated Schedule's hand-edit save, or
 * Manual Build's saveSlots, as AgentCells does), each run made only when its cells still hold what
 * the agent saw, and only while the day's marks are still the ones it read (seen), with the week
 * locked; otherwise refused (409), nothing changed. The week is kept first as "Before rainy
 * <day>", the name the screen gives, marked "Through an agent", so Undo switches the day back.
 */
@RestResource(urlMapping='/v1/switch_to_rain_plans')
global with sharing class AgentRainyDay implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'change',
    'said',
    'runs',
    'rain',
    'seen'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentRainyDay());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    String change = AgentFields.text(body, 'change');
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
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(week.draft.Id);
    if (!sameMarks(days, edit.rain[0].day, (List<Object>) body.get('seen'))) {
      throw changedSince(change);
    }
    // The name the screen keeps the week under: "Before rainy Monday".
    Id versionId = AgentWeeks.keepBefore(
      week.draft,
      days,
      change.uncapitalize()
    );
    // One edit, as the screen sends one step: made whole or not at all.
    SlotEdits.Result result = week.manual
      ? ManualBuildController.saveSlots(
          week.draft.Id,
          new List<SlotEdits.Edit>{ edit }
        )
      : AgentCells.handEdit(week, days, edit);
    if (!result.conflicts.isEmpty()) {
      throw changedSince(change);
    }
    AgentWeeks.changed(versionId, week.draft.Id);
    String said = AgentFields.text(body, 'said');
    return change +
      (String.isBlank(said) ? '.' : ': ' + said + '.') +
      ' undo_last_agent_change switches it back.';
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

  private static AgentWeeks.ConflictException changedSince(String change) {
    return new AgentWeeks.ConflictException(
      'Changed by someone else since you read the week: ' +
        change +
        '. Nothing was changed.'
    );
  }
}
