/**
 * A location with more groups at once than fit there, counting the groups each fixed or
 * recurring activity brings (only those at camp in each time block). Locations belong to the
 * season and programs keep their own time blocks, so "at once" means clock times that overlap,
 * on the same day of the same week. A location closed that week, or a group away that week, is
 * not counted.
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
      if (!result.containsKey(item.locationId)) {
        result.put(item.locationId, new List<Visit>());
      }
      Set<Integer> everyDay = new Set<Integer>(item.span());
      for (Integer block : item.widest()) {
        Visit visit = new Visit(
          item,
          item.program.blocks[block],
          item.groupsIn(block)
        );
        // A block it holds only on its early day (CORE-3.7).
        visit.onlyOn = everyDay.contains(block) ? null : item.earlyDay;
        result.get(item.locationId).add(visit);
      }
    }
    return result;
  }

  /** The visits that day and week, each counting only the groups there that week. */
  private List<Visit> during(List<Visit> visits, String day, Id week) {
    List<Visit> result = new List<Visit>();
    for (Visit visit : visits) {
      if (
        visit.item.weekIds.contains(week) &&
        !plan.isOff(visit.item.locationId, week) &&
        visit.item.runDays().contains(day) &&
        (visit.onlyOn == null ||
        visit.onlyOn == day)
      ) {
        visit.count = 0;
        for (Group__c grp : visit.groups) {
          visit.count += plan.isOff(grp.Id, week) ? 0 : 1;
        }
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
      SetTimeClash clash = atStartOf(visit, visits);
      if (
        clash.count > location.GroupsThatFit__c &&
        (busiest == null ||
        clash.count > busiest.count)
      ) {
        clash.location = location;
        busiest = clash;
      }
    }
    return busiest;
  }

  /** Who is at the location when a visit starts: how many groups, from which items. */
  private SetTimeClash atStartOf(Visit visit, List<Visit> visits) {
    SetTimeClash clash = new SetTimeClash(
      SetTimeClash.Kind.OVER_LOCATION,
      visit.item
    );
    clash.count = 0;
    clash.blockName = visit.block.Name;
    clash.day = day;
    clash.weekName = plan.weekNames.get(week);
    for (Visit other : visits) {
      if (other.count > 0 && other.overlapsStartOf(visit)) {
        clash.count += other.count;
        if (!clash.names.contains(other.item.name)) {
          clash.names.add(other.item.name);
        }
      }
    }
    return clash;
  }

  private class Visit {
    SetTimePlan.Item item;
    TimeBlock__c block;
    List<Group__c> groups;
    // How many of its groups are there in the week being looked at.
    Integer count = 0;
    // The one day it is there (a fixed activity's early day), or null for every day it runs.
    String onlyOn;

    Visit(SetTimePlan.Item item, TimeBlock__c block, List<Group__c> groups) {
      this.item = item;
      this.block = block;
      this.groups = groups;
    }

    /** Whether this visit is under way when the other one starts. */
    Boolean overlapsStartOf(Visit other) {
      return block.StartTime__c <= other.block.StartTime__c &&
        block.EndTime__c > other.block.StartTime__c;
    }
  }
}
