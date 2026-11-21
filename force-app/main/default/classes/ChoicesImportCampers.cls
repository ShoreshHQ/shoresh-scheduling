/**
 * A choices sheet's campers (ChoicesImport; repo ADR 0017 choices 14 and 15): which saved camper
 * each row is (ChoicesCamperMatch: two campers may share a name, ELECT-2.7), and new ones made. A
 * known camper keeps Shoresh's name and gains the sheet's comment when it says something new
 * (decision 48.3). No refusal names a camper. In user mode.
 */
public with sharing class ChoicesImportCampers {
  private ChoicesImport.Request request;
  private ChoicesCamperMatch match;
  // The campers save() made, by position.
  private Map<Integer, Camper__c> made = new Map<Integer, Camper__c>();

  public ChoicesImportCampers(ChoicesImport.Request given) {
    request = given;
    match = new ChoicesCamperMatch(given);
  }

  /** The saved camper for the request's camper at this position, or null (new, or unsettled). */
  public Camper__c at(Integer index) {
    return made.containsKey(index) ? made.get(index) : match.at(index);
  }

  /** Whether the director must still say which camper this row is. */
  public Boolean unsettled(Integer index) {
    return match.unsettled(index);
  }

  /** "Which camper is row 7?" for each row it is asked of (ChoicesWhichCamper). */
  public List<ChoicesImport.Which> questions() {
    return match.questions();
  }

  /** Makes the new campers and adds new comments to known ones. Returns how many were known. */
  public Integer save() {
    match.refuseUnsettled();
    List<Camper__c> fresh = new List<Camper__c>();
    List<Integer> freshAt = new List<Integer>();
    List<Camper__c> changed = new List<Camper__c>();
    for (Integer i = 0; i < request.campers.size(); i++) {
      ChoicesImport.SheetCamper sheetCamper = request.campers[i];
      Camper__c saved = at(i);
      if (saved == null) {
        Camper__c camper = CamperKeys.ofSheet(request.seasonId, sheetCamper);
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

  /** The saved comment with the sheet's added (ParentComments.joined). */
  public static String commentWith(String saved, String sheet) {
    return ParentComments.joined(saved, sheet);
  }
}
