/**
 * Choices on a sheet that name one of the set's linked choices (electives slice E8; repo ADR 0017
 * choice 22; desktop ADR 2026-09-29-linked-elective-bundles D6). In user mode.
 */
public with sharing class ChoicesImportLinked {
  private ChoicesImport.Request request;
  private ChoicesImportPlace place;

  public ChoicesImportLinked(
    ChoicesImport.Request given,
    ChoicesImportPlace forPlace
  ) {
    request = given;
    place = forPlace;
  }

  /**
   * A choice naming a linked choice (slice E8: a sheet names it by its name) must name one of the
   * set's, and its activity is that linked choice's offering's, whatever the screen sent. One
   * query, only when a choice names one.
   */
  public void pointAt() {
    Boolean named = false;
    for (ChoicesImport.SheetCamper sheetCamper : request.campers) {
      for (ChoicesImport.SheetChoice choice : sheetCamper.choices) {
        named = named || choice.l != null;
      }
    }
    if (!named) {
      return;
    }
    Map<Id, LinkedChoice__c> ofSet = new Map<Id, LinkedChoice__c>(
      [
        SELECT Id, Offering__r.Activity__c
        FROM LinkedChoice__c
        WHERE ElectiveSet__c = :place.electiveSet.Id
        WITH USER_MODE
      ]
    );
    for (ChoicesImport.SheetCamper sheetCamper : request.campers) {
      for (ChoicesImport.SheetChoice choice : sheetCamper.choices) {
        if (choice.l == null) {
          continue;
        }
        LinkedChoice__c linked = ofSet.get(choice.l);
        if (linked == null) {
          throw new ShoreshException(
            ChoicesImport.rowWords(sheetCamper) +
            'a choice names a linked choice that is no longer in this set. Reload the page.'
          );
        }
        choice.a = linked.Offering__r.Activity__c;
        choice.add = null;
      }
    }
  }

  /** What a choice is, for comparing: its linked choice, else its activity, else its name. */
  public static String keyOf(ChoicesImport.SheetChoice choice) {
    if (choice.l != null) {
      return String.valueOf(choice.l);
    }
    return choice.a != null
      ? String.valueOf(choice.a)
      : ChoicesImport.fold(choice.n);
  }
}
