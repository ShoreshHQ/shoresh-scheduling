/**
 * What a choices-sheet check counts (ChoicesImport.check): campers already here and new ones,
 * those whose choices were changed by hand (kept) and where the sheet now differs, numbers saved
 * under another name, and the run's campers not on the sheet. A row whose camper the director
 * must still say (ELECT-2.7) is neither known nor added; the questions are listed.
 */
public with sharing class ChoicesCheckCount {
  private ChoicesImport.Request request;
  private ChoicesImportCampers campers;
  private ChoicesImportChoices choices;

  public ChoicesCheckCount(
    ChoicesImport.Request request,
    ChoicesImportCampers campers,
    ChoicesImportChoices choices
  ) {
    this.request = request;
    this.campers = campers;
    this.choices = choices;
  }

  /** Puts the counts on the check. */
  public void into(ChoicesImport.Check result) {
    result.whichCamper = campers.questions();
    Set<Id> onSheet = new Set<Id>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      Camper__c saved = campers.unsettled(i) ? null : campers.at(i);
      if (saved != null) {
        result.known++;
        onSheet.add(saved.Id);
        ChoicesImport.Renamed renamed = renamedAt(i, request.campers[i], saved);
        if (renamed != null) {
          result.renamed.add(renamed);
        }
        sayHandChanged(result, i, choices.savedFor(saved.Id));
      } else if (!campers.unsettled(i)) {
        result.added++;
      }
    }
    result.notOnSheet = choices.savedCount() - choices.savedAmong(onSheet);
  }

  /** A camper whose choices were changed by hand: kept, and said when the sheet now differs. */
  private void sayHandChanged(
    ChoicesImport.Check result,
    Integer index,
    Preference__c had
  ) {
    if (had != null && CamperChoices.handChanged(had)) {
      result.handChanged.add(index);
      if (differs(had, request.campers[index])) {
        result.differs.add(index);
      }
    }
  }

  /** A camper number saved under another name (Shoresh's name is kept, and said), or null. */
  private static ChoicesImport.Renamed renamedAt(
    Integer index,
    ChoicesImport.SheetCamper sheetCamper,
    Camper__c saved
  ) {
    if (
      String.isBlank(sheetCamper.camperNumber) ||
      String.isBlank(sheetCamper.name) ||
      sheetCamper.name.normalizeSpace().toLowerCase() ==
      saved.Name.normalizeSpace().toLowerCase()
    ) {
      return null;
    }
    ChoicesImport.Renamed renamed = new ChoicesImport.Renamed();
    renamed.index = index;
    renamed.savedName = saved.Name;
    return renamed;
  }

  /** Whether the sheet now gives other choices than the ones changed by hand. */
  private static Boolean differs(
    Preference__c had,
    ChoicesImport.SheetCamper sheetCamper
  ) {
    return !CamperChoices.same(had.Choices__c, sheetCamper.choices);
  }
}
