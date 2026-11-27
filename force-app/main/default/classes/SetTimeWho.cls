/**
 * Who a recurring activity covers, saved from the Recurring activities table with its rows, and who
 * an elective set's time is for, from the Electives table (ELECT-7.4). Who is a list of divisions
 * and groups; an empty list means every group in the program (as for activities' "Who can do it").
 * The list sent replaces the saved one.
 */
public with sharing class SetTimeWho {
  // The season and camp of each owner, read once.
  private Map<Id, Id> seasonOf = new Map<Id, Id>();
  private Map<Id, Id> campOf = new Map<Id, Id>();
  // ELECT-7.4: saved sets whose who this save replaces: their old rows don't hold their time
  // block in its program (ElectiveSetMoves); the new rows are checked instead.
  private static Set<Id> replacing = new Set<Id>();

  /** One row's who: a saved row (target), or a new one (its place in the rows sent). */
  public class Who {
    @AuraEnabled
    public Id target { get; set; }
    @AuraEnabled
    public Integer row { get; set; }
    @AuraEnabled
    public List<Id> targets { get; set; }
  }

  /** Before the rows are saved: the saved elective sets whose who the same save replaces. */
  public static void willReplace(List<Who> who) {
    replacing.clear();
    for (Who entry : who ?? new List<Who>()) {
      if (
        entry.target != null &&
        entry.target.getSObjectType() == ElectiveSet__c.SObjectType
      ) {
        replacing.add(entry.target);
      }
    }
  }

  /** Whether this save replaces who the set is for. */
  public static Boolean replaces(Id setId) {
    return replacing.contains(setId);
  }

  public static void save(List<SObject> rows, List<Who> who) {
    if (who == null || who.isEmpty()) {
      return;
    }
    Map<Id, List<Id>> targetsByItem = new Map<Id, List<Id>>();
    Set<Id> recurringIds = new Set<Id>();
    Set<Id> setIds = new Set<Id>();
    for (Who entry : who) {
      Id item = itemOf(entry, rows);
      targetsByItem.put(item, entry.targets);
      if (item.getSObjectType() == RecurringActivity__c.SObjectType) {
        recurringIds.add(item);
      } else {
        setIds.add(item);
      }
    }
    SetTimeWho owners = new SetTimeWho();
    owners.read(recurringIds, setIds);
    List<Coverage__c> adds = new List<Coverage__c>();
    for (Id itemId : targetsByItem.keySet()) {
      adds.addAll(owners.rowsFor(itemId, targetsByItem.get(itemId)));
    }
    Database.delete(
      [
        SELECT Id
        FROM Coverage__c
        WHERE RecurringActivity__c IN :recurringIds OR ElectiveSet__c IN :setIds
        WITH USER_MODE
      ],
      true,
      AccessLevel.USER_MODE
    );
    Database.insert(adds, AccessLevel.USER_MODE);
    replacing.removeAll(setIds);
  }

  /** Each owner's season and camp, in user mode: one query per kind named. */
  private void read(Set<Id> recurringIds, Set<Id> setIds) {
    if (!recurringIds.isEmpty()) {
      for (RecurringActivity__c item : [
        SELECT Id, Program__r.Season__c, Program__r.Season__r.Camp__c
        FROM RecurringActivity__c
        WHERE Id IN :recurringIds
        WITH USER_MODE
      ]) {
        seasonOf.put(item.Id, item.Program__r.Season__c);
        campOf.put(item.Id, item.Program__r.Season__r.Camp__c);
      }
    }
    if (!setIds.isEmpty()) {
      for (ElectiveSet__c item : [
        SELECT Id, Season__c, Season__r.Camp__c
        FROM ElectiveSet__c
        WHERE Id IN :setIds
        WITH USER_MODE
      ]) {
        seasonOf.put(item.Id, item.Season__c);
        campOf.put(item.Id, item.Season__r.Camp__c);
      }
    }
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
      (item.getSObjectType() != RecurringActivity__c.SObjectType &&
      item.getSObjectType() != ElectiveSet__c.SObjectType)
    ) {
      throw new ShoreshException('These screens can\'t save that.');
    }
    return item;
  }

  /** One row per division or group named (each once). */
  private List<Coverage__c> rowsFor(Id itemId, List<Id> targets) {
    List<Coverage__c> result = new List<Coverage__c>();
    if (!seasonOf.containsKey(itemId)) {
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
      refuseOtherKinds(kind, campOf.get(itemId));
      Coverage__c row = new Coverage__c(Season__c = seasonOf.get(itemId));
      row.put(
        itemId.getSObjectType() == ElectiveSet__c.SObjectType
          ? Coverage__c.ElectiveSet__c
          : Coverage__c.RecurringActivity__c,
        itemId
      );
      row.put(
        kind == Division__c.SObjectType
          ? Coverage__c.Division__c
          : Coverage__c.Group__c,
        target
      );
      result.add(row);
    }
    return result;
  }

  private static void refuseOtherKinds(Schema.SObjectType kind, Id campId) {
    if (kind != Division__c.SObjectType && kind != Group__c.SObjectType) {
      CampLabels labels = CampLabels.forCamp(campId);
      throw new ShoreshException(
        'Who it covers can only name ' +
          labels.pluralInSentence('Division') +
          ' and ' +
          labels.pluralInSentence('Group') +
          '.'
      );
    }
  }
}
