/**
 * A season's own item for SetupDeletions: an activity, location, staff member or location type,
 * by its name and camp, read in user mode; a Found with no camp for anything else or one that
 * can't be read (SetupDeletions remembers nothing for it).
 */
public with sharing class SetupDeletionSeasonItems {
  private static final Map<Schema.SObjectType, String> TERMS = new Map<Schema.SObjectType, String>{
    Activity__c.SObjectType => 'Activity',
    Location__c.SObjectType => 'Location',
    StaffMember__c.SObjectType => 'StaffMember',
    LocationType__c.SObjectType => 'LocationType'
  };
  // Each kind's link to its season.
  private static final Map<Schema.SObjectType, Schema.SObjectField> SEASON = new Map<Schema.SObjectType, Schema.SObjectField>{
    Activity__c.SObjectType => Activity__c.Season__c,
    Location__c.SObjectType => Location__c.Season__c,
    StaffMember__c.SObjectType => StaffMember__c.Season__c,
    LocationType__c.SObjectType => LocationType__c.Season__c
  };

  public static Boolean handles(Schema.SObjectType type) {
    return TERMS.containsKey(type);
  }

  public static SetupDeletionElectives.Found of(Id recordId) {
    SetupDeletionElectives.Found found = new SetupDeletionElectives.Found();
    Schema.SObjectType type = recordId.getSObjectType();
    found.kind = TERMS.get(type);
    for (SObject row : rows(recordId, type)) {
      found.name = (String) row.get('Name');
      found.campId = (Id) row.getSObject(SEASON.get(type))
        .get(Season__c.Camp__c);
    }
    return found;
  }

  private static List<SObject> rows(Id recordId, Schema.SObjectType type) {
    if (type == Activity__c.SObjectType) {
      return [
        SELECT Name, Season__r.Camp__c
        FROM Activity__c
        WHERE Id = :recordId
        WITH USER_MODE
      ];
    }
    if (type == Location__c.SObjectType) {
      return [
        SELECT Name, Season__r.Camp__c
        FROM Location__c
        WHERE Id = :recordId
        WITH USER_MODE
      ];
    }
    if (type == StaffMember__c.SObjectType) {
      return [
        SELECT Name, Season__r.Camp__c
        FROM StaffMember__c
        WHERE Id = :recordId
        WITH USER_MODE
      ];
    }
    return [
      SELECT Name, Season__r.Camp__c
      FROM LocationType__c
      WHERE Id = :recordId
      WITH USER_MODE
    ];
  }
}
