/**
 * Two fixed or recurring activities with the same group in the same time block on the same day,
 * in a week both run in and the group is there. Groups belong to one program, so only items in the same program can
 * clash this way.
 */
public with sharing class SetTimeGroupClashes {
  private final SetTimePlan plan;
  // "group|block|day" => the items already taking that cell.
  private final Map<String, List<SetTimePlan.Item>> taken = new Map<String, List<SetTimePlan.Item>>();

  private SetTimeGroupClashes(SetTimePlan plan) {
    this.plan = plan;
  }

  public static SetTimeClash first(SetTimePlan plan) {
    SetTimeGroupClashes finder = new SetTimeGroupClashes(plan);
    for (SetTimePlan.Item item : plan.items) {
      SetTimeClash clash = finder.take(item);
      if (clash != null) {
        return clash;
      }
    }
    return null;
  }

  /** Takes every cell of the item, or returns the first clash with an item already there. */
  private SetTimeClash take(SetTimePlan.Item item) {
    for (Cell cell : cells(item)) {
      String key = cell.grp.Id + '|' + cell.block + '|' + cell.day;
      List<SetTimePlan.Item> there = taken.containsKey(key)
        ? taken.get(key)
        : new List<SetTimePlan.Item>();
      for (SetTimePlan.Item other : there) {
        Id week = plan.firstSharedWeek(other, item, cell.grp.Id);
        if (week != null) {
          return clash(other, cell, week);
        }
      }
      there.add(item);
      taken.put(key, there);
    }
    return null;
  }

  private SetTimeClash clash(SetTimePlan.Item other, Cell cell, Id week) {
    SetTimePlan.Item item = cell.item;
    SetTimeClash result = new SetTimeClash(SetTimeClash.Kind.SAME_GROUP, item);
    result.other = other;
    result.groupName = cell.grp.Name;
    result.blockName = item.program.blocks[cell.block].Name;
    result.day = cell.day;
    result.weekName = plan.weekNames.get(week);
    return result;
  }

  private static List<Cell> cells(SetTimePlan.Item item) {
    List<Cell> result = new List<Cell>();
    List<String> days = item.runDays();
    for (String day : days) {
      for (Integer block : item.span(day)) {
        for (Group__c grp : item.groupsIn(block)) {
          Cell cell = new Cell(grp, block, day);
          cell.item = item;
          result.add(cell);
        }
      }
    }
    return result;
  }

  private class Cell {
    SetTimePlan.Item item;
    Group__c grp;
    Integer block;
    String day;

    Cell(Group__c grp, Integer block, String day) {
      this.grp = grp;
      this.block = block;
      this.day = day;
    }
  }
}
