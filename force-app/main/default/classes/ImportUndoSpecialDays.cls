/**
 * Undo of the special days an import made (docs/import/weeks.md INGEST-4.3): one whose schedule
 * the director saved since the import wrote it (revision 1) is the director's work now and is
 * kept, and a kept special day keeps its day.
 */
public with sharing class ImportUndoSpecialDays {
  /** The special days among these whose plan was saved again after the import. */
  public static Set<Id> revised(String term, Set<Id> dayIds) {
    Set<Id> result = new Set<Id>();
    if (term != 'SpecialDay') {
      return result;
    }
    for (PlanPart__c part : [
      SELECT SpecialDay__c
      FROM PlanPart__c
      WHERE SpecialDay__c IN :dayIds AND Revision__c > 1
      WITH USER_MODE
    ]) {
      result.add(part.SpecialDay__c);
    }
    return result;
  }

  /**
   * The rows to remove: for special dates, those of special days this Undo keeps stay (counted
   * as kept); any other kind, unchanged.
   */
  public static List<SObject> withoutKept(
    String term,
    List<SObject> rows,
    Set<Id> keptIds
  ) {
    if (term != 'SpecialDate') {
      return rows;
    }
    Set<Id> ids = new Map<Id, SObject>(rows).keySet();
    List<SObject> result = new List<SObject>();
    for (SpecialDate__c row : [
      SELECT Id, SpecialDay__c
      FROM SpecialDate__c
      WHERE Id IN :ids
      WITH USER_MODE
    ]) {
      if (keptIds.contains(row.SpecialDay__c)) {
        keptIds.add(row.Id);
      } else {
        result.add(row);
      }
    }
    return result;
  }
}
