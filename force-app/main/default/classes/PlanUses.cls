/**
 * Which of these items a special day's or event's plan names, or a published copy of one
 * (ImportItemUses, INGEST-5.8): "Boating is in Field Day's plan", or on that published schedule.
 * Each part of a plan lists the plan's items, so any part names the item. Read 200 at a time;
 * past maxRows of either (published copies are kept for every publish), an item not already in
 * use is said to be in use, as for schedule days. In user mode.
 */
public with sharing class PlanUses {
  @TestVisible
  private static Integer maxRows = 5000;
  private Map<Id, String> result;
  private Map<Id, String> names;

  private PlanUses(Map<Id, String> result, Map<Id, String> names) {
    this.result = result;
    this.names = names;
  }

  /** Adds a reason for each item a plan names that has none yet. Two queries. */
  public static void addTo(
    Map<Id, String> result,
    Id seasonId,
    Map<Id, String> names
  ) {
    PlanUses uses = new PlanUses(result, names);
    Integer read = 0;
    for (PlanPart__c part : [
      SELECT Plan__c, SpecialDay__r.Name, SpecialEvent__r.Name
      FROM PlanPart__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Id
      LIMIT :maxRows + 1
    ]) {
      if (++read > maxRows) {
        ImportItemUses.uncheckedInUse(names, result);
        return;
      }
      String owner = part.SpecialDay__r?.Name ?? part.SpecialEvent__r?.Name;
      uses.said(part.Plan__c, ' is in ' + owner + '\'s plan');
    }
    read = 0;
    for (PublishedPlan__c copy : [
      SELECT Plan__c, Schedule__r.Name
      FROM PublishedPlan__c
      WHERE Schedule__r.Program__r.Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Id
      LIMIT :maxRows + 1
    ]) {
      if (++read > maxRows) {
        ImportItemUses.uncheckedInUse(names, result);
        return;
      }
      uses.said(copy.Plan__c, ' is on ' + copy.Schedule__r.Name);
    }
  }

  /** Each item this plan names and has no reason yet: its name and the place. */
  private void said(String plan, String place) {
    for (Id item : names.keySet()) {
      if (
        !result.containsKey(item) &&
        plan != null &&
        plan.contains(String.valueOf(item).left(15))
      ) {
        result.put(item, names.get(item) + place);
      }
    }
  }
}
