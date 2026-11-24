/**
 * Which saved camper each row of a choices sheet is (ELECT-2.7): what the check counts
 * (ChoicesCheckCount) and what ChoicesImportCampers saves from. Each row is found by its key (CamperKeys.of: the camper number, else a hash of the name), never by querying
 * a name. Two campers may share a name (Greg 2026-11-21): a row is matched by name only when one
 * saved camper has it; when two or more do, or the row is one of several the director called
 * different campers while one of that name is here, the director says which (questions), never
 * Shoresh. No refusal names a camper. The campers are read in user mode.
 */
public with sharing class ChoicesCamperMatch {
  private ChoicesImport.Request request;
  // The key of each request camper, in order, and the saved campers by key (oldest first).
  private List<String> keys = new List<String>();
  private Map<String, List<Camper__c>> byKey;
  // The camp's word for a camper, read only for a refusal.
  private SetupSeasons.LazyLabels labels;

  public ChoicesCamperMatch(ChoicesImport.Request given) {
    request = given;
    labels = SetupSeasons.labelsWhenNeeded(new Set<Id>{ given.seasonId });
    readKeys();
    // Inside the season the scheduler was already checked to see (ChoicesImportPlace).
    byKey = CamperKeys.campersIn(
      request.seasonId,
      new Set<String>(keys),
      new List<SObjectField>{ Camper__c.Name, Camper__c.ParentComments__c }
    );
    checkAnswers();
  }

  /**
   * Each request camper's key; two rows with one key (a number written two ways) are refused,
   * unless the director said they are different campers (apart).
   */
  private void readKeys() {
    Map<String, Integer> firstRow = new Map<String, Integer>();
    for (ChoicesImport.SheetCamper sheetCamper : request.campers) {
      String key = CamperKeys.of(ofSheet(request.seasonId, sheetCamper));
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
    for (Integer i = 0; i < request.campers.size(); i++) {
      ChoicesImport.SheetCamper sheetCamper = request.campers[i];
      if (
        sheetCamper.camperId != null &&
        sheetCamper.newCamper != true &&
        chosen(i) == null
      ) {
        throw new ShoreshException(
          ChoicesImport.rowWords(sheetCamper) +
            'the ' +
            camperWord() +
            ' chosen for this row is not one of this name in the season. Check the file again.'
        );
      }
    }
    refuseOneCamperTwice();
  }

  private void refuseOneCamperTwice() {
    Map<Id, Integer> rowOf = new Map<Id, Integer>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      Camper__c camper = at(i);
      if (camper == null) {
        continue;
      }
      if (rowOf.containsKey(camper.Id)) {
        throw new ShoreshException(
          'Rows ' +
            rowOf.get(camper.Id) +
            ' and ' +
            request.campers[i].row +
            ' are one ' +
            camperWord() +
            ' here. Choose another for one of them.'
        );
      }
      rowOf.put(camper.Id, request.campers[i].row);
    }
  }

  /** The season's campers this row's key finds (none, one, or several of one name). */
  private List<Camper__c> candidates(Integer index) {
    return byKey.get(keys[index]) ?? new List<Camper__c>();
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

  /** Whether this row is one the director says which camper it is (ELECT-2.7). */
  private Boolean asked(Integer index) {
    Integer found = candidates(index).size();
    return found > 1 || (found == 1 && request.campers[index].apart == true);
  }

  /** Whether the director must still say which camper this row is. */
  public Boolean unsettled(Integer index) {
    ChoicesImport.SheetCamper sheetCamper = request.campers[index];
    return sheetCamper.newCamper != true &&
      sheetCamper.camperId == null &&
      asked(index);
  }

  /** The saved camper for the request's camper at this position, or null (new, or unsettled). */
  public Camper__c at(Integer index) {
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

  /** "Which camper is row 7?" for each row it is asked of, answered or not (ChoicesWhichCamper). */
  public List<ChoicesImport.Which> questions() {
    Map<Integer, List<Camper__c>> rows = new Map<Integer, List<Camper__c>>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      if (asked(i)) {
        rows.put(i, candidates(i));
      }
    }
    return ChoicesWhichCamper.questions(request, rows);
  }

  /** Refuses the save while a row's camper is still a question (the screen asks first). */
  public void refuseUnsettled() {
    for (Integer i = 0; i < request.campers.size(); i++) {
      if (unsettled(i)) {
        throw new ShoreshException(
          ChoicesImport.rowWords(request.campers[i]) +
            'more than one ' +
            camperWord() +
            ' in this season has this name. Choose which, or a new one.'
        );
      }
    }
  }

  /** A sheet's camper as a camper of the season (name and number, trimmed), to key and to add. */
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

  private String camperWord() {
    return labels.get(request.seasonId).singularInSentence('Camper');
  }
}
