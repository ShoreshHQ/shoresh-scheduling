/**
 * DIV-1.1 (Greg 2026-10-27): a group may be in no division. A group needs a division record (it is
 * how the group knows its program), so a group in no division is held alone in a division record
 * flagged NoDivision__c. Only the flag says so, never the name: CIT alone in division CIT is a
 * division (DIV-3.1). The screens never show a holding record as a division.
 */
public with sharing class NoDivisions {
  /**
   * Groups saved by hand with no division: a new one, or a saved one moved to "No division"
   * (its division sent empty). Each gets its own holding record first.
   */
  public static void holdNew(List<SObject> rows, Id programId) {
    if (programId == null) {
      return;
    }
    List<Group__c> groups = new List<Group__c>();
    for (SObject row : rows) {
      if (row instanceof Group__c && wantsNone((Group__c) row)) {
        groups.add((Group__c) row);
      }
    }
    hold(groups, programId);
  }

  /** A new group with no division, or a saved one whose division was sent empty. */
  private static Boolean wantsNone(Group__c grp) {
    return grp.Division__c == null &&
      (grp.Id == null || grp.isSet(Group__c.Division__c));
  }

  /** A new holding record for each group, in the program, named as the group. */
  private static void hold(List<Group__c> groups, Id programId) {
    if (groups.isEmpty()) {
      return;
    }
    List<Division__c> holders = new List<Division__c>();
    Map<Id, String> savedNames = namesOf(groups);
    for (Group__c grp : groups) {
      holders.add(
        new Division__c(
          Program__c = programId,
          Name = grp.Name != null ? grp.Name : savedNames.get(grp.Id),
          NoDivision__c = true
        )
      );
    }
    Database.insert(holders, AccessLevel.USER_MODE);
    for (Integer i = 0; i < groups.size(); i++) {
      groups[i].Division__c = holders[i].Id;
    }
  }

  private static Map<Id, String> namesOf(List<Group__c> groups) {
    Set<Id> ids = new Set<Id>();
    for (Group__c grp : groups) {
      if (grp.Id != null && grp.Name == null) {
        ids.add(grp.Id);
      }
    }
    Map<Id, String> names = new Map<Id, String>();
    if (!ids.isEmpty()) {
      for (Group__c grp : [
        SELECT Id, Name
        FROM Group__c
        WHERE Id IN :ids
        WITH USER_MODE
      ]) {
        names.put(grp.Id, grp.Name);
      }
    }
    return names;
  }

  /**
   * Undo putting groups back in holding records removed since (they went when the group moved
   * out): each gets a new holding record in its current program. rows: groups about to be
   * updated with their former Division__c.
   */
  public static void restoreHolders(List<SObject> rows) {
    Map<Id, Group__c> back = new Map<Id, Group__c>();
    for (SObject row : rows) {
      if (row instanceof Group__c && ((Group__c) row).Division__c != null) {
        back.put(((Group__c) row).Division__c, (Group__c) row);
      }
    }
    if (back.isEmpty()) {
      return;
    }
    Set<Id> removed = removedHolders(back.keySet());
    if (removed.isEmpty()) {
      return;
    }
    Map<Id, Group__c> now = new Map<Id, Group__c>(
      [
        SELECT Id, Name, Division__r.Program__c
        FROM Group__c
        WHERE Id IN :idsOf(back, removed)
        WITH USER_MODE
      ]
    );
    List<Group__c> groups = new List<Group__c>();
    List<Division__c> holders = new List<Division__c>();
    for (Id holderId : removed) {
      Group__c row = back.get(holderId);
      Group__c current = now.get(row.Id);
      groups.add(row);
      holders.add(
        new Division__c(
          Program__c = current.Division__r.Program__c,
          Name = current.Name,
          NoDivision__c = true
        )
      );
    }
    Database.insert(holders, AccessLevel.USER_MODE);
    for (Integer i = 0; i < groups.size(); i++) {
      groups[i].Division__c = holders[i].Id;
    }
  }

  /** Of these divisions, the holding records deleted since. */
  private static Set<Id> removedHolders(Set<Id> divisionIds) {
    Set<Id> removed = new Set<Id>();
    for (Division__c gone : [
      SELECT Id, NoDivision__c, IsDeleted
      FROM Division__c
      WHERE Id IN :divisionIds
      WITH SYSTEM_MODE
      ALL ROWS
    ]) {
      if (gone.IsDeleted && gone.NoDivision__c) {
        removed.add(gone.Id);
      }
    }
    return removed;
  }

  private static Set<Id> idsOf(Map<Id, Group__c> back, Set<Id> removed) {
    Set<Id> ids = new Set<Id>();
    for (Id holderId : removed) {
      ids.add(back.get(holderId).Id);
    }
    return ids;
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
