/**
 * Reads everything set up in one season, shaped the way the setup screen shows it:
 * the season, its weeks, each program with its time blocks, divisions, groups, and fixed and
 * recurring activities (with who each recurring one covers), and the
 * season's location types, locations, and activities (with who can do each).
 * Runs in user mode, so the scheduler sees only what they are allowed to see.
 */
public with sharing class SeasonSetupReader {
  public static SeasonSetup read(Id seasonId) {
    List<Season__c> seasons = [
      SELECT
        Id,
        Name,
        Camp__c,
        StartDate__c,
        EndDate__c,
        Status__c,
        CopiedFrom__c,
        CopiedFrom__r.Name
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ];
    if (seasons.isEmpty()) {
      return null;
    }
    SeasonSetup result = new SeasonSetup();
    result.season = seasons[0];
    result.weeks = [
      SELECT Id, Name, StartDate__c, EndDate__c, SortOrder__c
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY StartDate__c, SortOrder__c
    ];
    result.programs = readPrograms(seasonId);
    result.locationTypes = [
      SELECT Id, Name, SortOrder__c
      FROM LocationType__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name
    ];
    result.locations = [
      SELECT Id, Name, GroupsThatFit__c, LocationType__c, Notes__c, SortOrder__c
      FROM Location__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY
        LocationType__r.SortOrder__c NULLS LAST,
        LocationType__r.Name NULLS LAST,
        SortOrder__c NULLS LAST,
        Name
    ];
    result.activities = [
      SELECT
        Id,
        Name,
        Location__c,
        Length__c,
        TimesPerWeekMin__c,
        TimesPerWeekMax__c,
        NoWeeklyMax__c,
        Priority__c,
        Outdoor__c,
        RainPlan__c,
        GroupsAtOnce__c,
        NoGroupLimit__c,
        SameDivisionOnly__c,
        EarlyWeekCount__c,
        EarlyWeekByDay__c,
        Notes__c,
        SortOrder__c,
        (SELECT Id, Division__c, Group__c FROM Eligibilities__r)
      FROM Activity__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name
    ];
    result.weekExceptions = [
      SELECT
        Id,
        Week__c,
        Group__c,
        Activity__c,
        Location__c,
        FixedActivity__c,
        RecurringActivity__c
      FROM WeekException__c
      WHERE Week__r.Season__c = :seasonId
      WITH USER_MODE
    ];
    result.labels = CampLabels.forCamp(result.season.Camp__c).all();
    return result;
  }

  private static List<ProgramSetup> readPrograms(Id seasonId) {
    Map<Id, ProgramSetup> programs = new Map<Id, ProgramSetup>();
    for (Program__c program : [
      SELECT
        Id,
        Name,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c,
        SortOrder__c
      FROM Program__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name
    ]) {
      programs.put(program.Id, new ProgramSetup(program));
    }
    for (TimeBlock__c block : [
      SELECT
        Id,
        Name,
        Program__c,
        StartTime__c,
        EndTime__c,
        PartOfDay__c,
        SortOrder__c
      FROM TimeBlock__c
      WHERE Program__c IN :programs.keySet()
      WITH USER_MODE
      ORDER BY StartTime__c, SortOrder__c, Id
    ]) {
      programs.get(block.Program__c).timeBlocks.add(block);
    }
    Map<Id, DivisionSetup> divisions = new Map<Id, DivisionSetup>();
    for (Division__c division : [
      SELECT Id, Name, Program__c, SortOrder__c
      FROM Division__c
      WHERE Program__c IN :programs.keySet()
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name
    ]) {
      DivisionSetup setup = new DivisionSetup(division);
      divisions.put(division.Id, setup);
      programs.get(division.Program__c).divisions.add(setup);
    }
    for (Group__c grp : [
      SELECT Id, Name, Division__c, Availability__c, SortOrder__c
      FROM Group__c
      WHERE Division__c IN :divisions.keySet()
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name
    ]) {
      divisions.get(grp.Division__c).groups.add(grp);
    }
    readSetTimeItems(programs);
    return programs.values();
  }

  private static void readSetTimeItems(Map<Id, ProgramSetup> programs) {
    for (FixedActivity__c item : [
      SELECT
        Id,
        Name,
        Program__c,
        TimeBlock__c,
        Length__c,
        Location__c,
        LastTimeBlock__c,
        SortOrder__c
      FROM FixedActivity__c
      WHERE Program__c IN :programs.keySet()
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name
    ]) {
      programs.get(item.Program__c).fixedActivities.add(item);
    }
    for (RecurringActivity__c item : [
      SELECT
        Id,
        Name,
        Program__c,
        TimeBlock__c,
        Length__c,
        Location__c,
        LastTimeBlock__c,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c,
        SortOrder__c,
        (SELECT Id, Division__c, Group__c FROM Coverages__r)
      FROM RecurringActivity__c
      WHERE Program__c IN :programs.keySet()
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name
    ]) {
      programs.get(item.Program__c).recurringActivities.add(item);
    }
  }

  public class SeasonSetup {
    @AuraEnabled
    public Season__c season;
    @AuraEnabled
    public List<Week__c> weeks;
    @AuraEnabled
    public List<WeekException__c> weekExceptions;
    @AuraEnabled
    public List<ProgramSetup> programs;
    @AuraEnabled
    public List<LocationType__c> locationTypes;
    @AuraEnabled
    public List<Location__c> locations;
    @AuraEnabled
    public List<Activity__c> activities;
    @AuraEnabled
    public List<CampLabels.TermLabel> labels;
  }

  public class ProgramSetup {
    @AuraEnabled
    public Program__c program;
    @AuraEnabled
    public List<TimeBlock__c> timeBlocks = new List<TimeBlock__c>();
    @AuraEnabled
    public List<DivisionSetup> divisions = new List<DivisionSetup>();
    @AuraEnabled
    public List<FixedActivity__c> fixedActivities = new List<FixedActivity__c>();
    @AuraEnabled
    public List<RecurringActivity__c> recurringActivities = new List<RecurringActivity__c>();

    public ProgramSetup(Program__c program) {
      this.program = program;
    }
  }

  public class DivisionSetup {
    @AuraEnabled
    public Division__c division;
    @AuraEnabled
    public List<Group__c> groups = new List<Group__c>();

    public DivisionSetup(Division__c division) {
      this.division = division;
    }
  }
}
