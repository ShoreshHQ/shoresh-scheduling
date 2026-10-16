/**
 * "Copy last season": makes a new season with new dates and new records for everything set up
 * in it (structure, locations, activities, who can do them, week exceptions), each linked to its original by CopiedFrom__c (decision: setup belongs to a season).
 * The original season and everything in it is only read, never written.
 *
 * Dates move by the number of days between the old and new start dates, so each week keeps its
 * length and position. If that shift is not a whole number of weeks, weeks land on different
 * weekdays; the preview says so rather than adjusting anything silently.
 */
public with sharing class SeasonCopier {
  private final Season__c source;
  private final Integer shiftDays;
  private final CampLabels labels;

  public SeasonCopier(Id sourceSeasonId, Date newStartDate) {
    List<Season__c> found = new List<Season__c>();
    if (Schema.sObjectType.Season__c.isAccessible()) {
      found = [
        SELECT Id, Name, Camp__c, StartDate__c, EndDate__c
        FROM Season__c
        WHERE Id = :sourceSeasonId
        WITH USER_MODE
      ];
    }
    if (found.isEmpty()) {
      throw new CopyException(
        'That ' +
          CampLabels.modelTermsOnly().singularInSentence('Season') +
          ' was not found, or you do not have access to it.'
      );
    }
    source = found[0];
    labels = CampLabels.forCamp(source.Camp__c);
    if (newStartDate == null) {
      throw new CopyException(
        'Choose a start date for the new ' +
          labels.singularInSentence('Season') +
          '.'
      );
    }
    shiftDays = source.StartDate__c.daysBetween(newStartDate);
  }

  public Preview preview() {
    Preview result = new Preview();
    result.startDate = source.StartDate__c.addDays(shiftDays);
    result.endDate = source.EndDate__c.addDays(shiftDays);
    result.oldWeekday = WeekCalendar.weekdayName(source.StartDate__c);
    result.newWeekday = WeekCalendar.weekdayName(result.startDate);
    result.weekdaysChange = Math.mod(shiftDays, 7) != 0;
    result.weeks = new List<PreviewWeek>();
    for (Week__c week : sourceWeeks()) {
      PreviewWeek row = new PreviewWeek();
      row.name = week.Name;
      row.oldStartDate = week.StartDate__c;
      row.oldEndDate = week.EndDate__c;
      row.startDate = week.StartDate__c.addDays(shiftDays);
      row.endDate = week.EndDate__c.addDays(shiftDays);
      result.weeks.add(row);
    }
    return result;
  }

  /** Creates the copy and returns the new season's Id. All of it is saved, or none of it. */
  public Id copy(String newName) {
    if (String.isBlank(newName)) {
      throw new CopyException(
        'Give the new ' + labels.singularInSentence('Season') + ' a name.'
      );
    }
    Savepoint beforeCopy = Database.setSavepoint();
    try {
      Season__c season = new Season__c(
        Name = newName.trim(),
        Camp__c = source.Camp__c,
        StartDate__c = source.StartDate__c.addDays(shiftDays),
        EndDate__c = source.EndDate__c.addDays(shiftDays),
        Status__c = 'Planning',
        CopiedFrom__c = source.Id
      );
      Database.insert(season, AccessLevel.USER_MODE);

      Map<Id, Week__c> weekCopies = copyWeeks(season.Id);
      Map<Id, Program__c> programCopies = copyPrograms(season.Id);
      copyTimeBlocks(programCopies);
      Map<Id, Division__c> divisionCopies = copyDivisions(programCopies);
      Map<Id, Group__c> groupCopies = copyGroups(divisionCopies);
      // Ids are unique across objects, so one map holds every original => copy.
      Map<Id, Id> copies = copyIds(groupCopies);
      copies.putAll(copyIds(divisionCopies));
      copies.putAll(new SetupCopier(source.Id, season.Id).copy(copies));
      copyWeekExceptions(weekCopies, copies);
      return season.Id;
    } catch (Exception e) {
      Database.rollback(beforeCopy);
      throw e;
    }
  }

  private List<Week__c> sourceWeeks() {
    return [
      SELECT Id, Name, StartDate__c, EndDate__c, SortOrder__c
      FROM Week__c
      WHERE Season__c = :source.Id
      WITH USER_MODE
      ORDER BY StartDate__c, SortOrder__c
    ];
  }

  private Map<Id, Week__c> copyWeeks(Id seasonId) {
    Map<Id, Week__c> copies = new Map<Id, Week__c>();
    for (Week__c week : sourceWeeks()) {
      copies.put(
        week.Id,
        new Week__c(
          Season__c = seasonId,
          Name = week.Name,
          StartDate__c = week.StartDate__c.addDays(shiftDays),
          EndDate__c = week.EndDate__c.addDays(shiftDays),
          SortOrder__c = week.SortOrder__c
        )
      );
    }
    Database.insert(copies.values(), AccessLevel.USER_MODE);
    return copies;
  }

  private Map<Id, Program__c> copyPrograms(Id seasonId) {
    Map<Id, Program__c> copies = new Map<Id, Program__c>();
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
      WHERE Season__c = :source.Id
      WITH USER_MODE
    ]) {
      Program__c copy = program.clone(false, true, false, false);
      copy.Season__c = seasonId;
      copy.CopiedFrom__c = program.Id;
      copies.put(program.Id, copy);
    }
    Database.insert(copies.values(), AccessLevel.USER_MODE);
    return copies;
  }

  private void copyTimeBlocks(Map<Id, Program__c> programCopies) {
    List<TimeBlock__c> copies = new List<TimeBlock__c>();
    for (TimeBlock__c block : [
      SELECT
        Id,
        Name,
        Program__c,
        StartTime__c,
        EndTime__c,
        PartOfDay__c,
        EventsOnly__c,
        SortOrder__c
      FROM TimeBlock__c
      WHERE Program__c IN :programCopies.keySet()
      WITH USER_MODE
    ]) {
      TimeBlock__c copy = block.clone(false, true, false, false);
      copy.Program__c = programCopies.get(block.Program__c).Id;
      copy.CopiedFrom__c = block.Id;
      copies.add(copy);
    }
    Database.insert(copies, AccessLevel.USER_MODE);
  }

  private Map<Id, Division__c> copyDivisions(
    Map<Id, Program__c> programCopies
  ) {
    Map<Id, Division__c> copies = new Map<Id, Division__c>();
    for (Division__c division : [
      SELECT Id, Name, Program__c, SortOrder__c
      FROM Division__c
      WHERE Program__c IN :programCopies.keySet()
      WITH USER_MODE
    ]) {
      Division__c copy = division.clone(false, true, false, false);
      copy.Program__c = programCopies.get(division.Program__c).Id;
      copy.CopiedFrom__c = division.Id;
      copies.put(division.Id, copy);
    }
    Database.insert(copies.values(), AccessLevel.USER_MODE);
    return copies;
  }

  private Map<Id, Group__c> copyGroups(Map<Id, Division__c> divisionCopies) {
    Map<Id, Group__c> copies = new Map<Id, Group__c>();
    for (Group__c grp : [
      SELECT Id, Name, Division__c, Availability__c, SortOrder__c
      FROM Group__c
      WHERE Division__c IN :divisionCopies.keySet()
      WITH USER_MODE
    ]) {
      Group__c copy = grp.clone(false, true, false, false);
      copy.Division__c = divisionCopies.get(grp.Division__c).Id;
      copy.CopiedFrom__c = grp.Id;
      copies.put(grp.Id, copy);
    }
    Database.insert(copies.values(), AccessLevel.USER_MODE);
    return copies;
  }

  /** Each exception moves to the copied week with the same position and the copied target. */
  private void copyWeekExceptions(
    Map<Id, Week__c> weekCopies,
    Map<Id, Id> targetCopies
  ) {
    List<WeekException__c> copies = new List<WeekException__c>();
    for (WeekException__c row : [
      SELECT Id, Week__c, Group__c, Activity__c, Location__c
      FROM WeekException__c
      WHERE Week__c IN :weekCopies.keySet()
      WITH USER_MODE
    ]) {
      copies.add(
        new WeekException__c(
          Week__c = weekCopies.get(row.Week__c).Id,
          Group__c = copyOf(targetCopies, row.Group__c),
          Activity__c = copyOf(targetCopies, row.Activity__c),
          Location__c = copyOf(targetCopies, row.Location__c)
        )
      );
    }
    Database.insert(copies, AccessLevel.USER_MODE);
  }

  private static Id copyOf(Map<Id, Id> copies, Id sourceId) {
    return sourceId == null ? null : copies.get(sourceId);
  }

  /** Original Id => its copy's Id. */
  private static Map<Id, Id> copyIds(Map<Id, SObject> copies) {
    Map<Id, Id> result = new Map<Id, Id>();
    for (Id sourceId : copies.keySet()) {
      result.put(sourceId, copies.get(sourceId).Id);
    }
    return result;
  }

  public class Preview {
    @AuraEnabled
    public Date startDate;
    @AuraEnabled
    public Date endDate;
    @AuraEnabled
    public String oldWeekday;
    @AuraEnabled
    public String newWeekday;
    @AuraEnabled
    public Boolean weekdaysChange;
    @AuraEnabled
    public List<PreviewWeek> weeks;
  }

  public class PreviewWeek {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Date oldStartDate;
    @AuraEnabled
    public Date oldEndDate;
    @AuraEnabled
    public Date startDate;
    @AuraEnabled
    public Date endDate;
  }

  public class CopyException extends ShoreshException {
  }
}
