/**
 * Server side of the camp setup screens. Every query runs in user mode and every write uses
 * user-mode DML, so Salesforce enforces the scheduler's object, field, and record access.
 */
public with sharing class SeasonSetupController {
  // The only records these screens may save.
  private static final Set<Schema.SObjectType> SAVABLE_TYPES = new Set<Schema.SObjectType>{
    Camp__c.SObjectType,
    Season__c.SObjectType,
    Week__c.SObjectType,
    Program__c.SObjectType,
    Division__c.SObjectType,
    Group__c.SObjectType,
    TimeBlock__c.SObjectType
  };
  // Camps are never deleted from these screens.
  private static final Set<Schema.SObjectType> DELETABLE_TYPES = new Set<Schema.SObjectType>{
    Season__c.SObjectType,
    Week__c.SObjectType,
    Program__c.SObjectType,
    Division__c.SObjectType,
    Group__c.SObjectType,
    TimeBlock__c.SObjectType
  };

  @AuraEnabled
  public static List<Camp__c> getCamps() {
    return [
      SELECT Id, Name, TimeZone__c
      FROM Camp__c
      WITH USER_MODE
      ORDER BY Name
      LIMIT 1000
    ];
  }

  @AuraEnabled
  public static List<Season__c> getSeasons(Id campId) {
    return [
      SELECT Id, Name, StartDate__c, EndDate__c, Status__c
      FROM Season__c
      WHERE Camp__c = :campId
      WITH USER_MODE
      ORDER BY StartDate__c DESC
      LIMIT 1000
    ];
  }

  @AuraEnabled
  public static List<CampLabels.TermLabel> getLabels(Id campId) {
    return CampLabels.forCamp(campId).all();
  }

  /** Why this person cannot change the camp's own words, or null when they can. */
  @AuraEnabled
  public static String campWordsBlockedReason(Id campId) {
    return CampLabels.whyCannotEdit(campId);
  }

  @AuraEnabled
  public static SeasonSetupReader.SeasonSetup getSeasonSetup(Id seasonId) {
    SeasonSetupReader.SeasonSetup setup = SeasonSetupReader.read(seasonId);
    if (setup == null) {
      throw ScreenErrors.of(
        'That ' +
          CampLabels.modelTermsOnly().singularInSentence('Season') +
          ' was not found, or you do not have access to it.'
      );
    }
    return setup;
  }

  /** Creates new records and updates existing ones, all or none. Returns the Ids in order. */
  @AuraEnabled
  public static List<Id> saveRecords(List<SObject> records) {
    for (SObject record : records) {
      if (!SAVABLE_TYPES.contains(record.getSObjectType())) {
        throw ScreenErrors.of('These screens cannot save that kind of record.');
      }
    }
    try {
      UserModeWrites.save(records);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
    List<Id> ids = new List<Id>();
    for (SObject record : records) {
      ids.add(record.Id);
    }
    return ids;
  }

  @AuraEnabled
  public static void deleteRecord(Id recordId) {
    if (
      recordId == null || !DELETABLE_TYPES.contains(recordId.getSObjectType())
    ) {
      throw ScreenErrors.of('These screens cannot delete that kind of record.');
    }
    String inUse = WeekExceptions.blockingDelete(recordId);
    if (inUse != null) {
      throw ScreenErrors.of(inUse);
    }
    try {
      Database.delete(recordId, true, AccessLevel.USER_MODE);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Saves the camp's own words. A term with both words blank goes back to the model term. */
  @AuraEnabled
  public static void saveCampLabels(
    Id campId,
    List<CampLabels.TermLabel> labels
  ) {
    String blocked = CampLabels.whyCannotEdit(campId);
    if (blocked != null) {
      throw ScreenErrors.of(blocked);
    }
    try {
      CampLabels.save(campId, labels);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Fills an empty season with Monday-to-Friday weeks covering its dates. */
  @AuraEnabled
  public static void addWeeksFromSeasonDates(Id seasonId) {
    try {
      SeasonWeeks.fillFromSeasonDates(seasonId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  @AuraEnabled
  public static SeasonCopier.Preview previewCopy(
    Id seasonId,
    Date newStartDate
  ) {
    try {
      return new SeasonCopier(seasonId, newStartDate).preview();
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  @AuraEnabled
  public static Id copySeason(Id seasonId, String newName, Date newStartDate) {
    try {
      return new SeasonCopier(seasonId, newStartDate).copy(newName);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
