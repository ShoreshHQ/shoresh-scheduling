/**
 * Manual Build's saves: each edit changes a run of slots (one group, one day, one or more time
 * blocks next to each other) and says what those slots held when the director saw them. An edit
 * is made only if its slots still hold that, so two people can work on the same day at once and
 * nobody's change is overwritten unseen: an edit whose slots someone else changed since comes
 * back as a conflict, for the screen to ask "keep theirs or use yours" (Greg, 2026-10-17).
 *
 * What a slot holds is written as its identity: '' (Open), 'A:<activity Id>' (an item starting
 * there; kind and record Id, or kind and name for things not set up in Shoresh yet), or '^' and
 * the identity of the item carrying on into it ('^A:<activity Id>'). Names never decide a match.
 *
 * Only a draft can be changed. Fixed and recurring activities stay where setup put them, and a
 * group is not placed where it is not at camp. Runs in user mode; the days are written by
 * ScheduleDaySaves under the schedule's lock.
 */
public with sharing class SlotSaves {
  public static final String OPEN = '';

  /** One edit: its runs are made together or not at all. */
  public class SlotEdit {
    @AuraEnabled
    public List<SlotRun> runs { get; set; }
  }

  /** Slots next to each other in one group's day: what they held, and what they should hold. */
  public class SlotRun {
    @AuraEnabled
    public Date day { get; set; }
    @AuraEnabled
    public String groupId { get; set; }
    @AuraEnabled
    public String firstBlockId { get; set; }
    @AuraEnabled
    public List<String> before { get; set; }
    @AuraEnabled
    public List<String> after { get; set; }
  }

  public class Result {
    // The edits not made because someone changed their slots since (their positions in the list).
    @AuraEnabled
    public List<Integer> conflicts = new List<Integer>();
    // The schedule as it is now, everyone's changes included.
    @AuraEnabled
    public ScheduleViews.ScheduleView schedule;
  }

  /** Makes the edits that still fit, in order, and returns the schedule as it now is. */
  public static Result save(Id scheduleId, List<SlotEdit> edits) {
    Schedule__c schedule = lockedDraft(scheduleId);
    Map<Date, ScheduleDays.DayGrid> days = new Map<Date, ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : ScheduleDays.read(scheduleId)) {
      days.put(day.day, day);
    }
    Context context = new Context(schedule, edits);
    Result result = new Result();
    Set<Date> changed = new Set<Date>();
    for (Integer i = 0; i < edits.size(); i++) {
      if (context.apply(edits[i], days)) {
        for (SlotRun run : edits[i].runs) {
          changed.add(run.day);
        }
      } else {
        result.conflicts.add(i);
      }
    }
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    List<Date> ordered = new List<Date>(changed);
    ordered.sort();
    for (Date day : ordered) {
      ScheduleDays.DayGrid read = days.get(day);
      saves.add(
        new ScheduleDaySaves.DaySave(day, tidy(read.grid), read.revision)
      );
    }
    if (!saves.isEmpty()) {
      ScheduleDaySaves.write(scheduleId, saves);
    }
    result.schedule = ScheduleViews.open(scheduleId);
    return result;
  }

  /** The identity of each slot in a group's row. */
  public static List<String> identities(ScheduleGrid grid, Integer g) {
    List<String> row = grid.rows[g];
    List<String> result = new List<String>();
    String carrying = OPEN;
    for (String token : row) {
      if (token == ScheduleGrid.CARRIES_ON) {
        result.add(ScheduleGrid.CARRIES_ON + carrying);
      } else if (String.isBlank(token)) {
        carrying = OPEN;
        result.add(OPEN);
      } else {
        carrying = identity(grid.items[Integer.valueOf(token) - 1]);
        result.add(carrying);
      }
    }
    return result;
  }

  public static String identity(ScheduleGrid.Item item) {
    if (!ScheduleGridRules.SET_UP_KINDS.contains(item.kind)) {
      return item.kind + ':' + item.name;
    }
    try {
      return item.kind + ':' + String.valueOf(Id.valueOf(item.id));
    } catch (StringException e) {
      return item.kind + ':' + item.id;
    }
  }

  private static Schedule__c lockedDraft(Id scheduleId) {
    List<Schedule__c> found = [
      SELECT Id, Status__c, Program__c, Program__r.Season__c, Program__r.Season__r.Camp__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (found.isEmpty()) {
      throw new ShoreshException(
        'That schedule was not found, or you do not have access to it.'
      );
    }
    if (found[0].Status__c != ManualDrafts.DRAFT) {
      CampLabels labels = CampLabels.forCamp(
        found[0].Program__r.Season__r.Camp__c
      );
      throw new ShoreshException(
        'A saved ' + labels.singularInSentence('Version') + ' can\'t be changed.'
      );
    }
    return found[0];
  }

  /** The day's items without any no slot uses, numbered again in the same order. */
  private static ScheduleGrid tidy(ScheduleGrid grid) {
    Set<String> used = new Set<String>();
    for (List<String> row : grid.rows) {
      for (String token : row) {
        if (String.isNotBlank(token) && token != ScheduleGrid.CARRIES_ON) {
          used.add(token);
        }
      }
    }
    Map<String, String> renumbered = new Map<String, String>();
    List<ScheduleGrid.Item> kept = new List<ScheduleGrid.Item>();
    for (Integer i = 0; i < grid.items.size(); i++) {
      if (used.contains(String.valueOf(i + 1))) {
        kept.add(grid.items[i]);
        renumbered.put(String.valueOf(i + 1), String.valueOf(kept.size()));
      }
    }
    grid.items = kept;
    for (List<String> row : grid.rows) {
      for (Integer b = 0; b < row.size(); b++) {
        if (renumbered.containsKey(row[b])) {
          row[b] = renumbered.get(row[b]);
        }
      }
    }
    return grid;
  }

  /** What the edits may place, and where the groups are at camp, read once. */
  private class Context {
    private Schedule__c schedule;
    private CampLabels labels;
    private Map<Id, Activity__c> activities = new Map<Id, Activity__c>();
    private Map<Id, Group__c> groups = new Map<Id, Group__c>();
    private Map<Id, TimeBlock__c> blocks = new Map<Id, TimeBlock__c>();

    private Context(Schedule__c schedule, List<SlotEdit> edits) {
      this.schedule = schedule;
      this.labels = CampLabels.forCamp(schedule.Program__r.Season__r.Camp__c);
      Set<Id> activityIds = new Set<Id>();
      for (SlotEdit edit : edits) {
        if (edit == null || edit.runs == null || edit.runs.isEmpty()) {
          throw new ShoreshException('That change could not be read.');
        }
        for (SlotRun run : edit.runs) {
          for (String slot : run.after == null ? new List<String>() : run.after) {
            Id activityId = activityIn(slot);
            if (activityId != null) {
              activityIds.add(activityId);
            }
          }
        }
      }
      if (!activityIds.isEmpty()) {
        activities = new Map<Id, Activity__c>(
          [
            SELECT Id, Name
            FROM Activity__c
            WHERE Id IN :activityIds AND Season__c = :schedule.Program__r.Season__c
            WITH USER_MODE
          ]
        );
      }
      for (Group__c grp : BlankWeek.groupsOf(schedule.Program__c)) {
        groups.put(grp.Id, grp);
      }
      for (TimeBlock__c block : BlankWeek.blocksOf(schedule.Program__c)) {
        blocks.put(block.Id, block);
      }
    }

    /** Makes one edit, or returns false when someone changed its slots since. */
    private Boolean apply(SlotEdit edit, Map<Date, ScheduleDays.DayGrid> days) {
      // Checked on copies, so an edit that does not fit leaves the days as they were.
      Map<Date, ScheduleGrid> working = new Map<Date, ScheduleGrid>();
      for (SlotRun run : edit.runs) {
        ScheduleDays.DayGrid day = days.get(run.day);
        if (day == null || day.grid == null) {
          return false;
        }
        if (!working.containsKey(run.day)) {
          working.put(run.day, copy(day.grid));
        }
        if (!applyRun(run, working.get(run.day))) {
          return false;
        }
      }
      for (Date day : working.keySet()) {
        days.get(day).grid = working.get(day);
      }
      return true;
    }

    private Boolean applyRun(SlotRun run, ScheduleGrid grid) {
      Integer g = indexOfGroup(grid, run.groupId);
      Integer first = indexOfBlock(grid, run.firstBlockId);
      if (
        g < 0 ||
        first < 0 ||
        run.before == null ||
        run.after == null ||
        run.before.isEmpty() ||
        run.before.size() != run.after.size() ||
        first + run.before.size() > grid.blocks.size()
      ) {
        return false;
      }
      List<String> was = identities(grid, g);
      for (Integer i = 0; i < run.before.size(); i++) {
        if (was[first + i] != normal(run.before[i])) {
          return false;
        }
      }
      List<String> row = grid.rows[g];
      for (Integer i = 0; i < run.after.size(); i++) {
        Integer b = first + i;
        String slot = normal(run.after[i]);
        if (slot == was[b]) {
          continue;
        }
        checkChangeable(was[b], slot, grid, g, b);
        row[b] = token(grid, slot, b == 0 ? OPEN : identities(grid, g)[b - 1]);
      }
      List<String> now = identities(grid, g);
      for (Integer b = 0; b < now.size(); b++) {
        Boolean inRun = b >= first && b < first + run.after.size();
        if (!inRun && owner(now[b]) != owner(was[b])) {
          throw new ShoreshException(
            'That change would cut into the slot next to it. Reload the page and try again.'
          );
        }
      }
      return true;
    }

    /** Fixed and recurring activities stay put, and nothing goes where a group isn't at camp. */
    private void checkChangeable(
      String was,
      String slot,
      ScheduleGrid grid,
      Integer g,
      Integer b
    ) {
      if (isSetTime(was) || isSetTime(slot)) {
        throw new ShoreshException(
          labels.plural('FixedActivity') +
            ' and ' +
            labels.pluralInSentence('RecurringActivity') +
            ' stay where they are set up.'
        );
      }
      Group__c grp = groups.get(Id.valueOf(grid.groups[g].id));
      TimeBlock__c block = blocks.get(Id.valueOf(grid.blocks[b].id));
      if (
        slot != OPEN &&
        grp != null &&
        block != null &&
        !SetTimePlan.atCamp(grp, block)
      ) {
        throw new ShoreshException(
          grp.Name + ' isn\'t at camp in ' + block.Name + '.'
        );
      }
    }

    /** The stored cell for a slot's identity, adding the item to the day's list if it's new. */
    private String token(ScheduleGrid grid, String slot, String previous) {
      if (slot == OPEN) {
        return OPEN;
      }
      if (slot.startsWith(ScheduleGrid.CARRIES_ON)) {
        if (owner(previous) != slot.substring(1)) {
          throw new ShoreshException(
            'That change could not be read. Reload the page and try again.'
          );
        }
        return ScheduleGrid.CARRIES_ON;
      }
      for (Integer i = 0; i < grid.items.size(); i++) {
        if (identity(grid.items[i]) == slot) {
          return String.valueOf(i + 1);
        }
      }
      Id activityId = activityIn(slot);
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
  }

  /** The activity a slot's identity starts, or null. */
  private static Id activityIn(String slot) {
    if (slot == null || !slot.startsWith('A:')) {
      return null;
    }
    try {
      return Id.valueOf(slot.substring(2));
    } catch (StringException e) {
      return null;
    }
  }

  private static Boolean isSetTime(String slot) {
    String item = owner(slot);
    return item.startsWith('F:') || item.startsWith('R:');
  }

  /** The item a slot belongs to, whether it starts there or carries on into it. */
  private static String owner(String slot) {
    return slot.startsWith(ScheduleGrid.CARRIES_ON) ? slot.substring(1) : slot;
  }

  /** The same identity however the screen wrote the record Id (15 or 18 characters). */
  private static String normal(String slot) {
    if (String.isBlank(slot)) {
      return OPEN;
    }
    String carry = slot.startsWith(ScheduleGrid.CARRIES_ON)
      ? ScheduleGrid.CARRIES_ON
      : '';
    String item = slot.substring(carry.length());
    String kind = item.substringBefore(':');
    if (ScheduleGridRules.SET_UP_KINDS.contains(kind)) {
      try {
        item = kind + ':' + String.valueOf(Id.valueOf(item.substringAfter(':')));
      } catch (StringException e) {
        throw new ShoreshException('That change could not be read.');
      }
    }
    return carry + item;
  }

  private static Integer indexOfGroup(ScheduleGrid grid, String groupId) {
    for (Integer g = 0; g < grid.groups.size(); g++) {
      if (sameId(grid.groups[g].id, groupId)) {
        return g;
      }
    }
    return -1;
  }

  private static Integer indexOfBlock(ScheduleGrid grid, String blockId) {
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      if (sameId(grid.blocks[b].id, blockId)) {
        return b;
      }
    }
    return -1;
  }

  private static Boolean sameId(String a, String b) {
    try {
      return Id.valueOf(a) == Id.valueOf(b);
    } catch (Exception e) {
      return false;
    }
  }

  private static ScheduleGrid copy(ScheduleGrid grid) {
    return ScheduleGrid.fromText(grid.toText());
  }
}
