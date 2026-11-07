/**
 * What a Lock or Unlock through an agent reaches (AgentLock, docs/protocol/api.md API-1.37), named
 * as the screen's Lock menu names it: one cell (day, group and time: "Bunk 1 · Monday ·
 * Period 2"), a day ("Monday"), a group ("Bunk 1") or a group's day ("Bunk 1 · Monday"); the
 * change as setLocks takes it. A name that isn't there is refused naming what there is.
 */
public with sharing class AgentLockScope {
  public GeneratedWeek.LockChange change = new GeneratedWeek.LockChange();
  public String place;
  // The week's days as read, the revision the change is made at.
  public List<ScheduleDays.DayGrid> days;

  /** The scope body names in the week, for action (Lock or Unlock). */
  public AgentLockScope(
    String action,
    Map<String, Object> body,
    AgentWeeks.Week week
  ) {
    change.action = action;
    days = ScheduleDays.read(week.draft.Id);
    String groupAsked = scoped(AgentFields.text(body, 'group'), 'group');
    String dayAsked = scoped(AgentFields.text(body, 'day'), 'day');
    String timeAsked = AgentFields.text(body, 'time');
    checkAsked(dayAsked, groupAsked, timeAsked);
    ScheduleGrid grid = null;
    if (String.isNotBlank(dayAsked)) {
      ScheduleDays.DayGrid day = AgentWeeks.dayOf(days, dayAsked, week.name);
      change.dateValue = day.day;
      grid = day.grid;
    }
    List<String> names = new List<String>();
    if (String.isNotBlank(groupAsked)) {
      ScheduleGrid.GroupRef found = groupIn(gridsOf(days, grid), groupAsked);
      change.groupId = found.id;
      names.add(found.name);
    }
    if (change.dateValue != null) {
      names.add(DayWords.say(change.dateValue));
    }
    if (String.isNotBlank(timeAsked)) {
      ScheduleGrid.Block block = blockIn(grid, timeAsked);
      change.blockId = block.id;
      names.add(block.name);
    }
    place = String.join(names, ' · ');
  }

  /**
   * A day or group is never left out (API-1.107): leaving one out would reach every one, so
   * "all" says that on purpose, and nothing said is refused naming what is missing.
   */
  private String scoped(String asked, String field) {
    if (String.isBlank(asked)) {
      throw new ShoreshException(
        'Nothing was changed: say which ' +
          field +
          ' (' +
          field +
          ') to ' +
          change.action.toLowerCase() +
          ', or "all" for every ' +
          field +
          '.'
      );
    }
    return asked.equalsIgnoreCase('all') ? '' : asked;
  }

  /** Refused unless a scope is named, and a time comes with a day and a group (one cell). */
  private void checkAsked(
    String dayAsked,
    String groupAsked,
    String timeAsked
  ) {
    if (String.isBlank(dayAsked) && String.isBlank(groupAsked)) {
      throw new ShoreshException(
        'Nothing was changed: "all" days of "all" groups is the whole week, which the Lock menu has no shortcut for. Name a day, a group, or both.'
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
