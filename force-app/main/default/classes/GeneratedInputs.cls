/**
 * Everything Generated Schedule's engine (c/shoreshEngine generateWeek, ADR 0010) needs to build
 * one program's week: the week's days (the Generated draft's, or a blank week's when there is
 * none yet: fixed and recurring activities placed, groups away that week left out), and the
 * season's records as the engine reads them. Records go to the screen as records, so their field
 * names carry the package's prefix once it has one (ADR 0009), plus other programs' use of the
 * season's places and activities that week (OtherProgramUse), and the week's published schedule
 * beside the draft, and the week as it was imported (the engine's floor). Every query runs in user mode,
 * which checks object and field access; the set-time reader behind a blank week is checked first
 * by SetTimeAccess (ADR 0008 §3).
 */
public with sharing class GeneratedInputs {
  private static final String VERSION_STATUS = 'Version';
  private static final String IMPORTED_ORIGIN = 'Imported';

  public class Inputs {
    // The program and week as the server has them (18-character Ids): the engine compares them
    // exactly, and they make its seed.
    @AuraEnabled
    public Id programId;
    @AuraEnabled
    public Id weekId;
    // The Generated draft, or null when the week has not been generated yet.
    @AuraEnabled
    public Id scheduleId;
    // What the draft's days were saved at (GeneratedDrafts.revisionOf); sent back with a save.
    // Empty when there is no draft.
    @AuraEnabled
    public String revision = '';
    // The option the draft was last built with, or null.
    @AuraEnabled
    public Integer option;
    // What the engine said about the week it last built (GeneratedEngineNotes), or null. Only
    // the screen reads it, and only to word the Why list.
    @AuraEnabled
    public String engineNotes;
    @AuraEnabled
    public List<ScheduleViews.DayView> days = new List<ScheduleViews.DayView>();
    // A blank week only: fixed or recurring activities whose slot was taken ("Rest · Bunk 3 ·
    // Monday").
    @AuraEnabled
    public List<String> notPlaced = new List<String>();
    @AuraEnabled
    public List<Group__c> groups;
    @AuraEnabled
    public List<TimeBlock__c> timeBlocks;
    @AuraEnabled
    public List<Activity__c> activities;
    @AuraEnabled
    public List<ActivityEligibility__c> eligibilities;
    @AuraEnabled
    public List<Location__c> locations;
    @AuraEnabled
    public List<FixedActivity__c> fixedActivities;
    @AuraEnabled
    public List<RecurringActivity__c> recurringActivities;
    // This week's exceptions (an activity or place closed, a group away).
    @AuraEnabled
    public List<WeekException__c> weekExceptions;
    // Other programs' groups at the season's places and activities this week (their published
    // schedule, or their fixed and recurring activities), by date and clock time (G5).
    @AuraEnabled
    public List<OtherProgramUse.Entry> otherPrograms { get; set; }
    // The week's published schedule (when, by whom, and whether the draft differs from it), or
    // null when the week has none or has not been generated yet (ADR 0010 "Publish").
    @AuraEnabled
    public SchedulePublish.PublishState published;
    // The week's days a special day replaces: the engine builds and counts nothing there
    // (WeekSpecials, ADR 0014 slice 4).
    @AuraEnabled
    public WeekSpecials.Specials specials = new WeekSpecials.Specials();
    // The week as it was imported (the newest version an import made for this program and week,
    // ImportedWeekGuard): the engine's floor (care plan step 8), never emptier than this. Null
    // when the week has no import.
    @AuraEnabled
    public ImportedWeek imported;
  }

  /** The week as it was imported: the version's name and its days. */
  public class ImportedWeek {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public List<ScheduleViews.DayView> days = new List<ScheduleViews.DayView>();
  }

  public static Inputs read(Id programId, Id weekId) {
    GeneratedSetup setup = new GeneratedSetup(programId, weekId);
    Inputs inputs = new Inputs();
    inputs.programId = setup.program.Id;
    inputs.weekId = setup.week.Id;
    // Groups away this week are left out, so the engine leaves their rows as they are (a row of a
    // group it isn't sent is kept); GeneratedClosures refuses anything new there on save.
    inputs.groups = setup.atCamp();
    inputs.timeBlocks = setup.blocks;
    inputs.weekExceptions = setup.exceptions;
    readSeason(inputs, setup.program.Season__c);
    readSetTime(inputs, setup.program.Id);
    inputs.otherPrograms = new OtherProgramUse(setup.week, setup.exceptions)
      .read(setup.program, inputs.activities);
    List<ScheduleDays.DayGrid> days;
    // The draft and the imported week in one query, and both their days in one more.
    Schedules found = new Schedules(setup);
    Schedule__c draft = found.draft;
    if (draft == null) {
      BlankWeek.Week blank = setup.blankWeek();
      days = daysOf(blank.days);
      inputs.notPlaced = blank.notPlaced;
    } else {
      days = found.daysById.get(draft.Id);
      inputs.scheduleId = draft.Id;
      inputs.revision = GeneratedDrafts.revisionOf(days);
      inputs.option = draft.EngineOption__c == null
        ? null
        : draft.EngineOption__c.intValue();
      inputs.engineNotes = draft.EngineNotes__c;
      inputs.published = SchedulePublish.stateOf(
        setup.program.Id,
        setup.week,
        days
      );
    }
    found.week = days;
    showDays(inputs, setup, found);
    inputs.specials = WeekSpecials.ofWeek(setup.week, setup.groups);
    return inputs;
  }

  /**
   * The week's days (found.week) and the imported week's (or none) as the screens show them, with what both
   * point at looked for once.
   */
  private static void showDays(
    Inputs inputs,
    GeneratedSetup setup,
    Schedules found
  ) {
    List<ScheduleDays.DayGrid> days = found.week;
    Schedule__c imported = found.imported;
    List<ScheduleDays.DayGrid> importedDays = imported == null
      ? new List<ScheduleDays.DayGrid>()
      : found.daysById.get(imported.Id);
    List<ScheduleDays.DayGrid> both = new List<ScheduleDays.DayGrid>(days);
    both.addAll(importedDays);
    Set<String> there = ScheduleRefs.stillThere(
      both,
      stillThere(setup, inputs)
    );
    inputs.days = ScheduleViews.dayViews(days, there);
    if (imported != null) {
      inputs.imported = new ImportedWeek();
      inputs.imported.name = imported.Name;
      inputs.imported.days = ScheduleViews.dayViews(importedDays, there);
    }
  }

  /**
   * What a day may point at that is known to be there, from the records just read (so most of
   * the week needs no extra query): the program's time blocks, groups, fixed and recurring
   * activities, and the season's activities. A record outside these is looked for by
   * ScheduleViews, as the Schedules page does: only a record that is gone is "deleted since".
   */
  public static Set<String> stillThere(GeneratedSetup setup, Inputs inputs) {
    List<SObject> records = new List<SObject>();
    records.addAll(setup.blocks);
    records.addAll(setup.groups);
    records.addAll(inputs.activities);
    records.addAll(inputs.fixedActivities);
    records.addAll(inputs.recurringActivities);
    Set<String> ids = new Set<String>();
    for (SObject record : records) {
      ids.add(record.Id);
    }
    return ids;
  }

  /**
   * The Generated draft as the screen shows it after a lock or a hand edit, with "deleted since"
   * worked out exactly as getInputs does (the program's setup now), so the same week always shows
   * the same notes, whichever answer it came from.
   */
  public static ScheduleViews.ScheduleView view(Schedule__c draft) {
    GeneratedSetup setup = new GeneratedSetup(draft.Program__c, draft.Week__c);
    Inputs records = new Inputs();
    records.activities = [
      SELECT Id
      FROM Activity__c
      WHERE Season__c = :setup.program.Season__c
      WITH USER_MODE
    ];
    readSetTime(records, setup.program.Id);
    return ScheduleViews.open(draft.Id, stillThere(setup, records));
  }

  /** A blank week's days, read as a saved draft's days are. */
  public static List<ScheduleDays.DayGrid> daysOf(
    List<ScheduleDaySaves.DaySave> saves
  ) {
    List<ScheduleDays.DayGrid> days = new List<ScheduleDays.DayGrid>();
    for (ScheduleDaySaves.DaySave save : saves) {
      ScheduleDays.DayGrid day = new ScheduleDays.DayGrid();
      day.day = save.day;
      day.grid = save.grid;
      days.add(day);
    }
    return days;
  }

  /**
   * The week's Generated draft (the first made, as GeneratedDrafts.find picks it) and the newest
   * version an import made (Status Version, Origin Imported; the latest created, then the highest
   * Id, so the same records always give the same one), from one query.
   */
  private with sharing class Schedules {
    Schedule__c draft;
    Schedule__c imported;
    // Both schedules' days, by schedule.
    Map<Id, List<ScheduleDays.DayGrid>> daysById;
    // The week's days to show: the draft's, or a blank week's.
    List<ScheduleDays.DayGrid> week;

    Schedules(GeneratedSetup setup) {
      for (Schedule__c schedule : [
        SELECT Id, Name, EngineOption__c, EngineNotes__c, Status__c, Origin__c
        FROM Schedule__c
        WHERE
          Program__c = :setup.program.Id
          AND Week__c = :setup.week.Id
          AND ((Status__c = :ManualDrafts.DRAFT
          AND Origin__c = :GeneratedDrafts.GENERATED)
          OR (Status__c = :VERSION_STATUS
          AND Origin__c = :IMPORTED_ORIGIN))
        WITH USER_MODE
        ORDER BY CreatedDate, Id
      ]) {
        if (schedule.Status__c == VERSION_STATUS) {
          imported = schedule;
        } else if (draft == null) {
          draft = schedule;
        }
      }
      daysById = ScheduleDays.read(scheduleIds());
    }

    Set<Id> scheduleIds() {
      Set<Id> found = new Set<Id>();
      if (draft != null) {
        found.add(draft.Id);
      }
      if (imported != null) {
        found.add(imported.Id);
      }
      return found;
    }
  }

  private static void readSeason(Inputs inputs, Id seasonId) {
    // Outdoor and Rain plan: the week editor's Rainy day switches from them (ADR 0019).
    inputs.activities = [
      SELECT
        Id,
        Name,
        Location__c,
        Length__c,
        TimesPerWeekMin__c,
        TimesPerWeekMax__c,
        NoWeeklyMax__c,
        GroupsAtOnce__c,
        NoGroupLimit__c,
        SameDivisionOnly__c,
        Priority__c,
        EarlyWeekCount__c,
        EarlyWeekByDay__c,
        SortOrder__c,
        Outdoor__c,
        RainPlan__c
      FROM Activity__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
    inputs.eligibilities = [
      SELECT Id, Activity__c, Division__c, Group__c
      FROM ActivityEligibility__c
      WHERE Activity__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Id
    ];
    inputs.locations = [
      SELECT Id, Name, GroupsThatFit__c, SortOrder__c
      FROM Location__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
  }

  private static void readSetTime(Inputs inputs, Id programId) {
    inputs.fixedActivities = [
      SELECT Id, Name, Location__c, SortOrder__c
      FROM FixedActivity__c
      WHERE Program__c = :programId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
    inputs.recurringActivities = [
      SELECT Id, Name, Location__c, SortOrder__c
      FROM RecurringActivity__c
      WHERE Program__c = :programId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
  }
}
