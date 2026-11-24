/**
 * Which saved camper each incoming record is about (docs/protocol/api.md API-2.1, 2.2):
 *
 * - With the other system's ID: only the camper with that system's name and ID (OutsideOwned's
 *   key), never by name or bunk. None has it, but one the import would match (same camper number,
 *   or same name with none) is already there: a question, since Shoresh can't tell whether they
 *   are one child (two systems, or a sheet and a system, disagreeing is a flag: API-6.1).
 * - With no ID: as the choices sheet matches (CamperKeys.of), never by querying
 *   a name. Two campers may share a name (ELECT-2.7): a name more than one camper has is a
 *   question (SAME_NAME), never a guess; a camper with another ID from the same system is
 *   another child, so two children of one name with their own IDs are both added.
 *
 * Keys are hidden fields, so they are matched in system mode inside the one season the sender was
 * already checked to see; the campers themselves are then read in user mode, by Id.
 */
public with sharing class IncomingCampers {
  public static final String DOUBT = 'A camper the import would match is already in Shoresh without this ID. A person needs to say whether they are the same child; nothing was changed.';
  public static final String SAME_NAME = 'More than one camper in this season has this name. Send their ID (camper_id) or camper number so Shoresh can tell which; nothing was changed.';
  private List<Camper__c> asSent = new List<Camper__c>();
  private Map<String, Camper__c> byOutside = new Map<String, Camper__c>();
  // The season's campers by key, oldest first: several when campers share a name (ELECT-2.7).
  private Map<String, List<Camper__c>> byKey = new Map<String, List<Camper__c>>();

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
      if (CamperKeys.ofSent(camper) != null) {
        keys.add(CamperKeys.ofSent(camper));
      }
    }
    byKey = CamperKeys.campersIn(
      seasonId,
      keys,
      new List<SObjectField>{
        Camper__c.Name,
        Camper__c.OutsideId__c,
        Camper__c.SourceSystem__c
      }
    );
    readOutside(seasonId, outsideKeys);
  }

  /**
   * The season's campers with these outside keys (hidden, matched in system mode), read in user
   * mode by Id, to tell a doubt (doubt()).
   */
  private void readOutside(Id seasonId, Set<String> outsideKeys) {
    if (outsideKeys.isEmpty()) {
      return;
    }
    Map<Id, Camper__c> hidden = new Map<Id, Camper__c>(
      [
        SELECT Id, OutsideMatch__c
        FROM Camper__c
        WHERE Season__c = :seasonId AND OutsideMatch__c IN :outsideKeys
        WITH SYSTEM_MODE
      ]
    );
    Set<Id> ids = hidden.keySet();
    for (Camper__c camper : [
      SELECT Id, Name, OutsideId__c, SourceSystem__c
      FROM Camper__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      // The hidden key stays off the record, which Undo's log may copy (ImportFields.WRITTEN).
      byOutside.put(hidden.get(camper.Id).OutsideMatch__c, camper);
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
    for (List<Camper__c> campers : byKey.values()) {
      for (Camper__c camper : campers) {
        ids.add(camper.Id);
      }
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
    List<Camper__c> found = candidates(sent);
    return found.size() == 1 ? found[0] : null;
  }

  /**
   * Whether Shoresh can't tell (API-2.2, ELECT-2.7): the record carries an ID no camper has, and
   * a camper the import would match is already there; or it carries no ID and more than one
   * camper has its name. A camper that already has another ID from the same system is another
   * child (API-2.1), never a doubt.
   */
  public Boolean doubt(Integer index) {
    Camper__c sent = asSent[index];
    String outside = OutsideOwned.outsideKey(sent);
    if (outside == null) {
      return candidates(sent).size() > 1;
    }
    return byOutside.get(outside) == null && likely(index) != null;
  }

  /** Whether the doubt is a name several campers share, sent with no ID (SAME_NAME). */
  public Boolean sharedName(Integer index) {
    return OutsideOwned.outsideKey(asSent[index]) == null && doubt(index);
  }

  /**
   * The doubt's question key: the camper it looks like, or, when that camper is only being added
   * in this batch, the name's key (no name in it).
   */
  public String doubtKey(Integer index) {
    Camper__c camper = likely(index);
    return camper.Id != null
      ? String.valueOf(camper.Id)
      : CamperKeys.ofSent(asSent[index]);
  }

  /** The problem a doubt gives its record. */
  public String doubtWords(Integer index) {
    return sharedName(index) ? SAME_NAME : DOUBT;
  }

  /** The camper the import would match, for a doubt's question (null for none). */
  public Camper__c likely(Integer index) {
    Camper__c sent = asSent[index];
    String outside = OutsideOwned.outsideKey(sent);
    for (Camper__c candidate : candidates(sent)) {
      if (outside == null || !fromSameSystem(candidate, sent)) {
        return candidate;
      }
    }
    return null;
  }

  /** Whether a saved camper already has an ID from the system this record (with one) is from. */
  private static Boolean fromSameSystem(Camper__c saved, Camper__c sent) {
    // OutsideOwned.outsideKey's parts, from fields the sender can read.
    return String.isNotBlank(saved.OutsideId__c) &&
      String.isNotBlank(saved.SourceSystem__c) &&
      saved.SourceSystem__c.normalizeSpace().toLowerCase() ==
      sent.SourceSystem__c.normalizeSpace().toLowerCase();
  }

  private List<Camper__c> candidates(Camper__c sent) {
    List<Camper__c> found = CamperKeys.ofSent(sent) == null
      ? null
      : byKey.get(CamperKeys.ofSent(sent));
    return found == null ? new List<Camper__c>() : found;
  }

  /** Remembers a camper this batch adds, so a later record of the same camper finds it. */
  public void adding(Integer index, Camper__c camper) {
    Camper__c sent = asSent[index];
    String outside = OutsideOwned.outsideKey(sent);
    if (outside != null) {
      byOutside.put(outside, camper);
    }
    if (CamperKeys.ofSent(sent) != null) {
      if (!byKey.containsKey(CamperKeys.ofSent(sent))) {
        byKey.put(CamperKeys.ofSent(sent), new List<Camper__c>());
      }
      byKey.get(CamperKeys.ofSent(sent)).add(camper);
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
