/**
 * Fixed and recurring activities a special day's cell edits put back after its plan dropped them
 * (Undo once no group holds one; ADR 0014 choice 15), read again by Id in user mode, so the plan
 * lists them with their names as they are now. Only those the special day starts with can be put
 * back (SpecialDaySeed.broughtInIds): they can't be typed in by name, so any other one, and any
 * in an event, is refused with a message, never placed.
 */
public with sharing class SpecialSetTimes {
  /** By Id, those the edits place that the grid no longer lists; refused unless brought in. */
  public static Map<Id, SObject> dropped(
    List<SlotEdits.Edit> edits,
    ScheduleGrid grid,
    SpecialSchedule.Owner owner
  ) {
    Set<Id> ids = notListed(placedBy(edits), grid);
    Map<Id, SObject> result = new Map<Id, SObject>();
    if (ids.isEmpty()) {
      return result;
    }
    Id seasonId = owner.seasonId;
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
    if (!result.isEmpty()) {
      checkBroughtIn(result.values(), owner);
    }
    return result;
  }

  /** Refuses one the item did not start with: an event starts with none. */
  private static void checkBroughtIn(
    List<SObject> records,
    SpecialSchedule.Owner owner
  ) {
    Set<Id> allowed = owner.isEvent()
      ? new Set<Id>()
      : SpecialDaySeed.broughtInIds(owner.seasonId);
    for (SObject record : records) {
      if (!allowed.contains(record.Id)) {
        throw notStartedWith((String) record.get('Name'), owner);
      }
    }
  }

  private static ShoreshException notStartedWith(
    String name,
    SpecialSchedule.Owner owner
  ) {
    CampLabels labels = CampLabels.forCamp(owner.campId);
    String kinds =
      labels.pluralInSentence('FixedActivity') +
      ' and ' +
      labels.pluralInSentence('RecurringActivity');
    return new ShoreshException(
      name +
        ' can\'t be put in ' +
        owner.name +
        (owner.isEvent()
          ? ': ' + kinds + ' have their own times and aren\'t placed in it.'
          : '. Only the ' + kinds + ' it started with can be put back.')
    );
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
