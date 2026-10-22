/**
 * The special events a save's edits place on a week's grid (ADR 0014 slice 4): the season's, read
 * once for the whole save in user mode (none read when no edit places one). One from another
 * season, or deleted, is refused when it is placed.
 */
public with sharing class SlotEvents {
  private Map<Id, SpecialEvent__c> events = new Map<Id, SpecialEvent__c>();
  private CampLabels labels;

  /** No events: a save that places none. */
  public static SlotEvents none() {
    return new SlotEvents();
  }

  /** The season's events the edits place. */
  public static SlotEvents read(
    Id seasonId,
    CampLabels labels,
    List<SlotEdits.Edit> edits
  ) {
    SlotEvents result = new SlotEvents();
    result.labels = labels;
    Set<Id> eventIds = placedIn(edits);
    if (!eventIds.isEmpty()) {
      result.events = new Map<Id, SpecialEvent__c>(
        [
          SELECT Id, Name
          FROM SpecialEvent__c
          WHERE Id IN :eventIds AND Season__c = :seasonId
          WITH USER_MODE
        ]
      );
    }
    return result;
  }

  private static Set<Id> placedIn(List<SlotEdits.Edit> edits) {
    Set<Id> eventIds = new Set<Id>();
    for (SlotEdits.Edit edit : edits) {
      for (SlotEdits.Run run : edit?.runs ?? new List<SlotEdits.Run>()) {
        eventIds.addAll(placedIn(run));
      }
    }
    eventIds.remove(null);
    return eventIds;
  }

  private static Set<Id> placedIn(SlotEdits.Run run) {
    Set<Id> eventIds = new Set<Id>();
    for (String slot : run?.after ?? new List<String>()) {
      eventIds.add(SlotIds.eventIn(SlotIds.owner(slot)));
    }
    return eventIds;
  }

  /** The stored cell for an event starting in a slot ('S:<Id>'), added to the day's list. */
  public String startToken(ScheduleGrid grid, String slot) {
    SpecialEvent__c event = events.get(SlotIds.eventIn(slot));
    if (event == null) {
      throw new ShoreshException(
        'That ' +
          (labels == null
            ? 'special event'
            : labels.singularInSentence('SpecialEvent')) +
          ' was not found. It may have been deleted.'
      );
    }
    grid.items.add(new ScheduleGrid.Item('S', event.Id, event.Name));
    return String.valueOf(grid.items.size());
  }
}
