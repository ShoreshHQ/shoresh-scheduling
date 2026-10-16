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

  private static final Set<StatusCode> NO_ACCESS = new Set<StatusCode>{
    StatusCode.INSUFFICIENT_ACCESS_OR_READONLY,
    StatusCode.INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY
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

  /**
   * Whether this person may change the camp's own words. Camps are read-only to everyone but
   * their owner and admins (data model), and camp labels follow their camp.
   */
  @AuraEnabled
  public static Boolean canEditCampWords(Id campId) {
    List<UserRecordAccess> access = [
      SELECT RecordId, HasEditAccess
      FROM UserRecordAccess
      WHERE UserId = :UserInfo.getUserId() AND RecordId = :campId
      WITH SYSTEM_MODE
    ];
    return !access.isEmpty() &&
      access[0].HasEditAccess &&
      Schema.sObjectType.CampLabel__c.isCreateable();
  }

  @AuraEnabled
  public static SeasonSetupReader.SeasonSetup getSeasonSetup(Id seasonId) {
    SeasonSetupReader.SeasonSetup setup = SeasonSetupReader.read(seasonId);
    if (setup == null) {
      throw handled(
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
        throw handled('These screens cannot save that kind of record.');
      }
    }
    try {
      UserModeWrites.save(records);
    } catch (Exception e) {
      throw handled(e);
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
      throw handled('These screens cannot delete that kind of record.');
    }
    try {
      Database.delete(recordId, true, AccessLevel.USER_MODE);
    } catch (Exception e) {
      throw handled(e);
    }
  }

  /** Saves the camp's own words. A term with both words blank goes back to the model term. */
  @AuraEnabled
  public static void saveCampLabels(
    Id campId,
    List<CampLabels.TermLabel> labels
  ) {
    try {
      CampLabels.save(campId, labels);
    } catch (Exception e) {
      throw handled(e);
    }
  }

  /** Fills an empty season with Monday-to-Friday weeks covering its dates. */
  @AuraEnabled
  public static void addWeeksFromSeasonDates(Id seasonId) {
    try {
      SeasonWeeks.fillFromSeasonDates(seasonId);
    } catch (Exception e) {
      throw handled(e);
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
      throw handled(e);
    }
  }

  @AuraEnabled
  public static Id copySeason(Id seasonId, String newName, Date newStartDate) {
    try {
      return new SeasonCopier(seasonId, newStartDate).copy(newName);
    } catch (Exception e) {
      throw handled(e);
    }
  }

  /** The message the scheduler sees for anything that went wrong. */
  private static AuraHandledException handled(Exception e) {
    return handled(
      e instanceof DmlException ? dmlMessage((DmlException) e) : e.getMessage()
    );
  }

  private static String dmlMessage(DmlException e) {
    StatusCode code = e.getDmlType(0);
    if (code == StatusCode.DELETE_FAILED) {
      return 'This can\'t be deleted while other records still use it. Change those first. (' +
        e.getDmlMessage(0) +
        ')';
    }
    if (NO_ACCESS.contains(code)) {
      return 'You don\'t have permission to change this. Ask the person who set it up, or a Salesforce admin.';
    }
    return e.getDmlMessage(0);
  }

  private static AuraHandledException handled(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }
}
