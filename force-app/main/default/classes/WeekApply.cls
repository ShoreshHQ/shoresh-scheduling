/**
 * Apply to other weeks (WEEK-6.2, ADR 0025 choice 5): a numbered-days season's week repeated on
 * another week of the program, one week per call (a request can't hold several: ADR 0025). The
 * week on screen (Manual Build's or Generated Schedule's draft) goes onto the target week's draft
 * of the same screen, by Day number, which is by weekday: Start from another week's matching and
 * its "can't go" listing (ManualWeekCopy), after WeekApplyClear has taken off what the other week
 * doesn't have, through the same slot saves as any edit. A locked cell is never overwritten and
 * each is listed. The target's draft goes to its Versions first; a week with none gets one; a
 * published copy is another record, untouched until the week is published again (PUB-4.2).
 *
 * What it fills is not locked, on Generated Schedule too (a hand edit's would be, LOCK-1.1):
 * otherwise a lock would keep every cell the next time the week is applied, and a later change to
 * the grid could never reach it. Only a person's own lock keeps a cell.
 *
 * The preview changes nothing; what it hands back (seen) is both weeks as they are, and the apply
 * is refused with nothing changed if either was saved since. Runs in user mode.
 */
public with sharing class WeekApply {
  private Schedule__c source;
  private Boolean manual;
  private GeneratedSetup setup;
  private WeekApplyPlan plan;

  /** What applying to one week would do, or did. */
  public class Outcome {
    @AuraEnabled
    public Id weekId;
    @AuraEnabled
    public String weekName;
    // Both weeks as the preview read them: sent back with the apply.
    @AuraEnabled
    public String seen;
    @AuraEnabled
    public Integer cellsChanging = 0;
    // A locked cell kept ("Swim · Bunk 3 · Day 3 · Period 2").
    @AuraEnabled
    public List<String> keptLocked = new List<String>();
    // What can't go, and why ("Swim · Bunk 3 · Day 3: not at camp then").
    @AuraEnabled
    public List<String> leftOut = new List<String>();
    // A new draft's fixed or recurring activity whose slot was taken ("Rest · Bunk 3 · Day 1").
    @AuraEnabled
    public List<String> notPlaced = new List<String>();
    // The week has no draft on this screen yet: it gets one.
    @AuraEnabled
    public Boolean startsDraft = false;
    // The week has a published schedule, which stays as it is.
    @AuraEnabled
    public Boolean published = false;
    // Why this week can't be applied to at all (a day that can't be read).
    @AuraEnabled
    public String problem;
    // Refused, nothing changed: one of the weeks was saved since it was seen.
    @AuraEnabled
    public Boolean changedSince = false;
    @AuraEnabled
    public Boolean applied = false;
  }

  /** What applying the draft to that week would do. seenSource: the week as on screen, if known. */
  public static Outcome preview(Id sourceId, Id weekId, String seenSource) {
    return new WeekApply(sourceOf(sourceId), weekId).previewNow(seenSource);
  }

  /** Applies the draft to that week, if both weeks are still as the preview saw them. */
  public static Outcome apply(Id sourceId, Id weekId, String seen) {
    Schedule__c source = sourceOf(sourceId);
    // Two applies, or an apply and a first save, take turns; setup is read after the lock.
    GeneratedDrafts.lockProgram(source.Program__c);
    return new WeekApply(source, weekId).applyNow(seen);
  }

  /** The name the target's draft is kept under in its Versions. */
  public static String versionName(String sourceWeekName) {
    return ('Before applying ' + sourceWeekName).left(80);
  }

  private WeekApply(Schedule__c source, Id weekId) {
    this.source = source;
    manual = source.Origin__c == ManualDrafts.MANUAL;
    setup = new GeneratedSetup(source.Program__c, weekId);
    if (setup.program.Season__r.NumberedDays__c != true) {
      throw new ShoreshException(
        'Only a season with numbered days repeats its ' +
          setup.labels().pluralInSentence('Week') +
          ' this way.'
      );
    }
    if (weekId == source.Week__c) {
      throw new ShoreshException(
        'That is the ' + setup.labels().singularInSentence('Week') + ' itself.'
      );
    }
    plan = new WeekApplyPlan(setup, source);
  }

  /** A draft of Manual Build or Generated Schedule; anything else is refused. */
  private static Schedule__c sourceOf(Id sourceId) {
    List<Schedule__c> found = [
      SELECT Id, Status__c, Origin__c, Program__c, Week__c, Week__r.Name
      FROM Schedule__c
      WHERE Id = :sourceId
      WITH USER_MODE
    ];
    if (
      found.isEmpty() ||
      found[0].Status__c != ManualDrafts.DRAFT ||
      (found[0].Origin__c != ManualDrafts.MANUAL &&
      found[0].Origin__c != GeneratedDrafts.GENERATED)
    ) {
      throw new ShoreshException(
        'That schedule was not found, or you do not have access to it.'
      );
    }
    return found[0];
  }

  private Outcome previewNow(String seenSource) {
    Outcome outcome = newOutcome();
    Id draftId = targetDraftId();
    Map<Id, List<ScheduleDays.DayGrid>> read = readBoth(draftId);
    List<ScheduleDays.DayGrid> sourceDays = read.get(source.Id);
    if (seenSource != null && ScheduleDays.stamp(sourceDays) != seenSource) {
      outcome.changedSince = true;
      return outcome;
    }
    List<ScheduleDays.DayGrid> days = daysOrBlank(outcome, read.get(draftId));
    outcome.seen = seenOf(sourceDays, read.get(draftId));
    outcome.problem = problemIn(days);
    if (outcome.problem == null) {
      plan.edits(sourceDays, days, outcome);
    }
    return outcome;
  }

  private Outcome applyNow(String seen) {
    Outcome outcome = newOutcome();
    Id draftId = targetDraftId();
    Schedule__c draft = draftId == null ? null : lockedDraft(draftId);
    Map<Id, List<ScheduleDays.DayGrid>> read = readBoth(draftId);
    List<ScheduleDays.DayGrid> sourceDays = read.get(source.Id);
    if (seenOf(sourceDays, read.get(draftId)) != seen) {
      outcome.changedSince = true;
      return outcome;
    }
    List<ScheduleDays.DayGrid> days = daysOrBlank(outcome, read.get(draftId));
    outcome.problem = problemIn(days);
    if (outcome.problem != null) {
      return outcome;
    }
    List<SlotEdits.Edit> edits = plan.edits(sourceDays, days, outcome);
    if (outcome.cellsChanging > 0) {
      Savepoint before = Database.setSavepoint();
      try {
        plan.save(draft, days, edits);
        outcome.applied = true;
      } catch (Exception e) {
        Database.rollback(before);
        throw e;
      }
    }
    return outcome;
  }

  private Outcome newOutcome() {
    Outcome outcome = new Outcome();
    outcome.weekId = setup.week.Id;
    outcome.weekName = setup.week.Name;
    outcome.published =
      SchedulePublish.publishedOf(setup.program.Id, setup.week.Id) != null;
    return outcome;
  }

  /** The target week's draft on the source's screen, or null. */
  private Id targetDraftId() {
    Schedule__c found = manual
      ? ManualDrafts.find(setup.program.Id, setup.week.Id)
      : GeneratedDrafts.find(setup.program.Id, setup.week.Id);
    return found?.Id;
  }

  private Schedule__c lockedDraft(Id draftId) {
    return manual
      ? ManualDrafts.locked(draftId)
      : GeneratedDrafts.lockedToEdit(draftId);
  }

  private Map<Id, List<ScheduleDays.DayGrid>> readBoth(Id draftId) {
    Set<Id> ids = new Set<Id>{ source.Id };
    if (draftId != null) {
      ids.add(draftId);
    }
    return ScheduleDays.read(ids);
  }

  /** The target's days, or a blank week's for one with no draft (its first save makes them). */
  private List<ScheduleDays.DayGrid> daysOrBlank(
    Outcome outcome,
    List<ScheduleDays.DayGrid> days
  ) {
    if (days != null) {
      return days;
    }
    BlankWeek.Week blank = setup.blankWeek();
    outcome.startsDraft = true;
    outcome.notPlaced = blank.notPlaced;
    return GeneratedInputs.daysOf(blank.days);
  }

  private static String seenOf(
    List<ScheduleDays.DayGrid> sourceDays,
    List<ScheduleDays.DayGrid> targetDays
  ) {
    return ScheduleDays.stamp(sourceDays) +
      '|' +
      ScheduleDays.stamp(targetDays ?? new List<ScheduleDays.DayGrid>());
  }

  /** A target day that can't be read: its week can't be kept in Versions, so nothing changes. */
  private static String problemIn(List<ScheduleDays.DayGrid> days) {
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid == null) {
        return 'A day could not be read (' +
          day.problem +
          '), so nothing was changed.';
      }
    }
    return null;
  }
}
