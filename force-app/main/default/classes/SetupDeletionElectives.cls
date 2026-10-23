/**
 * The Electives screen's items for SetupDeletions (plan §6.2, repo ADR 0018 choice 19): an
 * elective set, "deleted|ElectiveSet||<name>", and an offering, named by its activity within its
 * set, "deleted|Offering|<set>|<activity>". One query, in user mode.
 */
public with sharing class SetupDeletionElectives {
  public class Found {
    public String kind;
    public String scope = '';
    public String name;
    public Id campId;
  }

  public static Boolean handles(Schema.SObjectType type) {
    return type == ElectiveSet__c.SObjectType ||
      type == Offering__c.SObjectType;
  }

  /**
   * The set or offering as remembered; for anything else, or one that can't be read, a Found
   * with no camp (SetupDeletions remembers nothing for it).
   */
  public static Found of(Id recordId) {
    Found found = new Found();
    if (!handles(recordId.getSObjectType())) {
      return found;
    }
    if (recordId.getSObjectType() == ElectiveSet__c.SObjectType) {
      for (ElectiveSet__c row : [
        SELECT Name, Season__r.Camp__c
        FROM ElectiveSet__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        found.kind = 'ElectiveSet';
        found.name = row.Name;
        found.campId = row.Season__r.Camp__c;
        return found;
      }
      return found;
    }
    for (Offering__c row : [
      SELECT
        Activity__r.Name,
        ElectiveSet__r.Name,
        ElectiveSet__r.Season__r.Camp__c
      FROM Offering__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      found.kind = 'Offering';
      found.name = row.Activity__r.Name;
      found.scope = row.ElectiveSet__r.Name;
      found.campId = row.ElectiveSet__r.Season__r.Camp__c;
      return found;
    }
    return found;
  }
}
