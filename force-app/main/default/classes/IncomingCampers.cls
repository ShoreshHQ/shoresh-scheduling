/**
 * Which saved camper each incoming record is about (docs/protocol/api.md API-2.1, 2.2):
 *
 * - With the other system's ID: only the camper with that system's name and ID (OutsideOwned's
 *   key), never by name or bunk. None has it, but one the import would match (same camper number,
 *   or same name with none) is already there: a question, since Shoresh can't tell whether they
 *   are one child (two systems, or a sheet and a system, disagreeing is a flag: API-6.1).
 * - With no ID: as the choices sheet matches (ElectiveRunTriggers.camperKey), never by querying
 *   a name.
 *
 * Keys are hidden fields, so they are matched in system mode inside the one season the sender was
 * already checked to see; the campers themselves are then read in user mode, by Id.
 */
public with sharing class IncomingCampers {
  public static final String DOUBT = 'A camper the import would match is already in Shoresh without this ID. A person needs to say whether they are the same child; nothing was changed.';
  private List<Camper__c> asSent = new List<Camper__c>();
  private Map<String, Camper__c> byOutside = new Map<String, Camper__c>();
  private Map<String, Camper__c> byKey = new Map<String, Camper__c>();

  /** As sent, in order: each a camper with only its system, ID, name and number (asSent). */
  public IncomingCampers(Id seasonId, List<Camper__c> sent) {
    Set<String> outsideKeys = new Set<String>();
    Set<String> keys = new Set<String>();
    for (Camper__c camper : sent) {
      camper.Season__c = seasonId;
      asSent.add(camper);
      String outside = OutsideOwned.outsideKey(camper);
      if (outside != null) {
        outsideKeys.add(outside);
      }
      if (keyOf(camper) != null) {
        keys.add(keyOf(camper));
      }
    }
    Map<Id, Camper__c> matched = new Map<Id, Camper__c>(
      [
        SELECT Id, OutsideMatch__c, Key__c
        FROM Camper__c
        WHERE
          Season__c = :seasonId
          AND (OutsideMatch__c IN :outsideKeys
          OR Key__c IN :keys)
        WITH SYSTEM_MODE
      ]
    );
    Set<Id> ids = matched.keySet();
    for (Camper__c saved : [
      SELECT Id, Name, OutsideId__c, SourceSystem__c
      FROM Camper__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      Camper__c hidden = matched.get(saved.Id);
      if (hidden.OutsideMatch__c != null) {
        byOutside.put(hidden.OutsideMatch__c, saved);
      }
      byKey.put(hidden.Key__c, saved);
    }
  }

  /** A record's camper as sent: its system, the system's ID, and its name (blanks as none). */
  public static Camper__c asSent(String sender, String outsideId, String name) {
    return new Camper__c(
      SourceSystem__c = blankAsNull(sender),
      OutsideId__c = blankAsNull(outsideId),
      Name = blankAsNull(name)
    );
  }

  private static String blankAsNull(String value) {
    return String.isBlank(value) ? null : value.trim();
  }

  /** Every saved camper some record is about. */
  public Set<Id> found() {
    Set<Id> ids = new Set<Id>();
    for (Camper__c camper : byKey.values()) {
      ids.add(camper.Id);
    }
    for (Camper__c camper : byOutside.values()) {
      ids.add(camper.Id);
    }
    return ids;
  }

  /** The record as sent, as a camper (season, system, ID, name, number). */
  public Camper__c sent(Integer index) {
    return asSent[index];
  }

  /** The saved camper record i is about, or null: none, or a doubt (see doubt()). */
  public Camper__c at(Integer index) {
    Camper__c sent = asSent[index];
    String outside = OutsideOwned.outsideKey(sent);
    if (outside != null) {
      return byOutside.get(outside);
    }
    return byKey.get(keyOf(sent));
  }

  /**
   * Whether Shoresh can't tell (API-2.2): the record carries an ID no camper has, and a camper
   * the import would match is already there.
   */
  public Boolean doubt(Integer index) {
    Camper__c sent = asSent[index];
    return OutsideOwned.outsideKey(sent) != null &&
      byOutside.get(OutsideOwned.outsideKey(sent)) == null &&
      byKey.containsKey(keyOf(sent));
  }

  /** The camper the import would match, for a doubt's question (null for none). */
  public Camper__c likely(Integer index) {
    return byKey.get(keyOf(asSent[index]));
  }

  private static String keyOf(Camper__c sent) {
    return sent.Name == null &&
      sent.CamperNumber__c == null
      ? null
      : ElectiveRunTriggers.camperKey(sent);
  }

  /** Remembers a camper this batch adds, so a later record of the same camper finds it. */
  public void adding(Integer index, Camper__c camper) {
    Camper__c sent = asSent[index];
    String outside = OutsideOwned.outsideKey(sent);
    if (outside != null) {
      byOutside.put(outside, camper);
    }
    if (keyOf(sent) != null) {
      byKey.put(keyOf(sent), camper);
    }
  }

  /** "Say who": the problem for a record naming no camper at all. */
  public static String sayWho() {
    return 'Say which camper this is: their ID in the sending system (camper_id), or their name (camper_name).';
  }

  /** The problem for a record about a camper Shoresh doesn't have yet. */
  public static String notFound() {
    return 'Shoresh has no such camper in this season. Send the camper first (camper), then this.';
  }
}
