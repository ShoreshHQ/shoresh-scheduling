/**
 * For ScheduleDaySaves: the days a save names (each once, within the schedule's week) and the
 * parts of those days already saved.
 */
public with sharing class ScheduleDayReads {
  /** The days a save names, each once and within the schedule's week. */
  public static Set<Date> checkedDays(
    Schedule__c schedule,
    List<DaySave> saves
  ) {
    Set<Date> days = new Set<Date>();
    for (DaySave save : saves) {
      checkDate(schedule, save.day);
      if (!days.add(save.day)) {
        throw new ShoreshException('A save named the same day twice.');
      }
    }
    return days;
  }

  public static Map<Id, Map<Date, List<ScheduleDay__c>>> existingParts(
    Set<Id> scheduleIds,
    Set<Date> days
  ) {
    Map<Id, Map<Date, List<ScheduleDay__c>>> result = new Map<Id, Map<Date, List<ScheduleDay__c>>>();
    for (ScheduleDay__c part : [
      SELECT Id, Schedule__c, Date__c, Part__c, Revision__c
      FROM ScheduleDay__c
      WHERE Schedule__c IN :scheduleIds AND Date__c IN :days
      WITH USER_MODE
      ORDER BY Schedule__c, Date__c, Part__c
    ]) {
      if (!result.containsKey(part.Schedule__c)) {
        result.put(part.Schedule__c, new Map<Date, List<ScheduleDay__c>>());
      }
      Map<Date, List<ScheduleDay__c>> byDate = result.get(part.Schedule__c);
      if (!byDate.containsKey(part.Date__c)) {
        byDate.put(part.Date__c, new List<ScheduleDay__c>());
      }
      byDate.get(part.Date__c).add(part);
    }
    return result;
  }

  private static void checkDate(Schedule__c schedule, Date day) {
    if (
      day == null ||
      day < schedule.Week__r.StartDate__c ||
      day > schedule.Week__r.EndDate__c
    ) {
      CampLabels labels = CampLabels.forCamp(
        schedule.Program__r.Season__r.Camp__c
      );
      throw new ShoreshException(
        'A day of this schedule is not in ' +
          schedule.Week__r.Name +
          ', the ' +
          labels.singularInSentence('Week') +
          ' it is for.'
      );
    }
  }
}
