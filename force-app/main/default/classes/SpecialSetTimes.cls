/**
 * Fixed and recurring activities a special day's cell edits put back after its plan dropped them
 * (Undo once no group holds one; ADR 0014 choice 15), read again by Id in user mode, so the plan
 * lists them with their names as they are now.
 */
public with sharing class SpecialSetTimes {
  /** By Id, those the edits place that the grid no longer lists, of the season. */
  public static Map<Id, SObject> dropped(
    List<SlotEdits.Edit> edits,
    ScheduleGrid grid,
    Id seasonId
  ) {
    Set<Id> ids = notListed(placedBy(edits), grid);
    Map<Id, SObject> result = new Map<Id, SObject>();
    if (ids.isEmpty()) {
      return result;
    }
    result.putAll(
      new Map<Id, FixedActivity__c>(
        [
          SELECT Id, Name
          FROM FixedActivity__c
          WHERE Id IN :ids AND Program__r.Season__c = :seasonId
          WITH USER_MODE
        ]
      )
    );
    result.putAll(
      new Map<Id, RecurringActivity__c>(
        [
          SELECT Id, Name
          FROM RecurringActivity__c
          WHERE Id IN :ids AND Program__r.Season__c = :seasonId
          WITH USER_MODE
        ]
      )
    );
    return result;
  }

  /** Every fixed or recurring activity the edits put in a cell, as its slot identity. */
  private static Set<String> placedBy(List<SlotEdits.Edit> edits) {
    Set<String> result = new Set<String>();
    for (SlotEdits.Edit edit : edits) {
      for (SlotEdits.Run run : edit.runs) {
        result.addAll(setTimesIn(run.after));
      }
    }
    return result;
  }

  private static Set<String> setTimesIn(List<String> slots) {
    Set<String> result = new Set<String>();
    for (String after : slots == null ? new List<String>() : slots) {
      String slot = SlotIds.owner(SlotIds.normal(after));
      if (SlotIds.isSetTime(slot)) {
        result.add(slot);
      }
    }
    return result;
  }

  private static Set<Id> notListed(Set<String> slots, ScheduleGrid grid) {
    for (ScheduleGrid.Item item : grid.items) {
      slots.remove(SlotIds.of(item));
    }
    Set<Id> result = new Set<Id>();
    for (String slot : slots) {
      result.add(Id.valueOf(slot.substring(2)));
    }
    return result;
  }
}
