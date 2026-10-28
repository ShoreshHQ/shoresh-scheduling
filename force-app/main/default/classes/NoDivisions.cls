/**
 * DIV-1.1 (Greg 2026-10-27): a group may be in no division. A group needs a division record (it is
 * how the group knows its program), so a group in no division is held alone in a division record
 * flagged NoDivision__c. Only the flag says so, never the name: CIT alone in division CIT is a
 * division (DIV-3.1). The screens never show a holding record as a division.
 */
public with sharing class NoDivisions {
  /** New groups added by hand with no division: each gets its own holding record first. */
  public static void holdNew(List<SObject> rows, Id programId) {
    if (programId == null) {
      return;
    }
    List<Group__c> groups = new List<Group__c>();
    List<Division__c> holders = new List<Division__c>();
    for (SObject row : rows) {
      if (
        row instanceof Group__c &&
        row.Id == null &&
        ((Group__c) row).Division__c == null
      ) {
        Group__c grp = (Group__c) row;
        groups.add(grp);
        holders.add(
          new Division__c(
            Program__c = programId,
            Name = grp.Name,
            NoDivision__c = true
          )
        );
      }
    }
    if (holders.isEmpty()) {
      return;
    }
    Database.insert(holders, AccessLevel.USER_MODE);
    for (Integer i = 0; i < groups.size(); i++) {
      groups[i].Division__c = holders[i].Id;
    }
  }

  /** Holding records left with no group (it was deleted or moved out) are removed. */
  public static void removeEmpty(Set<Id> divisionIds) {
    divisionIds.remove(null);
    if (divisionIds.isEmpty()) {
      return;
    }
    List<Division__c> empty = [
      SELECT Id
      FROM Division__c
      WHERE
        Id IN :divisionIds
        AND NoDivision__c = TRUE
        AND Id NOT IN (SELECT Division__c FROM Group__c)
      WITH SYSTEM_MODE
    ];
    if (!empty.isEmpty()) {
      // Machinery: removed as the group's own change, whoever made it.
      Database.delete(empty, false, AccessLevel.SYSTEM_MODE);
    }
  }

  /** The divisions groups left: their old division, when it changed or the group is gone. */
  public static Set<Id> left(List<Group__c> groups, Map<Id, Group__c> before) {
    Map<Id, Group__c> now = new Map<Id, Group__c>(
      groups == null ? new List<Group__c>() : groups
    );
    Set<Id> ids = new Set<Id>();
    for (Group__c old : before.values()) {
      Group__c grp = now.get(old.Id);
      if (grp == null || grp.Division__c != old.Division__c) {
        ids.add(old.Division__c);
      }
    }
    return ids;
  }
}
