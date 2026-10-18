/**
 * Saves a generated week into the program's Generated draft: the whole week at once (Generate,
 * Rebuild, Try another, Fill the open cells, Start over), protected by the schedule-level revision
 * check (ADR 0005 §9). If someone else saved the week since it was read, nothing is written and
 * the answer is a conflict, for the screen to say so; nothing is overwritten unseen. Rebuild and
 * Start over save the draft as a version first (Greg, 2026-10-17), and so does Try another (as on
 * the desktop, which keeps one before every build that replaces a week). The save takes its lock
 * (the program's for a first save, the draft's after) before it reads anything it checks, so a
 * save that waited sees what the one before it left. What it checks against is GeneratedSetup,
 * read once; the days are checked by GeneratedFrames, GeneratedChecks (with GeneratedClosures for
 * this week's exceptions) and, before a first save, GeneratedSetupChanges against a blank week
 * built again (BlankWeek). Runs in user mode; the days are written by ScheduleDaySaves under the
 * lock.
 */
public with sharing class GeneratedSaves {
  public static final String GENERATE = 'Generate';
  public static final String REBUILD = 'Rebuild';
  public static final String TRY_ANOTHER = 'TryAnother';
  public static final String FILL_OPEN = 'FillOpen';
  public static final String START_OVER = 'StartOver';
  // What replaces the whole week keeps it first, as a version with this name.
  private static final Map<String, String> VERSION_FIRST = new Map<String, String>{
    REBUILD => 'Before Rebuild',
    TRY_ANOTHER => 'Before Try another',
    START_OVER => 'Before Start over'
  };
  private static final Set<String> ON_A_DRAFT = new Set<String>{
    REBUILD,
    TRY_ANOTHER,
    FILL_OPEN,
    START_OVER
  };

  private GeneratedWeek.Save request;
  private GeneratedSetup setup;
  private Program__c program;

  private GeneratedSaves(GeneratedWeek.Save request, GeneratedSetup setup) {
    this.request = request;
    this.setup = setup;
    this.program = setup.program;
  }

  public static GeneratedWeek.Result save(GeneratedWeek.Save request) {
    if (request == null) {
      throw GeneratedFrames.unreadable();
    }
    Boolean isFirst = request.scheduleId == null;
    request.check(isFirst ? new Set<String>{ GENERATE } : ON_A_DRAFT);
    if (isFirst) {
      if (String.isNotEmpty(request.revision)) {
        throw GeneratedFrames.unreadable();
      }
      GeneratedDrafts.lockProgram(request.programId);
      return new GeneratedSaves(request, setupNow(request)).first();
    }
    Schedule__c draft = GeneratedDrafts.locked(
      request.scheduleId,
      request.programId,
      request.weekId
    );
    return new GeneratedSaves(request, setupNow(request)).again(draft);
  }

  /** Setup as it is now: read after the lock is taken, never before. */
  private static GeneratedSetup setupNow(GeneratedWeek.Save request) {
    return new GeneratedSetup(request.programId, request.weekId);
  }

  /** The week's first save makes its Generated draft, from a blank week as it is now. */
  private GeneratedWeek.Result first() {
    // Looked for again under the lock: a save that waited sees the one before it.
    if (GeneratedDrafts.find(program.Id, request.weekId) != null) {
      return conflict(ScheduleDaySaves.CHANGED_SINCE);
    }
    List<ScheduleDays.DayGrid> blank = GeneratedInputs.daysOf(
      setup.blankWeek().days
    );
    // The blank week was read before; if setup has changed it since, the week is opened again.
    String changed = GeneratedSetupChanges.of(setup, blank, request.days);
    if (changed != null) {
      return conflict(changed);
    }
    List<ScheduleGrid> grids = GeneratedChecks.check(setup, blank, request);
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Schedule__c draft = new Schedule__c(
        Program__c = program.Id,
        Week__c = request.weekId,
        Name = GeneratedDrafts.NAME,
        Status__c = ManualDrafts.DRAFT,
        Origin__c = GeneratedDrafts.GENERATED,
        EngineOption__c = request.option
      );
      Database.insert(draft, AccessLevel.USER_MODE);
      ScheduleDaySaves.write(draft.Id, daySaves(blank, grids, false));
      return saved(draft.Id, blank, null);
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  /** A later save replaces the draft's days, if no one has saved them since they were read. */
  private GeneratedWeek.Result again(Schedule__c draft) {
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(draft.Id);
    if (!GeneratedDrafts.revisionOf(days).equals(request.revision ?? '')) {
      return conflict(ScheduleDaySaves.CHANGED_SINCE);
    }
    GeneratedFrames.checkReadable(days);
    // Same revision, so the same days: anything else wasn't built from this draft.
    if (!GeneratedFrames.sameFrame(days, request.days)) {
      throw GeneratedFrames.unreadable();
    }
    List<ScheduleGrid> grids = GeneratedChecks.check(setup, days, request);
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Id versionId = VERSION_FIRST.containsKey(request.action)
        ? saveVersion(draft, days)
        : null;
      Database.update(
        new Schedule__c(Id = draft.Id, EngineOption__c = request.option),
        AccessLevel.USER_MODE
      );
      ScheduleDaySaves.write(draft.Id, daySaves(days, grids, true));
      return saved(draft.Id, days, versionId);
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  /** The draft as it is now, kept as a version (Auto-saved) before it is replaced. */
  private Id saveVersion(Schedule__c draft, List<ScheduleDays.DayGrid> days) {
    Schedule__c version = new Schedule__c(
      Program__c = draft.Program__c,
      Week__c = draft.Week__c,
      Name = VERSION_FIRST.get(request.action),
      Status__c = ManualVersions.VERSION,
      Origin__c = GeneratedDrafts.GENERATED,
      VersionReason__c = ManualVersions.AUTO_SAVED,
      SourceSchedule__c = draft.Id,
      EngineOption__c = draft.EngineOption__c
    );
    Database.insert(version, AccessLevel.USER_MODE);
    List<ScheduleGrid> grids = new List<ScheduleGrid>();
    for (ScheduleDays.DayGrid day : days) {
      grids.add(day.grid);
    }
    ScheduleDaySaves.write(version.Id, daySaves(days, grids, false));
    return version.Id;
  }

  /** The days to write: each one's grid, at the revision it was read at (or as new). */
  private static List<ScheduleDaySaves.DaySave> daySaves(
    List<ScheduleDays.DayGrid> days,
    List<ScheduleGrid> grids,
    Boolean atRevision
  ) {
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    for (Integer i = 0; i < days.size(); i++) {
      saves.add(
        new ScheduleDaySaves.DaySave(
          days[i].day,
          grids[i],
          atRevision ? days[i].revision : null
        )
      );
    }
    return saves;
  }

  private static GeneratedWeek.Result conflict(String message) {
    GeneratedWeek.Result result = new GeneratedWeek.Result();
    result.conflict = true;
    result.message = message;
    return result;
  }

  /**
   * What the save leaves: each day one revision on from what was read under the lock (or 1 for a
   * new day), as ScheduleDaySaves writes it, so nothing is read again.
   */
  private static GeneratedWeek.Result saved(
    Id draftId,
    List<ScheduleDays.DayGrid> days,
    Id versionId
  ) {
    List<ScheduleDays.DayGrid> now = new List<ScheduleDays.DayGrid>();
    for (ScheduleDays.DayGrid day : days) {
      ScheduleDays.DayGrid next = new ScheduleDays.DayGrid();
      next.day = day.day;
      next.revision = day.revision == null ? 1 : day.revision + 1;
      now.add(next);
    }
    GeneratedWeek.Result result = new GeneratedWeek.Result();
    result.scheduleId = draftId;
    result.revision = GeneratedDrafts.revisionOf(now);
    result.versionId = versionId;
    return result;
  }
}
