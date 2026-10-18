/**
 * "Start from another week" (Greg, 2026-10-17; ADR 0008 §25): a new week's Manual Build draft
 * that begins as another week's Manual Build or a saved version of the program, matched by
 * weekday. The week starts as Start a blank week does (BlankWeek: fixed and recurring activities
 * from this week's own setup); then each activity of the source day goes into the same time
 * blocks for the same group, through the same slot saves as any edit (SlotSaves), only where the
 * cells are Open and the group is at camp. Anything that can't go is left Open and listed, never
 * guessed. Runs in user mode.
 */
public with sharing class ManualWeekStart {
  /** The new draft, and what was left out. */
  public class Started {
    public Id draftId;
    // Fixed or recurring activities whose slot was taken ("Rest · Bunk 3 · Monday").
    public List<String> notPlaced = new List<String>();
    // What the other week had that couldn't go ("Swim · Bunk 3 · Monday: not at camp then").
    public List<String> leftOut = new List<String>();
  }

  private Map<Id, Activity__c> activities;
  private Set<Id> closedActivities = new Set<Id>();
  private Map<Id, Group__c> groups;
  private Map<Id, TimeBlock__c> blocks;
  private List<SlotEdits.Edit> edits = new List<SlotEdits.Edit>();
  private Started started;

  /**
   * Starts the program's week from a source schedule (another week's Manual Build, or a version
   * of the program). If the week was started meanwhile, its draft is returned unchanged.
   */
  public static Started start(Id programId, Id weekId, Id sourceId) {
    Schedule__c source = sourceOf(sourceId, programId);
    Started result = new Started();
    if (ManualDrafts.find(programId, weekId) != null) {
      result.draftId = ManualDrafts.find(programId, weekId).Id;
      return result;
    }
    ManualDrafts.Started blank = ManualDrafts.start(programId, weekId);
    result.draftId = blank.draftId;
    result.notPlaced = blank.notPlaced;
    ManualWeekStart copy = new ManualWeekStart();
    copy.started = result;
    copy.read(programId, weekId);
    copy.plan(ScheduleDays.read(source.Id), ScheduleDays.read(blank.draftId));
    if (!copy.edits.isEmpty()) {
      SlotEdits.Result saved = SlotSaves.save(blank.draftId, copy.edits);
      if (!saved.conflicts.isEmpty()) {
        // Someone changed the new week in the moment it existed: start again from it.
        throw new ShoreshException(
          'Someone else started this week at the same moment. Reload the page.'
        );
      }
    }
    return result;
  }

  /** A Manual Build draft or a version of the program; anything else is refused. */
  private static Schedule__c sourceOf(Id sourceId, Id programId) {
    List<Schedule__c> found = [
      SELECT Id, Status__c, Origin__c, Program__c
      FROM Schedule__c
      WHERE Id = :sourceId
      WITH USER_MODE
    ];
    if (
      found.isEmpty() ||
      found[0].Program__c != programId ||
      !(found[0].Status__c == ManualVersions.VERSION ||
      (found[0].Status__c == ManualDrafts.DRAFT &&
      found[0].Origin__c == ManualDrafts.MANUAL))
    ) {
      throw new ShoreshException(
        'That schedule was not found, or you do not have access to it.'
      );
    }
    return found[0];
  }

  /** What decides where a copied activity may go: setup as it is for this week. */
  private void read(Id programId, Id weekId) {
    Program__c program = ProgramReads.programOf(programId);
    activities = new Map<Id, Activity__c>(
      [
        SELECT Id, Location__c
        FROM Activity__c
        WHERE Season__c = :program.Season__c
        WITH USER_MODE
      ]
    );
    Set<Id> closedLocations = new Set<Id>();
    for (WeekException__c mark : [
      SELECT Activity__c, Location__c
      FROM WeekException__c
      WHERE Week__c = :weekId
      WITH USER_MODE
    ]) {
      if (mark.Activity__c != null) {
        closedActivities.add(mark.Activity__c);
      }
      if (mark.Location__c != null) {
        closedLocations.add(mark.Location__c);
      }
    }
    for (Activity__c activity : activities.values()) {
      if (
        activity.Location__c != null &&
        closedLocations.contains(activity.Location__c)
      ) {
        closedActivities.add(activity.Id);
      }
    }
    groups = new Map<Id, Group__c>(ProgramReads.groupsOf(programId));
    blocks = new Map<Id, TimeBlock__c>(ProgramReads.blocksOf(programId));
  }

  /** The edits that copy each source day onto the new week's day with the same weekday. */
  private void plan(
    List<ScheduleDays.DayGrid> sourceDays,
    List<ScheduleDays.DayGrid> targetDays
  ) {
    Map<String, ScheduleDays.DayGrid> byWeekday = new Map<String, ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : sourceDays) {
      String weekday = BlankWeek.weekdayOf(day.day);
      if (day.grid != null && !byWeekday.containsKey(weekday)) {
        byWeekday.put(weekday, day);
      }
    }
    for (ScheduleDays.DayGrid target : targetDays) {
      String weekday = BlankWeek.weekdayOf(target.day);
      ScheduleDays.DayGrid source = byWeekday.get(weekday);
      if (source == null || target.grid == null) {
        continue;
      }
      for (Integer sg = 0; sg < source.grid.groups.size(); sg++) {
        copyGroup(source.grid, sg, target, weekday);
      }
    }
  }

  private void copyGroup(
    ScheduleGrid source,
    Integer sg,
    ScheduleDays.DayGrid target,
    String weekday
  ) {
    ScheduleGrid.GroupRef grp = source.groups[sg];
    Integer tg = SlotIds.indexOf(target.grid.groupIds(), grp.id);
    List<String> sourceRow = SlotIds.ofRow(source, sg);
    List<String> targetRow = tg < 0 ? null : SlotIds.ofRow(target.grid, tg);
    for (Integer b = 0; b < sourceRow.size(); b++) {
      String slot = sourceRow[b];
      if (
        slot == SlotIds.OPEN ||
        SlotIds.isCarryOn(slot) ||
        SlotIds.isSetTime(slot)
      ) {
        continue;
      }
      Integer length = 1;
      while (
        b + length < sourceRow.size() &&
        sourceRow[b + length] == ScheduleGrid.CARRIES_ON + slot
      ) {
        length++;
      }
      String why = tg < 0
        ? 'not at camp this week'
        : whyNot(source, b, length, slot, target.grid, tg, targetRow);
      String name = nameOf(source, slot);
      if (why != null) {
        started.leftOut.add(
          name + ' · ' + grp.name + ' · ' + weekday + ': ' + why
        );
        continue;
      }
      Integer first = SlotIds.indexOf(
        target.grid.blockIds(),
        source.blocks[b].id
      );
      List<String> before = new List<String>();
      List<String> after = new List<String>();
      for (Integer i = 0; i < length; i++) {
        before.add(SlotIds.OPEN);
        after.add(i == 0 ? slot : ScheduleGrid.CARRIES_ON + slot);
        targetRow[first + i] = after[i];
      }
      SlotEdits.Run run = new SlotEdits.Run();
      run.day = target.day;
      run.groupId = grp.id;
      run.firstBlockId = target.grid.blocks[first].id;
      run.blockIds = new List<String>();
      for (Integer i = 0; i < length; i++) {
        run.blockIds.add(target.grid.blocks[first + i].id);
      }
      run.before = before;
      run.after = after;
      SlotEdits.Edit edit = new SlotEdits.Edit();
      edit.runs = new List<SlotEdits.Run>{ run };
      edits.add(edit);
    }
  }

  /** Why a source placement can't go on the target, or null when it can. */
  private String whyNot(
    ScheduleGrid source,
    Integer b,
    Integer length,
    String slot,
    ScheduleGrid target,
    Integer tg,
    List<String> targetRow
  ) {
    Id activityId = SlotIds.activityIn(slot);
    if (activityId == null) {
      return 'not set up yet';
    }
    if (!activities.containsKey(activityId)) {
      return 'deleted from setup';
    }
    if (closedActivities.contains(activityId)) {
      return 'not running this week';
    }
    Group__c grp = groups.get(Id.valueOf(target.groups[tg].id));
    Integer first = -1;
    for (Integer i = 0; i < length; i++) {
      String blockId = source.blocks[b + i].id;
      Integer tb = SlotIds.indexOf(target.blockIds(), blockId);
      if (tb < 0 || (i > 0 && tb != first + i)) {
        return 'that day has no ' + source.blocks[b + i].name;
      }
      if (i == 0) {
        first = tb;
      }
      TimeBlock__c block = blocks.get(Id.valueOf(blockId));
      if (grp == null || block == null || !SetTimePlan.atCamp(grp, block)) {
        return 'not at camp then';
      }
      if (targetRow[tb] != SlotIds.OPEN) {
        return nameOf(target, targetRow[tb]) + ' is there';
      }
    }
    return null;
  }

  /** The name a grid gives what a slot holds. */
  private static String nameOf(ScheduleGrid grid, String slot) {
    String item = SlotIds.owner(slot);
    for (ScheduleGrid.Item candidate : grid.items) {
      if (SlotIds.of(candidate) == item) {
        return candidate.name;
      }
    }
    return item;
  }
}
