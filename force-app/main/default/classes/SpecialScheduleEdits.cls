/**
 * Cell edits on a special day's or event's own schedule (ADR 0014 choice 15), sent by the week
 * editor as Manual Build's are (SlotEdits): each run says what its cells held when the director
 * saw them, and is made only if they still do, so two people can fill the same plan at once and
 * nobody's change is overwritten unseen (a conflict, for the screen to ask "keep theirs or use
 * yours"). Only the season's activities can be typed in. A fixed or recurring activity brought
 * in when the special day started is an ordinary cell of the day, as on the desktop
 * (SpecialDayGridEditor.jsx): typed over, cleared, moved, copied or put back by Undo like any
 * other; only those the special day starts with are put back by Id (SpecialSetTimes). The plan is saved all at once under its item's lock (SpecialPlans). Runs in user mode.
 */
public with sharing class SpecialScheduleEdits {
  private final SpecialSchedule.Owner owner;
  private final CampLabels labels;
  private Map<Id, Activity__c> activities = new Map<Id, Activity__c>();
  // Brought-in fixed and recurring activities an edit puts back after the plan dropped them.
  private Map<Id, SObject> setTimes = new Map<Id, SObject>();

  private SpecialScheduleEdits(SpecialSchedule.Owner owner) {
    this.owner = owner;
    this.labels = CampLabels.forCamp(owner.campId);
  }

  /** Makes the edits that still fit, in order; the answer has the plan as it now is. */
  public static SlotEdits.Result save(Id itemId, List<SlotEdits.Edit> edits) {
    SpecialSchedule.Owner owner = SpecialSchedule.lockedOwnerOf(itemId);
    SpecialPlans.Plan plan = SpecialPlans.read(itemId);
    if (plan.grid == null) {
      throw new ShoreshException(
        plan.problem == null
          ? 'This schedule has no time blocks yet. Reload the page.'
          : 'This schedule could not be read: ' + plan.problem + '.'
      );
    }
    SpecialScheduleEdits saver = new SpecialScheduleEdits(owner);
    saver.readActivities(SlotRules.activityIdsIn(edits));
    saver.setTimes = SpecialSetTimes.dropped(edits, plan.grid, owner);
    SlotEdits.Result result = new SlotEdits.Result();
    ScheduleGrid grid = plan.grid;
    Boolean changed = false;
    for (Integer i = 0; i < edits.size(); i++) {
      // Worked on a copy, so an edit that does not fit leaves the plan as it was.
      ScheduleGrid working = ScheduleGrid.fromText(grid.toText());
      if (saver.apply(edits[i], working)) {
        grid = working;
        changed = true;
      } else {
        result.conflicts.add(i);
      }
    }
    Integer revision = plan.revision;
    if (changed) {
      grid.dropUnusedItems();
      revision = SpecialPlans.write(itemId, grid, plan.revision);
    }
    SpecialSchedule.PlanView view = SpecialSchedule.reread(owner);
    result.schedule = view.schedule;
    result.revision = String.valueOf(revision);
    return result;
  }

  private void readActivities(Set<Id> activityIds) {
    Id seasonId = owner.seasonId;
    activities = new Map<Id, Activity__c>(
      [
        SELECT Id, Name
        FROM Activity__c
        WHERE Id IN :activityIds AND Season__c = :seasonId
        WITH USER_MODE
      ]
    );
  }

  /** Makes one edit, or returns false when someone changed its cells since. */
  private Boolean apply(SlotEdits.Edit edit, ScheduleGrid grid) {
    for (SlotEdits.Run run : edit.runs) {
      if (!applyRun(run, grid)) {
        return false;
      }
    }
    return true;
  }

  private Boolean applyRun(SlotEdits.Run run, ScheduleGrid grid) {
    Integer g = SpecialPlanIds.indexOf(grid.groupIds(), run.groupId);
    Integer first = SpecialPlanIds.indexOf(grid.blockIds(), run.firstBlockId);
    if (
      g < 0 ||
      !run.fits(first, grid.blocks.size()) ||
      !SpecialPlanIds.onBlocks(run, grid.blockIds(), first)
    ) {
      return false;
    }
    List<String> was = SlotIds.ofRow(grid, g);
    for (Integer i = 0; i < run.before.size(); i++) {
      if (!was[first + i].equals(SlotIds.normal(run.before[i]))) {
        return false;
      }
    }
    // A run starts where a placement starts: starting inside one would cut off its first part.
    SlotRules.checkStartsClean(was[first]);
    Set<Integer> inRun = new Set<Integer>();
    for (Integer i = 0; i < run.after.size(); i++) {
      writeSlot(grid, new List<Integer>{ g, first + i }, run.after[i]);
      inRun.add(first + i);
    }
    return SlotRules.neighboursKept(was, SlotIds.ofRow(grid, g), inRun);
  }

  /** One cell (at: its row and time block) given what it should now hold. */
  private void writeSlot(ScheduleGrid grid, List<Integer> at, String after) {
    Integer g = at[0];
    Integer b = at[1];
    String slot = SlotIds.normal(after);
    List<String> row = SlotIds.ofRow(grid, g);
    if (slot.equals(row[b])) {
      return;
    }
    if (slot == SlotIds.OPEN) {
      grid.rows[g][b] = SlotIds.OPEN;
    } else if (SlotIds.isCarryOn(slot)) {
      checkCarriesOn(b == 0 ? SlotIds.OPEN : row[b - 1], slot);
      grid.rows[g][b] = ScheduleGrid.CARRIES_ON;
    } else {
      grid.rows[g][b] = startToken(grid, slot);
    }
  }

  /** A cell carries on only what the cell above it holds. */
  private static void checkCarriesOn(String previous, String slot) {
    if (!SlotIds.owner(previous).equals(slot.substring(1))) {
      throw new ShoreshException(
        'That change could not be read. Reload the page and try again.'
      );
    }
  }

  /** The stored cell for an item starting in a cell, adding it to the plan's list if new. */
  private String startToken(ScheduleGrid grid, String slot) {
    for (Integer i = 0; i < grid.items.size(); i++) {
      if (SlotIds.of(grid.items[i]).equals(slot)) {
        return String.valueOf(i + 1);
      }
    }
    if (SlotIds.isSetTime(slot)) {
      return setTimeToken(grid, slot);
    }
    Activity__c activity = activities.get(SlotIds.activityIn(slot));
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

  /** A fixed or recurring activity put back after the plan dropped it, read back by Id. */
  private String setTimeToken(ScheduleGrid grid, String slot) {
    SObject record = setTimes.get(Id.valueOf(slot.substring(2)));
    if (record == null) {
      throw new ShoreshException(
        'That ' +
          labels.singularInSentence(
            slot.startsWith('F:') ? 'FixedActivity' : 'RecurringActivity'
          ) +
          ' was not found. It may have been deleted.'
      );
    }
    grid.items.add(
      new ScheduleGrid.Item(
        slot.substring(0, 1),
        record.Id,
        (String) record.get('Name')
      )
    );
    return String.valueOf(grid.items.size());
  }
}
