/**
 * What changes when a week is published again: each cell (a group, a day, a time block) whose
 * activity differs between the published schedule and the draft, as a line a director reads
 * ("Group A · Monday · Period 2: Swim → Archery"). Neighbouring time blocks with the same change
 * share one line, named as the rest of the app names a run of blocks ("Period 1 – Period 2", or
 * "9:00 AM – 10:30 AM" when a block is named by its times; BlockRange). A cell is matched by its
 * group's and time block's records, so a renamed bunk or block is the same cell; one only one side has is Open on the other. An activity
 * renamed since is a change (its new name is what would be published), and so is a bunk or
 * block renamed since, or a time block at new times (Update to match setup moves them): one line
 * each, first (PublishedRenames). Locks are not compared:
 * they are how a draft is built, not what campers do. Same days, same lines.
 */
public with sharing class PublishedChanges {
  public class Changes {
    // The first lines, in day, then group, then time block order.
    public List<String> lines = new List<String>();
    // Every change, listed or not: each changed cell (a line can cover several neighbouring
    // cells), each rename and each time block's new times.
    public Integer count = 0;
    // Of count: the bunks and time blocks renamed, and the time blocks with new times
    // (PublishedRenames), so the screen can say them apart from cells.
    public Integer renames = 0;
    public Integer retimes = 0;
    // Of count: the special days and the special events whose own schedules change, said apart
    // from the week's cells (ScheduleSpecials, ADR 0014 slice 5).
    public Integer specialDays = 0;
    public Integer events = 0;
    // Of count: the days whose rainy-day marks change with their cells the same or not (a
    // raindrop gone or come back, ADR 0019 choice 9), one each.
    public Integer rainDays = 0;
    // The lines past mostLines, not listed ("…and N more.").
    public Integer moreLines = 0;
    // The days a special day replaces (on either side), whose own cells are out of sight and not
    // compared (SpecialChanges says what changes there).
    public Set<Date> hidden = new Set<Date>();
    private Integer mostLines;

    // A special day changed, one line.
    public void addSpecialDay(String line) {
      specialDays++;
      add(line, 1);
    }

    // A special event's own schedule changed, one line.
    public void addEvent(String line) {
      events++;
      add(line, 1);
    }

    // A line, and how many cells (or renames) it covers.
    public void add(String line, Integer cells) {
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
    Changes result = none(mostLines);
    addBetween(result, published, draft);
    return result;
  }

  /** No changes yet, to list at most mostLines of them. */
  public static Changes none(Integer mostLines) {
    Changes result = new Changes();
    result.mostLines = mostLines;
    return result;
  }

  /** Adds the changes from published to draft to result, leaving out its hidden days. */
  public static void addBetween(
    Changes result,
    List<ScheduleDays.DayGrid> published,
    List<ScheduleDays.DayGrid> draft
  ) {
    Map<Date, ScheduleDays.DayGrid> wasDays = byDay(published);
    Map<Date, ScheduleDays.DayGrid> nowDays = byDay(draft);
    Set<Date> dateSet = new Set<Date>(wasDays.keySet());
    dateSet.addAll(nowDays.keySet());
    dateSet.removeAll(result.hidden);
    List<Date> dates = new List<Date>(dateSet);
    dates.sort();
    PublishedRenames.addTo(result, published, draft);
    for (Date day : dates) {
      new DayCompare(
          WeekCalendar.weekdayName(day),
          wasDays.get(day),
          nowDays.get(day)
        )
        .addTo(result);
      PublishedRain.addTo(result, wasDays.get(day), nowDays.get(day));
    }
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

  /**
   * One day, published (was) against draft (now); either is null when that side has no such day.
   * dayName names it in each line ("Monday", or a special day's or event's own schedule: "Friday ·
   * Visiting Day", SpecialChanges).
   */
  public class DayCompare {
    private String dayName;
    private ScheduleDays.DayGrid was;
    // Groups and time blocks in the draft's order, then any only the published day had.
    private List<String> groupIds = new List<String>();
    private Map<String, String> groupNames = new Map<String, String>();
    private List<String> blockIds = new List<String>();
    private Map<String, ScheduleGrid.Block> blocks = new Map<String, ScheduleGrid.Block>();
    private Map<String, PublishedCells.Item> wasCells;
    private Map<String, PublishedCells.Item> nowCells;

    public DayCompare(
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

    public void addTo(Changes result) {
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
