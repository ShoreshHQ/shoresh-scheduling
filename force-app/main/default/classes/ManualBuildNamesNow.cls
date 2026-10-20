/**
 * A setup rename shows the new name, with no dot (Greg, Manual Build round 2 #3): a Manual Build
 * draft's time blocks, groups, activities and fixed and recurring activities are shown by their
 * names in setup now, on opening the week (ManualBuildViews) and in the week every save sends back
 * (SlotSaves.save), and Publish puts out what the screen shows (SchedulePublish), so the director
 * sees what staff will read. What is saved keeps the names it was saved with. Anything deleted
 * since keeps its saved name, and so does a time block whose times changed: its row shows the
 * week's times, and a name that is its new time range would contradict them (Update to match
 * setup offers the new times, SetupMatchCells.sameFrame).
 */
public with sharing class ManualBuildNamesNow {
  private Map<Id, String> names = new Map<Id, String>();
  // Each time block's times now, "HH:mm-HH:mm".
  private Map<Id, String> timesNow = new Map<Id, String>();
  // Time blocks and groups the days point at that are still there but not the program's now.
  private Set<String> elsewhere = new Set<String>();

  /** records: everything named in setup now; blocks: the program's time blocks now. */
  public ManualBuildNamesNow(List<SObject> records, List<TimeBlock__c> blocks) {
    for (SObject record : records) {
      names.put(record.Id, (String) record.get('Name'));
    }
    for (TimeBlock__c block : blocks) {
      timesNow.put(
        block.Id,
        BlankWeek.clock(block.StartTime__c) +
          '-' +
          BlankWeek.clock(block.EndTime__c)
      );
    }
  }

  /** Time blocks and groups the days point at that are still there, though not the program's. */
  public ManualBuildNamesNow alsoThere(Set<String> recordIds) {
    elsewhere.addAll(recordIds);
    return this;
  }

  /**
   * What the days point at that is still there, as ScheduleViews marks the rest gone (the same
   * as ScheduleRefs finds): the program's time blocks and groups, any elsewhere now, and what the
   * days place that can still be seen.
   */
  public Set<String> stillThere() {
    Set<String> result = new Set<String>(elsewhere);
    for (Id recordId : names.keySet()) {
      result.add(String.valueOf(recordId));
    }
    return result;
  }

  /** The screen's copy of the draft, by setup's names now. */
  public void applyTo(ScheduleViews.ScheduleView schedule) {
    for (ScheduleViews.DayView day : schedule.days) {
      for (ScheduleViews.Ref ref : day.blocks) {
        if (sameTimes(ref.id, ref.startTime, ref.endTime)) {
          ref.name = nameOf(ref.id, ref.name);
        }
      }
      for (ScheduleViews.Ref ref : day.groups) {
        ref.name = nameOf(ref.id, ref.name);
      }
      for (ScheduleViews.Ref ref : day.items) {
        ref.name = nameOf(ref.id, ref.name);
      }
    }
  }

  /** The draft's days as read (not saved again), by setup's names now: what Publish puts out. */
  public void applyTo(List<ScheduleDays.DayGrid> days) {
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid == null) {
        continue;
      }
      for (ScheduleGrid.Block block : day.grid.blocks) {
        if (sameTimes(block.id, block.startTime, block.endTime)) {
          block.name = nameOf(block.id, block.name);
        }
      }
      for (ScheduleGrid.GroupRef grp : day.grid.groups) {
        grp.name = nameOf(grp.id, grp.name);
      }
      for (ScheduleGrid.Item item : day.grid.items) {
        item.name = nameOf(item.id, item.name);
      }
    }
  }

  /** Its name in setup now, or the saved one when setup no longer has it. */
  private String nameOf(String savedId, String saved) {
    Id recordId = idOf(savedId);
    return recordId != null && names.containsKey(recordId)
      ? names.get(recordId)
      : saved;
  }

  /** A time block whose times are as setup has them now (or that setup no longer has). */
  private Boolean sameTimes(String savedId, String startTime, String endTime) {
    String now = timesNow.get(idOf(savedId));
    return now == null || now == startTime + '-' + endTime;
  }

  /** A saved Id, or null for a name (things not set up in Shoresh yet have none). */
  public static Id idOf(String text) {
    try {
      return String.isBlank(text) ? null : Id.valueOf(text);
    } catch (Exception e) {
      return null;
    }
  }
}
