/**
 * The Special events screen's items for SetupDeletions (docs/protocol/special.md SPECIAL-2.7): a
 * special day, "deleted|SpecialDay||<name>", and an event, "deleted|SpecialEvent||<name>", each
 * the season's own by its kind and name, so the screen's list leaves it out with Bring back. One
 * query, in user mode.
 */
public with sharing class SetupDeletionSpecials {
  /**
   * The special day or event as remembered; one that can't be read has no camp. Anything else is
   * as SetupDeletionElectives finds it.
   */
  public static SetupDeletionElectives.Found of(Id recordId) {
    Schema.SObjectType type = recordId.getSObjectType();
    if (
      type != SpecialDay__c.SObjectType &&
      type != SpecialEvent__c.SObjectType
    ) {
      return SetupDeletionElectives.of(recordId);
    }
    SetupDeletionElectives.Found found = new SetupDeletionElectives.Found();
    if (type == SpecialDay__c.SObjectType) {
      for (SpecialDay__c row : [
        SELECT Name, Season__r.Camp__c
        FROM SpecialDay__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        found.kind = 'SpecialDay';
        found.name = row.Name;
        found.campId = row.Season__r.Camp__c;
      }
      return found;
    }
    for (SpecialEvent__c row : [
      SELECT Name, Season__r.Camp__c
      FROM SpecialEvent__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      found.kind = 'SpecialEvent';
      found.name = row.Name;
      found.campId = row.Season__r.Camp__c;
    }
    return found;
  }
}
