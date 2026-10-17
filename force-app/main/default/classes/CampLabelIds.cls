/** The label editor changes or removes only its own camp's labels, whatever Ids the screen sends. */
public with sharing class CampLabelIds {
  public static void refuseOthers(Id campId, List<CampLabels.TermLabel> rows) {
    Set<Id> sent = new Set<Id>();
    for (CampLabels.TermLabel row : rows) {
      if (row.labelId != null) {
        sent.add(row.labelId);
      }
    }
    if (sent.isEmpty()) {
      return;
    }
    Map<Id, CampLabel__c> own = new Map<Id, CampLabel__c>(
      [
        SELECT Id
        FROM CampLabel__c
        WHERE Id IN :sent AND Camp__c = :campId
        WITH USER_MODE
      ]
    );
    if (!own.keySet().containsAll(sent)) {
      throw new CampLabels.LabelException(
        'Some of these words were changed somewhere else. Reload the page and try again.'
      );
    }
  }
}
