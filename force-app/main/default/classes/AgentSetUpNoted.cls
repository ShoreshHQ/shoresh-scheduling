/**
 * set_it_up: "Set it up" on a cell an import noted as not set up yet, on Generated
 * Schedule or Manual Build, through an agent or the command line (docs/protocol/api.md API-1.79).
 * Web address /v1/set_it_up, POST {season, week, program, schedule, kind, name}. With the
 * week's draft locked, the draft must still have a cell noting that kind and name (what the agent
 * saw), or it is refused (409) with nothing made. Then the screen's own Set it up runs
 * (SpecialPlacingController.setUpItem), and, as on the screen, nothing else: no version is kept,
 * and the screen has no Undo for it, though its Undo goes on past it to the hand edits before
 * (the week is read again, its history kept: API-1.14).
 */
@RestResource(urlMapping='/v1/set_it_up')
global with sharing class AgentSetUpNoted implements AgentRequest.Change {
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
    AgentRequest.answer(new AgentSetUpNoted());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  public String run(Map<String, Object> body) {
    String kind = KINDS.get(AgentFields.text(body, 'kind').toLowerCase());
    String name = AgentFields.text(body, 'name');
    if (kind == null || String.isBlank(name)) {
      throw new ShoreshException(
        'Say the kind (special event, special day or elective set) and the name the cell notes.'
      );
    }
    // Locked as the screen's save locks it.
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(week.draft.Id);
    // The cell's item as noted, as the screen sends it.
    ScheduleGrid.Item noted = notedOf(days, kind, name);
    if (noted == null) {
      throw new AgentWeeks.ConflictException(
        'Nothing in this week is noted as "' +
          name.left(80) +
          '" not set up yet (someone may have set it up or changed it since). Nothing was changed.'
      );
    }
    String change = 'Set up ' + noted.name;
    SpecialSetUp.Done done;
    try {
      done = SpecialPlacingController.setUpItem(
        week.draft.Id,
        noted.kind,
        noted.name
      );
    } catch (Exception e) {
      throw new ShoreshException(
        'Nothing was changed. ' + ScreenErrors.words(e)
      );
    }
    Map<String, Object> undo = AgentUndoHeld.entry(
      week.draft.Id,
      'kept',
      change
    );
    undo.put(
      'seen',
      week.manual ? null : WeekTickets.stamp(ScheduleDays.read(week.draft.Id))
    );
    AgentUndoHeld.hold(undo);
    return done.said;
  }

  /** The noted cell's item; a special day may be a noted trip, set up as one (SPECIAL-1.5). */
  private static ScheduleGrid.Item notedOf(
    List<ScheduleDays.DayGrid> days,
    String kind,
    String name
  ) {
    ScheduleGrid.Item noted = notedItem(days, kind, name);
    return noted == null && kind == 'D' ? notedItem(days, 'T', name) : noted;
  }

  /** The noted cell's item of that kind and name, read as NotedItems reads it; null when none. */
  private static ScheduleGrid.Item notedItem(
    List<ScheduleDays.DayGrid> days,
    String kind,
    String name
  ) {
    NotedItems asked = new NotedItems(kind, name);
    for (ScheduleDays.DayGrid day : days) {
      for (
        ScheduleGrid.Item item : day.grid == null
          ? new List<ScheduleGrid.Item>()
          : day.grid.items
      ) {
        ScheduleGrid one = new ScheduleGrid();
        one.items.add(item);
        if (asked.isIn(one)) {
          return item;
        }
      }
    }
    return null;
  }
}
