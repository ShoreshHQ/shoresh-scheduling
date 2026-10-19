/**
 * A setup rename shows the new name, with no dot (Greg, Manual Build round 2 #3): the draft's
 * time blocks, groups, activities and fixed and recurring activities are shown by their names in
 * setup now (ManualBuildViews). Only the screen's copy changes; what is saved keeps its names
 * until an edit or "Update to match setup" writes the day again. Anything deleted since keeps its
 * saved name, and so does a time block whose times changed: its row shows the week's times, and
 * a name that is its new time range would contradict them (Update to match setup offers the new
 * times, SetupMatchCells.sameFrame).
 */
public with sharing class ManualBuildNamesNow {
  /** records: everything named in setup now; blocks: the program's time blocks now. */
  public static void apply(
    ScheduleViews.ScheduleView schedule,
    List<SObject> records,
    List<TimeBlock__c> blocks
  ) {
    Map<Id, String> names = new Map<Id, String>();
    for (SObject record : records) {
      names.put(record.Id, (String) record.get('Name'));
    }
    Map<Id, String> timesNow = new Map<Id, String>();
    for (TimeBlock__c block : blocks) {
      timesNow.put(
        block.Id,
        BlankWeek.clock(block.StartTime__c) +
          '-' +
          BlankWeek.clock(block.EndTime__c)
      );
    }
    for (ScheduleViews.DayView day : schedule.days) {
      List<ScheduleViews.Ref> refs = sameTimes(day.blocks, timesNow);
      refs.addAll(day.groups);
      refs.addAll(day.items);
      for (ScheduleViews.Ref ref : refs) {
        Id recordId = idOf(ref.id);
        if (recordId != null && names.containsKey(recordId)) {
          ref.name = names.get(recordId);
        }
      }
    }
  }

  /** The day's time blocks whose times are as setup has them now (or that setup no longer has). */
  private static List<ScheduleViews.Ref> sameTimes(
    List<ScheduleViews.Ref> dayBlocks,
    Map<Id, String> timesNow
  ) {
    List<ScheduleViews.Ref> result = new List<ScheduleViews.Ref>();
    for (ScheduleViews.Ref ref : dayBlocks) {
      String now = timesNow.get(idOf(ref.id));
      if (now == null || now == ref.startTime + '-' + ref.endTime) {
        result.add(ref);
      }
    }
    return result;
  }

  /** A saved Id, or null for a name (things not set up in Shoresh yet have none). */
  private static Id idOf(String text) {
    try {
      return String.isBlank(text) ? null : Id.valueOf(text);
    } catch (Exception e) {
      return null;
    }
  }
}
