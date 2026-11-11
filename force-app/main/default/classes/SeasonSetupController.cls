/**
 * Server side of the camp setup screens. Every query runs in user mode and every write uses
 * user-mode DML, so Salesforce enforces the scheduler's object, field, and record access.
 */
public with sharing class SeasonSetupController {
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

  /** What deleting the record would do: why it can't, or the question to ask first (SetupDelete). */
  @AuraEnabled
  public static SetupDelete.Preview deletePreview(Id recordId) {
    try {
      return SetupDelete.preview(recordId);
    } catch (Exception e) {
      throw ScreenErrors.ofLoading(e);
    }
  }

  /** Deletes a setup record, unless something still uses it (SetupDelete). */
  @AuraEnabled
  public static void deleteRecord(Id recordId) {
    SetupDelete.remove(recordId);
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

  /** Fills an empty season with weeks covering its dates, on the days its programs run. */
  @AuraEnabled
  public static void addWeeksFromSeasonDates(Id seasonId) {
    try {
      SeasonWeeks.fillFromSeasonDates(seasonId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** A program's days changed: the weeks follow them (repo ADR 0028; WEEK-2.7). */
  @AuraEnabled
  public static SeasonWeeksFollow.Followed followProgramDays(Id seasonId) {
    try {
      return SeasonWeeksFollow.followProgramDays(seasonId);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Undo of followProgramDays: the weeks back on their dates (moved: its answer's moved). */
  @AuraEnabled
  public static void putWeeksBack(String moved) {
    try {
      SeasonWeeksFollow.putBack(
        (List<SeasonWeeksFollow.Moved>) JSON.deserialize(
          moved,
          List<SeasonWeeksFollow.Moved>.class
        )
      );
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
