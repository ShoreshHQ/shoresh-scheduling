/**
 * Manual Build's "setup changed since the week started" (ADR 0008 part 6; Greg's Manual Build
 * round 1 #5: placements stay, mismatches get a dot, and "Update to match setup" for all or per
 * slot; round 2 #3: a rename shows the new name, with no dot). The desktop writes fixed and
 * recurring events in once and never updates them (src/screens/schedule/useGeneration.js; wiki
 * behaviour index "Fixed/recurring events frozen at start"), and marks a placement whose
 * activity, group or place is closed that week (src/utils/computeWeekClosures.js).
 *
 * Each day of the draft is compared with the day setup makes now (SetupMatchDay): every cell
 * that differs gets a dot saying why, and the differences are listed as changes the director
 * can make one at a time or all at once, each shown before it is made. Nothing changes unless
 * the director chooses it. A change that takes away the director's own placement keeps the week
 * as it was first, as an automatic version (the desktop's way back before a restore), once per
 * opening of the list. Runs in
 * user mode.
 *
 * Generated Schedule's draft gets the same (Greg's look-and-feel decision 1, 2026-10-20; ADR 0010
 * §56): the same dots, list and update, and its locks stay on every cell an update leaves holding
 * what it held (SetupMatchDay), so a director's hand edits and Locks are never lost unseen.
 */
public with sharing class SetupMatch {
  public static final String BEFORE_UPDATE = 'Before Update to match setup';
  // Why an update was refused, with nothing changed.
  public static final String CHANGED_SINCE = 'changedSince';
  public static final String SETUP_CHANGED = 'setupChanged';

  /** One cell change: "Bunk 1 · Monday · Period 2", "Archery" → "Open", and why. */
  public class Line {
    @AuraEnabled
    public String place;
    @AuraEnabled
    public String before;
    @AuraEnabled
    public String after;
    @AuraEnabled
    public String reason;
  }

  /**
   * A change the director can make on its own: one line, or a whole day (its summary, then its
   * lines) when the day's time blocks or groups changed.
   */
  public class Change {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public Date dateValue;
    @AuraEnabled
    public String summary;
    @AuraEnabled
    public List<Line> lines = new List<Line>();
    // It takes away or replaces a placement the director made.
    @AuraEnabled
    public Boolean takesChoices = false;
  }

  /** A cell's dot: the grid's key ("date|groupId|blockId") and its words. */
  public class Dot {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String words;

    public Dot(String key, String words) {
      this.key = key;
      this.words = words;
    }
  }

  /** What setup changed since the week started, as the screen shows it. */
  public class Preview {
    @AuraEnabled
    public List<Change> changes = new List<Change>();
    @AuraEnabled
    public List<Dot> dots = new List<Dot>();
    // The week's revisions it was worked out on (ScheduleDays.stamp), sent back by an update.
    @AuraEnabled
    public String revisions;
    // Activities closed this week: placing one makes a new difference.
    @AuraEnabled
    public List<Id> closedActivityIds = new List<Id>();
    // Why the week can't be compared with setup now ("No bunks of Main are at camp in Week 1."),
    // or null.
    @AuraEnabled
    public String problem;
  }

  /**
   * What an update asks for: the keys chosen, the week's revisions the list was worked out on,
   * and whether an earlier update in this opening of the list kept a version already. Sent by
   * the screen, so each is a property ({ get; set; }): Salesforce fills only properties of a
   * class a Lightning call sends, and left as plain fields every update came in with no
   * revisions and was refused as changed since (scripts/apex-aura-inputs.js).
   */
  public class Ask {
    @AuraEnabled
    public List<String> keys { get; set; }
    @AuraEnabled
    public String seenRevisions { get; set; }
    @AuraEnabled
    public Boolean versionKept { get; set; }
  }

  /** An update's answer: refused (CHANGED_SINCE or SETUP_CHANGED, nothing changed) or made. */
  public class Updated {
    @AuraEnabled
    public String refused;
    // Manual Build's draft as it is now, when the update was made. None for Generated Schedule's,
    // whose screen reads its week again (the engine's input, not Manual Build's view).
    @AuraEnabled
    public ManualBuildViews.DraftView view;
    // This update kept the week as it was first (BEFORE_UPDATE).
    @AuraEnabled
    public Boolean kept = false;
  }

  /** The week compared with setup, day by day. */
  private class Plan {
    private Preview preview = new Preview();
    private List<SetupMatchDay> days = new List<SetupMatchDay>();
    private List<ScheduleDays.DayGrid> current;
    // What the director chose, and whether it takes away a placement of theirs.
    private Set<String> chosen;
    private Boolean takesChoices = false;
    // An earlier update in the same opening of the list kept the week as it was already.
    private Boolean versionKept = false;
  }

  /** What setup changed since the draft's week started (Manual Build's or Generated Schedule's). */
  public static Preview of(Id draftId) {
    Schedule__c draft = draftOf(draftId);
    return planFor(
        new GeneratedSetup(draft.Program__c, draft.Week__c),
        ScheduleDays.read(draftId)
      )
      .preview;
  }

  /**
   * Makes the chosen changes (their keys, from a preview of the week at ask.seenRevisions).
   * Refused, with nothing changed, when anyone saved a day since (CHANGED_SINCE), or when setup
   * changed since so a chosen change is no longer the one shown (SETUP_CHANGED). One opening of
   * the list keeps at most one version (ask.versionKept: an earlier update in it kept one), so
   * the way back is the week as it was before the list's first change that took a placement of
   * the director's.
   */
  public static Updated make(Id draftId, Ask asked) {
    Ask ask = asked == null ? new Ask() : asked;
    Schedule__c draft = lockedDraft(draftId);
    List<ScheduleDays.DayGrid> current = ScheduleDays.read(draftId);
    Updated result = new Updated();
    if (ScheduleDays.stamp(current) != ask.seenRevisions) {
      result.refused = CHANGED_SINCE;
      return result;
    }
    // Setup is read under the draft's lock, so what is made is what setup says now.
    Plan plan = planFor(
      new GeneratedSetup(draft.Program__c, draft.Week__c),
      current
    );
    if (plan.preview.problem != null) {
      throw new ShoreshException(plan.preview.problem);
    }
    plan.chosen = new Set<String>(
      ask.keys == null ? new List<String>() : ask.keys
    );
    Set<String> offered = new Set<String>();
    for (Change change : plan.preview.changes) {
      offered.add(change.key);
      plan.takesChoices =
        plan.takesChoices ||
        (plan.chosen.contains(change.key) && change.takesChoices);
    }
    if (plan.chosen.isEmpty() || !offered.containsAll(plan.chosen)) {
      result.refused = SETUP_CHANGED;
      return result;
    }
    plan.versionKept = ask.versionKept == true;
    result.kept = write(draft, plan);
    result.view = viewOf(draft);
    return result;
  }

  /** Manual Build's draft as it is now; none for Generated Schedule's, which reads its week again. */
  private static ManualBuildViews.DraftView viewOf(Schedule__c draft) {
    return draft.Origin__c == ManualDrafts.MANUAL
      ? ManualBuildViews.open(draft.Id)
      : null;
  }

  /** Makes the chosen changes; returns whether it kept the week as it was first. */
  private static Boolean write(Schedule__c draft, Plan plan) {
    Set<String> chosen = plan.chosen;
    Map<Date, Integer> revisions = new Map<Date, Integer>();
    for (ScheduleDays.DayGrid day : plan.current) {
      revisions.put(day.day, day.revision);
    }
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    Set<Date> gone = new Set<Date>();
    for (SetupMatchDay day : plan.days) {
      if (!day.touches(chosen)) {
        continue;
      }
      if (day.goes()) {
        gone.add(day.day);
      } else {
        saves.add(
          new ScheduleDaySaves.DaySave(
            day.day,
            day.madeWith(chosen),
            revisions.get(day.day)
          )
        );
      }
    }
    Boolean keep = plan.takesChoices && !plan.versionKept;
    Savepoint beforeUpdate = Database.setSavepoint();
    try {
      if (keep) {
        ManualVersions.keepAutomatically(draft, BEFORE_UPDATE, plan.current);
      }
      ScheduleDaySaves.write(draft.Id, saves);
      if (!gone.isEmpty()) {
        Database.delete(
          [
            SELECT Id
            FROM ScheduleDay__c
            WHERE Schedule__c = :draft.Id AND Date__c IN :gone
            WITH USER_MODE
          ],
          true,
          AccessLevel.USER_MODE
        );
      }
    } catch (Exception e) {
      Database.rollback(beforeUpdate);
      throw e;
    }
    return keep;
  }

  /** Each readable day of the draft beside the day setup makes now, in date order. */
  private static Plan planFor(
    GeneratedSetup setup,
    List<ScheduleDays.DayGrid> draftDays
  ) {
    Plan plan = new Plan();
    plan.current = draftDays;
    plan.preview.revisions = ScheduleDays.stamp(draftDays);
    BlankWeek.Week target;
    try {
      target = setup.blankWeek();
    } catch (ShoreshException e) {
      // The week can't be laid out from setup now (no time blocks, no group at camp, no day it
      // runs, or no access to its set-time items): said, never guessed at.
      plan.preview.problem = e.getMessage();
      return plan;
    }
    SetupMatchRules rules = new SetupMatchRules(setup);
    plan.preview.closedActivityIds.addAll(rules.closed);
    Map<Date, ScheduleGrid> targetByDay = new Map<Date, ScheduleGrid>();
    for (ScheduleDaySaves.DaySave day : target.days) {
      targetByDay.put(day.day, day.grid);
    }
    Map<Date, ScheduleDays.DayGrid> draftByDay = new Map<Date, ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : draftDays) {
      draftByDay.put(day.day, day);
    }
    Set<Date> dates = new Set<Date>(targetByDay.keySet());
    dates.addAll(draftByDay.keySet());
    List<Date> ordered = new List<Date>(dates);
    ordered.sort();
    for (Date day : ordered) {
      ScheduleDays.DayGrid drafted = draftByDay.get(day);
      if (drafted != null && drafted.grid == null) {
        // A day that can't be read is left as it is (the screen says why it can't be read).
        continue;
      }
      SetupMatchDay compared = new SetupMatchDay(rules, day)
        .compare(drafted == null ? null : drafted.grid, targetByDay.get(day));
      plan.days.add(compared);
      plan.preview.changes.addAll(compared.changes);
      plan.preview.dots.addAll(compared.dots);
    }
    return plan;
  }

  /** A Manual Build or Generated Schedule draft the user can see, or refused. */
  private static Schedule__c draftOf(Id draftId) {
    List<Schedule__c> found = [
      SELECT Id, Program__c, Week__c, Status__c, Origin__c
      FROM Schedule__c
      WHERE Id = :draftId
      WITH USER_MODE
    ];
    if (found.isEmpty() || !isDraft(found[0])) {
      throw notFound();
    }
    return found[0];
  }

  /**
   * The draft, locked until this update ends so saves of it take turns (as ManualDrafts.locked
   * and GeneratedDrafts.lockedToEdit lock it): one query, whichever screen's draft it is. A
   * version or a published schedule is refused.
   */
  private static Schedule__c lockedDraft(Id draftId) {
    List<Schedule__c> found = [
      SELECT
        Id,
        Name,
        Status__c,
        Origin__c,
        EngineOption__c,
        Program__c,
        Week__c
      FROM Schedule__c
      WHERE Id = :draftId
      WITH USER_MODE
      FOR UPDATE
    ];
    if (found.isEmpty() || !isDraft(found[0])) {
      throw notFound();
    }
    return found[0];
  }

  private static Boolean isDraft(Schedule__c schedule) {
    return schedule.Status__c == ManualDrafts.DRAFT &&
      (schedule.Origin__c == ManualDrafts.MANUAL ||
      schedule.Origin__c == GeneratedDrafts.GENERATED);
  }

  private static ShoreshException notFound() {
    return new ShoreshException(
      'That schedule was not found, or you do not have access to it.'
    );
  }
}
