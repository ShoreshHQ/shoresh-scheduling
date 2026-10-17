/**
 * Undo, for a camp workbook (slice 4c part D): puts back the weeks off (WeekException__c) the
 * workbook removed, unless the week or the item is gone, or the item is already off that week.
 * Every name and Id comes from the import's record, so each is checked (ImportFields).
 */
public with sharing class ImportUndoWeeksOff {
  private ImportUndo.Result result;

  public ImportUndoWeeksOff(ImportUndo.Result result) {
    this.result = result;
  }

  /** entries: [{ weekOn, week, field, target, name }]. */
  public void run(List<Object> entries) {
    if (entries.isEmpty()) {
      return;
    }
    Set<Id> weeks = new Set<Id>();
    Set<Id> targets = new Set<Id>();
    List<WeekException__c> wanted = new List<WeekException__c>();
    List<String> names = new List<String>();
    for (Object item : entries) {
      Map<String, Object> entry = (Map<String, Object>) item;
      WeekException__c off = checked(entry);
      wanted.add(off);
      names.add((String) entry.get('name'));
      weeks.add(off.Week__c);
      targets.add(targetOf(off));
    }
    Set<String> there = existing(weeks, targets);
    Set<Id> still = stillThere(targets);
    still.addAll(
      new Map<Id, Week__c>(
          [SELECT Id FROM Week__c WHERE Id IN :weeks WITH USER_MODE]
        )
        .keySet()
    );
    List<WeekException__c> toAdd = new List<WeekException__c>();
    for (Integer i = 0; i < wanted.size(); i++) {
      WeekException__c off = wanted[i];
      Id target = targetOf(off);
      if (!still.contains(off.Week__c) || !still.contains(target)) {
        // The week or the item was deleted since: nothing to put back.
        result.gone.add(names[i]);
      } else if (!there.contains(target + '|' + off.Week__c)) {
        toAdd.add(off);
      }
    }
    insertAll(toAdd);
  }

  /** A week off from the log, every name and Id checked against what an import writes. */
  private static WeekException__c checked(Map<String, Object> entry) {
    String field = (String) entry.get('field');
    ImportFields.check(WeekException__c.SObjectType, new Set<String>{ field });
    if (
      field == 'Week__c' ||
      ImportFields.ofRecord(entry.get('week')) != Week__c.SObjectType
    ) {
      throw ImportFields.unreadableLog();
    }
    // Checked before it is read as an Id, so text that isn't one is refused the same way.
    if (ImportFields.ofRecord(entry.get('target')) != fieldType(field)) {
      throw ImportFields.unreadableLog();
    }
    Id target = (Id) (String) entry.get('target');
    WeekException__c off = new WeekException__c(
      Week__c = (Id) (String) entry.get('week')
    );
    off.put(field, target);
    return off;
  }

  /** The items still there, read by their objects (only those ImportFields lists). */
  private static Set<Id> stillThere(Set<Id> targets) {
    Set<Id> result = new Set<Id>();
    for (
      List<SObject> found : new List<List<SObject>>{
        [SELECT Id FROM Group__c WHERE Id IN :targets WITH USER_MODE],
        [SELECT Id FROM Location__c WHERE Id IN :targets WITH USER_MODE],
        [SELECT Id FROM Activity__c WHERE Id IN :targets WITH USER_MODE],
        [SELECT Id FROM FixedActivity__c WHERE Id IN :targets WITH USER_MODE],
        [
          SELECT Id
          FROM RecurringActivity__c
          WHERE Id IN :targets
          WITH USER_MODE
        ]
      }
    ) {
      result.addAll(new Map<Id, SObject>(found).keySet());
    }
    return result;
  }

  private static Schema.SObjectType fieldType(String field) {
    return ImportFields.ofTerm(field.removeEnd('__c'));
  }

  private static Id targetOf(WeekException__c off) {
    for (
      Object value : new List<Object>{
        off.Group__c,
        off.Location__c,
        off.Activity__c,
        off.FixedActivity__c,
        off.RecurringActivity__c
      }
    ) {
      if (value != null) {
        return (Id) value;
      }
    }
    return null;
  }

  /** "target|week" for the weeks off already there. */
  private static Set<String> existing(Set<Id> weeks, Set<Id> targets) {
    Set<String> result = new Set<String>();
    for (WeekException__c off : [
      SELECT
        Week__c,
        Group__c,
        Location__c,
        Activity__c,
        FixedActivity__c,
        RecurringActivity__c
      FROM WeekException__c
      WHERE Week__c IN :weeks
      WITH USER_MODE
    ]) {
      Id target = targetOf(off);
      if (targets.contains(target)) {
        result.add(target + '|' + off.Week__c);
      }
    }
    return result;
  }

  /** Any refusal (a rule, a permission) stops the whole Undo with its reason. */
  private void insertAll(List<WeekException__c> rows) {
    List<Database.SaveResult> outcomes = Database.insert(
      rows,
      false,
      AccessLevel.USER_MODE
    );
    for (Integer i = 0; i < outcomes.size(); i++) {
      if (outcomes[i].isSuccess()) {
        result.restored++;
        continue;
      }
      Database.Error error = outcomes[i].getErrors()[0];
      throw ImportUndo.refused('A week off', 'couldn\'t put it back', error);
    }
  }
}
