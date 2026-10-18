/**
 * Whether a generated week sent to be saved (GeneratedSaves) is the week it was built on: every
 * day of the draft once, each on its own time blocks and groups, and every stored day readable.
 */
public with sharing class GeneratedFrames {
  public static ShoreshException unreadable() {
    return new ShoreshException(
      'That change could not be read. Reload the page and try again.'
    );
  }

  /** Refuses a draft with a day that can't be read, naming the day, rather than replace it. */
  public static void checkReadable(List<ScheduleDays.DayGrid> days) {
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid == null) {
        throw new ShoreshException(
          BlankWeek.weekdayOf(day.day) +
            ' could not be read: ' +
            day.problem +
            '.'
        );
      }
    }
  }

  /** A first save whose blank week has changed since it was read (a time block added). */
  public static String setupChanged(Program__c program) {
    CampLabels labels = CampLabels.forCamp(program.Season__r.Camp__c);
    return program.Name +
      '\'s ' +
      labels.pluralInSentence('TimeBlock') +
      ' or ' +
      labels.pluralInSentence('Group') +
      ' changed since you opened this ' +
      labels.singularInSentence('Week') +
      '. Open it again, then generate.';
  }

  /** Every day sent names its time blocks and groups; one that doesn't wasn't sent by the screen. */
  public static void checkSent(List<GeneratedWeek.Day> sent) {
    for (GeneratedWeek.Day day : byDate(sent).values()) {
      if (day.blockIds == null || day.groupIds == null) {
        throw unreadable();
      }
    }
  }

  /** Whether the days sent are exactly these days, each on the same time blocks and groups. */
  public static Boolean sameFrame(
    List<ScheduleDays.DayGrid> days,
    List<GeneratedWeek.Day> sent
  ) {
    Map<Date, GeneratedWeek.Day> byDate = byDate(sent);
    Boolean same = byDate.size() == days.size();
    for (ScheduleDays.DayGrid day : days) {
      same = same && sameFrame(day.grid, byDate.get(day.day));
    }
    return same;
  }

  private static Boolean sameFrame(ScheduleGrid grid, GeneratedWeek.Day built) {
    return built != null &&
      grid != null &&
      sameIds(grid.blockIds(), built.blockIds) &&
      sameIds(grid.groupIds(), built.groupIds);
  }

  /** The days sent by date; each date at most once. */
  public static Map<Date, GeneratedWeek.Day> byDate(
    List<GeneratedWeek.Day> sent
  ) {
    Map<Date, GeneratedWeek.Day> result = new Map<Date, GeneratedWeek.Day>();
    for (GeneratedWeek.Day day : sent) {
      if (
        day == null ||
        day.dateValue == null ||
        result.containsKey(day.dateValue)
      ) {
        throw unreadable();
      }
      result.put(day.dateValue, day);
    }
    return result;
  }

  private static Boolean sameIds(List<String> ids, List<String> sent) {
    return ids.size() == sent.size() && SlotIds.sameBlocks(ids, 0, sent);
  }

  /** Stored the one way: '' for Open, item numbers without leading zeros, 18-character Ids. */
  public static void tidy(ScheduleGrid grid) {
    for (List<String> row : grid.rows) {
      for (Integer b = 0; b < row.size(); b++) {
        row[b] = String.isBlank(row[b]) || row[b] == ScheduleGrid.CARRIES_ON
          ? row[b].trim()
          : String.valueOf(Integer.valueOf(row[b].trim()));
      }
    }
    for (ScheduleGrid.Item item : grid.items) {
      item.id = ScheduleGridRules.SET_UP_KINDS.contains(item.kind)
        ? fullId(item.id)
        : item.id;
    }
  }

  private static String fullId(String recordId) {
    try {
      return String.valueOf(Id.valueOf(recordId));
    } catch (StringException e) {
      throw unreadable();
    }
  }
}
