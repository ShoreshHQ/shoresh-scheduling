/**
 * Who a recurring activity covers, saved from the Recurring activities table with its rows. Who is
 * a list of divisions and groups in the activity's program; an empty list means every group in the
 * program (as for activities' "Who can do it"). The list sent replaces the saved one.
 */
public with sharing class SetTimeWho {
  /** One row's who: a saved row (target), or a new one (its place in the rows sent). */
  public class Who {
    @AuraEnabled
    public Id target { get; set; }
    @AuraEnabled
    public Integer row { get; set; }
    @AuraEnabled
    public List<Id> targets { get; set; }
  }

  public static void save(List<SObject> rows, List<Who> who) {
    if (who == null || who.isEmpty()) {
      return;
    }
    Map<Id, List<Id>> targetsByItem = new Map<Id, List<Id>>();
    for (Who entry : who) {
      targetsByItem.put(itemOf(entry, rows), entry.targets);
    }
    Map<Id, RecurringActivity__c> items = new Map<Id, RecurringActivity__c>(
      [
        SELECT Id, Program__r.Season__c, Program__r.Season__r.Camp__c
        FROM RecurringActivity__c
        WHERE Id IN :targetsByItem.keySet()
        WITH USER_MODE
      ]
    );
    List<Coverage__c> adds = new List<Coverage__c>();
    for (Id itemId : targetsByItem.keySet()) {
      adds.addAll(rowsFor(items.get(itemId), targetsByItem.get(itemId)));
    }
    Database.delete(
      [
        SELECT Id
        FROM Coverage__c
        WHERE RecurringActivity__c IN :targetsByItem.keySet()
        WITH USER_MODE
      ],
      true,
      AccessLevel.USER_MODE
    );
    Database.insert(adds, AccessLevel.USER_MODE);
  }

  private static Id itemOf(Who entry, List<SObject> rows) {
    Id item = entry.target;
    if (
      item == null &&
      entry.row != null &&
      entry.row >= 0 &&
      entry.row < rows.size()
    ) {
      item = rows[entry.row].Id;
    }
    if (
      item == null ||
      item.getSObjectType() != RecurringActivity__c.SObjectType
    ) {
      throw new ShoreshException(
        'These screens can only save who a recurring activity covers.'
      );
    }
    return item;
  }

  /** One row per division or group named (each once). */
  private static List<Coverage__c> rowsFor(
    RecurringActivity__c item,
    List<Id> targets
  ) {
    List<Coverage__c> result = new List<Coverage__c>();
    if (item == null) {
      throw new ShoreshException(
        'That was not found, or you do not have access to it.'
      );
    }
    Set<Id> seen = new Set<Id>();
    for (Id target : targets == null ? new List<Id>() : targets) {
      if (target == null || !seen.add(target)) {
        continue;
      }
      Schema.SObjectType kind = target.getSObjectType();
      if (kind != Division__c.SObjectType && kind != Group__c.SObjectType) {
        CampLabels labels = CampLabels.forCamp(
          item.Program__r.Season__r.Camp__c
        );
        throw new ShoreshException(
          'Who it covers can only name ' +
            labels.pluralInSentence('Division') +
            ' and ' +
            labels.pluralInSentence('Group') +
            '.'
        );
      }
      Coverage__c row = new Coverage__c(
        Season__c = item.Program__r.Season__c,
        RecurringActivity__c = item.Id
      );
      row.put(
        kind == Division__c.SObjectType ? 'Division__c' : 'Group__c',
        target
      );
      result.add(row);
    }
    return result;
  }
}
