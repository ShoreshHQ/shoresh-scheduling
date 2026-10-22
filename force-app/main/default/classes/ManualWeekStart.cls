/**
 * "Start from another week" (Greg, 2026-10-17; ADR 0008 §25): a new week's Manual Build draft
 * that begins as another week's Manual Build, a published schedule or a saved version of the
 * program, matched by
 * weekday. The week starts as Start a blank week does (BlankWeek: fixed and recurring activities
 * from this week's own setup); then each activity of the source day goes into the same time
 * blocks for the same group (ManualWeekCopy), through the same slot saves as any edit
 * (SlotSaves), only where the cells are Open and the group is at camp, and only if the activity
 * is still in setup and running that week. Anything that can't go is left Open and listed, never
 * guessed. Runs in user mode.
 */
public with sharing class ManualWeekStart {
  private Map<Id, Activity__c> activities;
  private Set<Id> closedActivities = new Set<Id>();
  private Map<Id, Group__c> groups;
  private Map<Id, TimeBlock__c> blocks;
  private GeneratedSetup setup;

  /** The new draft, and what was left out. */
  public class Started {
    public Id draftId;
    // Fixed or recurring activities whose slot was taken ("Rest · Bunk 3 · Monday").
    public List<String> notPlaced = new List<String>();
    // What the other week had that couldn't go ("Swim · Bunk 3 · Monday: not at camp then").
    public List<String> leftOut = new List<String>();
    // False when someone else had started the week first: nothing was copied into theirs.
    public Boolean copied = true;
  }

  /**
   * Starts the program's week from a source schedule (another week's Manual Build, a published
   * schedule, or a version of the program). If the week was started meanwhile, its draft is returned unchanged.
   */
  public static Started start(Id programId, Id weekId, Id sourceId) {
    return startWith(new GeneratedSetup(programId, weekId), sourceId);
  }

  /** The same, on the program's setup for the week, read once for the whole request. */
  public static Started startWith(GeneratedSetup setup, Id sourceId) {
    Schedule__c source = sourceOf(sourceId, setup.program.Id);
    Started result = new Started();
    ManualDrafts.Started blank = ManualDrafts.startWith(setup);
    result.draftId = blank.draftId;
    if (!blank.created) {
      // Someone else started the week (before, or while this waited for the lock): theirs stays
      // as it is, nothing copied into it.
      result.copied = false;
      return result;
    }
    result.notPlaced = blank.notPlaced;
    ManualWeekCopy copy = new ManualWeekCopy(new ManualWeekStart(setup));
    copy.plan(ScheduleDays.read(source.Id), ScheduleDays.read(blank.draftId));
    result.leftOut = copy.leftOut;
    if (!copy.edits.isEmpty()) {
      // No second lock: this request inserted the draft (under the program's lock), so nobody
      // else can see or save it until the request ends.
      SlotEdits.Result saved = SlotSaves.makeWith(
        blank.draftId,
        copy.edits,
        setup.rules(SlotRules.activityIdsIn(copy.edits))
      );
      if (!saved.conflicts.isEmpty()) {
        throw new ShoreshException(
          'The week could not be copied. Reload the page and try again.'
        );
      }
    }
    return result;
  }

  /**
   * A Manual Build draft, a published schedule or a version of the program; anything else is
   * refused.
   */
  private static Schedule__c sourceOf(Id sourceId, Id programId) {
    List<Schedule__c> found = [
      SELECT Id, Status__c, Origin__c, Program__c
      FROM Schedule__c
      WHERE Id = :sourceId
      WITH USER_MODE
    ];
    if (found.isEmpty() || !canStartFrom(found[0], programId)) {
      throw new ShoreshException(
        'That schedule was not found, or you do not have access to it.'
      );
    }
    return found[0];
  }

  private static Boolean canStartFrom(Schedule__c source, Id programId) {
    Boolean isManualDraft =
      source.Status__c == ManualDrafts.DRAFT &&
      source.Origin__c == ManualDrafts.MANUAL;
    return source.Program__c == programId &&
      (source.Status__c == ManualVersions.VERSION ||
      source.Status__c == SchedulePublish.PUBLISHED ||
      isManualDraft);
  }

  /** Setup as it is for this week: what decides where a copied activity may go. */
  private ManualWeekStart(GeneratedSetup setup) {
    this.setup = setup;
    activities = new Map<Id, Activity__c>(setup.activityRecords());
    readClosures(setup.exceptions);
    groups = new Map<Id, Group__c>(setup.groups);
    blocks = new Map<Id, TimeBlock__c>(setup.blocks);
  }

  /** Activities closed this week, themselves or by their place. */
  private void readClosures(List<WeekException__c> exceptions) {
    Set<Id> closedLocations = new Set<Id>();
    for (WeekException__c mark : exceptions) {
      if (mark.Activity__c != null) {
        closedActivities.add(mark.Activity__c);
      }
      if (mark.Location__c != null) {
        closedLocations.add(mark.Location__c);
      }
    }
    for (Activity__c activity : activities.values()) {
      if (closedLocations.contains(activity.Location__c)) {
        closedActivities.add(activity.Id);
      }
    }
  }

  /** Why an item can't be copied into this week at all, or null when it can. */
  public String whyNotItem(String slot) {
    Id activityId = SlotIds.activityIn(slot);
    if (SlotIds.eventIn(slot) != null) {
      // A special event is put on each day by hand (desktop: placed day by day, never copied).
      return 'a ' +
        setup.labels().singularInSentence('SpecialEvent') +
        ' is put on each day by hand';
    }
    if (activityId == null) {
      return 'not set up yet';
    }
    if (!activities.containsKey(activityId)) {
      return 'deleted from setup';
    }
    return closedActivities.contains(activityId)
      ? 'not running this ' + weekWord()
      : null;
  }

  /** The camp's word for a week, in a sentence ("week", "session"), read only when needed. */
  public String weekWord() {
    return setup.labels().singularInSentence('Week');
  }

  /** Whether a group is at camp in a time block (both by Id). */
  public Boolean atCamp(String groupId, String blockId) {
    Group__c grp = groups.get(Id.valueOf(groupId));
    TimeBlock__c block = blocks.get(Id.valueOf(blockId));
    return grp != null && block != null && SetTimePlan.atCamp(grp, block);
  }
}
