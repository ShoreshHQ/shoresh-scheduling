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
    List<List<SObject>> lists = new List<List<SObject>>{
      [SELECT Id FROM Program__c WHERE Season__c = :seasonId WITH USER_MODE],
      [
        SELECT Id
        FROM TimeBlock__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ],
      [
        SELECT Id
        FROM Division__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ],
      [
        SELECT Id
        FROM Group__c
        WHERE Division__r.Program__r.Season__c = :seasonId
        WITH USER_MODE
      ],
      [SELECT Id FROM Location__c WHERE Season__c = :seasonId WITH USER_MODE],
      [SELECT Id FROM Activity__c WHERE Season__c = :seasonId WITH USER_MODE],
      [
        SELECT Id
        FROM FixedActivity__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ],
      [
        SELECT Id
        FROM RecurringActivity__c
        WHERE Program__r.Season__c = :seasonId
        WITH USER_MODE
      ]
    };
    for (List<SObject> records : lists) {
      for (SObject record : records) {
        inSeason.add(record.Id);
      }
    }
  }

  public void put(String key, Id recordId) {
    saved.put(key, recordId);
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
