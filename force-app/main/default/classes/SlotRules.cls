/**
 * What a Manual Build edit may do (SlotSaves): place the season's activities, never move or cover a
 * fixed or recurring activity (they stay where setup puts them), and never place anything where a
 * group is not at camp. Reads what the edits need once, in user mode.
 */
public with sharing class SlotRules {
  private CampLabels labels;
  private Map<Id, Activity__c> activities = new Map<Id, Activity__c>();
  private Map<Id, Group__c> groups = new Map<Id, Group__c>();
  private Map<Id, TimeBlock__c> blocks = new Map<Id, TimeBlock__c>();

  public SlotRules(Schedule__c schedule, List<SlotEdits.Edit> edits) {
    labels = CampLabels.forCamp(schedule.Program__r.Season__r.Camp__c);
    Set<Id> activityIds = activityIdsIn(edits);
    if (!activityIds.isEmpty()) {
      activities = new Map<Id, Activity__c>(
        [
          SELECT Id, Name
          FROM Activity__c
          WHERE
            Id IN :activityIds
            AND Season__c = :schedule.Program__r.Season__c
          WITH USER_MODE
        ]
      );
    }
    for (Group__c grp : ProgramReads.groupsOf(schedule.Program__c)) {
      groups.put(grp.Id, grp);
    }
    for (TimeBlock__c block : ProgramReads.blocksOf(schedule.Program__c)) {
      blocks.put(block.Id, block);
    }
  }

  private static Set<Id> activityIdsIn(List<SlotEdits.Edit> edits) {
    Set<Id> result = new Set<Id>();
    for (SlotEdits.Edit edit : edits) {
      if (edit == null || edit.runs == null || edit.runs.isEmpty()) {
        throw new ShoreshException('That change could not be read.');
      }
      for (SlotEdits.Run run : edit.runs) {
        result.addAll(activityIdsIn(run));
      }
    }
    return result;
  }

  private static Set<Id> activityIdsIn(SlotEdits.Run run) {
    Set<Id> result = new Set<Id>();
    for (String slot : run.after == null ? new List<String>() : run.after) {
      Id activityId = SlotIds.activityIn(slot);
      if (activityId != null) {
        result.add(activityId);
      }
    }
    return result;
  }

  /** Fixed and recurring activities stay where setup put them. */
  public void checkNotSetTime(String was, String slot) {
    if (SlotIds.isSetTime(was) || SlotIds.isSetTime(slot)) {
      throw new ShoreshException(
        labels.plural('FixedActivity') +
          ' and ' +
          labels.pluralInSentence('RecurringActivity') +
          ' stay where they are set up.'
      );
    }
  }

  /** Nothing goes where a group isn't at camp (a morning-only group's afternoon). */
  public void checkAtCamp(String slot, String groupId, String blockId) {
    if (slot == SlotIds.OPEN) {
      return;
    }
    Group__c grp = groups.get(Id.valueOf(groupId));
    TimeBlock__c block = blocks.get(Id.valueOf(blockId));
    if (grp != null && block != null && !SetTimePlan.atCamp(grp, block)) {
      throw new ShoreshException(
        grp.Name + ' isn\'t at camp in ' + block.Name + '.'
      );
    }
  }

  /** The stored cell for an item starting in a slot, adding it to the day's list if new. */
  public String startToken(ScheduleGrid grid, String slot) {
    for (Integer i = 0; i < grid.items.size(); i++) {
      if (SlotIds.of(grid.items[i]) == slot) {
        return String.valueOf(i + 1);
      }
    }
    Id activityId = SlotIds.activityIn(slot);
    Activity__c activity = activityId == null
      ? null
      : activities.get(activityId);
    if (activity == null) {
      throw new ShoreshException(
        'That ' +
          labels.singularInSentence('Activity') +
          ' was not found. It may have been deleted.'
      );
    }
    grid.items.add(new ScheduleGrid.Item('A', activity.Id, activity.Name));
    return String.valueOf(grid.items.size());
  }

  /** A run may not change what the slots outside it belong to (cut into a placement). */
  public static void checkNeighbours(
    List<String> was,
    List<String> now,
    Set<Integer> inRun
  ) {
    for (Integer b = 0; b < now.size(); b++) {
      if (
        !inRun.contains(b) && SlotIds.owner(now[b]) != SlotIds.owner(was[b])
      ) {
        throw new ShoreshException(
          'That change would cut into the slot next to it. Reload the page and try again.'
        );
      }
    }
  }
}
