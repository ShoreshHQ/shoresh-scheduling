/**
 * For AgentFixedOver (API-1.147): the recurring activities a fixed activity would share a time
 * block with, for the same groups on the same day in a week both run, and the runs of time blocks
 * each keeps, as fixedOver.js finds them (CORE-3.9).
 */
public with sharing class AgentFixedOverLandings {
  /** One recurring activity the fixed activity lands on. */
  public class Landing {
    public RecurringActivity__c item;
    // The blocks it shares with the fixed activity, and the days it does.
    public List<Integer> at = new List<Integer>();
    public List<String> days = new List<String>();
    // Each run it keeps: [first block, length, end].
    public List<Integer[]> pieces = new List<Integer[]>();
  }

  /** Those it lands on; null when one sits only in its blocks and can't go around it. */
  public static List<Landing> of(AgentFixedOverPlan plan) {
    List<Landing> result = new List<Landing>();
    for (RecurringActivity__c item : plan.entry.recurringActivities) {
      Landing landing = landingOf(plan, item);
      if (landing == null) {
        continue;
      }
      if (landing.pieces.isEmpty()) {
        return null;
      }
      result.add(landing);
    }
    return result;
  }

  /** Where the fixed activity lands on this one; null when they never meet. */
  private static Landing landingOf(
    AgentFixedOverPlan plan,
    RecurringActivity__c item
  ) {
    Integer first = plan.indexOf(item.TimeBlock__c);
    if (first < 0 || !plan.weeks.sharedWith(item.Id)) {
      return null;
    }
    List<String> days = daysOf(plan, item);
    Integer span = Math.min(
      first + AgentFixedOverPlan.wholeOr(item.Length__c, 1),
      plan.blocks.size()
    );
    Landing landing = new Landing();
    landing.item = item;
    for (Integer b = first; b < span; b++) {
      if (heldAt(plan, days, b) && coversSomeoneAt(plan, item, b)) {
        landing.at.add(b);
      } else {
        keep(landing.pieces, b);
      }
    }
    if (landing.at.isEmpty()) {
      return null;
    }
    for (String day : days) {
      if (holdsAny(plan, day, landing.at)) {
        landing.days.add(day);
      }
    }
    return landing;
  }

  /** The days it is ticked that its program runs. */
  private static List<String> daysOf(
    AgentFixedOverPlan plan,
    RecurringActivity__c item
  ) {
    List<String> result = new List<String>();
    for (String day : SetTimePlan.WEEKDAYS) {
      Schema.SObjectField field = SetTimePlan.dayField(
        RecurringActivity__c.SObjectType,
        day
      );
      if (item.get(field) == true && plan.runs(day)) {
        result.add(day);
      }
    }
    return result;
  }

  /** Block b joins the run it follows, or starts one. */
  private static void keep(List<Integer[]> pieces, Integer b) {
    Integer[] last = pieces.isEmpty() ? null : pieces[pieces.size() - 1];
    if (last != null && last[2] == b) {
      last[1] = last[1] + 1;
      last[2] = last[2] + 1;
    } else {
      pieces.add(new List<Integer>{ b, 1, b + 1 });
    }
  }

  /** Whether the fixed activity holds block b on any of these days. */
  private static Boolean heldAt(
    AgentFixedOverPlan plan,
    List<String> days,
    Integer b
  ) {
    for (String day : days) {
      if (plan.holds(day, b)) {
        return true;
      }
    }
    return false;
  }

  /** Whether the fixed activity holds any of these blocks on a day. */
  private static Boolean holdsAny(
    AgentFixedOverPlan plan,
    String day,
    List<Integer> blocks
  ) {
    for (Integer b : blocks) {
      if (plan.holds(day, b)) {
        return true;
      }
    }
    return false;
  }

  /** As c/shoreshSetupRules coversSomeoneAt: a group it covers is at camp in block b. */
  private static Boolean coversSomeoneAt(
    AgentFixedOverPlan plan,
    RecurringActivity__c item,
    Integer b
  ) {
    Set<Id> named = new Set<Id>();
    for (Coverage__c row : item.Coverages__r) {
      named.add(row.Division__c != null ? row.Division__c : row.Group__c);
    }
    TimeBlock__c block = plan.blocks[b];
    for (SeasonSetupReader.DivisionSetup division : plan.entry.divisions) {
      for (Group__c grp : division.groups) {
        if (
          isCovered(named, division.division.Id, grp.Id) &&
          SetTimePlan.atCamp(grp, block)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /** Covered: it names no one (everyone), or names the group or its division. */
  private static Boolean isCovered(Set<Id> named, Id divisionId, Id groupId) {
    return named.isEmpty() ||
      named.contains(groupId) ||
      named.contains(divisionId);
  }
}
