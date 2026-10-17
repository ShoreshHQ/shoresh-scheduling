/**
 * Manual Build's saves: each edit changes a run of slots (one group, one day, one or more time
 * blocks next to each other, and only the blocks the screen made it on, which it names) and says what those slots held when the director saw them (SlotIds).
 * An edit is made only if its slots still hold that, so two people can work on the same day at
 * once and nobody's change is overwritten unseen: an edit whose slots someone else changed since
 * comes back as a conflict, for the screen to ask "keep theirs or use yours" (Greg, 2026-10-17).
 *
 * Only a draft can be changed, and only as SlotRules allows. Runs in user mode; the days are
 * written by ScheduleDaySaves under the schedule's lock.
 */
public with sharing class SlotSaves {
  private SlotRules rules;
  private Map<Date, ScheduleDays.DayGrid> days = new Map<Date, ScheduleDays.DayGrid>();
  private Set<Date> changed = new Set<Date>();

  /** Makes the edits that still fit, in order, and returns the schedule as it now is. */
  public static SlotEdits.Result save(
    Id scheduleId,
    List<SlotEdits.Edit> edits
  ) {
    Schedule__c schedule = ManualDrafts.locked(scheduleId);
    SlotSaves saves = new SlotSaves();
    saves.rules = new SlotRules(schedule, edits);
    for (ScheduleDays.DayGrid day : ScheduleDays.read(scheduleId)) {
      saves.days.put(day.day, day);
    }
    SlotEdits.Result result = new SlotEdits.Result();
    for (Integer i = 0; i < edits.size(); i++) {
      if (!saves.apply(edits[i])) {
        result.conflicts.add(i);
      }
    }
    saves.write(scheduleId);
    result.schedule = ScheduleViews.open(scheduleId);
    return result;
  }

  private void write(Id scheduleId) {
    List<Date> ordered = new List<Date>(changed);
    ordered.sort();
    List<ScheduleDaySaves.DaySave> toSave = new List<ScheduleDaySaves.DaySave>();
    for (Date day : ordered) {
      ScheduleDays.DayGrid read = days.get(day);
      read.grid.dropUnusedItems();
      toSave.add(new ScheduleDaySaves.DaySave(day, read.grid, read.revision));
    }
    if (!toSave.isEmpty()) {
      ScheduleDaySaves.write(scheduleId, toSave);
    }
  }

  /** Makes one edit, or returns false when someone changed its slots since. */
  private Boolean apply(SlotEdits.Edit edit) {
    // Worked on copies, so an edit that does not fit leaves the days as they were.
    Map<Date, ScheduleGrid> working = new Map<Date, ScheduleGrid>();
    for (SlotEdits.Run run : edit.runs) {
      ScheduleDays.DayGrid day = readable(run.day);
      if (!working.containsKey(run.day)) {
        working.put(run.day, ScheduleGrid.fromText(day.grid.toText()));
      }
      if (!applyRun(run, working.get(run.day))) {
        return false;
      }
    }
    for (Date day : working.keySet()) {
      days.get(day).grid = working.get(day);
      changed.add(day);
    }
    return true;
  }

  /** A day of the schedule that can be read; anything else is refused, not a conflict. */
  private ScheduleDays.DayGrid readable(Date day) {
    ScheduleDays.DayGrid read = days.get(day);
    if (read == null) {
      throw new ShoreshException(
        'That day is not in this schedule. Reload the page.'
      );
    }
    if (read.grid == null) {
      throw new ShoreshException(
        'This day could not be read: ' + read.problem + '.'
      );
    }
    return read;
  }

  private Boolean applyRun(SlotEdits.Run run, ScheduleGrid grid) {
    Integer g = SlotIds.indexOf(grid.groupIds(), run.groupId);
    Integer first = SlotIds.indexOf(grid.blockIds(), run.firstBlockId);
    if (
      g < 0 ||
      !run.fits(first, grid.blocks.size()) ||
      !run.onBlocks(grid.blockIds(), first)
    ) {
      return false;
    }
    List<String> was = SlotIds.ofRow(grid, g);
    for (Integer i = 0; i < run.before.size(); i++) {
      if (!was[first + i].equals(SlotIds.normal(run.before[i]))) {
        return false;
      }
    }
    // A run starts where a placement starts: starting inside one would cut off its first part.
    SlotRules.checkStartsClean(was[first]);
    Set<Integer> inRun = new Set<Integer>();
    for (Integer i = 0; i < run.after.size(); i++) {
      writeSlot(grid, new List<Integer>{ g, first + i }, run.after[i]);
      inRun.add(first + i);
    }
    return SlotRules.neighboursKept(was, SlotIds.ofRow(grid, g), inRun);
  }

  /** One slot (at: group and block positions) given what it should now hold. */
  private void writeSlot(ScheduleGrid grid, List<Integer> at, String after) {
    Integer g = at[0];
    Integer b = at[1];
    String slot = SlotIds.normal(after);
    List<String> row = SlotIds.ofRow(grid, g);
    if (slot.equals(row[b])) {
      return;
    }
    rules.checkNotSetTime(row[b], slot);
    rules.checkAtCamp(slot, grid.groups[g].id, grid.blocks[b].id);
    if (slot == SlotIds.OPEN) {
      grid.rows[g][b] = SlotIds.OPEN;
    } else if (SlotIds.isCarryOn(slot)) {
      String previous = b == 0 ? SlotIds.OPEN : row[b - 1];
      if (!SlotIds.owner(previous).equals(slot.substring(1))) {
        throw new ShoreshException(
          'That change could not be read. Reload the page and try again.'
        );
      }
      grid.rows[g][b] = ScheduleGrid.CARRIES_ON;
    } else {
      grid.rows[g][b] = rules.startToken(grid, slot);
    }
  }
}
