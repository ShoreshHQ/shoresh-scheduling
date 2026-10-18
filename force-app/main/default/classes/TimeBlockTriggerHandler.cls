/**
 * Time blocks, as on Shoresh desktop (timeBlockLabel.js, timeBlockRange.js): a block with no
 * name is named by its time range ("9:00 AM – 9:45 AM"), and one with no part of day gets the
 * part its start time falls in (from noon on, Afternoon). A name that is just the old range
 * follows the times when they change; a name or part of day the director chose is never touched.
 */
public with sharing class TimeBlockTriggerHandler {
  private static final Time NOON = Time.newInstance(12, 0, 0, 0);

  /** Before a save: names and parts of day. After any change: the set-time check. */
  public static void handle(
    System.TriggerOperation operation,
    List<TimeBlock__c> blocks,
    Map<Id, TimeBlock__c> before
  ) {
    if (
      operation == System.TriggerOperation.BEFORE_INSERT ||
      operation == System.TriggerOperation.BEFORE_UPDATE
    ) {
      beforeSave(blocks, before);
    } else {
      SetTimeTriggers.timeBlocksChanged(blocks);
    }
  }

  public static void beforeSave(
    List<TimeBlock__c> blocks,
    Map<Id, TimeBlock__c> before
  ) {
    for (TimeBlock__c block : blocks) {
      TimeBlock__c old = before == null ? null : before.get(block.Id);
      if (String.isBlank(block.Name) || followsTimes(block, old)) {
        String range = rangeLabel(block.StartTime__c, block.EndTime__c);
        if (range != null) {
          block.Name = range;
        }
      }
      if (String.isBlank(block.PartOfDay__c) && block.StartTime__c != null) {
        block.PartOfDay__c = partOfDayFor(block.StartTime__c);
      }
    }
  }

  /** The name was the old time range, is unchanged, and the times moved. */
  private static Boolean followsTimes(TimeBlock__c block, TimeBlock__c old) {
    return old != null &&
      block.Name == old.Name &&
      (block.StartTime__c != old.StartTime__c ||
      block.EndTime__c != old.EndTime__c) &&
      old.Name == rangeLabel(old.StartTime__c, old.EndTime__c);
  }

  /** "Morning" before noon, "Afternoon" from noon on (day camps have no evening). */
  public static String partOfDayFor(Time start) {
    return start < NOON ? 'Morning' : 'Afternoon';
  }

  /** "9:00 AM – 9:45 AM" (desktop timeRangeLabel), or null without both times. */
  public static String rangeLabel(Time startTime, Time endTime) {
    if (startTime == null || endTime == null) {
      return null;
    }
    return clock12(startTime) + ' – ' + clock12(endTime);
  }

  /** "1:35 PM": 12-hour clock, no leading zero on the hour. */
  public static String clock12(Time value) {
    Integer hour = value.hour();
    Integer shown = Math.mod(hour, 12) == 0 ? 12 : Math.mod(hour, 12);
    String minutes = String.valueOf(value.minute()).leftPad(2, '0');
    return shown + ':' + minutes + (hour < 12 ? ' AM' : ' PM');
  }
}
