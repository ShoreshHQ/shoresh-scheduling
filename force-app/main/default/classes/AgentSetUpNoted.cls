/**
 * set_up_noted_item: "Set it up" on a cell an import noted as not set up yet, on Generated
 * Schedule or Manual Build, through an agent or the command line (docs/protocol/api.md API-1.79).
 * Web address /v1/set_up_noted_item, POST {season, week, program, schedule, kind, name}. With the
 * week's draft locked, the draft must still have a cell noting that kind and name (what the agent
 * saw), or it is refused (409) with nothing made. The week is kept first as a version marked
 * Through an agent, then the screen's own Set it up runs (SpecialPlacingController.setUpItem):
 * undo_last_agent_change brings the cells back; the record made stays in setup.
 */
@RestResource(urlMapping='/v1/set_up_noted_item')
global with sharing class AgentSetUpNoted implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'kind',
    'name'
  };
  // The kinds a noted cell can be set up as, and the screen's letters for them.
  private static final Map<String, String> KINDS = new Map<String, String>{
    'special event' => 'S',
    'special day' => 'D',
    'elective set' => 'E'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentSetUpNoted());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    String kind = KINDS.get(IncomingBatch.fold(AgentFields.text(body, 'kind')));
    String name = AgentFields.text(body, 'name');
    if (kind == null || String.isBlank(name)) {
      throw new ShoreshException(
        'Say the kind (special event, special day or elective set) and the name the cell notes.'
      );
    }
    // Locked as the screen's save locks it.
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(week.draft.Id);
    if (!noted(days, new NotedItems(kind, name))) {
      throw new AgentWeeks.ConflictException(
        'Nothing in this week is noted as "' +
          name.left(80) +
          '" not set up yet (someone may have set it up or changed it since). Nothing was changed.'
      );
    }
    String change = 'Set up ' + name;
    Id versionId = AgentWeeks.keepBefore(week.draft, days, change);
    SpecialSetUp.Done done;
    try {
      done = SpecialPlacingController.setUpItem(week.draft.Id, kind, name);
    } catch (Exception e) {
      throw new ShoreshException(
        'Nothing was changed. ' + ScreenErrors.words(e)
      );
    }
    AgentWeeks.changed(versionId, week.draft.Id);
    return done.said +
      ' undo_last_agent_change brings the week\'s cells back; what was made stays in setup, and a special day put on a day stays there (take_special_day_off_day takes it off).';
  }

  private static Boolean noted(
    List<ScheduleDays.DayGrid> days,
    NotedItems items
  ) {
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid != null && items.isIn(day.grid)) {
        return true;
      }
    }
    return false;
  }
}
