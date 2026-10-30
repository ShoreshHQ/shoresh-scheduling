/**
 * Undo's count of what it removed is the import's count of what it added: records saved with
 * what they belong to and never counted as added (a special day's day, who rows) are not counted
 * either, and a holding record of a group with no division (DIV-1.1) the import made, which goes
 * with its last group (GroupTriggerHandler) before Undo reaches it, still is.
 */
public with sharing class ImportUndoCount {
  private static final Set<String> UNCOUNTED = new Set<String>{
    'SpecialDate',
    'Coverage',
    'ActivityEligibility',
    'LinkedChoiceTime'
  };

  // The import's holding records, there when Undo began.
  private Set<Id> holders;

  public ImportUndoCount(Set<Id> createdIds) {
    holders = new Map<Id, Division__c>(
        [
          SELECT Id
          FROM Division__c
          WHERE Id IN :createdIds AND NoDivision__c = TRUE
          WITH USER_MODE
        ]
      )
      .keySet();
  }

  /** What one record of this kind removed adds to the count: 1, or 0 for an uncounted kind. */
  public static Integer each(String term) {
    return UNCOUNTED.contains(term) ? 0 : 1;
  }

  /** The import's holding records among those logged that are gone now (removed by Undo). */
  public Integer goneHolders(Set<Id> logged, Set<Id> present) {
    Set<Id> gone = new Set<Id>(holders);
    gone.retainAll(logged);
    gone.removeAll(present);
    return gone.size();
  }
}
