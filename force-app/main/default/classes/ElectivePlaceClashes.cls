/**
 * Double-booked on the schedule (electives slice E7; repo ADR 0018 choice 33): the places that hold
 * more groups than fit at a time a run's elective set is on the schedule, the check Finalize makes
 * (desktop finalizeElectiveRun.js step 2, engine/routeConflicts.js). Each bunk's item there counts
 * at its places (ElectivePlaces); a place holds its "groups that fit" (at least 1). Only the times
 * the run's set is placed are looked at. Five queries.
 */
public with sharing class ElectivePlaceClashes {
  private ElectiveRunState state;
  private Map<String, ElectivePeriod> periodBySlot = new Map<String, ElectivePeriod>();
  // Each bunk's item at those times: slot and item, side by side.
  private List<String> slots = new List<String>();
  private List<ScheduleGrid.Item> items = new List<ScheduleGrid.Item>();

  public ElectivePlaceClashes(ElectiveRunState given) {
    state = given;
    for (ElectivePeriod at : state.live.periods) {
      periodBySlot.put(ElectiveTimes.slotOf(at.day, at.blockId), at);
    }
  }

  /** "Pool, Tuesday, Period 3": each place over what fits, in the order of the week. */
  public List<String> find() {
    for (ScheduleDays.DayGrid day : state.liveDays) {
      if (day.grid != null) {
        readDay(day);
      }
    }
    ElectivePlaces places = new ElectivePlaces(items);
    // slot -> place -> groups there.
    Map<String, Map<Id, Integer>> counts = new Map<String, Map<Id, Integer>>();
    for (Integer i = 0; i < items.size(); i++) {
      if (!counts.containsKey(slots[i])) {
        counts.put(slots[i], new Map<Id, Integer>());
      }
      Map<Id, Integer> here = counts.get(slots[i]);
      for (Id place : places.of(items[i])) {
        here.put(place, (here.containsKey(place) ? here.get(place) : 0) + 1);
      }
    }
    return over(counts);
  }

  private void readDay(ScheduleDays.DayGrid day) {
    for (Integer b = 0; b < day.grid.blocks.size(); b++) {
      String slot = ElectiveTimes.slotOf(day.day, day.grid.blocks[b].id);
      if (!periodBySlot.containsKey(slot)) {
        continue;
      }
      for (Integer g = 0; g < day.grid.groups.size(); g++) {
        ScheduleGrid.Item item = GridItems.itemAt(day.grid, g, b);
        if (item != null && GridItems.isId(item.id)) {
          slots.add(slot);
          items.add(item);
        }
      }
    }
  }

  private List<String> over(Map<String, Map<Id, Integer>> counts) {
    Set<Id> placeIds = new Set<Id>();
    for (Map<Id, Integer> here : counts.values()) {
      placeIds.addAll(here.keySet());
    }
    Map<Id, Location__c> places = new Map<Id, Location__c>(
      [
        SELECT Id, Name, GroupsThatFit__c
        FROM Location__c
        WHERE Id IN :placeIds
        WITH USER_MODE
      ]
    );
    List<String> result = new List<String>();
    for (ElectivePeriod at : state.live.periods) {
      Map<Id, Integer> here = counts.remove(
        ElectiveTimes.slotOf(at.day, at.blockId)
      );
      if (here != null) {
        result.addAll(overAt(at, here, places));
      }
    }
    return result;
  }

  private static List<String> overAt(
    ElectivePeriod at,
    Map<Id, Integer> here,
    Map<Id, Location__c> places
  ) {
    List<String> names = new List<String>();
    for (Id place : here.keySet()) {
      Location__c location = places.get(place);
      if (location != null && here.get(place) > fitOf(location)) {
        names.add(location.Name);
      }
    }
    names.sort();
    List<String> result = new List<String>();
    for (String name : names) {
      result.add(name + ', ' + at.words());
    }
    return result;
  }

  private static Integer fitOf(Location__c location) {
    Decimal fit = location.GroupsThatFit__c;
    return fit == null || fit < 1 ? 1 : fit.intValue();
  }
}
