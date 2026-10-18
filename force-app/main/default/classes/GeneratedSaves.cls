/**
 * Saves a generated week into the program's Generated draft: the whole week at once (Generate,
 * Rebuild, Try another, Fill the open cells, Start over), protected by the schedule-level revision
 * check (ADR 0005 §9). If someone else saved the week since it was read, nothing is written and
 * the answer is a conflict, for the screen to say so; nothing is overwritten unseen. Rebuild and
 * Start over save the draft as a version first (Greg, 2026-10-17). The days are checked by
 * GeneratedChecks. Runs in user mode; the days are written by ScheduleDaySaves under the lock.
 */
public with sharing class GeneratedSaves {
  public static final String GENERATE = 'Generate';
  public static final String REBUILD = 'Rebuild';
  public static final String TRY_ANOTHER = 'TryAnother';
  public static final String FILL_OPEN = 'FillOpen';
  public static final String START_OVER = 'StartOver';
  public static final String AUTO_SAVED = 'AutoSaved';
  public static final String VERSION = 'Version';
  // Rebuild and Start over keep what they replace, as a version with this name.
  private static final Map<String, String> VERSION_FIRST = new Map<String, String>{
    REBUILD => 'Before Rebuild',
    START_OVER => 'Before Start over'
  };
  private static final Set<String> ON_A_DRAFT = new Set<String>{
    REBUILD,
    TRY_ANOTHER,
    FILL_OPEN,
    START_OVER
  };
  // EngineOption__c holds four digits.
  private static final Integer LAST_OPTION = 9999;

  public static GeneratedWeek.Result save(GeneratedWeek.Save request) {
    checkRequest(request);
    Program__c program = ProgramReads.programOf(request.programId);
    ProgramReads.weekOf(request.weekId, program);
    return request.scheduleId == null
      ? first(request, program)
      : again(request, program);
  }

  private static void checkRequest(GeneratedWeek.Save request) {
    if (
      request == null ||
      request.days == null ||
      !(request.action == GENERATE || ON_A_DRAFT.contains(request.action))
    ) {
      throw GeneratedChecks.unreadable();
    }
    if (
      request.option == null ||
      request.option < 1 ||
      request.option > LAST_OPTION
    ) {
      throw new ShoreshException('That option can\'t be built.');
    }
  }

  /** The week's first save makes its Generated draft, from a blank week as it is now. */
  private static GeneratedWeek.Result first(
    GeneratedWeek.Save request,
    Program__c program
  ) {
    if (request.action != GENERATE || String.isNotEmpty(request.revision)) {
      throw GeneratedChecks.unreadable();
    }
    // Looked for again under the lock: a save that waited sees the one before it.
    GeneratedDrafts.lockProgram(program.Id);
    if (GeneratedDrafts.find(program.Id, request.weekId) != null) {
      return conflict();
    }
    List<ScheduleDays.DayGrid> blank = GeneratedInputs.daysOf(
      BlankWeek.build(program.Id, request.weekId).days
    );
    // The blank week was read before; if setup has changed its days since, build it again.
    if (!GeneratedChecks.sameFrame(blank, request.days)) {
      return conflict();
    }
    List<ScheduleGrid> grids = GeneratedChecks.check(
      program,
      blank,
      request.days
    );
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
      return saved(draft.Id, null);
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  /** A later save replaces the draft's days, if no one has saved them since they were read. */
  private static GeneratedWeek.Result again(
    GeneratedWeek.Save request,
    Program__c program
  ) {
    if (!ON_A_DRAFT.contains(request.action)) {
      throw GeneratedChecks.unreadable();
    }
    Schedule__c draft = GeneratedDrafts.locked(
      request.scheduleId,
      program.Id,
      request.weekId
    );
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(draft.Id);
    String sent = request.revision == null ? '' : request.revision;
    if (!GeneratedDrafts.revisionOf(days).equals(sent)) {
      return conflict();
    }
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid == null) {
        throw new ShoreshException(
          'This day could not be read: ' + day.problem + '.'
        );
      }
    }
    // Same revision, so the same days: anything else wasn't built from this draft.
    if (!GeneratedChecks.sameFrame(days, request.days)) {
      throw GeneratedChecks.unreadable();
    }
    List<ScheduleGrid> grids = GeneratedChecks.check(
      program,
      days,
      request.days
    );
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Id versionId = VERSION_FIRST.containsKey(request.action)
        ? saveVersion(draft, days, VERSION_FIRST.get(request.action))
        : null;
      Database.update(
        new Schedule__c(Id = draft.Id, EngineOption__c = request.option),
        AccessLevel.USER_MODE
      );
      ScheduleDaySaves.write(draft.Id, daySaves(days, grids, true));
      return saved(draft.Id, versionId);
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    }
  }

  /** The draft as it is now, kept as a version (Auto-saved) before it is replaced. */
  private static Id saveVersion(
    Schedule__c draft,
    List<ScheduleDays.DayGrid> days,
    String name
  ) {
    Schedule__c version = new Schedule__c(
      Program__c = draft.Program__c,
      Week__c = draft.Week__c,
      Name = name,
      Status__c = VERSION,
      Origin__c = GeneratedDrafts.GENERATED,
      VersionReason__c = AUTO_SAVED,
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

  private static GeneratedWeek.Result conflict() {
    GeneratedWeek.Result result = new GeneratedWeek.Result();
    result.conflict = true;
    result.message = ScheduleDaySaves.CHANGED_SINCE;
    return result;
  }

  private static GeneratedWeek.Result saved(Id draftId, Id versionId) {
    GeneratedWeek.Result result = new GeneratedWeek.Result();
    result.scheduleId = draftId;
    result.revision = GeneratedDrafts.revisionOf(ScheduleDays.read(draftId));
    result.versionId = versionId;
    return result;
  }
}
