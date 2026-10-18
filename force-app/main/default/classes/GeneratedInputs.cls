/**
 * Everything Generated Schedule's engine (c/shoreshEngine generateWeek, ADR 0010) needs to build
 * one program's week: the week's days (the Generated draft's, or a blank week's when there is
 * none yet: fixed and recurring activities placed, groups away that week left out), and the
 * season's records as the engine reads them. Records go to the screen as records, so their field
 * names carry the package's prefix once it has one (ADR 0009). Every query runs in user mode,
 * which checks object and field access; the set-time reader behind a blank week is checked first
 * by SetTimeAccess (ADR 0008 §3).
 */
public with sharing class GeneratedInputs {
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
  }

  public static Inputs read(Id programId, Id weekId) {
    Program__c program = ProgramReads.programOf(programId);
    Week__c week = ProgramReads.weekOf(weekId, program);
    Inputs inputs = new Inputs();
    inputs.programId = program.Id;
    inputs.weekId = week.Id;
    Schedule__c draft = GeneratedDrafts.find(programId, weekId);
    if (draft == null) {
      BlankWeek.Week blank = BlankWeek.build(programId, weekId);
      inputs.days = ScheduleViews.dayViews(daysOf(blank.days));
      inputs.notPlaced = blank.notPlaced;
    } else {
      List<ScheduleDays.DayGrid> days = ScheduleDays.read(draft.Id);
      inputs.scheduleId = draft.Id;
      inputs.revision = GeneratedDrafts.revisionOf(days);
      inputs.option = draft.EngineOption__c == null
        ? null
        : draft.EngineOption__c.intValue();
      inputs.days = ScheduleViews.dayViews(days);
    }
    // Groups away this week are left out, so the engine leaves their rows as they are (a row of a
    // group it isn't sent is kept); GeneratedClosures refuses anything new there on save.
    inputs.groups = ProgramReads.groupsAtCamp(programId, week.Id);
    inputs.timeBlocks = ProgramReads.blocksOf(programId);
    readSeason(inputs, program.Season__c);
    readSetTime(inputs, programId, week.Id);
    return inputs;
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

  private static void readSeason(Inputs inputs, Id seasonId) {
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
        SortOrder__c
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

  private static void readSetTime(Inputs inputs, Id programId, Id weekId) {
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
    inputs.weekExceptions = [
      SELECT Id, Week__c, Activity__c, Location__c, Group__c
      FROM WeekException__c
      WHERE Week__c = :weekId
      WITH USER_MODE
      ORDER BY Id
    ];
  }
}
