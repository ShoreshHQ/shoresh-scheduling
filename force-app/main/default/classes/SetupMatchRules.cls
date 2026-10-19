/**
 * Setup as it is now, as "Update to match setup" (SetupMatch) reads it: which activities are
 * still in the season and which are closed this week (themselves or by their place, as the
 * desktop's computeWeekClosures.js marks them), the program's groups and those away this week,
 * its time blocks, and the words a dot says. Everything comes from GeneratedSetup, read once per
 * request in user mode; the camp's words are read only when a dot needs one.
 */
public with sharing class SetupMatchRules {
  public static final String DELETED = 'Deleted from setup';
  public static final String NOT_AT_CAMP_THEN = 'Not at camp then';
  public static final String NOT_HERE_NOW = 'Not set up here now';

  private GeneratedSetup setup;
  public Map<Id, Activity__c> activities;
  public Set<Id> closed = new Set<Id>();
  private Map<Id, Group__c> groups;
  private Set<Id> away;
  private Map<Id, TimeBlock__c> blocks;

  public SetupMatchRules(GeneratedSetup setup) {
    this.setup = setup;
    activities = new Map<Id, Activity__c>(setup.activityRecords());
    groups = new Map<Id, Group__c>(setup.groups);
    away = setup.away();
    blocks = new Map<Id, TimeBlock__c>(setup.blocks);
    Set<Id> closedPlaces = new Set<Id>();
    for (WeekException__c mark : setup.exceptions) {
      if (mark.Activity__c != null) {
        closed.add(mark.Activity__c);
      }
      if (mark.Location__c != null) {
        closedPlaces.add(mark.Location__c);
      }
    }
    for (Activity__c activity : activities.values()) {
      if (closedPlaces.contains(activity.Location__c)) {
        closed.add(activity.Id);
      }
    }
  }

  /** The program's name, for the words that name it. */
  public String programName() {
    return setup.program.Name;
  }

  /** Why an activity's placement can't stay this week, or null when it can. */
  public String whyNotActivity(String owner) {
    if (!owner.startsWith('A:')) {
      // Not set up in Shoresh yet (an imported elective): nothing in setup to compare it with.
      return null;
    }
    Id activityId = SlotIds.activityIn(owner);
    if (activityId == null || !activities.containsKey(activityId)) {
      return DELETED;
    }
    return closed.contains(activityId)
      ? 'Not running this ' + setup.labels().singularInSentence('Week')
      : null;
  }

  /** Why a group's row is not in the week now: away this week, or no longer in the program. */
  public String whyNoRow(Id groupId) {
    if (groups.containsKey(groupId) && away.contains(groupId)) {
      return 'Not at camp this ' + setup.labels().singularInSentence('Week');
    }
    return 'No longer in ' + programName();
  }

  /** Whether a group is at camp in a time block (a morning-only group's afternoon is not). */
  public Boolean atCamp(Id groupId, Id blockId) {
    Group__c grp = groups.get(groupId);
    TimeBlock__c block = blocks.get(blockId);
    return grp != null && block != null && SetTimePlan.atCamp(grp, block);
  }

  /** The group's name now, or null when it is no longer in the program. */
  public String groupName(Id groupId) {
    Group__c grp = groups.get(groupId);
    return grp == null ? null : grp.Name;
  }

  /** "Period 5 is no longer set up". */
  public String blockGone(String blockName) {
    return blockName + ' is no longer set up';
  }

  /** "Its periods changed": a time block was added inside a placement. */
  public String blocksChanged() {
    return 'Its ' + setup.labels().pluralInSentence('TimeBlock') + ' changed';
  }

  /** "Periods changed": the day's time blocks are in a new order. */
  public String blocksReordered() {
    return setup.labels().plural('TimeBlock') + ' changed';
  }

  /** "Period 2 now 10:30 AM – 11:15 AM": a time block whose times changed ("HH:mm" times). */
  public String blockAt(String blockName, String startTime, String endTime) {
    String range = TimeBlockTriggerHandler.rangeLabel(
      timeOf(startTime),
      timeOf(endTime)
    );
    return blockName + ' now ' + (range == null ? 'at other times' : range);
  }

  private static Time timeOf(String clock) {
    try {
      return Time.newInstance(
        Integer.valueOf(clock.substringBefore(':')),
        Integer.valueOf(clock.substringAfter(':')),
        0,
        0
      );
    } catch (Exception e) {
      return null;
    }
  }

  /** "Lunch is set up here now". */
  public String setUpHere(String name) {
    return name + ' is set up here now';
  }

  /** "Not a day of Main now". */
  public String notADay() {
    return 'Not a day of ' + programName() + ' now';
  }
}
