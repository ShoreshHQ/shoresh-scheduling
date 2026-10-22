/**
 * Schedules: a schedule's week must be in the same season as its program, so a version can
 * never belong to another season's week; published history is kept (PublishedGuard). A draft
 * deleted or restored takes its special events off their days or puts them back
 * (SpecialEventDays).
 */
public with sharing class ScheduleTriggerHandler {
  public static void handle(
    TriggerOperation operation,
    List<Schedule__c> news,
    Map<Id, Schedule__c> oldMap
  ) {
    if (operation == TriggerOperation.BEFORE_DELETE) {
      PublishedGuard.refuseScheduleDeletes(oldMap.values());
      SpecialEventDays.beforeRemoval(oldMap.keySet());
      return;
    }
    if (operation == TriggerOperation.AFTER_DELETE) {
      SpecialEventDays.afterRemoval();
      return;
    }
    if (operation == TriggerOperation.AFTER_UNDELETE) {
      SpecialEventDays.afterRestore(new Map<Id, Schedule__c>(news).keySet());
      return;
    }
    PublishedGuard.checkSchedules(news, oldMap);
    beforeSave(news);
  }

  public static void beforeSave(List<Schedule__c> schedules) {
    Set<Id> programIds = new Set<Id>();
    Set<Id> weekIds = new Set<Id>();
    for (Schedule__c schedule : schedules) {
      programIds.add(schedule.Program__c);
      weekIds.add(schedule.Week__c);
    }
    Map<Id, Program__c> programs = new Map<Id, Program__c>(
      [
        SELECT Id, Season__c, Season__r.Camp__c
        FROM Program__c
        WHERE Id IN :programIds
        WITH SYSTEM_MODE
      ]
    );
    Map<Id, Week__c> weeks = new Map<Id, Week__c>(
      [
        SELECT Id, Name, Season__c
        FROM Week__c
        WHERE Id IN :weekIds
        WITH SYSTEM_MODE
      ]
    );
    Set<Id> campIds = new Set<Id>();
    for (Program__c program : programs.values()) {
      campIds.add(program.Season__r.Camp__c);
    }
    Map<Id, CampLabels> labelsByCamp = CampLabels.forCamps(campIds);
    for (Schedule__c schedule : schedules) {
      Program__c program = programs.get(schedule.Program__c);
      Week__c week = weeks.get(schedule.Week__c);
      if (
        program != null &&
        week != null &&
        week.Season__c != program.Season__c
      ) {
        CampLabels labels = labelsByCamp.get(program.Season__r.Camp__c);
        schedule.Week__c.addError(
          week.Name +
            ' is in another ' +
            labels.singularInSentence('Season') +
            '. A schedule\'s ' +
            labels.singularInSentence('Week') +
            ' must be in its ' +
            labels.singularInSentence('Program') +
            '\'s ' +
            labels.singularInSentence('Season') +
            '.'
        );
      }
    }
  }
}
