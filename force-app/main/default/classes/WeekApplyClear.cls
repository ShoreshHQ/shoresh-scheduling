/**
 * What Apply to other weeks takes off a target week's day before the other week's cells go in
 * (WEEK-6.2, ADR 0025 choice 5), so the copying stays ManualWeekCopy's, into Open cells. Taken off,
 * as runs of the same slot saves as any edit: what the other week's day doesn't have there. Kept:
 * a locked placement or locked empty cell (each listed), fixed and recurring activities (this week
 * has its own, ManualWeekPlacements) and a special event (put on each day by hand, listed); and,
 * each said by WeekApplyKeep, a group away in either week, a group the other week's day has no row
 * for, and a placement on a time block that day doesn't have.
 */
public with sharing class WeekApplyClear {
  private ManualWeekStart rules;
  // What stays and is said so: groups away, a group or time block the source day lacks.
  private WeekApplyKeep keep;
  private Set<Id> away;
  // The target day being worked on, and how it is said.
  private ScheduleDays.DayGrid target;
  private String dayName;
  public List<String> kept = new List<String>();
  public List<String> leftOut = new List<String>();
  private Map<Date, SlotEdits.Edit> editByDay = new Map<Date, SlotEdits.Edit>();

  public WeekApplyClear(ManualWeekStart rules, WeekApplyKeep keep) {
    this.rules = rules;
    this.keep = keep;
    away = keep.awayGroups();
  }

  /** The groups whose rows stay: away in either week. */
  public Set<Id> away() {
    return away;
  }

  /** Takes off the target day's working grid what the source day doesn't have. */
  public void clearDay(
    ScheduleGrid source,
    ScheduleDays.DayGrid target,
    String dayName
  ) {
    this.target = target;
    this.dayName = dayName;
    List<String> sourceGroups = source.groupIds();
    for (Integer g = 0; g < target.grid.groups.size(); g++) {
      ScheduleGrid.GroupRef grp = target.grid.groups[g];
      Integer sg = SlotIds.indexOf(sourceGroups, grp.id);
      if (away.contains(Id.valueOf(grp.id))) {
        continue;
      }
      if (sg < 0) {
        keep.groupMissing(grp.name, dayName);
      } else {
        clearGroup(source, sg, g);
      }
    }
  }

  private void clearGroup(ScheduleGrid source, Integer sg, Integer g) {
    String said = target.grid.groups[g].name + ' · ' + dayName;
    listLockedEmpty(target.grid, g, said);
    List<String> sourceRow = SlotIds.ofRow(source, sg);
    for (
      ManualWeekPlacements.Placement p : ManualWeekPlacements.of(target.grid, g)
    ) {
      String name = ManualWeekPlacements.nameOf(target.grid, p.slot);
      if (isLocked(p, g)) {
        kept.add(
          name + ' · ' + said + ' · ' + target.grid.blocks[p.first].name
        );
      } else if (!ManualWeekPlacements.holds(p, source, sourceRow)) {
        String lacking = blockLacking(p, source);
        if (lacking != null) {
          keep.blockMissing(name + ' · ' + said, lacking);
        } else if (p.slot.startsWith('S:')) {
          leftOut.add(name + ' · ' + said + ': ' + rules.whyNotItem(p.slot));
        } else {
          clear(p, g);
        }
      }
    }
  }

  private void listLockedEmpty(ScheduleGrid grid, Integer g, String said) {
    List<String> row = SlotIds.ofRow(grid, g);
    for (Integer b = 0; b < row.size(); b++) {
      if (row[b] == SlotIds.OPEN && ScheduleGridLocks.isLocked(grid, g, b)) {
        kept.add('Locked empty · ' + said + ' · ' + grid.blocks[b].name);
      }
    }
  }

  /** The first of a placement's time blocks the source day doesn't have, or null. */
  private static String blockLacking(
    ManualWeekPlacements.Placement p,
    ScheduleGrid source
  ) {
    List<String> sourceBlocks = source.blockIds();
    for (Integer i = 0; i < p.length; i++) {
      ScheduleGrid.Block block = p.grid.blocks[p.first + i];
      if (SlotIds.indexOf(sourceBlocks, block.id) < 0) {
        return block.name;
      }
    }
    return null;
  }

  /** A lock on any cell of a placement keeps all of it (LOCK-4.1). */
  private static Boolean isLocked(ManualWeekPlacements.Placement p, Integer g) {
    for (Integer i = 0; i < p.length; i++) {
      if (ScheduleGridLocks.isLocked(p.grid, g, p.first + i)) {
        return true;
      }
    }
    return false;
  }

  /** The run that takes a whole placement off; the working grid goes on without it. */
  private void clear(ManualWeekPlacements.Placement p, Integer g) {
    SlotEdits.Run run = new SlotEdits.Run();
    run.day = target.day;
    run.groupId = target.grid.groups[g].id;
    run.firstBlockId = target.grid.blocks[p.first].id;
    run.blockIds = new List<String>();
    run.before = new List<String>();
    run.after = new List<String>();
    for (Integer i = 0; i < p.length; i++) {
      run.blockIds.add(target.grid.blocks[p.first + i].id);
      run.before.add(i == 0 ? p.slot : ScheduleGrid.CARRIES_ON + p.slot);
      run.after.add(SlotIds.OPEN);
      target.grid.rows[g][p.first + i] = SlotIds.OPEN;
    }
    if (!editByDay.containsKey(target.day)) {
      SlotEdits.Edit edit = new SlotEdits.Edit();
      edit.runs = new List<SlotEdits.Run>();
      editByDay.put(target.day, edit);
    }
    editByDay.get(target.day).runs.add(run);
  }

  /** One edit per day: on each, what comes off first, then what goes in (fills). */
  public List<SlotEdits.Edit> thenFill(List<SlotEdits.Edit> fills) {
    List<SlotEdits.Edit> edits = new List<SlotEdits.Edit>();
    for (SlotEdits.Edit fill : fills) {
      SlotEdits.Edit clears = editByDay.remove(fill.runs[0].day);
      if (clears == null) {
        edits.add(fill);
      } else {
        clears.runs.addAll(fill.runs);
        edits.add(clears);
      }
    }
    edits.addAll(editByDay.values());
    return edits;
  }
}
