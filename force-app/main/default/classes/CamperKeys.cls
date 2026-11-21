/**
 * A camper's hidden keys (repo ADR 0018 point 5, ELECT-2.7). A camper number is a camper once in
 * a season: its key (Key__c) is unique, and a second camper with the number is refused. A name is
 * not (Greg 2026-11-21): two children may share one, so a number-less camper's name key
 * (NameKey__c) only lets imports find them without reading names. Filled by the camper trigger
 * (ElectiveRunTriggers.campersSaving). No message names a camper.
 *
 * Its reads are in system mode on purpose (repo ADR 0018 choice 60): the keys are hidden (no one
 * is granted them; this class fills them), the duplicate check must see every camper whoever
 * saves, and the import lookup is inside a season the caller already checked. Only keys and Ids
 * come back; the class is with sharing.
 */
public with sharing class CamperKeys {
  /**
   * Season and camper number; with no number, season and a SHA-256 of the name (spacing and
   * capitals aside), so the name is not stored twice.
   */
  public static String of(Camper__c camper) {
    if (String.isNotBlank(camper.CamperNumber__c)) {
      return camper.Season__c +
        '|#|' +
        camper.CamperNumber__c.deleteWhitespace().toLowerCase();
    }
    String name = camper.Name == null
      ? ''
      : camper.Name.normalizeSpace().toLowerCase();
    return camper.Season__c +
      '|n|' +
      EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf(name))
      );
  }

  /** Fills each camper's keys and refuses a number another camper in the season has. */
  public static void fill(List<Camper__c> campers) {
    // A delete (no new rows) is only checked for an archived season (ArchivedSeasons).
    if (campers == null) {
      return;
    }
    Set<String> keys = new Set<String>();
    Set<Id> savingIds = new Set<Id>();
    for (Camper__c camper : campers) {
      String key = of(camper);
      Boolean numbered = String.isNotBlank(camper.CamperNumber__c);
      camper.Key__c = numbered ? key : null;
      camper.NameKey__c = numbered ? null : key;
      if (numbered) {
        keys.add(key);
      }
      if (camper.Id != null) {
        savingIds.add(camper.Id);
      }
    }
    if (!keys.isEmpty()) {
      refuseTakenNumbers(campers, taken(keys, savingIds));
    }
  }

  private static Set<String> taken(Set<String> keys, Set<Id> savingIds) {
    Set<String> result = new Set<String>();
    for (Camper__c existing : [
      SELECT Key__c
      FROM Camper__c
      WHERE Key__c IN :keys AND Id NOT IN :savingIds
      WITH SYSTEM_MODE
    ]) {
      result.add(existing.Key__c);
    }
    return result;
  }

  /** "Another camper in this season has this number.", in the camp's words. */
  private static void refuseTakenNumbers(
    List<Camper__c> campers,
    Set<String> taken
  ) {
    Set<Id> seasonIds = new Set<Id>();
    for (Camper__c camper : campers) {
      seasonIds.add(camper.Season__c);
    }
    SetupSeasons.LazyLabels labelsBySeason = SetupSeasons.labelsWhenNeeded(
      seasonIds
    );
    for (Camper__c camper : campers) {
      if (camper.Key__c == null || taken.add(camper.Key__c)) {
        continue;
      }
      CampLabels labels = labelsBySeason.get(camper.Season__c);
      camper.CamperNumber__c.addError(
        'Another ' +
          labels.singularInSentence('Camper') +
          ' in this ' +
          labels.singularInSentence('Season') +
          ' has this number.'
      );
    }
  }

  /**
   * The season's campers with each of these keys, in the order they were added (one key may
   * have several: a name two campers share). A camper saved before ELECT-2.7 may hold its name
   * key in Key__c, so both are read. Only Ids come back.
   */
  public static Map<String, List<Id>> savedIn(Id seasonId, Set<String> keys) {
    Map<String, List<Id>> result = new Map<String, List<Id>>();
    for (Camper__c saved : [
      SELECT Id, Key__c, NameKey__c
      FROM Camper__c
      WHERE Season__c = :seasonId AND (Key__c IN :keys OR NameKey__c IN :keys)
      WITH SYSTEM_MODE
      ORDER BY CreatedDate, Id
    ]) {
      String key = saved.NameKey__c != null ? saved.NameKey__c : saved.Key__c;
      if (!result.containsKey(key)) {
        result.put(key, new List<Id>());
      }
      result.get(key).add(saved.Id);
    }
    return result;
  }

  /** Every Id savedIn found. */
  public static Set<Id> idsIn(Map<String, List<Id>> idsByKey) {
    Set<Id> result = new Set<Id>();
    for (List<Id> ids : idsByKey.values()) {
      result.addAll(ids);
    }
    return result;
  }

  /** savedIn's campers by key, in its order, keeping only those read (those the user sees). */
  public static Map<String, List<Camper__c>> inOrder(
    Map<String, List<Id>> idsByKey,
    Map<Id, Camper__c> read
  ) {
    Map<String, List<Camper__c>> result = new Map<String, List<Camper__c>>();
    for (String key : idsByKey.keySet()) {
      List<Camper__c> found = new List<Camper__c>();
      for (Id camperId : idsByKey.get(key)) {
        if (read.containsKey(camperId)) {
          found.add(read.get(camperId));
        }
      }
      result.put(key, found);
    }
    return result;
  }

  /**
   * An incoming record's key (of), or null when it names neither a name nor a number
   * (IncomingCampers).
   */
  public static String ofSent(Camper__c sent) {
    return sent.Name == null && sent.CamperNumber__c == null ? null : of(sent);
  }

  /** Whether a saved camper already has an ID from the system this record is from. */
  public static Boolean fromSameSystem(Camper__c saved, Camper__c sent) {
    // OutsideOwned.outsideKey with the ID left off: season|system|.
    String systemPrefix = OutsideOwned.outsideKey(
        new Camper__c(
          Season__c = sent.Season__c,
          SourceSystem__c = sent.SourceSystem__c,
          OutsideId__c = '-'
        )
      )
      .removeEnd('-');
    return saved.OutsideMatch__c != null &&
      saved.OutsideMatch__c.startsWith(systemPrefix);
  }

  /** A choices sheet's camper as a camper of the season (name and number, trimmed), to key. */
  public static Camper__c ofSheet(
    Id seasonId,
    ChoicesImport.SheetCamper sheetCamper
  ) {
    return new Camper__c(
      Season__c = seasonId,
      Name = sheetCamper.name == null ? null : sheetCamper.name.trim(),
      CamperNumber__c = String.isBlank(sheetCamper.camperNumber)
        ? null
        : sheetCamper.camperNumber.trim()
    );
  }
}
