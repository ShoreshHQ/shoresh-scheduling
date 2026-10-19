/**
 * A run of time blocks as the app names one (c/shoreshSetupRules "Period 1 – Lunch"; one block by
 * its name). When either end is named by its own times (a block saved without a name), the run is
 * named by its times instead, as TimeBlockTriggerHandler names a block: "9:00 AM – 10:30 AM", not
 * "9:00 AM – 9:45 AM – 9:45 AM – 10:30 AM". Used by the Publish box (PublishedChanges).
 */
public with sharing class BlockRange {
  public static String of(ScheduleGrid.Block first, ScheduleGrid.Block last) {
    if (first.id == last.id) {
      return first.name;
    }
    String times = TimeBlockTriggerHandler.rangeLabel(
      clockOf(first.startTime),
      clockOf(last.endTime)
    );
    if (times != null && (namedByTimes(first) || namedByTimes(last))) {
      return times;
    }
    return first.name + ' – ' + last.name;
  }

  /** The block's name is just its time range, "9:00 AM – 9:45 AM". */
  private static Boolean namedByTimes(ScheduleGrid.Block block) {
    String times = TimeBlockTriggerHandler.rangeLabel(
      clockOf(block.startTime),
      clockOf(block.endTime)
    );
    return times != null && times.equals(block.name);
  }

  /** "HH:mm" as a time, or null when there is none. */
  private static Time clockOf(String text) {
    if (text == null || !Pattern.matches('\\d{1,2}:\\d{2}', text)) {
      return null;
    }
    List<String> parts = text.split(':');
    return Time.newInstance(
      Integer.valueOf(parts[0]),
      Integer.valueOf(parts[1]),
      0,
      0
    );
  }
}
