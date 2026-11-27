/**
 * Who each elective set's time is for, as a fresh week places it (ELECT-7.4; repo ADR 0027): its
 * Coverage rows' divisions and groups, read once for every set ElectiveSetTimes read. No rows, or
 * a user who can't read them, means every group at camp then, as before.
 */
public with sharing class ElectiveSetWho {
  private static final List<Schema.SObjectField> FIELDS = new List<Schema.SObjectField>{
    Coverage__c.ElectiveSet__c,
    Coverage__c.Division__c,
    Coverage__c.Group__c
  };
  // The divisions and groups each set is for; a set with no rows is not here.
  private static Map<Id, Set<Id>> whoBySet = new Map<Id, Set<Id>>();

  /** Whether the user can read who sets' times are for. */
  public static Boolean readable() {
    return Schema.sObjectType.Coverage__c.isAccessible() &&
      ElectiveSetTimes.canRead(FIELDS);
  }

  /** The sets' rows, in one query; none when there is no set or the user can't read them. */
  public static void read(Set<Id> setIds) {
    if (setIds.isEmpty() || !readable()) {
      return;
    }
    // Read again, so a request that changed who reads it as it is now.
    for (Id setId : setIds) {
      whoBySet.remove(setId);
    }
    for (Coverage__c row : [
      SELECT ElectiveSet__c, Division__c, Group__c
      FROM Coverage__c
      WHERE ElectiveSet__c IN :setIds
      WITH USER_MODE
    ]) {
      if (!whoBySet.containsKey(row.ElectiveSet__c)) {
        whoBySet.put(row.ElectiveSet__c, new Set<Id>());
      }
      whoBySet.get(row.ElectiveSet__c)
        .add(row.Division__c != null ? row.Division__c : row.Group__c);
    }
  }

  /** No rows is every group; else the groups named, and those of a division named. */
  public static Boolean isFor(Id setId, Group__c grp) {
    Set<Id> who = whoBySet.get(setId);
    return who == null ||
      who.isEmpty() ||
      who.contains(grp.Id) ||
      (grp.Division__c != null && who.contains(grp.Division__c));
  }
}
