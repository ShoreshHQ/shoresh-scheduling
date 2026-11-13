/**
 * What Apply to other weeks does to one target week (WeekApply): worked out without saving, on
 * copies of its days, what comes off (WeekApplyClear), what goes in and what can't
 * (ManualWeekCopy), and how many cells end up holding something else; then saved, through the same
 * slot saves as any edit, on the draft locked by the caller (on a Generated draft, what it fills
 * locked, as a hand edit's is).
 */
public with sharing class WeekApplyPlan {
  private GeneratedSetup setup;
  private ManualWeekStart rules;
  private Schedule__c source;
  private Boolean manual;
  private WeekApplyKeep keep;

  /** source: the draft being applied (its Origin__c and Week__r.Name). */
  public WeekApplyPlan(GeneratedSetup setup, Schedule__c source) {
    this.setup = setup;
    this.source = source;
    rules = new ManualWeekStart(setup);
    manual = source.Origin__c == ManualDrafts.MANUAL;
    keep = new WeekApplyKeep(setup, source);
  }

  /** The target's draft kept first, or made; then the edits; a Generated draft's notes go. */
  public void save(
    Schedule__c draft,
    List<ScheduleDays.DayGrid> days,
    List<SlotEdits.Edit> edits
  ) {
    SlotSaves.Prepared prepared = new SlotSaves.Prepared();
    if (draft == null) {
      prepared.scheduleId = manual
        ? ManualDrafts.startWith(setup).draftId
        : GeneratedDrafts.startBlank(setup, setup.blankWeek());
      prepared.days = ScheduleDays.read(prepared.scheduleId);
    } else {
      ManualVersions.keepAutomatically(
        draft,
        WeekApply.versionName(source.Week__r.Name),
        days
      );
      prepared.scheduleId = draft.Id;
      prepared.days = days;
    }
    prepared.rules = rules.rulesFor(edits);
    // On Generated Schedule what it fills is locked, as a hand edit's is (WEEK-6.2).
    prepared.lockEdits = !manual;
    if (!SlotSaves.makeWith(prepared, edits).conflicts.isEmpty()) {
      throw new ShoreshException(
        'The week could not be applied. Reload the page and try again.'
      );
    }
    // As Restore does: the engine's notes were about the week this replaced.
    if (draft != null && !manual && draft.EngineNotes__c != null) {
      Database.update(
        new Schedule__c(Id = draft.Id, EngineNotes__c = null),
        AccessLevel.USER_MODE
      );
    }
  }

  /**
   * What goes where (the outcome's lists and count) and the edits that do it, one per day, worked
   * out on copies of the target's days.
   */
  public List<SlotEdits.Edit> edits(
    List<ScheduleDays.DayGrid> sourceDays,
    List<ScheduleDays.DayGrid> days,
    WeekApply.Outcome outcome
  ) {
    List<ScheduleDays.DayGrid> working = copiesOf(days);
    Map<Date, String> names = new Map<Date, String>();
    Map<String, ScheduleDays.DayGrid> targets = ManualWeekCopy.byPlace(
      working,
      names
    );
    Map<String, ScheduleDays.DayGrid> sources = ManualWeekCopy.byPlace(
      sourceDays,
      new Map<Date, String>()
    );
    keep.lines.clear();
    WeekApplyClear clear = new WeekApplyClear(rules, keep);
    ManualWeekCopy copy = new ManualWeekCopy(rules);
    copy.noSuchDay = 'that week has no such day';
    copy.skipGroups = clear.away();
    for (String place : targets.keySet()) {
      ScheduleDays.DayGrid target = targets.get(place);
      ScheduleDays.DayGrid other = sources.get(place);
      String dayName = names.get(target.day);
      if (other == null) {
        // A short week's days only: the target's other days have nothing to repeat.
        outcome.leftOut.add(dayName + ': stays as it is');
      } else if (keep.dayStays(target, other, dayName)) {
        copy.skipPlaces.add(place);
      } else if (other.grid != null) {
        clear.clearDay(other.grid, target, dayName);
      }
    }
    copy.plan(sourceDays, working);
    outcome.keptLocked.addAll(clear.kept);
    outcome.leftOut.addAll(keep.lines);
    outcome.leftOut.addAll(clear.leftOut);
    outcome.leftOut.addAll(copy.leftOut);
    List<SlotEdits.Edit> edits = clear.thenFill(copy.edits);
    outcome.cellsChanging = cellsChangedBy(edits);
    return edits;
  }

  private static List<ScheduleDays.DayGrid> copiesOf(
    List<ScheduleDays.DayGrid> days
  ) {
    List<ScheduleDays.DayGrid> copies = new List<ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : days) {
      ScheduleDays.DayGrid copy = new ScheduleDays.DayGrid();
      copy.day = day.day;
      copy.grid = ScheduleGrid.fromText(day.grid.toText());
      copy.rain = day.rain;
      copies.add(copy);
    }
    return copies;
  }

  /** The cells that end up holding something else: taken off and put back doesn't count. */
  private static Integer cellsChangedBy(List<SlotEdits.Edit> edits) {
    Map<String, String> was = new Map<String, String>();
    Map<String, String> now = new Map<String, String>();
    for (SlotEdits.Edit edit : edits) {
      for (SlotEdits.Run run : edit.runs) {
        for (Integer i = 0; i < run.blockIds.size(); i++) {
          String cell = run.day + '|' + run.groupId + '|' + run.blockIds[i];
          if (!was.containsKey(cell)) {
            was.put(cell, SlotIds.normal(run.before[i]));
          }
          now.put(cell, SlotIds.normal(run.after[i]));
        }
      }
    }
    Integer count = 0;
    for (String cell : was.keySet()) {
      if (was.get(cell) != now.get(cell)) {
        count++;
      }
    }
    return count;
  }
}
