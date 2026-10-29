/**
 * What belongs to the camp's other system (repo ADR 0024 choices 4 and 5; docs/protocol/api.md).
 *
 * - API-4.2: a camper's name and bunk come from outside and are not edited in Shoresh. Only a
 *   bringing-in (the choices sheet today, the Shoresh API later) may change them; it sets
 *   bringingIn while it saves. Anyone else, by any screen or Salesforce's own pages, is refused.
 * - API-2.1: a camper from another system carries that system's name and its own ID. Shoresh
 *   fills OutsideMatch__c (season, system, ID) so that camper is in a season once; an outside
 *   system can save by it (upsert). Shoresh's own record IDs never change.
 *
 * Its read is in system mode on purpose, like ElectiveRunTriggers: it reads only hidden keys to
 * refuse a duplicate whoever saves it, and returns no name.
 */
public with sharing class OutsideOwned {
  /** True while a bringing-in saves campers and their bunks. */
  public static Boolean bringingIn = false;

  public static final String NAME_REFUSAL = 'Names come from the camp\'s sign-up list or other system. Change it there and bring it in again.';
  // "Bunks come from ...", in the camp's own word for groups.
  private static final String GROUP_REFUSAL = ' come from the camp\'s sign-up list or other system. Change it there and bring it in again.';
  public static final String NO_SYSTEM = 'Say which system this outside ID comes from.';
  public static final String ID_TAKEN = 'Another camper in this season has this outside ID from this system.';

  public static void campersSaving(
    List<Camper__c> campers,
    Map<Id, Camper__c> before
  ) {
    refuseRenames(campers, before);
    Set<String> keys = new Set<String>();
    Set<Id> savingIds = new Set<Id>();
    for (Camper__c camper : campers) {
      camper.OutsideMatch__c = outsideKey(camper);
      if (
        String.isNotBlank(camper.OutsideId__c) && camper.OutsideMatch__c == null
      ) {
        camper.SourceSystem__c.addError(NO_SYSTEM);
      }
      if (camper.OutsideMatch__c != null) {
        keys.add(camper.OutsideMatch__c);
      }
      if (camper.Id != null) {
        savingIds.add(camper.Id);
      }
    }
    if (!keys.isEmpty()) {
      refuseTakenKeys(campers, keys, savingIds);
    }
  }

  /** An outside key another camper already has, or that two in this save share, is refused. */
  private static void refuseTakenKeys(
    List<Camper__c> campers,
    Set<String> keys,
    Set<Id> savingIds
  ) {
    Set<String> taken = new Set<String>();
    for (Camper__c existing : [
      SELECT OutsideMatch__c
      FROM Camper__c
      WHERE OutsideMatch__c IN :keys AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      taken.add(existing.OutsideMatch__c);
    }
    for (Camper__c camper : campers) {
      if (
        camper.OutsideMatch__c != null && !taken.add(camper.OutsideMatch__c)
      ) {
        camper.OutsideId__c.addError(ID_TAKEN);
      }
    }
  }

  private static void refuseRenames(
    List<Camper__c> campers,
    Map<Id, Camper__c> before
  ) {
    if (before == null || bringingIn) {
      return;
    }
    for (Camper__c camper : campers) {
      if (!camper.Name.equals(before.get(camper.Id).Name)) {
        camper.Name.addError(NAME_REFUSAL);
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
    List<Preference__c> moved = new List<Preference__c>();
    for (Preference__c row : rows) {
      if (row.Group__c != before.get(row.Id).Group__c) {
        moved.add(row);
      }
    }
    if (moved.isEmpty()) {
      return;
    }
    Map<Id, CampLabels> labels = labelsByRun(moved);
    for (Preference__c row : moved) {
      CampLabels words = labels.get(row.ElectiveRun__c);
      row.Group__c.addError(
        groupRefusal(words == null ? CampLabels.modelTermsOnly() : words)
      );
    }
  }

  /**
   * Each run's camp words. Only which camp is read, to say the camp's own word, whoever saves
   * (like the keys above).
   */
  private static Map<Id, CampLabels> labelsByRun(List<Preference__c> rows) {
    Set<Id> runIds = new Set<Id>();
    for (Preference__c row : rows) {
      runIds.add(row.ElectiveRun__c);
    }
    Map<Id, Id> campOf = new Map<Id, Id>();
    for (ElectiveRun__c run : [
      SELECT Id, Season__r.Camp__c
      FROM ElectiveRun__c
      WHERE Id IN :runIds
      WITH SYSTEM_MODE
    ]) {
      campOf.put(run.Id, run.Season__r.Camp__c);
    }
    Map<Id, CampLabels> byCamp = CampLabels.forCamps(
      new Set<Id>(campOf.values())
    );
    Map<Id, CampLabels> result = new Map<Id, CampLabels>();
    for (Id runId : campOf.keySet()) {
      result.put(runId, byCamp.get(campOf.get(runId)));
    }
    return result;
  }

  /** "Bunks come from the camp's sign-up list or other system...", in the camp's word. */
  public static String groupRefusal(CampLabels labels) {
    return labels.plural('Group') + GROUP_REFUSAL;
  }
}
