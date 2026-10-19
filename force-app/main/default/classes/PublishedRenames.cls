/**
 * The bunks and time blocks a draft names differently from the published schedule it would
 * replace (PublishedChanges), as lines a director reads: "Renamed: Group A → Bunk A". Each once
 * for the week, groups first, then time blocks, in the draft's order; a name is the one on its
 * first day. Compared exactly: a name's case is part of what campers read. Same days, same lines.
 */
public with sharing class PublishedRenames {
  /** Each rename, a line and one change. */
  public static void addTo(
    PublishedChanges.Changes changes,
    List<ScheduleDays.DayGrid> published,
    List<ScheduleDays.DayGrid> draft
  ) {
    Names was = new Names(published);
    Names now = new Names(draft);
    for (String key : now.keys) {
      String wasName = was.names.get(key);
      String nowName = now.names.get(key);
      if (wasName != null && nowName != null && !wasName.equals(nowName)) {
        changes.add('Renamed: ' + wasName + ' → ' + nowName, 1);
      }
    }
  }

  /** Groups' ("g|id"), then time blocks' ("b|id") names, by their first day, in its order. */
  private class Names {
    private List<String> keys = new List<String>();
    private Map<String, String> names = new Map<String, String>();

    private Names(List<ScheduleDays.DayGrid> days) {
      List<ScheduleDays.DayGrid> sorted = byDate(days);
      List<String> blockKeys = new List<String>();
      for (ScheduleDays.DayGrid day : sorted) {
        if (day.grid == null) {
          continue;
        }
        for (ScheduleGrid.GroupRef grp : day.grid.groups) {
          add(keys, 'g|' + grp.id, grp.name);
        }
        for (ScheduleGrid.Block block : day.grid.blocks) {
          add(blockKeys, 'b|' + block.id, block.name);
        }
      }
      keys.addAll(blockKeys);
    }

    private void add(List<String> keyList, String key, String name) {
      if (!names.containsKey(key)) {
        keyList.add(key);
        names.put(key, name);
      }
    }
  }

  /** The days in date order (one per date, the last given). */
  private static List<ScheduleDays.DayGrid> byDate(
    List<ScheduleDays.DayGrid> days
  ) {
    Map<Date, ScheduleDays.DayGrid> dayMap = new Map<Date, ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : days) {
      dayMap.put(day.day, day);
    }
    List<Date> dates = new List<Date>(dayMap.keySet());
    dates.sort();
    List<ScheduleDays.DayGrid> result = new List<ScheduleDays.DayGrid>();
    for (Date onDay : dates) {
      result.add(dayMap.get(onDay));
    }
    return result;
  }
}
