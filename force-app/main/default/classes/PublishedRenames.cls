/**
 * The bunks and time blocks a draft names differently from the published schedule it would
 * replace (PublishedChanges), as lines a director reads: "Renamed: Group A → Bunk A". Each once
 * for the week, groups first, then time blocks, in the draft's order; a name is the one on its
 * first day. Then each time block at other times than published on any day (Update to match setup
 * moves them; staff would keep the old times): "New times: Period 2, 9:00 AM – 9:45 AM → 9:30 AM –
 * 10:15 AM", once for the week, by its first such day. A block named by its times says its new
 * times in its rename when that rename was written (its first day moved too); moved on a later day
 * only, it gets a line of its own: "New times: 9:00 AM – 9:45 AM → 9:30 AM – 10:15 AM". Compared exactly: a name's case is part of what campers read.
 * Same days, same lines.
 */
public with sharing class PublishedRenames {
  /** Each rename, then each time block's new times: a line and one change each. */
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
        changes.renames++;
      }
    }
    for (String key : now.keys) {
      String line = key.startsWith('b|') ? now.newTimes(key, was) : null;
      if (line != null) {
        changes.add(line, 1);
        changes.retimes++;
      }
    }
  }

  /** Groups' ("g|id"), then time blocks' ("b|id") names, by their first day, in its order. */
  private class Names {
    private List<String> keys = new List<String>();
    private Map<String, String> names = new Map<String, String>();
    // Each time block on each day it is in: "b|id|date".
    private Map<String, ScheduleGrid.Block> blocksOn = new Map<String, ScheduleGrid.Block>();
    private List<Date> dates = new List<Date>();

    private Names(List<ScheduleDays.DayGrid> days) {
      List<ScheduleDays.DayGrid> sorted = byDate(days);
      List<String> blockKeys = new List<String>();
      for (ScheduleDays.DayGrid day : sorted) {
        if (day.grid == null) {
          continue;
        }
        dates.add(day.day);
        for (ScheduleGrid.GroupRef grp : day.grid.groups) {
          add(keys, 'g|' + grp.id, grp.name);
        }
        for (ScheduleGrid.Block block : day.grid.blocks) {
          add(blockKeys, 'b|' + block.id, block.name);
          blocksOn.put('b|' + block.id + '|' + day.day, block);
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

    /**
     * "New times: Period 2, 9:00 AM – 9:45 AM → 9:30 AM – 10:15 AM" for the first day this time
     * block's times differ from was's, or null when they never do (or a side has no times).
     */
    private String newTimes(String key, Names was) {
      for (Date onDay : dates) {
        ScheduleGrid.Block nowBlock = blocksOn.get(key + '|' + onDay);
        ScheduleGrid.Block wasBlock = was.blocksOn.get(key + '|' + onDay);
        if (nowBlock == null || wasBlock == null) {
          continue;
        }
        String nowTimes = BlockRange.timesOf(nowBlock);
        String wasTimes = BlockRange.timesOf(wasBlock);
        if (nowTimes == null || wasTimes == null || nowTimes.equals(wasTimes)) {
          continue;
        }
        if (renamedTo(key, nowTimes, was)) {
          return null;
        }
        // Named by its times on this day: the times are its name.
        return nowTimes.equals(nowBlock.name)
          ? 'New times: ' + wasTimes + ' → ' + nowTimes
          : 'New times: ' + nowBlock.name + ', ' + wasTimes + ' → ' + nowTimes;
      }
      return null;
    }

    /** This block's rename line was written, and ends in these times: nothing to add. */
    private Boolean renamedTo(String key, String times, Names was) {
      String wasName = was.names.get(key);
      return times.equals(names.get(key)) &&
        wasName != null &&
        !wasName.equals(times);
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
