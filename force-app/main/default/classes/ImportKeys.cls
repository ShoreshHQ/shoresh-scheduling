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
    // Four reads, each with the lists inside it (a list inside a read is not a query of its own).
    List<String> onSeason = inside(
      Season__c.SObjectType,
      new List<Schema.SObjectField>{
        Program__c.Season__c,
        LocationType__c.Season__c,
        Location__c.Season__c,
        Activity__c.Season__c,
        Week__c.Season__c,
        ElectiveSet__c.Season__c,
        SpecialDay__c.Season__c,
        SpecialEvent__c.Season__c
      }
    );
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
      addInside(season, onSeason);
    }
    List<String> onProgram = inside(
      Program__c.SObjectType,
      new List<Schema.SObjectField>{
        TimeBlock__c.Program__c,
        Division__c.Program__c,
        FixedActivity__c.Program__c,
        RecurringActivity__c.Program__c
      }
    );
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
      addInside(program, onProgram);
    }
    List<String> onDivision = inside(
      Division__c.SObjectType,
      new List<Schema.SObjectField>{ Group__c.Division__c }
    );
    for (Division__c division : [
      SELECT Id, (SELECT Id FROM Groups__r)
      FROM Division__c
      WHERE Program__r.Season__c = :seasonId
      WITH USER_MODE
    ]) {
      addInside(division, onDivision);
    }
    List<String> onSet = inside(
      ElectiveSet__c.SObjectType,
      new List<Schema.SObjectField>{ Offering__c.ElectiveSet__c }
    );
    for (ElectiveSet__c electiveSet : [
      SELECT Id, (SELECT Id FROM Offerings__r)
      FROM ElectiveSet__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
    ]) {
      addInside(electiveSet, onSet);
    }
  }

  /** The relationship names, from the platform, of the lists inside a record. */
  private static List<String> inside(
    Schema.SObjectType parent,
    List<Schema.SObjectField> children
  ) {
    List<String> names = new List<String>();
    for (Schema.SObjectField child : children) {
      names.add(ShoreshSchema.childRelationship(parent, child));
    }
    return names;
  }

  /** The records in each list inside a record read, as the season's. */
  private void addInside(SObject parent, List<String> relationships) {
    for (String relationship : relationships) {
      // Walked in a loop, never held as a list: a list of any length reads in parts.
      for (SObject record : parent.getSObjects(relationship)) {
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
