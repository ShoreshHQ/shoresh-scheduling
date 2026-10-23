/**
 * Server side of the camp setup screens. Every query runs in user mode and every write uses
 * user-mode DML, so Salesforce enforces the scheduler's object, field, and record access.
 */
public with sharing class SeasonSetupController {
  // Camps are never deleted from these screens.
  private static final Set<Schema.SObjectType> DELETABLE_TYPES = new Set<Schema.SObjectType>{
    Season__c.SObjectType,
    Week__c.SObjectType,
    Program__c.SObjectType,
    Division__c.SObjectType,
    Group__c.SObjectType,
    TimeBlock__c.SObjectType,
    LocationType__c.SObjectType,
    Location__c.SObjectType,
    Activity__c.SObjectType,
    FixedActivity__c.SObjectType,
    RecurringActivity__c.SObjectType,
    SpecialDay__c.SObjectType,
    SpecialEvent__c.SObjectType,
    ElectiveSet__c.SObjectType,
    Offering__c.SObjectType
  };

  @AuraEnabled
  public static List<Camp__c> getCamps() {
    try {
      return [
        SELECT Id, Name, TimeZone__c
        FROM Camp__c
        WITH USER_MODE
        ORDER BY Name
        LIMIT 1000
      ];
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  @AuraEnabled
  public static List<Season__c> getSeasons(Id campId) {
    try {
      return [
        SELECT Id, Name, StartDate__c, EndDate__c, Status__c
        FROM Season__c
        WHERE Camp__c = :campId
        WITH USER_MODE
        ORDER BY StartDate__c DESC
        LIMIT 1000
      ];
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  @AuraEnabled
  public static List<CampLabels.TermLabel> getLabels(Id campId) {
    try {
      return CampLabels.forCamp(campId).all();
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Why this person cannot change the camp's own words, or null when they can. */
  @AuraEnabled
  public static String campWordsBlockedReason(Id campId) {
    return CampLabels.whyCannotEdit(campId);
  }

  @AuraEnabled
  public static SeasonSetupReader.SeasonSetup getSeasonSetup(Id seasonId) {
    return getSeasonSetupInCamp(null, seasonId);
  }

  /** The same, for a screen showing one camp: a missing season is named in that camp's words. */
  @AuraEnabled
  public static SeasonSetupReader.SeasonSetup getSeasonSetupInCamp(
    Id campId,
    Id seasonId
  ) {
    try {
      return SeasonSetupReader.readForScreen(seasonId, campId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Creates new records and updates existing ones, all or none. Returns the Ids in order. */
  @AuraEnabled
  public static List<Id> saveRecords(List<SObject> records) {
    return ScreenSaves.save(records, null, null);
  }

  @AuraEnabled
  public static void deleteRecord(Id recordId) {
    if (
      recordId == null || !DELETABLE_TYPES.contains(recordId.getSObjectType())
    ) {
      throw ScreenErrors.of('These screens can\'t delete that.');
    }
    String inUse = InUse.reason(recordId);
    if (inUse != null) {
      throw ScreenErrors.of(inUse);
    }
    // Deleting a time block can move the ones after it: fixed and recurring activities that
    // span it are checked once the delete is done, and a clash undoes it.
    SetTimeGuard.defer();
    Savepoint beforeDelete = Database.setSavepoint();
    try {
      // Remembered first, while its name can still be read: a later import leaves it out.
      SetupDeletions.remember(recordId);
      WeekExceptions.deleteWithWeeks(recordId);
      SetTimeGuard.checkPending();
    } catch (Exception e) {
      Database.rollback(beforeDelete);
      throw ScreenErrors.of(e);
    } finally {
      SetTimeGuard.resume();
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
      throw ScreenErrors.ofLoading(e);
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
