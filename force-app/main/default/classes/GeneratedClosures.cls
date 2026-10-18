/**
 * This week's exceptions, as a generated week's save checks them (GeneratedChecks): nothing is
 * newly placed for a group away this week, and no activity is newly placed that is closed this
 * week, or whose place is. A leftover may stay or be cleared, as with other leftovers. The
 * engine leaves closed activities out; groups away are left out of its inputs (GeneratedInputs),
 * so their rows stay as they were. The exceptions are GeneratedSetup's, read in user mode.
 */
public with sharing class GeneratedClosures {
  private String weekName;
  private Map<Id, String> away = new Map<Id, String>();
  private Set<Id> closedActivities = new Set<Id>();
  private Map<Id, String> closedPlaces = new Map<Id, String>();

  public GeneratedClosures(GeneratedSetup setup) {
    weekName = setup.week.Name;
    for (WeekException__c mark : setup.exceptions) {
      if (mark.Group__c != null) {
        away.put(mark.Group__c, mark.Group__r.Name);
      }
      if (mark.Activity__c != null) {
        closedActivities.add(mark.Activity__c);
      }
      if (mark.Location__c != null) {
        closedPlaces.put(mark.Location__c, mark.Location__r.Name);
      }
    }
  }

  /** Refuses placing the activity (newly) for the group this week. */
  public void check(String groupId, Activity__c activity) {
    Id grp = Id.valueOf(groupId);
    if (away.containsKey(grp)) {
      throw new ShoreshException(
        away.get(grp) + ' isn\'t at camp in ' + weekName + '.'
      );
    }
    if (closedActivities.contains(activity.Id)) {
      throw new ShoreshException(
        activity.Name + ' is closed in ' + weekName + '.'
      );
    }
    if (closedPlaces.containsKey(activity.Location__c)) {
      throw new ShoreshException(
        closedPlaces.get(activity.Location__c) +
          ' is closed in ' +
          weekName +
          '.'
      );
    }
  }
}
