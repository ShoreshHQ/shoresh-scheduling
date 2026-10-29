/**
 * What belongs to the camp's other system (repo ADR 0024 choices 4 and 5; docs/protocol/api.md).
 *
 * - API-4.2: a camper's name and bunk come from outside and are not edited in Shoresh. Only a
 *   bringing-in (the choices sheet today, the Shoresh API later) may change them; it sets
 *   bringingIn while it saves. Anyone else, by any screen or Salesforce's own pages, is refused.
 * - API-2.1: a camper from another system carries that system's name and its own ID. Shoresh
 *   fills OutsideKey__c (season, system, ID) so that camper is in a season once; an outside
 *   system can save by it (upsert). Shoresh's own record IDs never change.
 *
 * Its read is in system mode on purpose, like ElectiveRunTriggers: it reads only hidden keys to
 * refuse a duplicate whoever saves it, and returns no name.
 */
public with sharing class OutsideOwned {
  /** True while a bringing-in saves campers and their bunks. */
  public static Boolean bringingIn = false;

  public static final String NAME_REFUSAL = 'Names come from the camp\'s sign-up list or other system. Change it there and bring it in again.';
  public static final String BUNK_REFUSAL = 'Bunks come from the camp\'s sign-up list or other system. Change it there and bring it in again.';
  public static final String NO_SYSTEM = 'Say which system this outside ID comes from.';
  public static final String ID_TAKEN = 'Another camper in this season has this outside ID from this system.';

  public static void campersSaving(
    List<Camper__c> campers,
    Map<Id, Camper__c> before
  ) {
    Set<String> keys = new Set<String>();
    Set<Id> savingIds = new Set<Id>();
    for (Camper__c camper : campers) {
      if (
        before != null &&
        !bringingIn &&
        !camper.Name.equals(before.get(camper.Id).Name)
      ) {
        camper.Name.addError(NAME_REFUSAL);
      }
      camper.OutsideKey__c = outsideKey(camper);
      if (
        String.isNotBlank(camper.OutsideId__c) && camper.OutsideKey__c == null
      ) {
        camper.SourceSystem__c.addError(NO_SYSTEM);
      }
      if (camper.OutsideKey__c != null) {
        keys.add(camper.OutsideKey__c);
      }
      if (camper.Id != null) {
        savingIds.add(camper.Id);
      }
    }
    if (keys.isEmpty()) {
      return;
    }
    Set<String> taken = new Set<String>();
    for (Camper__c existing : [
      SELECT OutsideKey__c
      FROM Camper__c
      WHERE OutsideKey__c IN :keys AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      taken.add(existing.OutsideKey__c);
    }
    for (Camper__c camper : campers) {
      if (camper.OutsideKey__c != null && !taken.add(camper.OutsideKey__c)) {
        camper.OutsideId__c.addError(ID_TAKEN);
      }
    }
  }

  /**
   * Season, system (spacing and capitals aside) and ID, exactly as that system writes it (some
   * systems' IDs differ only in capitals); null without both.
   */
  public static String outsideKey(Camper__c camper) {
    if (
      String.isBlank(camper.OutsideId__c) ||
      String.isBlank(camper.SourceSystem__c)
    ) {
      return null;
    }
    return camper.Season__c +
      '|' +
      camper.SourceSystem__c.normalizeSpace().toLowerCase() +
      '|' +
      camper.OutsideId__c.trim();
  }

  public static void preferencesSaving(
    List<Preference__c> rows,
    Map<Id, Preference__c> before
  ) {
    if (before == null || bringingIn) {
      return;
    }
    for (Preference__c row : rows) {
      if (row.Group__c != before.get(row.Id).Group__c) {
        row.Group__c.addError(BUNK_REFUSAL);
      }
    }
  }
}
