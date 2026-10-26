/**
 * Where what is placed on a schedule takes place (electives slice E7; repo ADR 0018 choice 33), for
 * Finalize's double-booking check (ElectivePlaceClashes): an activity, fixed or recurring activity
 * at its place; an elective set at each place of its confirmed, open offerings, once per set (as
 * the week editor counts it, ADR 0018 choice 24, and the desktop's electiveOccupancy.js). Four
 * queries for any number of items.
 */
public with sharing class ElectivePlaces {
  private Map<Id, Id> placeOf = new Map<Id, Id>();
  private Map<Id, List<Id>> placesOfSet = new Map<Id, List<Id>>();

  /** items: what is placed, each with a record Id. */
  public ElectivePlaces(List<ScheduleGrid.Item> items) {
    Map<String, Set<Id>> idsByKind = new Map<String, Set<Id>>{
      'A' => new Set<Id>(),
      'F' => new Set<Id>(),
      'R' => new Set<Id>(),
      ElectiveTimes.ELECTIVE => new Set<Id>()
    };
    for (ScheduleGrid.Item item : items) {
      if (idsByKind.containsKey(item.kind)) {
        idsByKind.get(item.kind).add(Id.valueOf(item.id));
      }
    }
    readPlaces(idsByKind);
    readSets(idsByKind.get(ElectiveTimes.ELECTIVE));
  }

  private void readPlaces(Map<String, Set<Id>> idsByKind) {
    Set<Id> activityIds = idsByKind.get('A');
    Set<Id> fixedIds = idsByKind.get('F');
    Set<Id> recurringIds = idsByKind.get('R');
    for (Activity__c activity : [
      SELECT Id, Location__c
      FROM Activity__c
      WHERE Id IN :activityIds
      WITH USER_MODE
    ]) {
      placeOf.put(activity.Id, activity.Location__c);
    }
    for (FixedActivity__c fixed : [
      SELECT Id, Location__c
      FROM FixedActivity__c
      WHERE Id IN :fixedIds
      WITH USER_MODE
    ]) {
      placeOf.put(fixed.Id, fixed.Location__c);
    }
    for (RecurringActivity__c recurring : [
      SELECT Id, Location__c
      FROM RecurringActivity__c
      WHERE Id IN :recurringIds
      WITH USER_MODE
    ]) {
      placeOf.put(recurring.Id, recurring.Location__c);
    }
  }

  private void readSets(Set<Id> setIds) {
    for (Offering__c offering : [
      SELECT ElectiveSet__c, Activity__r.Location__c
      FROM Offering__c
      WHERE ElectiveSet__c IN :setIds AND Proposed__c = FALSE
      WITH USER_MODE
      ORDER BY ElectiveSet__c, Activity__r.Name, Id
    ]) {
      addSetPlace(offering);
    }
  }

  /**
   * A confirmed offering's place counts for its set, whatever its seats: 0 or blank seats don't
   * close it (Greg, 2026-10-26: the seat run uses no limit and says so).
   */
  private void addSetPlace(Offering__c offering) {
    Id place = offering.Activity__r?.Location__c;
    if (place == null) {
      return;
    }
    if (!placesOfSet.containsKey(offering.ElectiveSet__c)) {
      placesOfSet.put(offering.ElectiveSet__c, new List<Id>());
    }
    List<Id> places = placesOfSet.get(offering.ElectiveSet__c);
    if (!places.contains(place)) {
      places.add(place);
    }
  }

  /** The places an item takes up (none when it has no place). */
  public List<Id> of(ScheduleGrid.Item item) {
    Id itemId = Id.valueOf(item.id);
    if (item.kind == ElectiveTimes.ELECTIVE) {
      return placesOfSet.containsKey(itemId)
        ? placesOfSet.get(itemId)
        : new List<Id>();
    }
    Id place = placeOf.get(itemId);
    return place == null ? new List<Id>() : new List<Id>{ place };
  }
}
