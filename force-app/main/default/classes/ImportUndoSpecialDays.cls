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

  /**
   * Of these records, those the schedule of a special day this Undo keeps uses (a group, an
   * activity, a fixed or recurring activity, a place), with that special day's name: kept with
   * it, so nothing in its schedule points at a removed record.
   */
  public static Map<Id, String> usedBy(Set<Id> keptIds, Set<Id> ids) {
    Map<Id, String> result = new Map<Id, String>();
    Map<Id, SpecialDay__c> kept = new Map<Id, SpecialDay__c>(
      [SELECT Id, Name FROM SpecialDay__c WHERE Id IN :keptIds WITH USER_MODE]
    );
    if (kept.isEmpty()) {
      return result;
    }
    Map<Id, SpecialPlans.Plan> plans = SpecialPlans.readAll(kept.keySet());
    for (Id dayId : plans.keySet()) {
      for (Id used : withPlaces(referencesIn(plans.get(dayId).grid))) {
        if (ids.contains(used)) {
          result.put(used, kept.get(dayId).Name);
        }
      }
    }
    return result;
  }

  /** The records named, with the places of the activities among them. */
  private static Set<Id> withPlaces(Set<Id> named) {
    Set<Id> result = new Set<Id>(named);
    for (Activity__c activity : [
      SELECT Location__c
      FROM Activity__c
      WHERE Id IN :named AND Location__c != NULL
      WITH USER_MODE
    ]) {
      result.add(activity.Location__c);
    }
    return result;
  }

  /** Every record a schedule names: its groups and its items (a trip names none). */
  private static Set<Id> referencesIn(ScheduleGrid grid) {
    Set<Id> result = new Set<Id>();
    if (grid == null) {
      return result;
    }
    for (ScheduleGrid.GroupRef groupRef : grid.groups) {
      addId(result, groupRef.id);
    }
    for (ScheduleGrid.Item item : grid.items) {
      addId(result, item.id);
    }
    return result;
  }

  private static void addId(Set<Id> ids, String value) {
    if (String.isBlank(value)) {
      return;
    }
    try {
      ids.add(Id.valueOf(value));
    } catch (StringException e) {
      // Not a record (an id local to the plan): nothing to keep.
      return;
    }
  }

  /** A kept record's name, saying which kept special day uses it ("Swim (Week 2 Friday uses it)"). */
  public static String named(String name, String usedBy) {
    return usedBy == null ? name : name + ' (' + usedBy + ' uses it)';
  }
}
