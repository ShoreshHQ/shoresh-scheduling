/**
 * lock: Generated Schedule's Lock on a cell, a day, a group or a group's day, as the person,
 * through an agent or the command line (docs/protocol/api.md API-1.37). Web address
 * /v1/lock_cells, POST {season, week, program, day, group, time}: day, group and time name one
 * cell; a day alone, a group alone, or a group and a day, the screen's Lock menu shortcuts. It is
 * the menu's own server action (GeneratedScheduleController.setLocks), so a lock covers what the
 * screen's covers; answered as the screen says it ("Locked Bunk 1 · Monday · Period 2."), refused
 * in its words. Unlock is AgentUnlock, the same action the other way.
 */
@RestResource(urlMapping='/v1/lock_cells')
global with sharing class AgentLock implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'day',
    'group',
    'time'
  };

  // GeneratedWeek.LOCK or GeneratedWeek.UNLOCK.
  private String action;

  public AgentLock() {
    this(GeneratedWeek.LOCK);
  }

  public AgentLock(String action) {
    this.action = action;
  }

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentLock());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentWeeks.weekOf(body);
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(week.draft.Id);
    GeneratedWeek.LockChange change = new GeneratedWeek.LockChange();
    change.action = action;
    String place = scopeOf(body, days, week.name, change);
    Boolean locks = change.locks();
    GeneratedWeek.Locked result;
    try {
      result = GeneratedScheduleController.setLocks(
        week.draft.Id,
        new List<GeneratedWeek.LockChange>{ change },
        GeneratedDrafts.revisionOf(days)
      );
    } catch (Exception e) {
      throw new ShoreshException(
        place +
          ' wasn\'t ' +
          (locks ? 'locked' : 'unlocked') +
          '. ' +
          ScreenErrors.words(e)
      );
    }
    if (result.conflict) {
      throw new AgentWeeks.ConflictException(result.message);
    }
    if (result.revision == GeneratedDrafts.revisionOf(days)) {
      // The screen's menu never offers a change that would do nothing (locks.js lockChoices).
      return locks
        ? 'Nothing in ' +
          place +
          ' to lock: it is locked already, or holds only Open cells or fixed or recurring activities (lock an Open cell on its own).'
        : 'Nothing in ' + place + ' is locked.';
    }
    return (locks ? 'Locked ' : 'Unlocked ') + place + '.';
  }

  /**
   * What the change reaches, named as the screen's Lock menu names it: one cell (day, group and
   * time: "Bunk 1 · Monday · Period 2"), a day ("Monday"), a group ("Bunk 1") or a group's day
   * ("Bunk 1 · Monday").
   */
  private static String scopeOf(
    Map<String, Object> body,
    List<ScheduleDays.DayGrid> days,
    String weekName,
    GeneratedWeek.LockChange change
  ) {
    String dayAsked = AgentFields.text(body, 'day');
    String groupAsked = AgentFields.text(body, 'group');
    String timeAsked = AgentFields.text(body, 'time');
    if (String.isBlank(dayAsked) && String.isBlank(groupAsked)) {
      throw new ShoreshException(
        'Say what to ' +
          change.action.toLowerCase() +
          ': a day (day), a group (group), a group\'s day (group and day), or one cell (day, group and time).'
      );
    }
    if (
      String.isNotBlank(timeAsked) &&
      (String.isBlank(dayAsked) || String.isBlank(groupAsked))
    ) {
      throw new ShoreshException(
        'One cell is a day, a group and a time: say all three (day, group, time).'
      );
    }
    List<String> names = new List<String>();
    ScheduleGrid grid = null;
    if (String.isNotBlank(dayAsked)) {
      ScheduleDays.DayGrid day = AgentWeeks.dayOf(days, dayAsked, weekName);
      change.dateValue = day.day;
      grid = day.grid;
    }
    if (String.isNotBlank(groupAsked)) {
      ScheduleGrid.GroupRef found = groupIn(gridsOf(days, grid), groupAsked);
      change.groupId = found.id;
      names.add(found.name);
    }
    if (change.dateValue != null) {
      names.add(AgentWeeks.dayName(change.dateValue));
    }
    if (String.isNotBlank(timeAsked)) {
      ScheduleGrid.Block block = blockIn(grid, timeAsked);
      change.blockId = block.id;
      names.add(block.name);
    }
    return String.join(names, ' · ');
  }

  /** The day's grid when a day was named; otherwise every readable day of the week. */
  private static List<ScheduleGrid> gridsOf(
    List<ScheduleDays.DayGrid> days,
    ScheduleGrid grid
  ) {
    List<ScheduleGrid> grids = new List<ScheduleGrid>();
    if (grid != null) {
      grids.add(grid);
      return grids;
    }
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid != null) {
        grids.add(day.grid);
      }
    }
    return grids;
  }

  /** The group by its name, on the first of those grids that has it. */
  private static ScheduleGrid.GroupRef groupIn(
    List<ScheduleGrid> grids,
    String asked
  ) {
    List<String> names = new List<String>();
    for (ScheduleGrid each : grids) {
      List<String> here = new List<String>();
      for (ScheduleGrid.GroupRef g : each.groups) {
        here.add(g.name);
        if (!names.contains(g.name)) {
          names.add(g.name);
        }
      }
      Integer found = AgentFields.onlyOne(here, asked, 'group');
      if (found >= 0) {
        return each.groups[found];
      }
    }
    throw new ShoreshException(
      'There is no group called "' +
        asked.left(80) +
        '" in this schedule. ' +
        AgentWeeks.namesSaid('groups', names)
    );
  }

  /** The time block by its name ("Period 2") or its start ("09:00"), as AgentCell finds it. */
  private static ScheduleGrid.Block blockIn(ScheduleGrid grid, String asked) {
    List<String> names = new List<String>();
    List<String> starts = new List<String>();
    for (ScheduleGrid.Block block : grid.blocks) {
      names.add(block.name);
      starts.add(block.startTime == null ? '' : block.startTime.left(5));
    }
    Integer found = AgentFields.onlyOne(names, asked, 'time');
    if (found < 0) {
      found = AgentFields.onlyOne(starts, asked, 'time');
    }
    if (found >= 0) {
      return grid.blocks[found];
    }
    throw new ShoreshException(
      'There is no time called "' +
        asked.left(80) +
        '" on that day. ' +
        AgentWeeks.namesSaid('times', names)
    );
  }
}
