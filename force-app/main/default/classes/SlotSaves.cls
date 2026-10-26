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
 * A hand edit is never refused for what the director knows better than setup (Greg, 2026-10-26,
 * engine care Q4): a closed activity or place, a group away or not at camp then, or a fixed or
 * recurring activity moved, covered or cleared. Each shows as a reminder in the Why list instead
 * ("Update to match setup", SetupMatch). What is still refused protects the data: a stale or
 * changed cell (a conflict), a Lock the screen didn't see, a record that isn't the season's, a
 * day or group or time block that isn't the draft's, a run cutting into a placement, and anything
 * but a draft (repo docs/adr/0008-manual-build.md, hand edits are reminders).
 *
 * Only a draft can be changed, and only as SlotRules allows. Runs in user mode; the days are
 * written by ScheduleDaySaves under the schedule's lock.
 */
public with sharing class SlotSaves {
  private SlotRules rules;
  // The program's setup as saveOn read it (not read by makeWith).
  private SlotRules.Setup setup;
  private Map<Date, ScheduleDays.DayGrid> days = new Map<Date, ScheduleDays.DayGrid>();
  private Set<Date> changed = new Set<Date>();
  // The "Rain plan full" marks an edit made leaves on a day (a rainy day, or its Undo).
  private Map<Date, List<String>> rain = new Map<Date, List<String>>();
  // Generated Schedule: what an edit fills is locked.
  private Boolean lockEdits = false;

  /**
   * Makes the edits that still fit, in order; the answer has the schedule as it now is, by
   * setup's names now as Manual Build shows it (ManualBuildNamesNow).
   */
  public static SlotEdits.Result save(
    Id scheduleId,
    List<SlotEdits.Edit> edits
  ) {
    SlotSaves saves = new SlotSaves();
    SlotEdits.Result result = saves.saveOn(
      ManualDrafts.locked(scheduleId),
      edits
    );
    // Setup now, on the setup the save read: what is still there and what it is called.
    ManualBuildNamesNow names = ManualBuildSetupNow.of(
      saves.days.values(),
      saves.setup.blocks,
      saves.setup.groups
    );
    result.schedule = ScheduleViews.open(scheduleId, names.stillThere());
    names.applyTo(result.schedule);
    return result;
  }

  /**
   * Start from another week's copy: on setup already read (GeneratedSetup.rules) and the draft's
   * days as the start read them (read), and without reading the schedule back (the start reads the
   * whole draft once afterwards anyway). The draft must be one this request inserted, so nobody
   * else can save it meanwhile.
   */
  public static SlotEdits.Result makeWith(
    Id scheduleId,
    List<ScheduleDays.DayGrid> read,
    List<SlotEdits.Edit> edits,
    SlotRules rules
  ) {
    SlotSaves saves = new SlotSaves();
    saves.rules = rules;
    return saves.saveAll(scheduleId, read, edits);
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
    setup = setupOf(schedule.Program__r);
    rules = new SlotRules(setup, SlotRules.activityIdsIn(edits))
      .withEvents(edits);
    return saveAll(schedule.Id, ScheduleDays.read(schedule.Id), edits);
  }

  /** The edits, on the rules already set, on the schedule's days as read. */
  private SlotEdits.Result saveAll(
    Id scheduleId,
    List<ScheduleDays.DayGrid> read,
    List<SlotEdits.Edit> edits
  ) {
    for (ScheduleDays.DayGrid day : read) {
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
      ScheduleDaySaves.DaySave save = new ScheduleDaySaves.DaySave(
        day,
        read.grid,
        read.revision
      );
      // The marks an edit left on the day; none named, the day keeps its own.
      save.rain = rain.get(day);
      toSave.add(save);
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
    // The "Rain plan full" marks it leaves (a rainy day, or its Undo), on days that can be read.
    Map<Date, List<String>> marks = RainMarks.ofEdit(edit, days);
    for (Date day : working.keySet()) {
      days.get(day).grid = working.get(day);
      changed.add(day);
    }
    rain.putAll(marks);
    changed.addAll(marks.keySet());
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
      bringSetTimeItem(grid, slot);
      grid.rows[g][b] = rules.startToken(grid, slot);
    }
  }

  /**
   * A fixed or recurring activity moved by hand onto a day that doesn't list it: listed there, as
   * another day of the schedule names it. One no day names was not on the screen: refused.
   */
  private void bringSetTimeItem(ScheduleGrid grid, String slot) {
    if (!SlotIds.isSetTime(slot) || itemFor(grid, slot) != null) {
      return;
    }
    for (ScheduleDays.DayGrid day : days.values()) {
      ScheduleGrid.Item item = day.grid == null
        ? null
        : itemFor(day.grid, slot);
      if (item != null) {
        grid.items.add(new ScheduleGrid.Item(item.kind, item.id, item.name));
        return;
      }
    }
    throw new ShoreshException(
      'That change could not be read. Reload the page and try again.'
    );
  }

  private static ScheduleGrid.Item itemFor(ScheduleGrid grid, String slot) {
    for (ScheduleGrid.Item item : grid.items) {
      if (SlotIds.of(item).equals(slot)) {
        return item;
      }
    }
    return null;
  }
}
