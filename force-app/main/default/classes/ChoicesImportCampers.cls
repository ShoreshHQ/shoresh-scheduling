/**
 * A choices sheet's campers (ChoicesImport; repo ADR 0017 choices 14 and 15). Each is found by
 * its key (ElectiveRunTriggers.camperKey: the camper number, else a hash of the name), never by
 * querying a name; new ones are made. A known camper keeps Shoresh's name and gains the sheet's
 * comment when it says something new (decision 48.3). No refusal names a camper. In user mode.
 */
public with sharing class ChoicesImportCampers {
  private ChoicesImport.Request request;
  // The key of each request camper, in order, and the saved camper by key.
  private List<String> keys = new List<String>();
  private Map<String, Camper__c> byKey = new Map<String, Camper__c>();

  public ChoicesImportCampers(ChoicesImport.Request given) {
    request = given;
    readKeys();
    // The key is hidden (no one is granted it; triggers fill it), so it is matched in system
    // mode, inside the season the scheduler was already checked to see (ChoicesImportPlace).
    // The campers themselves are then read in user mode, by Id.
    Map<Id, String> keyOf = new Map<Id, String>();
    for (Camper__c match : [
      SELECT Id, Key__c
      FROM Camper__c
      WHERE Key__c IN :keys AND Season__c = :request.seasonId
      WITH SYSTEM_MODE
    ]) {
      keyOf.put(match.Id, match.Key__c);
    }
    Set<Id> matched = keyOf.keySet();
    for (Camper__c saved : [
      SELECT Id, Name, ParentComments__c
      FROM Camper__c
      WHERE Id IN :matched
      WITH USER_MODE
    ]) {
      byKey.put(keyOf.get(saved.Id), saved);
    }
  }

  /** Each request camper's key; two rows with one key (a number written two ways) are refused. */
  private void readKeys() {
    Map<String, Integer> firstRow = new Map<String, Integer>();
    for (ChoicesImport.SheetCamper sheetCamper : request.campers) {
      String key = ElectiveRunTriggers.camperKey(asCamper(sheetCamper));
      if (firstRow.containsKey(key)) {
        throw new ShoreshException(
          'Rows ' +
            firstRow.get(key) +
            ' and ' +
            sheetCamper.row +
            ' are one camper written two ways. Write them one way in the sheet, then choose it again.'
        );
      }
      firstRow.put(key, sheetCamper.row);
      keys.add(key);
    }
  }

  /** The saved camper for the request's camper at this position, or null. */
  public Camper__c at(Integer index) {
    return byKey.get(keys[index]);
  }

  private Camper__c asCamper(ChoicesImport.SheetCamper sheetCamper) {
    return new Camper__c(
      Season__c = request.seasonId,
      Name = sheetCamper.name == null ? null : sheetCamper.name.trim(),
      CamperNumber__c = String.isBlank(sheetCamper.camperNumber)
        ? null
        : sheetCamper.camperNumber.trim()
    );
  }

  /** Makes the new campers and adds new comments to known ones. Returns how many were known. */
  public Integer save() {
    List<Camper__c> made = new List<Camper__c>();
    List<ChoicesImport.SheetCamper> madeFrom = new List<ChoicesImport.SheetCamper>();
    List<Camper__c> changed = new List<Camper__c>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      ChoicesImport.SheetCamper sheetCamper = request.campers[i];
      Camper__c saved = at(i);
      if (saved == null) {
        Camper__c fresh = asCamper(sheetCamper);
        fresh.ParentComments__c = commentWith(null, sheetCamper.comment);
        made.add(fresh);
        madeFrom.add(sheetCamper);
        continue;
      }
      String comments = commentWith(
        saved.ParentComments__c,
        sheetCamper.comment
      );
      if (comments != saved.ParentComments__c) {
        changed.add(new Camper__c(Id = saved.Id, ParentComments__c = comments));
      }
    }
    insertAll(made, madeFrom);
    Database.update(changed, AccessLevel.USER_MODE);
    return request.campers.size() - made.size();
  }

  /** New campers, all or none; a refusal gives the sheet's row, never the name. */
  private void insertAll(
    List<Camper__c> made,
    List<ChoicesImport.SheetCamper> madeFrom
  ) {
    List<Database.SaveResult> results = Database.insert(
      made,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < results.size(); i++) {
      if (!results[i].isSuccess()) {
        throw new ShoreshException(
          ChoicesImport.rowWords(madeFrom[i]) +
          ScreenErrors.messageOf(results[i].getErrors()[0])
        );
      }
    }
    // The trigger's key is not handed back to this list, so it is worked out the same way.
    for (Camper__c camper : made) {
      byKey.put(ElectiveRunTriggers.camperKey(camper), camper);
    }
  }

  /**
   * The saved comment with the sheet's added: a blank never erases, the same words are not
   * added twice, and new words go on a line of their own after what was there.
   */
  public static String commentWith(String saved, String sheet) {
    String given = sheet == null ? '' : sheet.trim();
    if (given == '') {
      return saved;
    }
    if (String.isBlank(saved)) {
      return given.left(32768);
    }
    if (saved.contains(given)) {
      return saved;
    }
    return (saved + '\n' + given).left(32768);
  }
}
