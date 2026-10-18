/**
 * The copying half of "Start from another week" (ManualWeekStart): each source day onto the new
 * week's day with the same weekday (a week longer than seven days: first Monday onto first Monday,
 * second onto second), group by group (matched by Id), placement by placement at the
 * same time blocks (matched by Id). A placement goes only whole, into Open cells where its group
 * is at camp; otherwise it is listed with why ("Swim · Bunk 3 · Monday: not at camp then").
 */
public with sharing class ManualWeekCopy {
  private ManualWeekStart rules;
  public List<SlotEdits.Edit> edits = new List<SlotEdits.Edit>();
  public List<String> leftOut = new List<String>();
  // One edit per day of the new week: its runs go in together (one read of the day each).
  private Map<Date, SlotEdits.Edit> editByDay = new Map<Date, SlotEdits.Edit>();
  // How each day is named in what is left out: "Monday", or with its date for a week's second
  // Monday. One map per week: the two weeks can share a date (a two-week week).
  private Map<Date, String> sourceNames = new Map<Date, String>();
  private Map<Date, String> targetNames = new Map<Date, String>();

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
    Map<String, ScheduleDays.DayGrid> byWeekday = readableByWeekday(sourceDays);
    Map<String, ScheduleDays.DayGrid> targets = byPlace(
      targetDays,
      targetNames
    );
    for (String place : targets.keySet()) {
      ScheduleDays.DayGrid target = targets.get(place);
      ScheduleDays.DayGrid source = byWeekday.remove(place);
      if (source != null && target.grid != null) {
        for (Integer sg = 0; sg < source.grid.groups.size(); sg++) {
          copyGroup(source.grid, sg, target);
        }
      }
    }
    listUnmatched(byWeekday);
  }

  /** The source's days by place in the week; one that can't be read is listed, never skipped. */
  private Map<String, ScheduleDays.DayGrid> readableByWeekday(
    List<ScheduleDays.DayGrid> sourceDays
  ) {
    Map<String, ScheduleDays.DayGrid> byWeekday = byPlace(
      sourceDays,
      sourceNames
    );
    for (String place : new List<String>(byWeekday.keySet())) {
      ScheduleDays.DayGrid day = byWeekday.get(place);
      if (day.grid == null) {
        leftOut.add(
          sourceNames.get(day.day) + ': could not be read (' + day.problem + ')'
        );
        byWeekday.remove(place);
      }
    }
    return byWeekday;
  }

  /**
   * Days (in date order) by weekday and which of that weekday they are: "Monday", then "Monday 2"
   * for a second Monday. Names each day (in names) as it goes.
   */
  private static Map<String, ScheduleDays.DayGrid> byPlace(
    List<ScheduleDays.DayGrid> days,
    Map<Date, String> names
  ) {
    Map<String, ScheduleDays.DayGrid> result = new Map<String, ScheduleDays.DayGrid>();
    Map<String, Integer> seen = new Map<String, Integer>();
    for (ScheduleDays.DayGrid day : days) {
      String weekday = BlankWeek.weekdayOf(day.day);
      Integer n = seen.containsKey(weekday) ? seen.get(weekday) + 1 : 1;
      seen.put(weekday, n);
      result.put(n == 1 ? weekday : weekday + ' ' + n, day);
      names.put(day.day, n == 1 ? weekday : weekday + ' ' + day.day.format());
    }
    return result;
  }

  /** A source day the new week has no match for: its activities are listed, not dropped. */
  private void listUnmatched(Map<String, ScheduleDays.DayGrid> byWeekday) {
    for (ScheduleDays.DayGrid day : byWeekday.values()) {
      if (ManualWeekPlacements.hasActivities(day.grid)) {
        leftOut.add(
          sourceNames.get(day.day) + ': not in this ' + rules.weekWord()
        );
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
    for (
      ManualWeekPlacements.Placement p : ManualWeekPlacements.of(source, sg)
    ) {
      String why = target.g < 0
        ? 'not at camp this ' + rules.weekWord()
        : whyNot(p, target);
      if (why == null) {
        add(p, target);
      } else {
        leftOut.add(
          ManualWeekPlacements.nameOf(source, p.slot) +
            ' · ' +
            source.groups[sg].name +
            ' · ' +
            targetNames.get(day.day) +
            ': ' +
            why
        );
      }
    }
  }

  /** Why a placement can't go on the target row, or null when it can. */
  private String whyNot(ManualWeekPlacements.Placement p, Target target) {
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
        return ManualWeekPlacements.nameOf(
            target.day.grid,
            target.row[first + i]
          ) + ' is there';
      }
    }
    return null;
  }

  /** Where a placement's blocks start on the target day, or -1 if it lacks any of them in a row. */
  private static Integer firstBlockOn(
    ManualWeekPlacements.Placement p,
    Target target
  ) {
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
  private void add(ManualWeekPlacements.Placement p, Target target) {
    Integer first = firstBlockOn(p, target);
    SlotEdits.Run run = runFor(p, target.day, first);
    run.groupId = target.day.grid.groups[target.g].id;
    for (Integer i = 0; i < run.after.size(); i++) {
      target.row[first + i] = run.after[i];
    }
    SlotEdits.Edit edit = editByDay.get(run.day);
    if (edit == null) {
      edit = new SlotEdits.Edit();
      edit.runs = new List<SlotEdits.Run>();
      editByDay.put(run.day, edit);
      edits.add(edit);
    }
    edit.runs.add(run);
  }

  /** The run that fills the placement's blocks on a day, from Open, starting at a block index. */
  private static SlotEdits.Run runFor(
    ManualWeekPlacements.Placement p,
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
}
