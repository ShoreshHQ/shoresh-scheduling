/**
 * A location with more groups at once than fit there, counting the groups each fixed or
 * recurring activity brings (only those at camp in each time block). Locations belong to the
 * season and programs keep their own time blocks, so "at once" means clock times that overlap,
 * on the same day of the same week.
 */
public with sharing class SetTimeLocationClashes {
  private final SetTimePlan plan;
  // The day and week being looked at.
  private String day;
  private Id week;

  private SetTimeLocationClashes(SetTimePlan plan) {
    this.plan = plan;
  }

  public static SetTimeClash first(SetTimePlan plan) {
    SetTimeLocationClashes finder = new SetTimeLocationClashes(plan);
    Map<Id, List<Visit>> visits = finder.visitsByLocation();
    for (Id locationId : visits.keySet()) {
      for (Id week : plan.weekIds) {
        for (String day : SetTimePlan.WEEKDAYS) {
          finder.day = day;
          finder.week = week;
          SetTimeClash clash = finder.crowded(
            plan.locations.get(locationId),
            finder.during(visits.get(locationId), day, week)
          );
          if (clash != null) {
            return clash;
          }
        }
      }
    }
    return null;
  }

  /** Each item's time at its location, one visit per time block with how many groups come. */
  private Map<Id, List<Visit>> visitsByLocation() {
    Map<Id, List<Visit>> result = new Map<Id, List<Visit>>();
    for (SetTimePlan.Item item : plan.items) {
      if (
        item.locationId == null || !plan.locations.containsKey(item.locationId)
      ) {
        continue;
      }
      for (Integer block : item.span()) {
        Integer count = item.groupsIn(block).size();
        if (count > 0) {
          if (!result.containsKey(item.locationId)) {
            result.put(item.locationId, new List<Visit>());
          }
          result.get(item.locationId)
            .add(new Visit(item, item.program.blocks[block], count));
        }
      }
    }
    return result;
  }

  private List<Visit> during(List<Visit> visits, String day, Id week) {
    List<Visit> result = new List<Visit>();
    for (Visit visit : visits) {
      if (
        visit.item.weekIds.contains(week) && visit.item.runDays().contains(day)
      ) {
        result.add(visit);
      }
    }
    return result;
  }

  /**
   * The busiest moment is when some visit starts: count everyone there then, and report the
   * busiest, so "keep it at N or more" names enough.
   */
  private SetTimeClash crowded(Location__c location, List<Visit> visits) {
    SetTimeClash busiest;
    for (Visit visit : visits) {
      Integer count = 0;
      List<String> names = new List<String>();
      for (Visit other : visits) {
        if (other.overlapsStartOf(visit)) {
          count += other.count;
          if (!names.contains(other.item.name)) {
            names.add(other.item.name);
          }
        }
      }
      if (
        count > location.GroupsThatFit__c &&
        (busiest == null ||
        count > busiest.count)
      ) {
        SetTimeClash clash = new SetTimeClash(
          SetTimeClash.Kind.OVER_LOCATION,
          visit.item
        );
        clash.location = location;
        clash.count = count;
        clash.names = names;
        clash.blockName = visit.block.Name;
        clash.day = day;
        clash.weekName = plan.weekNames.get(week);
        busiest = clash;
      }
    }
    return busiest;
  }

  private class Visit {
    SetTimePlan.Item item;
    TimeBlock__c block;
    Integer count;

    Visit(SetTimePlan.Item item, TimeBlock__c block, Integer count) {
      this.item = item;
      this.block = block;
      this.count = count;
    }

    /** Whether this visit is under way when the other one starts. */
    Boolean overlapsStartOf(Visit other) {
      return block.StartTime__c <= other.block.StartTime__c &&
        block.EndTime__c > other.block.StartTime__c;
    }
  }
}
