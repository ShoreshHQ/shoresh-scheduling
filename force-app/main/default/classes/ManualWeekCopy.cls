/**
 * The copying half of "Start from another week" (ManualWeekStart): each source day onto the new
 * week's day with the same weekday, group by group (matched by Id), placement by placement at the
 * same time blocks (matched by Id). A placement goes only whole, into Open cells where its group
 * is at camp; otherwise it is listed with why ("Swim · Bunk 3 · Monday: not at camp then").
 */
public with sharing class ManualWeekCopy {
  private ManualWeekStart rules;
  public List<SlotEdits.Edit> edits = new List<SlotEdits.Edit>();
  public List<String> leftOut = new List<String>();

  /** One placement of the source day: where it starts, how long it runs, what it is. */
  private class Placement {
    ScheduleGrid grid;
    Integer first;
    Integer length = 1;
    String slot;
  }

  /** One group's row on the new week's day, kept up to date as copies go in. */
  private class Target {
    ScheduleDays.DayGrid day;
    Integer g;
    List<String> row;
  }

  public ManualWeekCopy(ManualWeekStart rules) {
    this.rules = rules;
  }

  /** The edits (and what is left out) that copy each source day onto its weekday. */
  public void plan(
    List<ScheduleDays.DayGrid> sourceDays,
    List<ScheduleDays.DayGrid> targetDays
  ) {
    Map<String, ScheduleDays.DayGrid> byWeekday = new Map<String, ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : sourceDays) {
      String weekday = BlankWeek.weekdayOf(day.day);
      if (day.grid != null && !byWeekday.containsKey(weekday)) {
        byWeekday.put(weekday, day);
      }
    }
    for (ScheduleDays.DayGrid target : targetDays) {
      ScheduleDays.DayGrid source = byWeekday.get(
        BlankWeek.weekdayOf(target.day)
      );
      if (source != null && target.grid != null) {
        for (Integer sg = 0; sg < source.grid.groups.size(); sg++) {
          copyGroup(source.grid, sg, target);
        }
      }
    }
  }

  private void copyGroup(
    ScheduleGrid source,
    Integer sg,
    ScheduleDays.DayGrid day
  ) {
    String groupId = source.groups[sg].id;
    Target target = new Target();
    target.day = day;
    target.g = SlotIds.indexOf(day.grid.groupIds(), groupId);
    target.row = target.g < 0 ? null : SlotIds.ofRow(day.grid, target.g);
    for (Placement p : placementsOf(source, sg)) {
      String why = target.g < 0 ? 'not at camp this week' : whyNot(p, target);
      if (why == null) {
        add(p, target);
      } else {
        leftOut.add(
          nameOf(source, p.slot) +
            ' · ' +
            source.groups[sg].name +
            ' · ' +
            BlankWeek.weekdayOf(day.day) +
            ': ' +
            why
        );
      }
    }
  }

  /** A group's placements on a source day, set-time items aside (this week has its own). */
  private static List<Placement> placementsOf(ScheduleGrid grid, Integer g) {
    List<Placement> result = new List<Placement>();
    List<String> row = SlotIds.ofRow(grid, g);
    for (Integer b = 0; b < row.size(); b++) {
      String slot = row[b];
      if (
        slot == SlotIds.OPEN ||
        SlotIds.isCarryOn(slot) ||
        SlotIds.isSetTime(slot)
      ) {
        continue;
      }
      Placement p = new Placement();
      p.grid = grid;
      p.first = b;
      p.slot = slot;
      while (
        b + p.length < row.size() &&
        row[b + p.length] == ScheduleGrid.CARRIES_ON + slot
      ) {
        p.length++;
      }
      result.add(p);
    }
    return result;
  }

  /** Why a placement can't go on the target row, or null when it can. */
  private String whyNot(Placement p, Target target) {
    String why = rules.whyNotItem(p.slot);
    if (why != null) {
      return why;
    }
    Integer first = firstBlockOn(p, target);
    if (first < 0) {
      return 'that day has no ' + p.grid.blocks[p.first].name;
    }
    for (Integer i = 0; i < p.length; i++) {
      ScheduleGrid.Block block = target.day.grid.blocks[first + i];
      if (!rules.atCamp(target.day.grid.groups[target.g].id, block.id)) {
        return 'not at camp then';
      }
      if (target.row[first + i] != SlotIds.OPEN) {
        return nameOf(target.day.grid, target.row[first + i]) + ' is there';
      }
    }
    return null;
  }

  /** Where a placement's blocks start on the target day, or -1 if it lacks any of them in a row. */
  private static Integer firstBlockOn(Placement p, Target target) {
    List<String> blockIds = target.day.grid.blockIds();
    Integer first = SlotIds.indexOf(blockIds, p.grid.blocks[p.first].id);
    for (Integer i = 1; first >= 0 && i < p.length; i++) {
      if (
        blockIds.size() <= first + i ||
        blockIds[first + i] != p.grid.blocks[p.first + i].id
      ) {
        return -1;
      }
    }
    return first;
  }

  /** The edit that puts a placement into Open cells (they are taken from here on). */
  private void add(Placement p, Target target) {
    Integer first = firstBlockOn(p, target);
    SlotEdits.Run run = runFor(p, target.day, first);
    run.groupId = target.day.grid.groups[target.g].id;
    for (Integer i = 0; i < run.after.size(); i++) {
      target.row[first + i] = run.after[i];
    }
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = new List<SlotEdits.Run>{ run };
    edits.add(edit);
  }

  /** The run that fills the placement's blocks on a day, from Open, starting at a block index. */
  private static SlotEdits.Run runFor(
    Placement p,
    ScheduleDays.DayGrid day,
    Integer first
  ) {
    SlotEdits.Run run = new SlotEdits.Run();
    run.day = day.day;
    run.firstBlockId = day.grid.blocks[first].id;
    run.blockIds = new List<String>{ run.firstBlockId };
    run.before = new List<String>{ SlotIds.OPEN };
    run.after = new List<String>{ p.slot };
    for (Integer i = 1; i < p.length; i++) {
      run.blockIds.add(day.grid.blocks[first + i].id);
      run.before.add(SlotIds.OPEN);
      run.after.add(ScheduleGrid.CARRIES_ON + p.slot);
    }
    return run;
  }

  /** The name a grid gives what a slot holds. */
  private static String nameOf(ScheduleGrid grid, String slot) {
    String item = SlotIds.owner(slot);
    for (ScheduleGrid.Item candidate : grid.items) {
      if (SlotIds.of(candidate) == item) {
        return candidate.name;
      }
    }
    return item;
  }
}
