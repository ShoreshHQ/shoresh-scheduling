/**
 * Special events and special days (ADR 0014). Before save: fills the hidden key (season + name)
 * so Salesforce refuses two with the same name in a season, and keeps a special event's location
 * in its season, with messages in the camp's words. Before delete: refuses one that is still on
 * a day, naming the days; otherwise its plan goes with it.
 */
public with sharing class SpecialItemTriggerHandler {
  public static void handle(
    System.TriggerOperation operation,
    List<SObject> items,
    Map<Id, SObject> before
  ) {
    if (operation == System.TriggerOperation.BEFORE_DELETE) {
      beforeDelete(before);
    } else {
      beforeSave(items);
    }
  }

  private static void beforeSave(List<SObject> items) {
    Schema.SObjectType type = items[0].getSObjectType();
    Schema.SObjectField seasonField = seasonFieldOf(type);
    Set<Id> seasonIds = new Set<Id>();
    Set<Id> savingIds = new Set<Id>();
    for (SObject item : items) {
      item.put(keyFieldOf(type), keyOf(item, seasonField));
      seasonIds.add((Id) item.get(seasonField));
      if (item.Id != null) {
        savingIds.add(item.Id);
      }
    }
    // Friendly duplicate check; the unique key is the backstop. Items in this save are compared
    // with their new names, so swapping two names in one save is fine.
    Set<String> taken = new Set<String>();
    for (SObject existing : siblings(type, seasonIds, savingIds)) {
      taken.add(keyOf(existing, seasonField));
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    String term = termOf(type);
    for (SObject item : items) {
      if (!taken.add((String) item.get(keyFieldOf(type)))) {
        CampLabels labels = labelsBySeason.get((Id) item.get(seasonField));
        item.addError(
          'There is already a ' +
            labels.singularInSentence(term) +
            ' called "' +
            item.get('Name') +
            '" in this ' +
            labels.singularInSentence('Season') +
            '.'
        );
      }
    }
    if (type == SpecialEvent__c.SObjectType) {
      checkLocations((List<SpecialEvent__c>) items, labelsBySeason);
    }
  }

  private static List<SObject> siblings(
    Schema.SObjectType type,
    Set<Id> seasonIds,
    Set<Id> savingIds
  ) {
    if (type == SpecialEvent__c.SObjectType) {
      return [
        SELECT Id, Name, Season__c
        FROM SpecialEvent__c
        WHERE Season__c IN :seasonIds AND Id NOT IN :savingIds
        WITH SYSTEM_MODE
      ];
    }
    return [
      SELECT Id, Name, Season__c
      FROM SpecialDay__c
      WHERE Season__c IN :seasonIds AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ];
  }

  /** A special event's location must be in the event's own season. */
  private static void checkLocations(
    List<SpecialEvent__c> events,
    SetupSeasons.LazyLabels labelsBySeason
  ) {
    Set<Id> locationIds = new Set<Id>();
    for (SpecialEvent__c event : events) {
      if (event.Location__c != null) {
        locationIds.add(event.Location__c);
      }
    }
    if (locationIds.isEmpty()) {
      return;
    }
    Map<Id, Location__c> locations = new Map<Id, Location__c>(
      [
        SELECT Id, Season__c
        FROM Location__c
        WHERE Id IN :locationIds
        WITH SYSTEM_MODE
      ]
    );
    for (SpecialEvent__c event : events) {
      Location__c location = locations.get(event.Location__c);
      if (location != null && location.Season__c != event.Season__c) {
        event.Location__c.addError(
          SetupSeasons.otherSeason(
            labelsBySeason.get(event.Season__c),
            'Location',
            'SpecialEvent'
          )
        );
      }
    }
  }

  private static void beforeDelete(Map<Id, SObject> before) {
    Map<Id, String> whereById = SpecialDates.whereItemsAre(before.keySet());
    Set<Id> deletable = new Set<Id>();
    for (SObject item : before.values()) {
      String onDays = whereById.get(item.Id);
      if (onDays == null) {
        deletable.add(item.Id);
      } else {
        item.addError(onDays);
      }
    }
    if (deletable.isEmpty()) {
      return;
    }
    // System mode on purpose: a plan is part of its special day or event (the screens never
    // show it on its own), so whoever may delete the item must not be stopped by a part they
    // cannot see. Salesforce checks restrict-delete lookups after this runs.
    List<PlanPart__c> parts = [
      SELECT Id
      FROM PlanPart__c
      WHERE SpecialDay__c IN :deletable OR SpecialEvent__c IN :deletable
      WITH SYSTEM_MODE
    ];
    if (!parts.isEmpty()) {
      Database.delete(parts, true, AccessLevel.SYSTEM_MODE);
    }
  }

  /** 'SpecialEvent' or 'SpecialDay': the camp-label term for the kind of item. */
  public static String termOf(Schema.SObjectType type) {
    return type == SpecialEvent__c.SObjectType ? 'SpecialEvent' : 'SpecialDay';
  }

  private static Schema.SObjectField seasonFieldOf(Schema.SObjectType type) {
    return type == SpecialEvent__c.SObjectType
      ? SpecialEvent__c.Season__c
      : SpecialDay__c.Season__c;
  }

  private static Schema.SObjectField keyFieldOf(Schema.SObjectType type) {
    return type == SpecialEvent__c.SObjectType
      ? SpecialEvent__c.Key__c
      : SpecialDay__c.Key__c;
  }

  @TestVisible
  private static String keyOf(SObject item, Schema.SObjectField seasonField) {
    String name = (String) item.get('Name');
    return item.get(seasonField) +
      '|' +
      (name == null ? '' : name.trim().toLowerCase());
  }
}
