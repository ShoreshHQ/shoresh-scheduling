/**
 * Weeks: fills the hidden key (season + start date) so Salesforce refuses two weeks in a
 * season starting the same day, with a message in the camp's words; refuses deleting a week
 * with published history.
 */
public with sharing class WeekTriggerHandler {
  public static void handle(
    System.TriggerOperation operation,
    List<Week__c> weeks,
    Map<Id, Week__c> oldWeeks
  ) {
    if (operation == System.TriggerOperation.BEFORE_DELETE) {
      beforeDelete(oldWeeks);
    } else if (
      operation == System.TriggerOperation.AFTER_INSERT ||
      operation == System.TriggerOperation.AFTER_UNDELETE
    ) {
      SetTimeTriggers.weeksAdded(weeks);
    } else {
      beforeSave(weeks);
    }
  }

  public static void beforeSave(List<Week__c> weeks) {
    Set<Id> seasonIds = new Set<Id>();
    for (Week__c week : weeks) {
      week.Key__c = keyOf(week);
      seasonIds.add(week.Season__c);
    }

    // Friendly duplicate check; the unique key is the backstop. Weeks in this save are
    // compared with their new dates, so swapping two weeks' dates in one save is fine.
    Set<Id> savingIds = new Set<Id>();
    for (Week__c week : weeks) {
      if (week.Id != null) {
        savingIds.add(week.Id);
      }
    }
    Map<String, Week__c> takenByKey = new Map<String, Week__c>();
    for (Week__c existing : [
      SELECT Id, Name, Season__c, StartDate__c
      FROM Week__c
      WHERE Season__c IN :seasonIds AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      takenByKey.put(keyOf(existing), existing);
    }
    // The camp's words are read only if a week is refused.
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    for (Week__c week : weeks) {
      Week__c other = takenByKey.get(week.Key__c);
      if (other != null) {
        CampLabels labels = labelsBySeason.get(week.Season__c);
        week.StartDate__c.addError(
          '"' +
            other.Name +
            '" already starts on ' +
            week.StartDate__c.format() +
            '. Each ' +
            labels.singularInSentence('Week') +
            ' in a ' +
            labels.singularInSentence('Season') +
            ' needs its own start date.'
        );
      } else {
        takenByKey.put(week.Key__c, week);
      }
    }
  }

  public static void beforeDelete(Map<Id, Week__c> oldWeeks) {
    Set<Id> seasonIds = new Set<Id>();
    for (Week__c week : oldWeeks.values()) {
      seasonIds.add(week.Season__c);
    }
    Map<Id, Id> campIdBySeasonId = campIdBySeasonId(seasonIds);
    Map<Id, Id> campIdByWeekId = new Map<Id, Id>();
    for (Week__c week : oldWeeks.values()) {
      campIdByWeekId.put(week.Id, campIdBySeasonId.get(week.Season__c));
    }
    PublishedHistory.refuseDeletes(oldWeeks.values(), 'Week', campIdByWeekId);
  }

  @TestVisible
  private static String keyOf(Week__c week) {
    return week.Season__c + '|' + String.valueOf(week.StartDate__c);
  }

  private static Map<Id, Id> campIdBySeasonId(Set<Id> seasonIds) {
    Map<Id, Id> result = new Map<Id, Id>();
    for (Season__c season : [
      SELECT Id, Camp__c
      FROM Season__c
      WHERE Id IN :seasonIds
      WITH SYSTEM_MODE
    ]) {
      result.put(season.Id, season.Camp__c);
    }
    return result;
  }
}
