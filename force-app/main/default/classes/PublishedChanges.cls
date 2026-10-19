/**
 * What changes when a week is published again: each cell (a group, a day, a time block) whose
 * activity differs between the published schedule and the draft, as a line a director reads
 * ("Group A · Monday · Period 2: Swim → Archery"). Neighbouring time blocks with the same change
 * share one line, named as the rest of the app names a run of blocks ("Period 1 – Period 2", or
 * "9:00 AM – 10:30 AM" when a block is named by its times; BlockRange). A cell is matched by its
 * group's and time block's records, so a renamed bunk or block is the same cell; one only one side has is Open on the other. An activity
 * renamed since is a change (its new name is what would be published). Locks are not compared:
 * they are how a draft is built, not what campers do. Same days, same lines.
 */
public with sharing class PublishedChanges {
  public class Changes {
    // The first lines, in day, then group, then time block order.
    public List<String> lines = new List<String>();
    // Every changed cell, listed or not (a line can cover several neighbouring cells).
    public Integer count = 0;
    // The lines past mostLines, not listed ("…and N more.").
    public Integer moreLines = 0;
    private Integer mostLines;

    private void add(String line, Integer cells) {
      count += cells;
      if (lines.size() < mostLines) {
        lines.add(line);
      } else {
        moreLines++;
      }
    }
  }

  /** The changes from published to draft, listing at most mostLines of them. */
  public static Changes between(
    List<ScheduleDays.DayGrid> published,
    List<ScheduleDays.DayGrid> draft,
    Integer mostLines
  ) {
    Map<Date, ScheduleDays.DayGrid> wasDays = byDay(published);
    Map<Date, ScheduleDays.DayGrid> nowDays = byDay(draft);
    Set<Date> dateSet = new Set<Date>(wasDays.keySet());
    dateSet.addAll(nowDays.keySet());
    List<Date> dates = new List<Date>(dateSet);
    dates.sort();
    Changes result = new Changes();
    result.mostLines = mostLines;
    for (Date day : dates) {
      new DayCompare(
          WeekCalendar.weekdayName(day),
          wasDays.get(day),
          nowDays.get(day)
        )
        .addTo(result);
    }
    return result;
  }

  private static Map<Date, ScheduleDays.DayGrid> byDay(
    List<ScheduleDays.DayGrid> days
  ) {
    Map<Date, ScheduleDays.DayGrid> result = new Map<Date, ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : days) {
      result.put(day.day, day);
    }
    return result;
  }

  /** One day, published (was) against draft (now); either is null when that side has no such day. */
  private class DayCompare {
    private String dayName;
    private ScheduleDays.DayGrid was;
    // Groups and time blocks in the draft's order, then any only the published day had.
    private List<String> groupIds = new List<String>();
    private Map<String, String> groupNames = new Map<String, String>();
    private List<String> blockIds = new List<String>();
    private Map<String, ScheduleGrid.Block> blocks = new Map<String, ScheduleGrid.Block>();
    private Map<String, PublishedCells.Item> wasCells;
    private Map<String, PublishedCells.Item> nowCells;

    private DayCompare(
      String dayName,
      ScheduleDays.DayGrid was,
      ScheduleDays.DayGrid now
    ) {
      this.dayName = dayName;
      this.was = was;
      ScheduleGrid wasGrid = was == null ? null : was.grid;
      ScheduleGrid nowGrid = now == null ? null : now.grid;
      collect(nowGrid);
      collect(wasGrid);
      wasCells = PublishedCells.of(wasGrid);
      nowCells = PublishedCells.of(nowGrid);
    }

    private void collect(ScheduleGrid grid) {
      if (grid == null) {
        return;
      }
      for (ScheduleGrid.GroupRef grp : grid.groups) {
        if (!groupNames.containsKey(grp.id)) {
          groupIds.add(grp.id);
          groupNames.put(grp.id, grp.name);
        }
      }
      for (ScheduleGrid.Block block : grid.blocks) {
        if (!blocks.containsKey(block.id)) {
          blockIds.add(block.id);
          blocks.put(block.id, block);
        }
      }
    }

    private void addTo(Changes result) {
      if (was != null && was.grid == null) {
        // Nothing to compare against: the whole day is replaced, and said once. Every cell of
        // the day being published counts (at least one: the day changes even when it is empty).
        result.add(
          dayName +
          ': the published day could not be read, so all of it is replaced',
          Math.max(1, groupIds.size() * blockIds.size())
        );
        return;
      }
      for (String groupId : groupIds) {
        addGroup(groupId, result);
      }
    }

    /** One group's changed blocks, a run of neighbours with the same change as one line. */
    private void addGroup(String groupId, Changes result) {
      Run run = null;
      for (String blockId : blockIds) {
        String change = changeAt(groupId + '|' + blockId);
        if (run != null && run.continuesWith(change)) {
          run.last = blockId;
          run.cells++;
          continue;
        }
        if (run != null) {
          result.add(lineOf(groupId, run), run.cells);
        }
        run = change == null ? null : new Run(blockId, change);
      }
      if (run != null) {
        result.add(lineOf(groupId, run), run.cells);
      }
    }

    /** "Swim → Archery", or null when the cell is the same. */
    private String changeAt(String cellKey) {
      PublishedCells.Item wasItem = wasCells.get(cellKey);
      PublishedCells.Item nowItem = nowCells.get(cellKey);
      return PublishedCells.same(wasItem, nowItem)
        ? null
        : PublishedCells.nameOf(wasItem) +
          ' → ' +
          PublishedCells.nameOf(nowItem);
    }

    private String lineOf(String groupId, Run run) {
      return groupNames.get(groupId) +
        ' · ' +
        dayName +
        ' · ' +
        BlockRange.of(blocks.get(run.first), blocks.get(run.last)) +
        ': ' +
        run.change;
    }
  }

  /** Neighbouring time blocks with the same change. */
  private class Run {
    private String first;
    private String last;
    private String change;
    // How many time blocks (cells) the run covers.
    private Integer cells = 1;

    private Run(String blockId, String change) {
      this.first = blockId;
      this.last = blockId;
      this.change = change;
    }

    // Exactly: Apex's == ignores case, and a name's case is part of what campers read.
    private Boolean continuesWith(String next) {
      return next != null && next.equals(change);
    }
  }
}
