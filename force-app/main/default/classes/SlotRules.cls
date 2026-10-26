/**
 * What an edit may place (SlotSaves): the season's activities, special events (ADR 0014 slice 4)
 * and elective sets (ADR 0018 slice E5), as the day saved them. A hand edit may also move, cover
 * or clear a fixed or recurring activity and place anything where a group is not at camp: the
 * director knows better (Greg, 2026-10-26), and the Why list reminds them. A generated week's save
 * still holds what the engine built to those rules (GeneratedCellRules). Reads
 * what the edits need once, in user mode.
 */
public with sharing class SlotRules {
  private CampLabels labels;
  private Map<Id, Activity__c> activities = new Map<Id, Activity__c>();
  // The special events and elective sets the edits place (SlotEvents); none unless withEvents
  // read them.
  private SlotEvents events = SlotEvents.none();
  private Id seasonId;
  private Setup setup;

  /** What the rules are checked against: the season, the camp's words, groups and time blocks. */
  public class Setup {
    public Id seasonId;
    public CampLabels labels;
    public List<Group__c> groups;
    public List<TimeBlock__c> blocks;
  }

  /** The rules on setup already read, with the activities the edits place. */
  public SlotRules(Setup setup, Set<Id> activityIds) {
    this(setup, seasonActivities(setup.seasonId, activityIds));
  }

  private static List<Activity__c> seasonActivities(
    Id seasonId,
    Set<Id> activityIds
  ) {
    return [
      SELECT Id, Name, Location__c
      FROM Activity__c
      WHERE Id IN :activityIds AND Season__c = :seasonId
      WITH USER_MODE
    ];
  }

  /**
   * The same, on the season's activities already read in user mode (Id, Name, Location__c), so a
   * request that has them reads none again.
   */
  public SlotRules(Setup setup, List<Activity__c> seasonActivities) {
    seasonId = setup.seasonId;
    labels = setup.labels;
    activities = new Map<Id, Activity__c>(seasonActivities);
    this.setup = setup;
  }

  /** The season's special events and elective sets the edits place, read once (SlotEvents). */
  public SlotRules withEvents(List<SlotEdits.Edit> edits) {
    return withEvents(edits, new Map<Id, SObject>());
  }

  /** The same, given elective sets already read (Id, Name, of the season): not read again. */
  public SlotRules withEvents(
    List<SlotEdits.Edit> edits,
    Map<Id, SObject> known
  ) {
    events = SlotEvents.read(setup, edits, known);
    return this;
  }

  /**
   * The activities a Manual Build save's edits place; refuses an edit that can't be read. An edit
   * changes at least one cell, or (a rainy day whose cells are all full) only names the "Rain
   * plan full" marks its day keeps (repo docs/adr/0019).
   */
  public static Set<Id> activityIdsIn(List<SlotEdits.Edit> edits) {
    Set<Id> result = new Set<Id>();
    for (SlotEdits.Edit edit : edits) {
      if (edit?.runs == null || (edit.runs.isEmpty() && edit.rain == null)) {
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
      result.add(SlotIds.activityIn(slot));
    }
    result.remove(null);
    return result;
  }

  /** The stored cell for an item starting in a slot, adding it to the day's list if new. */
  public String startToken(ScheduleGrid grid, String slot) {
    for (Integer i = 0; i < grid.items.size(); i++) {
      if (SlotIds.of(grid.items[i]).equals(slot)) {
        return String.valueOf(i + 1);
      }
    }
    if (SlotEvents.isPlaced(slot)) {
      return events.startToken(grid, slot);
    }
    Activity__c activity = seasonActivity(slot);
    grid.items.add(new ScheduleGrid.Item('A', activity.Id, activity.Name));
    return String.valueOf(grid.items.size());
  }

  /** The season's activity a slot starts or carries on, or null. */
  public Activity__c activityOf(String slot) {
    return activities.get(SlotIds.activityIn(SlotIds.owner(slot)));
  }

  /** The season's activity a slot starts or carries on; refused when it isn't one of them. */
  public Activity__c seasonActivity(String slot) {
    Activity__c activity = activityOf(slot);
    if (activity == null) {
      throw new ShoreshException(
        'That ' +
          labels.singularInSentence('Activity') +
          ' was not found. It may have been deleted.'
      );
    }
    return activity;
  }
}
