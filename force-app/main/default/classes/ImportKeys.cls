/**
 * The records an import refers to: new ones by the key the screen gave them (filled in as they
 * are saved), existing ones by Id. An Id is only accepted if it belongs to the season being
 * imported into, so an import can never reach into another season.
 */
public with sharing class ImportKeys {
  private Map<String, Id> saved = new Map<String, Id>();
  private Set<Id> inSeason = new Set<Id>();
  private String notHere;

  public ImportKeys(Id seasonId, CampLabels labels) {
    notHere =
      'The import refers to something that is not in this ' +
      labels.singularInSentence('Season') +
      '. Start it again.';
    // Four reads, each with the lists inside it (a list inside a read is not a query of its own),
    // walked in loops so a list of any length reads in parts.
    for (Season__c season : [
      SELECT
        Id,
        (SELECT Id FROM Programs__r),
        (SELECT Id FROM LocationTypes__r),
        (SELECT Id FROM Locations__r),
        (SELECT Id FROM Activities__r),
        (SELECT Id FROM Weeks__r),
        (SELECT Id FROM ElectiveSets__r),
        (SELECT Id FROM SpecialDays__r),
        (SELECT Id FROM SpecialEvents__r)
      FROM Season__c
      WHERE Id = :seasonId
      WITH USER_MODE
    ]) {
      for (SObject record : season.Programs__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : season.LocationTypes__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : season.Locations__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : season.Activities__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : season.Weeks__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : season.ElectiveSets__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : season.SpecialDays__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : season.SpecialEvents__r) {
        inSeason.add(record.Id);
      }
    }
    for (Program__c program : [
      SELECT
        Id,
        (SELECT Id FROM TimeBlocks__r),
        (SELECT Id FROM Divisions__r),
        (SELECT Id FROM FixedActivities__r),
        (SELECT Id FROM RecurringActivities__r)
      FROM Program__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (SObject record : program.TimeBlocks__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : program.Divisions__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : program.FixedActivities__r) {
        inSeason.add(record.Id);
      }
      for (SObject record : program.RecurringActivities__r) {
        inSeason.add(record.Id);
      }
    }
    for (Division__c division : [
      SELECT Id, (SELECT Id FROM Groups__r)
      FROM Division__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (SObject record : division.Groups__r) {
        inSeason.add(record.Id);
      }
    }
    for (ElectiveSet__c electiveSet : [
      SELECT Id, (SELECT Id FROM Offerings__r)
      FROM ElectiveSet__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      for (SObject record : electiveSet.Offerings__r) {
        inSeason.add(record.Id);
      }
    }
  }

  public void put(String key, Id recordId) {
    saved.put(key, recordId);
  }

  /** Whether a key names a record saved so far, or one in the season. */
  public Boolean knows(String key) {
    if (saved.containsKey(key)) {
      return true;
    }
    Id existing = asId(key);
    return existing != null && inSeason.contains(existing);
  }

  /** The record a key names, or null for none (an empty key). */
  public Id of(String key) {
    if (String.isBlank(key)) {
      return null;
    }
    if (saved.containsKey(key)) {
      return saved.get(key);
    }
    Id existing = asId(key);
    if (existing == null || !inSeason.contains(existing)) {
      throw new ShoreshException(notHere);
    }
    return existing;
  }

  /** An existing record the import changes: it must be in the season. */
  public Id existing(Id recordId) {
    if (recordId == null || !inSeason.contains(recordId)) {
      throw new ShoreshException(notHere);
    }
    return recordId;
  }

  private static Id asId(String key) {
    try {
      return (Id) key;
    } catch (Exception e) {
      return null;
    }
  }
}
