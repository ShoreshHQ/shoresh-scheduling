/**
 * A choices sheet's choices (ChoicesImport; repo ADR 0017 choices 14 to 16): every choice
 * checked, and one Preference__c
 * per camper per run. What the sheet says is always kept as imported; the choices used are the
 * sheet's unless they were changed by hand, which are kept. In user mode.
 */
public with sharing class ChoicesImportChoices {
  private static final Set<String> KINDS = new Set<String>{
    'ranked',
    'cell',
    'unordered'
  };
  private ChoicesImport.Request request;
  private ChoicesImportPlace place;
  // The run's saved choices, by camper.
  private Map<Id, Preference__c> savedByCamper = new Map<Id, Preference__c>();

  public ChoicesImportChoices(
    ChoicesImport.Request given,
    ChoicesImportPlace forPlace
  ) {
    request = given;
    place = forPlace;
  }

  // ---------------------------------------------------------------- checks

  /**
   * Each choice has a kind Shoresh knows and a name; each camper's group is of the program, and
   * of the row's division when the sheet names one.
   */
  public void checkChoices() {
    Set<Id> groupIds = new Set<Id>();
    for (ChoicesImport.SheetCamper sheetCamper : request.campers) {
      if (sheetCamper.groupId != null) {
        groupIds.add(sheetCamper.groupId);
      }
      refuseUnreadable(sheetCamper);
    }
    if (groupIds.isEmpty()) {
      return;
    }
    Map<Id, Group__c> ofProgram = new Map<Id, Group__c>(
      [
        SELECT Id, Division__c
        FROM Group__c
        WHERE
          Id IN :groupIds
          AND Division__r.Program__c = :place.schedule.Program__c
        WITH USER_MODE
      ]
    );
    if (ofProgram.size() != groupIds.size()) {
      throw new ShoreshException(
        'A camper\'s group is not in this schedule\'s program. Reload the page.'
      );
    }
    refuseOtherDivisions(ofProgram);
  }

  /** A camper whose group is not in the division the sheet names for the row. */
  private void refuseOtherDivisions(Map<Id, Group__c> ofProgram) {
    for (ChoicesImport.SheetCamper sheetCamper : request.campers) {
      if (
        sheetCamper.groupId != null &&
        sheetCamper.divisionId != null &&
        ofProgram.get(sheetCamper.groupId).Division__c != sheetCamper.divisionId
      ) {
        throw new ShoreshException(
          ChoicesImport.rowWords(sheetCamper) +
          'the group is not in the row\'s division. Reload the page.'
        );
      }
    }
  }

  private static void refuseUnreadable(ChoicesImport.SheetCamper sheetCamper) {
    for (ChoicesImport.SheetChoice choice : sheetCamper.choices) {
      if (!KINDS.contains(choice.k) || String.isBlank(choice.n)) {
        throw new ShoreshException(
          ChoicesImport.rowWords(sheetCamper) +
          'a choice could not be read. Choose the file again.'
        );
      }
    }
  }

  // ---------------------------------------------------------------- the run's choices

  public void readSaved() {
    savedByCamper.clear();
    if (place.run == null || place.run.Id == null) {
      return;
    }
    for (Preference__c had : [
      SELECT Id, Camper__c, Group__c, Choices__c, ManualChange__c
      FROM Preference__c
      WHERE ElectiveRun__c = :place.run.Id
      WITH USER_MODE
    ]) {
      savedByCamper.put(had.Camper__c, had);
    }
  }

  public Preference__c savedFor(Id camperId) {
    return savedByCamper.get(camperId);
  }

  public Integer savedCount() {
    return savedByCamper.size();
  }

  public Integer savedAmong(Set<Id> camperIds) {
    Integer count = 0;
    for (Id camperId : savedByCamper.keySet()) {
      if (camperIds.contains(camperId)) {
        count++;
      }
    }
    return count;
  }

  /**
   * One set of choices per camper. The sheet's bunk is used; a camper the sheet gives no bunk
   * keeps the one saved. Returns how many hand changes stayed.
   */
  public Integer save(ChoicesImportCampers campers) {
    List<Preference__c> rows = new List<Preference__c>();
    Integer handKept = 0;
    for (Integer i = 0; i < request.campers.size(); i++) {
      ChoicesImport.SheetCamper sheetCamper = request.campers[i];
      Id camperId = campers.at(i).Id;
      String imported = JSON.serialize(sheetCamper.choices, true);
      Preference__c had = savedByCamper.get(camperId);
      if (had == null) {
        rows.add(
          new Preference__c(
            ElectiveRun__c = place.run.Id,
            Camper__c = camperId,
            Group__c = sheetCamper.groupId,
            Choices__c = imported,
            ImportedChoices__c = imported
          )
        );
        continue;
      }
      Preference__c change = new Preference__c(
        Id = had.Id,
        ImportedChoices__c = imported,
        Group__c = sheetCamper.groupId == null
          ? had.Group__c
          : sheetCamper.groupId
      );
      if (had.ManualChange__c) {
        handKept++;
      } else {
        change.Choices__c = imported;
      }
      rows.add(change);
    }
    UserModeWrites.save(rows);
    return handKept;
  }

  // ---------------------------------------------------------------- comparing

  /** Choices compared by what they are, not how they were written down. */
  public static String signature(String stored) {
    if (String.isBlank(stored)) {
      return signature(new List<ChoicesImport.SheetChoice>());
    }
    try {
      return signature(
        (List<ChoicesImport.SheetChoice>) JSON.deserialize(
          stored,
          List<ChoicesImport.SheetChoice>.class
        )
      );
    } catch (JSONException e) {
      // Stored some other way: compared as text, so any difference shows.
      return stored;
    }
  }

  public static String signature(List<ChoicesImport.SheetChoice> choices) {
    List<String> parts = new List<String>();
    for (ChoicesImport.SheetChoice choice : choices) {
      parts.add(
        String.join(
          new List<String>{
            choice.a != null
              ? String.valueOf(choice.a)
              : ChoicesImport.fold(choice.n),
            String.valueOf(choice.r),
            String.valueOf(choice.k),
            ChoicesImport.fold(choice.d),
            ChoicesImport.fold(choice.p)
          },
          '|'
        )
      );
    }
    parts.sort();
    return String.join(parts, ';');
  }
}
