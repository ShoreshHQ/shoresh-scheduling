/**
 * A choices sheet's campers (ChoicesImport; repo ADR 0017 choices 14 and 15). Each is found by
 * its key (ElectiveRunTriggers.camperKey: the camper number, else a hash of the name), never by
 * querying a name; new ones are made. A known camper keeps Shoresh's name and gains the sheet's
 * comment when it says something new (decision 48.3). No refusal names a camper. In user mode.
 *
 * Two campers may share a name (ELECT-2.7, Greg 2026-11-21). A row is matched by name only when
 * one saved camper has it; when two or more do, or the row is one of several the director said
 * are different campers, the director says which (questions), never Shoresh.
 */
public with sharing class ChoicesImportCampers {
  private ChoicesImport.Request request;
  // The key of each request camper, in order, and the saved campers by key (oldest first).
  private List<String> keys = new List<String>();
  private Map<String, List<Camper__c>> byKey = new Map<String, List<Camper__c>>();
  // The campers save() made, by position.
  private Map<Integer, Camper__c> made = new Map<Integer, Camper__c>();

  public ChoicesImportCampers(ChoicesImport.Request given) {
    request = given;
    readKeys();
    // The keys are hidden, so they are matched in system mode inside the season the scheduler
    // was already checked to see (ChoicesImportPlace); the campers are then read in user mode.
    Map<String, List<Id>> idsByKey = ElectiveRunTriggers.savedByKey(
      request.seasonId,
      new Set<String>(keys)
    );
    Set<Id> matched = new Set<Id>();
    for (List<Id> ids : idsByKey.values()) {
      matched.addAll(ids);
    }
    Map<Id, Camper__c> saved = new Map<Id, Camper__c>(
      [
        SELECT Id, Name, ParentComments__c
        FROM Camper__c
        WHERE Id IN :matched
        WITH USER_MODE
      ]
    );
    for (String key : idsByKey.keySet()) {
      List<Camper__c> found = new List<Camper__c>();
      for (Id camperId : idsByKey.get(key)) {
        if (saved.containsKey(camperId)) {
          found.add(saved.get(camperId));
        }
      }
      byKey.put(key, found);
    }
    checkAnswers();
  }

  /**
   * Each request camper's key; two rows with one key (a number written two ways) are refused,
   * unless the director said they are different campers (apart).
   */
  private void readKeys() {
    Map<String, Integer> firstRow = new Map<String, Integer>();
    for (ChoicesImport.SheetCamper sheetCamper : request.campers) {
      String key = ElectiveRunTriggers.camperKey(asCamper(sheetCamper));
      if (firstRow.containsKey(key) && sheetCamper.apart != true) {
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

  /** A camper the director chose must be one of the row's name, and no two rows the same one. */
  private void checkAnswers() {
    Map<Id, Integer> rowOf = new Map<Id, Integer>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      ChoicesImport.SheetCamper sheetCamper = request.campers[i];
      if (sheetCamper.camperId == null || sheetCamper.newCamper == true) {
        continue;
      }
      if (chosen(i) == null) {
        throw new ShoreshException(
          ChoicesImport.rowWords(sheetCamper) +
          'the camper chosen for this row is not one of this name in the season. Check the file again.'
        );
      }
    }
    for (Integer i = 0; i < request.campers.size(); i++) {
      Camper__c camper = unsettled(i) ? null : at(i);
      if (camper == null) {
        continue;
      }
      if (rowOf.containsKey(camper.Id)) {
        throw new ShoreshException(
          'Rows ' +
            rowOf.get(camper.Id) +
            ' and ' +
            request.campers[i].row +
            ' are one camper here. Choose another for one of them.'
        );
      }
      rowOf.put(camper.Id, request.campers[i].row);
    }
  }

  /** The season's campers this row's key finds (none, one, or several of one name). */
  private List<Camper__c> candidates(Integer index) {
    List<Camper__c> found = byKey.get(keys[index]);
    return found == null ? new List<Camper__c>() : found;
  }

  /** The candidate the director chose for this row, or null. */
  private Camper__c chosen(Integer index) {
    for (Camper__c candidate : candidates(index)) {
      if (candidate.Id == request.campers[index].camperId) {
        return candidate;
      }
    }
    return null;
  }

  /** Whether the director must still say which camper this row is (ELECT-2.7). */
  public Boolean unsettled(Integer index) {
    ChoicesImport.SheetCamper sheetCamper = request.campers[index];
    if (sheetCamper.newCamper == true || sheetCamper.camperId != null) {
      return false;
    }
    Integer found = candidates(index).size();
    return found > 1 || (found == 1 && sheetCamper.apart == true);
  }

  /** The saved camper for the request's camper at this position, or null (new, or unsettled). */
  public Camper__c at(Integer index) {
    if (made.containsKey(index)) {
      return made.get(index);
    }
    ChoicesImport.SheetCamper sheetCamper = request.campers[index];
    if (sheetCamper.newCamper == true) {
      return null;
    }
    if (sheetCamper.camperId != null) {
      return chosen(index);
    }
    return unsettled(index) || candidates(index).isEmpty()
      ? null
      : candidates(index)[0];
  }

  /**
   * "Which camper is row 7?" for each unsettled row: the season's campers of its name, each with
   * their bunk (from their latest choices) so the director can tell them apart, and the order
   * they were added when that is all there is. One query, only when there is a question.
   */
  public List<ChoicesImport.Which> questions() {
    List<ChoicesImport.Which> result = new List<ChoicesImport.Which>();
    Set<Id> asked = new Set<Id>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      if (unsettled(i)) {
        for (Camper__c candidate : candidates(i)) {
          asked.add(candidate.Id);
        }
      }
    }
    if (asked.isEmpty()) {
      return result;
    }
    Map<Id, String> bunkOf = new Map<Id, String>();
    for (Preference__c had : [
      SELECT Camper__c, Group__r.Name
      FROM Preference__c
      WHERE Camper__c IN :asked AND Group__c != NULL
      WITH USER_MODE
      ORDER BY ElectiveRun__r.CreatedDate DESC, Id DESC
    ]) {
      if (!bunkOf.containsKey(had.Camper__c)) {
        bunkOf.put(had.Camper__c, had.Group__r.Name);
      }
    }
    for (Integer i = 0; i < request.campers.size(); i++) {
      if (!unsettled(i)) {
        continue;
      }
      ChoicesImport.Which which = new ChoicesImport.Which();
      which.index = i;
      which.row = request.campers[i].row;
      which.choices = picks(candidates(i), bunkOf);
      result.add(which);
    }
    return result;
  }

  /** "Ari Green, Oak"; two the same are told apart by when each was added ("added second"). */
  private static List<ChoicesImport.Pick> picks(
    List<Camper__c> found,
    Map<Id, String> bunkOf
  ) {
    Map<String, Integer> seen = new Map<String, Integer>();
    List<String> labels = new List<String>();
    for (Camper__c candidate : found) {
      String label = candidate.Name.normalizeSpace();
      if (bunkOf.containsKey(candidate.Id)) {
        label += ', ' + bunkOf.get(candidate.Id);
      }
      labels.add(label);
      seen.put(label, seen.containsKey(label) ? seen.get(label) + 1 : 1);
    }
    List<ChoicesImport.Pick> result = new List<ChoicesImport.Pick>();
    Map<String, Integer> count = new Map<String, Integer>();
    for (Integer i = 0; i < found.size(); i++) {
      String label = labels[i];
      if (seen.get(label) > 1) {
        Integer nth = count.containsKey(label) ? count.get(label) + 1 : 1;
        count.put(label, nth);
        label += ', added ' + ordinalWord(nth);
      }
      ChoicesImport.Pick pick = new ChoicesImport.Pick();
      pick.id = found[i].Id;
      pick.label = label;
      result.add(pick);
    }
    return result;
  }

  private static String ordinalWord(Integer n) {
    List<String> words = new List<String>{
      'first',
      'second',
      'third',
      'fourth',
      'fifth'
    };
    return n <= words.size() ? words[n - 1] : n + 'th';
  }

  /** Refuses the save while a row's camper is still a question (the screen asks first). */
  public void refuseUnsettled() {
    for (Integer i = 0; i < request.campers.size(); i++) {
      if (unsettled(i)) {
        throw new ShoreshException(
          ChoicesImport.rowWords(request.campers[i]) +
          'more than one camper in this season has this name. Say which this is, or a new camper.'
        );
      }
    }
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
    refuseUnsettled();
    List<Camper__c> fresh = new List<Camper__c>();
    List<Integer> freshAt = new List<Integer>();
    List<Camper__c> changed = new List<Camper__c>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      ChoicesImport.SheetCamper sheetCamper = request.campers[i];
      Camper__c saved = at(i);
      if (saved == null) {
        Camper__c camper = asCamper(sheetCamper);
        camper.ParentComments__c = commentWith(null, sheetCamper.comment);
        fresh.add(camper);
        freshAt.add(i);
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
    insertAll(fresh, freshAt);
    Database.update(changed, AccessLevel.USER_MODE);
    return request.campers.size() - fresh.size();
  }

  /** New campers, all or none; a refusal gives the sheet's row, never the name. */
  private void insertAll(List<Camper__c> fresh, List<Integer> freshAt) {
    List<Database.SaveResult> results = Database.insert(
      fresh,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < results.size(); i++) {
      if (!results[i].isSuccess()) {
        throw new ShoreshException(
          ChoicesImport.rowWords(request.campers[freshAt[i]]) +
          ScreenErrors.messageOf(results[i].getErrors()[0])
        );
      }
    }
    for (Integer i = 0; i < fresh.size(); i++) {
      made.put(freshAt[i], fresh[i]);
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
