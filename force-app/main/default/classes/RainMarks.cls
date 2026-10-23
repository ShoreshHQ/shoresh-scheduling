/**
 * The marks a rainy day leaves (repo docs/adr/0019 choice 9; desktop src/utils/rainyDay.js): the
 * "Rain plan full: choose another" cells a switch left outdoors because their rain plan had no
 * room, "group Id|time block Id|activity Id", and the cells it switched to their rain plan, the
 * same with "|switched" after (the Schedules page's raindrop, issue #129). Stored in
 * ScheduleDay__c.RainyDay__c (the day's first part), one line per cell, sorted, so the same marks
 * always give the same text.
 *
 * A mark stays only while its cell holds that activity, starting there (keptOn): any change to
 * the cell takes it away, as on the desktop ("the mark stays until the cell is next changed").
 */
public with sharing class RainMarks {
  private static final String SEPARATOR = '|';
  // The last part of a switched cell's mark.
  public static final String SWITCHED = 'switched';

  /**
   * The marks as stored; none for blank. A line that can't be read is left out (a mark is a
   * hint on a cell, never a reason the day can't be shown).
   */
  public static List<String> read(String stored) {
    List<String> marks = new List<String>();
    if (String.isBlank(stored)) {
      return marks;
    }
    for (String line : stored.split('\n')) {
      try {
        marks.addAll(normal(new List<String>{ line.trim() }));
      } catch (ShoreshException e) {
        continue;
      }
    }
    return normal(marks);
  }

  /**
   * Each mark with its record Ids written the one way (18 characters), once each, sorted.
   * Refused when one isn't three record Ids, with "switched" after them or not: a screen never
   * sends that.
   */
  public static List<String> normal(List<String> marks) {
    Set<String> found = new Set<String>();
    for (String mark : marks == null ? new List<String>() : marks) {
      List<String> ids = String.valueOf(mark).split('\\|', -1);
      Boolean switched = ids.size() == 4 && ids[3] == SWITCHED;
      if (ids.size() != 3 && !switched) {
        throw unreadable();
      }
      List<String> written = new List<String>();
      for (String part : new List<String>{ ids[0], ids[1], ids[2] }) {
        try {
          written.add(String.valueOf(Id.valueOf(part)));
        } catch (Exception e) {
          throw unreadable();
        }
      }
      if (switched) {
        written.add(SWITCHED);
      }
      found.add(String.join(written, SEPARATOR));
    }
    List<String> sorted = new List<String>(found);
    sorted.sort();
    return sorted;
  }

  /** The marks as stored: one per line, or null when there are none. */
  public static String text(List<String> marks) {
    return marks == null || marks.isEmpty() ? null : String.join(marks, '\n');
  }

  /**
   * The marks an edit leaves, by day (SlotEdits.Edit.rain): a rainy day's, or none for its Undo.
   * Refused when a day isn't named, isn't one of the schedule's (`days`, as SlotSaves read them)
   * that can be read, or a mark can't be read, as a run on such a day is.
   */
  public static Map<Date, List<String>> ofEdit(
    SlotEdits.Edit edit,
    Map<Date, ScheduleDays.DayGrid> days
  ) {
    Map<Date, List<String>> marks = new Map<Date, List<String>>();
    for (SlotEdits.RainDay day : edit.rain ?? new List<SlotEdits.RainDay>()) {
      checkDay(day?.day, days);
      marks.put(day.day, normal(day.cells));
    }
    return marks;
  }

  private static void checkDay(Date day, Map<Date, ScheduleDays.DayGrid> days) {
    if (day == null) {
      throw unreadable();
    }
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
  }

  /**
   * What a day's first part stores once it is saved: the marks given (null: the ones it has,
   * from `before`, its parts as they are), kept only where their cell still holds them.
   */
  public static String forSave(
    ScheduleGrid grid,
    List<String> given,
    List<ScheduleDay__c> before
  ) {
    List<String> marks = given;
    if (marks == null) {
      marks = before.isEmpty() ? null : read(before[0].RainyDay__c);
    }
    return text(keptOn(grid, marks));
  }

  /**
   * The marks whose cell, in this grid, still holds that activity starting there (a full cell
   * its own activity, a switched one its rain plan).
   */
  public static List<String> keptOn(ScheduleGrid grid, List<String> marks) {
    List<String> kept = new List<String>();
    if (grid == null || marks == null || marks.isEmpty()) {
      return kept;
    }
    List<String> groupIds = grid.groupIds();
    List<String> blockIds = grid.blockIds();
    Map<Integer, List<String>> rows = new Map<Integer, List<String>>();
    for (String mark : marks) {
      List<String> ids = mark.split('\\|', -1);
      Integer g = SlotIds.indexOf(groupIds, ids[0]);
      Integer b = SlotIds.indexOf(blockIds, ids[1]);
      if (g < 0 || b < 0) {
        continue;
      }
      if (!rows.containsKey(g)) {
        rows.put(g, SlotIds.ofRow(grid, g));
      }
      if (rows.get(g)[b].equals('A:' + ids[2])) {
        kept.add(mark);
      }
    }
    return kept;
  }

  private static ShoreshException unreadable() {
    return new ShoreshException(
      'That change could not be read. Reload the page and try again.'
    );
  }
}
