/**
 * A staff member from the camp's own system carries that system's name and its own ID, as a
 * camper does (API-2.1, OutsideOwned): Shoresh fills OutsideMatch__c (season, system, ID) so the
 * same person is in a season once.
 *
 * API-4.11: that person's name is then the system's, as a camper's is (OutsideOwned, API-4.2): only
 * a bringing-in (OutsideOwned.bringingIn: an incoming batch, or Undo of one) renames them. A staff
 * member added in Camp Setup, with no outside ID, is renamed there freely.
 *
 * Its read is in system mode on purpose, as OutsideOwned's: it reads only hidden keys to refuse a
 * duplicate whoever saves it, and returns no name.
 */
public with sharing class StaffMemberTriggerHandler {
  /** "Another counselor in this season has this outside ID from this system.", in the camp's words. */
  public static String idTaken(CampLabels labels) {
    return 'Another ' +
      labels.singularInSentence('StaffMember') +
      ' in this ' +
      labels.singularInSentence('Season') +
      ' has this outside ID from this system.';
  }

  public static void beforeSave(List<StaffMember__c> staff) {
    // A delete (no new rows) is only checked for an archived season (ArchivedSeasons).
    if (staff == null) {
      return;
    }
    refuseRenames(staff);
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
    SetupSeasons.LazyLabels labels = SetupSeasons.labelsWhenNeeded(
      seasonsOf(staff)
    );
    for (StaffMember__c person : staff) {
      if (
        person.OutsideMatch__c != null && !taken.add(person.OutsideMatch__c)
      ) {
        person.OutsideId__c.addError(idTaken(labels.get(person.Season__c)));
      }
    }
  }

  /** A rename of someone who came from an outside system, outside a bringing-in, is refused. */
  private static void refuseRenames(List<StaffMember__c> staff) {
    if (OutsideOwned.bringingIn || !Trigger.isExecuting || !Trigger.isUpdate) {
      return;
    }
    for (StaffMember__c person : staff) {
      StaffMember__c before = (StaffMember__c) Trigger.oldMap.get(person.Id);
      if (
        before.OutsideMatch__c != null &&
        (person.Name == null || !person.Name.equals(before.Name))
      ) {
        person.Name.addError(nameRefusal(before.SourceSystem__c));
      }
    }
  }

  /**
   * "This name comes from CampMinder.", then the screen's advice; an AI hears the problem alone
   * (API-1.105). The refusal of a rename by hand (API-4.11).
   */
  public static String nameRefusal(String sourceSystem) {
    String fromWhere = sourceSystem.normalizeSpace();
    return AgentRefusal.withFix(
      'This name comes from ' + fromWhere + '.',
      'Change it there, and Shoresh takes the new name the next time ' +
        fromWhere +
        ' sends it.'
    );
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

  private static Set<Id> seasonsOf(List<StaffMember__c> staff) {
    Set<Id> result = new Set<Id>();
    for (StaffMember__c person : staff) {
      result.add(person.Season__c);
    }
    return result;
  }
}
