/**
 * Manual Build's saves: each edit changes a run of slots (one group, one day, one or more time
 * blocks next to each other, and only the blocks the screen made it on, which it names) and says what those slots held when the director saw them (SlotIds).
 * An edit is made only if its slots still hold that, so two people can work on the same day at
 * once and nobody's change is overwritten unseen: an edit whose slots someone else changed since
 * comes back as a conflict, for the screen to ask "keep theirs or use yours" (Greg, 2026-10-17).
 *
 * Generated Schedule's hand edits are saved the same way (GeneratedHandEdit, through saveLocked):
 * there each run also goes by the draft's locks (RunLocks: GeneratedEdits), so building the week
 * again keeps what the director did (Greg, 2026-10-17: hand edits are locks).
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
  // The days in date order, as read before the edits.
  private List<ScheduleDays.DayGrid> asRead;
  private Set<Date> changed = new Set<Date>();
  // Each written day's new revision (ScheduleDaySaves.write).
  private Map<Date, Integer> written = new Map<Date, Integer>();
  // The "Rain plan full" marks an edit made leaves on a day (a rainy day, or its Undo).
  private Map<Date, List<String>> rain = new Map<Date, List<String>>();
  // Generated Schedule: each run goes by the draft's locks (null on Manual Build).
  private RunLocks locks;

  /** What a run adds on a draft that keeps locks (Generated Schedule: GeneratedEdits); Manual Build has none. */
  public interface RunLocks {
    /** Whether the run's cells are locked as the screen saw them; if not, the edit is a conflict. */
    Boolean asSeen(RunAt made, ScheduleGrid grid);
    /** The locks after the run's slots are written. */
    void lock(RunAt made, ScheduleGrid grid);
  }

  /** A run where it is made: its group and first block positions, and what its group held before it. */
  public class RunAt {
    public SlotEdits.Run run;
    public List<Integer> at;
    public List<String> was;

    public RunAt(SlotEdits.Run run, List<Integer> at, List<String> was) {
      this.run = run;
      this.at = at;
      this.was = was;
    }
  }

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
   * days as the start read them (Prepared), and without reading the schedule back (the start reads the
   * whole draft once afterwards anyway). The draft must be one this request inserted or has locked
   * (Apply to other weeks, WeekApply), so nobody else can save it meanwhile. What it fills is
   * locked only when the draft says so (locks), as a hand edit's is.
   */
  public static SlotEdits.Result makeWith(
    Prepared draft,
    List<SlotEdits.Edit> edits
  ) {
    SlotSaves saves = new SlotSaves();
    saves.rules = draft.rules;
    saves.locks = draft.locks;
    return saves.saveAll(draft.scheduleId, draft.days, edits);
  }

  /** A draft this request made or locked, with its days as read and the rules its edits go by (makeWith). */
  public class Prepared {
    public Id scheduleId;
    public List<ScheduleDays.DayGrid> days;
    public SlotRules rules;
    // A Generated draft Apply to other weeks fills: what it fills is locked, as a hand edit's
    // (GeneratedEdits), so the next build keeps the director's own action (WEEK-6.2).
    public RunLocks locks;
  }

  /**
   * The same, on a draft the caller has locked (Generated Schedule's hand edit:
   * GeneratedHandEdit), each run going by locks. The answer leaves the schedule to the caller.
   */
  public static Saved saveLocked(
    Schedule__c draft,
    List<SlotEdits.Edit> edits,
    RunLocks locks
  ) {
    SlotSaves saves = new SlotSaves();
    saves.locks = locks;
    Saved saved = new Saved();
    saved.result = saves.saveOn(draft, edits);
    saved.read = saves.asRead;
    saved.written = saves.written;
    return saved;
  }

  /** What saveLocked did: its answer, the days as read before it, and each written day's new revision. */
  public class Saved {
    public SlotEdits.Result result;
    public List<ScheduleDays.DayGrid> read;
    public Map<Date, Integer> written;
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
    asRead = read;
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
      written = ScheduleDaySaves.write(scheduleId, toSave);
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
        AgentRefusal.withFix(
          'That day is not in this schedule.',
          'Reload the page.'
        )
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
    RunAt made = new RunAt(run, new List<Integer>{ g, first }, was);
    if (!locksAsSeen(made, grid)) {
      return false;
    }
    // A run starts where a placement starts: starting inside one would cut off its first part.
    SlotRunChecks.checkStartsClean(was[first]);
    Set<Integer> inRun = new Set<Integer>();
    for (Integer i = 0; i < run.after.size(); i++) {
      writeSlot(grid, new List<Integer>{ g, first + i }, run.after[i]);
      inRun.add(first + i);
    }
    if (locks != null) {
      locks.lock(made, grid);
    }
    return SlotRunChecks.neighboursKept(was, SlotIds.ofRow(grid, g), inRun);
  }

  /** The run's locks are as the screen saw them, on a draft that keeps locks (RunLocks). */
  private Boolean locksAsSeen(RunAt made, ScheduleGrid grid) {
    return locks == null || locks.asSeen(made, grid);
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
          AgentRefusal.withFix(
            'That change could not be read.',
            'Reload the page and try again.'
          )
        );
      }
      grid.rows[g][b] = ScheduleGrid.CARRIES_ON;
    } else {
      SlotSetTimeItems.bring(grid, slot, days.values());
      grid.rows[g][b] = rules.startToken(grid, slot);
    }
  }
}
