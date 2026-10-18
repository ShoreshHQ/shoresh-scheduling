/**
 * Manual Build's saves: each edit changes a run of slots (one group, one day, one or more time
 * blocks next to each other, and only the blocks the screen made it on, which it names) and says what those slots held when the director saw them (SlotIds).
 * An edit is made only if its slots still hold that, so two people can work on the same day at
 * once and nobody's change is overwritten unseen: an edit whose slots someone else changed since
 * comes back as a conflict, for the screen to ask "keep theirs or use yours" (Greg, 2026-10-17).
 *
 * Generated Schedule's hand edits are saved the same way (saveOnGenerated), and each cell an edit
 * fills is locked, so building the week again keeps it (Greg, 2026-10-17: hand edits are locks);
 * a cell an edit leaves Open is unlocked, for the next build to fill.
 *
 * Only a draft can be changed, and only as SlotRules allows. Runs in user mode; the days are
 * written by ScheduleDaySaves under the schedule's lock.
 */
public with sharing class SlotSaves {
  private SlotRules rules;
  private Map<Date, ScheduleDays.DayGrid> days = new Map<Date, ScheduleDays.DayGrid>();
  private Set<Date> changed = new Set<Date>();
  // Generated Schedule: what an edit fills is locked.
  private Boolean lockEdits = false;

  /** Makes the edits that still fit, in order; the answer has the schedule as it now is. */
  public static SlotEdits.Result save(
    Id scheduleId,
    List<SlotEdits.Edit> edits
  ) {
    SlotEdits.Result result = new SlotSaves()
      .saveOn(ManualDrafts.locked(scheduleId), edits);
    result.schedule = ScheduleViews.open(scheduleId);
    return result;
  }

  /**
   * The same, on a Generated draft (GeneratedEdits): each run is made only if its locks are as
   * the screen saw them, and what it changes is locked. seen: the revision the screen read the
   * week at; the answer's revision is given only when nobody else saved the week since.
   */
  public static SlotEdits.Result saveOnGenerated(
    Id scheduleId,
    List<SlotEdits.Edit> edits,
    String seen
  ) {
    SlotSaves saves = new SlotSaves();
    saves.lockEdits = true;
    Schedule__c draft = GeneratedDrafts.lockedToEdit(scheduleId);
    SlotEdits.Result result = saves.saveOn(draft, edits);
    // Shown with "deleted since" as Generated Schedule's own reader works it out.
    result.schedule = GeneratedInputs.view(draft);
    result.revision = GeneratedEdits.revisionAfter(
      saves.days,
      saves.changed,
      seen
    );
    return result;
  }

  private SlotEdits.Result saveOn(
    Schedule__c schedule,
    List<SlotEdits.Edit> edits
  ) {
    Id scheduleId = schedule.Id;
    rules = new SlotRules(
      setupOf(schedule.Program__r),
      SlotRules.activityIdsIn(edits)
    );
    for (ScheduleDays.DayGrid day : ScheduleDays.read(scheduleId)) {
      days.put(day.day, day);
    }
    SlotEdits.Result result = new SlotEdits.Result();
    for (Integer i = 0; i < edits.size(); i++) {
      if (!apply(edits[i])) {
        result.conflicts.add(i);
      }
    }
    write(scheduleId);
    return result;
  }

  /** program: its Id, Season__c and Season__r.Camp__c. */
  private static SlotRules.Setup setupOf(Program__c program) {
    SlotRules.Setup setup = new SlotRules.Setup();
    setup.seasonId = program.Season__c;
    setup.labels = CampLabels.forCamp(program.Season__r.Camp__c);
    setup.groups = ProgramReads.groupsOf(program.Id);
    setup.blocks = ProgramReads.blocksOf(program.Id);
    return setup;
  }

  private void write(Id scheduleId) {
    List<Date> ordered = new List<Date>(changed);
    ordered.sort();
    List<ScheduleDaySaves.DaySave> toSave = new List<ScheduleDaySaves.DaySave>();
    for (Date day : ordered) {
      ScheduleDays.DayGrid read = days.get(day);
      read.grid.dropUnusedItems();
      ScheduleGridLocks.tidy(read.grid);
      toSave.add(new ScheduleDaySaves.DaySave(day, read.grid, read.revision));
    }
    if (!toSave.isEmpty()) {
      ScheduleDaySaves.write(scheduleId, toSave);
    }
  }

  /** Makes one edit, or returns false when someone changed its slots since. */
  private Boolean apply(SlotEdits.Edit edit) {
    // Worked on copies, so an edit that does not fit leaves the days as they were.
    Map<Date, ScheduleGrid> working = new Map<Date, ScheduleGrid>();
    for (SlotEdits.Run run : edit.runs) {
      ScheduleDays.DayGrid day = readable(run.day);
      if (!working.containsKey(run.day)) {
        working.put(run.day, ScheduleGrid.fromText(day.grid.toText()));
      }
      if (!applyRun(run, working.get(run.day))) {
        return false;
      }
    }
    for (Date day : working.keySet()) {
      days.get(day).grid = working.get(day);
      changed.add(day);
    }
    return true;
  }

  /** A day of the schedule that can be read; anything else is refused, not a conflict. */
  private ScheduleDays.DayGrid readable(Date day) {
    ScheduleDays.DayGrid read = days.get(day);
    if (read == null) {
      throw new ShoreshException(
        'That day is not in this schedule. Reload the page.'
      );
    }
    if (read.grid == null) {
      throw new ShoreshException(
        'This day could not be read: ' + read.problem + '.'
      );
    }
    return read;
  }

  private Boolean applyRun(SlotEdits.Run run, ScheduleGrid grid) {
    Integer g = SlotIds.indexOf(grid.groupIds(), run.groupId);
    Integer first = SlotIds.indexOf(grid.blockIds(), run.firstBlockId);
    if (
      g < 0 ||
      !run.fits(first, grid.blocks.size()) ||
      !run.onBlocks(grid.blockIds(), first)
    ) {
      return false;
    }
    List<String> was = SlotIds.ofRow(grid, g);
    for (Integer i = 0; i < run.before.size(); i++) {
      if (!was[first + i].equals(SlotIds.normal(run.before[i]))) {
        return false;
      }
    }
    if (!locksAsSeen(run, grid, new List<Integer>{ g, first })) {
      return false;
    }
    // A run starts where a placement starts: starting inside one would cut off its first part.
    SlotRules.checkStartsClean(was[first]);
    Set<Integer> inRun = new Set<Integer>();
    for (Integer i = 0; i < run.after.size(); i++) {
      writeSlot(grid, new List<Integer>{ g, first + i }, run.after[i]);
      inRun.add(first + i);
    }
    if (lockEdits) {
      new GeneratedEdits(run, was).lock(grid, new List<Integer>{ g, first });
    }
    return SlotRules.neighboursKept(was, SlotIds.ofRow(grid, g), inRun);
  }

  /** Generated Schedule: the run's locks are as the screen saw them (GeneratedEdits). */
  private Boolean locksAsSeen(
    SlotEdits.Run run,
    ScheduleGrid grid,
    List<Integer> at
  ) {
    return !lockEdits || GeneratedEdits.sawLocks(run, grid, at);
  }

  /** One slot (at: group and block positions) given what it should now hold. */
  private void writeSlot(ScheduleGrid grid, List<Integer> at, String after) {
    Integer g = at[0];
    Integer b = at[1];
    String slot = SlotIds.normal(after);
    List<String> row = SlotIds.ofRow(grid, g);
    if (slot.equals(row[b])) {
      return;
    }
    rules.checkNotSetTime(row[b], slot);
    rules.checkAtCamp(slot, grid.groups[g].id, grid.blocks[b].id);
    if (slot == SlotIds.OPEN) {
      grid.rows[g][b] = SlotIds.OPEN;
    } else if (SlotIds.isCarryOn(slot)) {
      String previous = b == 0 ? SlotIds.OPEN : row[b - 1];
      if (!SlotIds.owner(previous).equals(slot.substring(1))) {
        throw new ShoreshException(
          'That change could not be read. Reload the page and try again.'
        );
      }
      grid.rows[g][b] = ScheduleGrid.CARRIES_ON;
    } else {
      grid.rows[g][b] = rules.startToken(grid, slot);
    }
  }
}
