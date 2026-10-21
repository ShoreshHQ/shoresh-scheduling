/**
 * Reads and saves the plan of a special day or special event (PlanPart__c, ADR 0014): its own
 * time blocks, its rows (a special day: every group in the camp; an event: its stations or
 * teams), and its cells, in the same compact grid format and parts as a schedule day (ADR 0005).
 * A save names the revision the plan was opened at and is refused if it was saved since; a
 * save across several parts writes all of them or none. Runs in user mode.
 */
public with sharing class SpecialPlans {
  /** A plan as read: its grid (null when nothing is saved yet), revision, or why it can't be read. */
  public class Plan {
    public Id itemId;
    public ScheduleGrid grid;
    public Integer revision;
    public String problem;
  }

  public static Plan read(Id itemId) {
    return readAll(new Set<Id>{ itemId }).get(itemId);
  }

  /** Each item's plan, in one query; an item with nothing saved has a plan with no grid. */
  public static Map<Id, Plan> readAll(Set<Id> itemIds) {
    Map<Id, List<PlanPart__c>> partsByItem = partsOf(itemIds);
    Map<Id, Plan> result = new Map<Id, Plan>();
    for (Id itemId : itemIds) {
      List<PlanPart__c> parts = partsByItem.get(itemId);
      Plan plan = new Plan();
      plan.itemId = itemId;
      if (parts != null) {
        // Same format and rules as a schedule day, so its reader is used as it is.
        ScheduleDays.DayGrid read = ScheduleDays.readDay(
          null,
          asDayParts(parts)
        );
        plan.grid = read.grid;
        plan.revision = read.revision;
        plan.problem = read.problem;
      }
      result.put(itemId, plan);
    }
    return result;
  }

  /**
   * Saves a plan, all parts or none. expectedRevision: the revision it was opened at, or null
   * for a plan never saved. Returns the new revision.
   */
  public static Integer write(
    Id itemId,
    ScheduleGrid grid,
    Integer expectedRevision
  ) {
    // Locking the item makes two saves of its plan run one after the other.
    Item item = locked(itemId);
    List<PlanPart__c> before = partsOf(new Set<Id>{ itemId }).get(itemId);
    before = before == null ? new List<PlanPart__c>() : before;
    Integer revision = nextRevision(item, before, expectedRevision);
    List<String> texts = ScheduleGridParts.split(grid);
    List<PlanPart__c> toSave = new List<PlanPart__c>();
    for (Integer i = 0; i < texts.size(); i++) {
      PlanPart__c part = i < before.size()
        ? new PlanPart__c(Id = before[i].Id)
        : newPart(item, itemId);
      part.Part__c = i + 1;
      part.Plan__c = texts[i];
      part.GridFormatVersion__c = ScheduleGridLocks.formatOf(grid);
      part.Revision__c = revision;
      toSave.add(part);
    }
    List<PlanPart__c> toDelete = new List<PlanPart__c>();
    for (Integer i = texts.size(); i < before.size(); i++) {
      toDelete.add(before[i]);
    }
    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.delete(toDelete, true, AccessLevel.USER_MODE);
      Database.upsert(toSave, true, AccessLevel.USER_MODE);
    } catch (Exception e) {
      Database.rollback(beforeSave);
      throw e;
    }
    return revision;
  }

  /** The revision this save writes; refused if the plan was saved since it was opened. */
  private static Integer nextRevision(
    Item item,
    List<PlanPart__c> before,
    Integer expectedRevision
  ) {
    Integer current = before.isEmpty() || before[0].Revision__c == null
      ? null
      : before[0].Revision__c.intValue();
    if (current != expectedRevision) {
      CampLabels labels = CampLabels.forCamp(item.campId);
      throw new ShoreshException(
        'Someone else changed this ' +
          labels.singularInSentence(item.term) +
          ' since you opened it. Open it again to see their changes, then make yours.'
      );
    }
    return current == null ? 1 : current + 1;
  }

  private class Item {
    private Id seasonId;
    private Id campId;
    private String term;
  }

  private static Item locked(Id itemId) {
    Schema.SObjectType type = itemId?.getSObjectType();
    Item item = new Item();
    item.term = SpecialItemTriggerHandler.termOf(type);
    // Without access to the object, it is "not found", never a platform error.
    if (
      type == SpecialDay__c.SObjectType &&
      Schema.sObjectType.SpecialDay__c.isAccessible()
    ) {
      for (SpecialDay__c day : [
        SELECT Season__c, Season__r.Camp__c
        FROM SpecialDay__c
        WHERE Id = :itemId
        WITH USER_MODE
        FOR UPDATE
      ]) {
        item.seasonId = day.Season__c;
        item.campId = day.Season__r.Camp__c;
      }
    } else if (
      type == SpecialEvent__c.SObjectType &&
      Schema.sObjectType.SpecialEvent__c.isAccessible()
    ) {
      for (SpecialEvent__c event : [
        SELECT Season__c, Season__r.Camp__c
        FROM SpecialEvent__c
        WHERE Id = :itemId
        WITH USER_MODE
        FOR UPDATE
      ]) {
        item.seasonId = event.Season__c;
        item.campId = event.Season__r.Camp__c;
      }
    }
    if (item.seasonId == null) {
      throw new ShoreshException(
        'That was not found, or you don\'t have access to it. Reload the page.'
      );
    }
    return item;
  }

  private static PlanPart__c newPart(Item item, Id itemId) {
    PlanPart__c part = new PlanPart__c(Season__c = item.seasonId);
    if (itemId.getSObjectType() == SpecialDay__c.SObjectType) {
      part.SpecialDay__c = itemId;
    } else {
      part.SpecialEvent__c = itemId;
    }
    return part;
  }

  private static Map<Id, List<PlanPart__c>> partsOf(Set<Id> itemIds) {
    Map<Id, List<PlanPart__c>> result = new Map<Id, List<PlanPart__c>>();
    for (PlanPart__c part : [
      SELECT
        Id,
        SpecialDay__c,
        SpecialEvent__c,
        Part__c,
        Plan__c,
        GridFormatVersion__c,
        Revision__c
      FROM PlanPart__c
      WHERE SpecialDay__c IN :itemIds OR SpecialEvent__c IN :itemIds
      WITH USER_MODE
      ORDER BY Part__c, Id
    ]) {
      Id owner = part.SpecialDay__c != null
        ? part.SpecialDay__c
        : part.SpecialEvent__c;
      if (!result.containsKey(owner)) {
        result.put(owner, new List<PlanPart__c>());
      }
      result.get(owner).add(part);
    }
    return result;
  }

  /** A plan's parts as the schedule-day records ScheduleDays reads (never saved). */
  private static List<ScheduleDay__c> asDayParts(List<PlanPart__c> parts) {
    List<ScheduleDay__c> result = new List<ScheduleDay__c>();
    for (PlanPart__c part : parts) {
      result.add(
        new ScheduleDay__c(
          Part__c = part.Part__c,
          Grid__c = part.Plan__c,
          GridFormatVersion__c = part.GridFormatVersion__c,
          Revision__c = part.Revision__c
        )
      );
    }
    return result;
  }
}
