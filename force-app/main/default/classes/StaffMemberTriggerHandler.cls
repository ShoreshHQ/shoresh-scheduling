/**
 * A staff member from the camp's own system carries that system's name and its own ID, as a
 * camper does (API-2.1, OutsideOwned): Shoresh fills OutsideMatch__c (season, system, ID) so the
 * same person is in a season once.
 *
 * Its read is in system mode on purpose, as OutsideOwned's: it reads only hidden keys to refuse a
 * duplicate whoever saves it, and returns no name.
 */
public with sharing class StaffMemberTriggerHandler {
  public static final String ID_TAKEN = 'Another staff member in this season has this outside ID from this system.';

  public static void beforeSave(List<StaffMember__c> staff) {
    // A delete (no new rows) is only checked for an archived season (ArchivedSeasons).
    if (staff == null) {
      return;
    }
    Set<String> keys = new Set<String>();
    Set<Id> savingIds = new Set<Id>();
    for (StaffMember__c person : staff) {
      person.OutsideMatch__c = outsideKey(person);
      if (
        String.isNotBlank(person.OutsideId__c) && person.OutsideMatch__c == null
      ) {
        person.SourceSystem__c.addError(OutsideOwned.NO_SYSTEM);
      }
      if (person.OutsideMatch__c != null) {
        keys.add(person.OutsideMatch__c);
      }
      if (person.Id != null) {
        savingIds.add(person.Id);
      }
    }
    if (!keys.isEmpty()) {
      refuseTakenKeys(staff, keys, savingIds);
    }
  }

  private static void refuseTakenKeys(
    List<StaffMember__c> staff,
    Set<String> keys,
    Set<Id> savingIds
  ) {
    Set<String> taken = new Set<String>();
    for (StaffMember__c existing : [
      SELECT OutsideMatch__c
      FROM StaffMember__c
      WHERE OutsideMatch__c IN :keys AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      taken.add(existing.OutsideMatch__c);
    }
    for (StaffMember__c person : staff) {
      if (
        person.OutsideMatch__c != null && !taken.add(person.OutsideMatch__c)
      ) {
        person.OutsideId__c.addError(ID_TAKEN);
      }
    }
  }

  /** Season, system (spacing and capitals aside) and ID as that system writes it; null without both. */
  public static String outsideKey(StaffMember__c person) {
    if (
      String.isBlank(person.OutsideId__c) ||
      String.isBlank(person.SourceSystem__c)
    ) {
      return null;
    }
    return person.Season__c +
      '|' +
      person.SourceSystem__c.normalizeSpace().toLowerCase() +
      '|' +
      person.OutsideId__c.trim();
  }
}
