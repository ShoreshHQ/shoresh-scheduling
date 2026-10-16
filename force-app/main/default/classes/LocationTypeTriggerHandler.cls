/**
 * Location types: fills the hidden key (season + name) so Salesforce refuses two types with the
 * same name in a season, with a message in the camp's words.
 */
public with sharing class LocationTypeTriggerHandler {
  public static void beforeSave(List<LocationType__c> types) {
    Set<Id> seasonIds = new Set<Id>();
    Set<Id> savingIds = new Set<Id>();
    for (LocationType__c type : types) {
      type.Key__c = keyOf(type);
      seasonIds.add(type.Season__c);
      if (type.Id != null) {
        savingIds.add(type.Id);
      }
    }
    // Friendly duplicate check; the unique key is the backstop. Types in this save are compared
    // with their new names, so swapping two names in one save is fine.
    Set<String> taken = new Set<String>();
    for (LocationType__c existing : [
      SELECT Id, Name, Season__c
      FROM LocationType__c
      WHERE Season__c IN :seasonIds AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      taken.add(keyOf(existing));
    }
    Map<Id, CampLabels> labelsBySeason = SetupSeasons.labelsBySeason(seasonIds);
    for (LocationType__c type : types) {
      if (!taken.add(type.Key__c)) {
        CampLabels labels = labelsBySeason.get(type.Season__c);
        type.Name.addError(
          'There is already a ' +
            labels.singularInSentence('LocationType') +
            ' called "' +
            type.Name +
            '" in this ' +
            labels.singularInSentence('Season') +
            '.'
        );
      }
    }
  }

  @TestVisible
  private static String keyOf(LocationType__c type) {
    return type.Season__c +
      '|' +
      (type.Name == null ? '' : type.Name.trim().toLowerCase());
  }
}
