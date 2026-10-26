/**
 * The special events (ADR 0014 slice 4) and elective sets (ADR 0018 slice E5) a save's edits place
 * on a week's grid: the season's, read once for the whole save in user mode (none read of a kind
 * no edit places). One from another season, or deleted, is refused when it is placed.
 */
public with sharing class SlotEvents {
  private Map<Id, SObject> placed = new Map<Id, SObject>();
  // The camp's words, for a refusal naming an event or a set; the model terms until read() is
  // given the camp's.
  private CampLabels labels = CampLabels.modelTermsOnly();

  /** Whether a slot starts a special event or an elective set, by its record. */
  public static Boolean isPlaced(String slot) {
    return SlotIds.eventIn(slot) != null || SlotIds.electiveIn(slot) != null;
  }

  /** No events or sets: a save that places none. */
  public static SlotEvents none() {
    return new SlotEvents();
  }

  /** The season's events and elective sets the edits place. */
  public static SlotEvents read(
    Id seasonId,
    CampLabels labels,
    List<SlotEdits.Edit> edits
  ) {
    return read(seasonId, labels, edits, new Map<Id, SObject>());
  }

  /**
   * The same, given records already read in user mode (the season's, with Id and Name): those
   * aren't read again.
   */
  public static SlotEvents read(
    Id seasonId,
    CampLabels labels,
    List<SlotEdits.Edit> edits,
    Map<Id, SObject> known
  ) {
    SlotEvents result = new SlotEvents();
    result.labels = labels ?? result.labels;
    Set<Id> eventIds = new Set<Id>();
    Set<Id> setIds = new Set<Id>();
    for (String slot : placedIn(edits)) {
      eventIds.add(SlotIds.eventIn(slot));
      setIds.add(SlotIds.electiveIn(slot));
    }
    eventIds.remove(null);
    setIds.remove(null);
    for (Id recordId : known.keySet()) {
      if (setIds.remove(recordId) || eventIds.remove(recordId)) {
        result.placed.put(recordId, known.get(recordId));
      }
    }
    if (!eventIds.isEmpty()) {
      result.placed.putAll(
        [
          SELECT Id, Name
          FROM SpecialEvent__c
          WHERE Id IN :eventIds AND Season__c = :seasonId
          WITH USER_MODE
        ]
      );
    }
    if (!setIds.isEmpty()) {
      result.placed.putAll(
        [
          SELECT Id, Name
          FROM ElectiveSet__c
          WHERE Id IN :setIds AND Season__c = :seasonId
          WITH USER_MODE
        ]
      );
    }
    return result;
  }

  /** What the edits' runs put in their slots, each slot's owner. */
  private static Set<String> placedIn(List<SlotEdits.Edit> edits) {
    Set<String> slots = new Set<String>();
    for (SlotEdits.Edit edit : edits) {
      for (SlotEdits.Run run : edit?.runs ?? new List<SlotEdits.Run>()) {
        for (String slot : run?.after ?? new List<String>()) {
          slots.add(SlotIds.owner(slot));
        }
      }
    }
    return slots;
  }

  /**
   * The stored cell for an event ('S:<Id>') or elective set ('E:<Id>') starting in a slot, added
   * to the day's list.
   */
  public String startToken(ScheduleGrid grid, String slot) {
    Boolean isEvent = SlotIds.eventIn(slot) != null;
    Id recordId = isEvent ? SlotIds.eventIn(slot) : SlotIds.electiveIn(slot);
    SObject record = placed.get(recordId);
    if (record == null) {
      throw new ShoreshException(
        'That ' + word(isEvent) + ' was not found. It may have been deleted.'
      );
    }
    grid.items.add(
      new ScheduleGrid.Item(
        isEvent ? 'S' : 'E',
        record.Id,
        (String) record.get('Name')
      )
    );
    return String.valueOf(grid.items.size());
  }

  /** "special event" or "elective set", or the camp's own word for one (one: singular). */
  private String word(Boolean isEvent) {
    return labels.singularInSentence(isEvent ? 'SpecialEvent' : 'ElectiveSet');
  }
}
