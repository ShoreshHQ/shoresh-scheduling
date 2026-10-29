/**
 * Other programs' fixed and recurring activities with a place, where setup puts them, for
 * OtherProgramUse, on each day of the week their program has no published schedule for. The
 * same rules as Start a blank week and setup's clash check (SetTimePlan): a fixed activity takes
 * every group of its program on every day it runs, a recurring one the groups it covers (all
 * when it names none) on the days ticked; only groups at camp in each time block; it runs to the
 * end of the day at most. A group away, the place closed, or the activity off that week doesn't
 * count. At most two queries in user mode, none when no other program has one.
 */
public with sharing class OtherProgramSetTime {
  private final OtherProgramUse tally;
  // "programId|date" of the days a published schedule already counted.
  private final Set<String> published;

  public OtherProgramSetTime(OtherProgramUse tally, Set<String> published) {
    this.tally = tally;
    this.published = published;
  }

  /** others: the other programs with their time blocks, fixed and recurring activities. */
  public void add(Map<Id, Program__c> others) {
    List<RecurringActivity__c> recurring = new List<RecurringActivity__c>();
    Integer fixedCount = 0;
    for (Program__c other : others.values()) {
      fixedCount += other.FixedActivities__r.size();
      recurring.addAll(other.RecurringActivities__r);
    }
    if (fixedCount == 0 && recurring.isEmpty()) {
      return;
    }
    Map<Id, SetTimePlan.ProgramPlan> plans = plansOf(others);
    Map<Id, Set<Id>> covered = coverageOf(recurring);
    for (Program__c other : others.values()) {
      SetTimePlan.ProgramPlan plan = plans.get(other.Id);
      for (FixedActivity__c record : other.FixedActivities__r) {
        SetTimePlan.Item item = itemOf(record, plan);
        item.days.addAll(plan.days);
        item.groupIds.addAll(new Map<Id, Group__c>(plan.groups).keySet());
        addItem(item);
      }
      for (RecurringActivity__c record : other.RecurringActivities__r) {
        SetTimePlan.Item item = itemOf(record, plan);
        item.days.addAll(daysTicked(record));
        item.groupIds.addAll(coveredGroups(plan, covered.get(record.Id)));
        addItem(item);
      }
    }
  }

  private static List<String> daysTicked(RecurringActivity__c record) {
    List<String> days = new List<String>();
    for (String weekday : SetTimePlan.WEEKDAYS) {
      Schema.SObjectField ticked = SetTimePlan.dayField(
        RecurringActivity__c.SObjectType,
        weekday
      );
      if ((Boolean) record.get(ticked) == true) {
        days.add(weekday);
      }
    }
    return days;
  }

  /** The program's groups a recurring activity covers: those named, or all when none is. */
  private static Set<Id> coveredGroups(
    SetTimePlan.ProgramPlan plan,
    Set<Id> named
  ) {
    Set<Id> result = new Set<Id>();
    for (Group__c grp : plan.groups) {
      if (
        named == null ||
        named.contains(grp.Id) ||
        named.contains(grp.Division__c)
      ) {
        result.add(grp.Id);
      }
    }
    return result;
  }

  private static SetTimePlan.Item itemOf(
    SObject record,
    SetTimePlan.ProgramPlan plan
  ) {
    SetTimePlan.ItemFields f = SetTimePlan.fieldsOf(record.getSObjectType());
    SetTimePlan.Item item = new SetTimePlan.Item();
    item.record = record;
    item.program = plan;
    item.start = plan.blockIndex.get((Id) record.get(f.timeBlock));
    Decimal length = (Decimal) record.get(f.length);
    item.length = length == null ? 1 : length.intValue();
    item.locationId = (Id) record.get(f.location);
    // A fixed activity's early day (CORE-3.7).
    if (record instanceof FixedActivity__c) {
      FixedActivity__c fixed = (FixedActivity__c) record;
      item.earlyDay = fixed.EarlyDay__c;
      item.early = fixed.EarlyBlocks__c == null
        ? 0
        : fixed.EarlyBlocks__c.intValue();
    }
    return item;
  }

  /** Each day of the week the item runs, unless a published schedule already counted it. */
  private void addItem(SetTimePlan.Item item) {
    if (
      item.start == null ||
      tally.isOff(item.record.Id) ||
      tally.isOff(item.locationId)
    ) {
      return;
    }
    List<String> runs = item.runDays();
    for (
      Date day = tally.week.StartDate__c;
      day <= tally.week.EndDate__c;
      day = day.addDays(1)
    ) {
      String key = item.program.program.Id + '|' + String.valueOf(day);
      if (runs.contains(BlankWeek.weekdayOf(day)) && !published.contains(key)) {
        addDay(item, day);
      }
    }
  }

  /** Each time block it takes that day, with the groups there that aren't away. */
  private void addDay(SetTimePlan.Item item, Date day) {
    for (Integer b : item.span(BlankWeek.weekdayOf(day))) {
      TimeBlock__c block = item.program.blocks[b];
      OtherProgramUse.Entry entry = OtherProgramUse.at(
        day,
        BlankWeek.clock(block.StartTime__c),
        BlankWeek.clock(block.EndTime__c)
      );
      entry.locationId = item.locationId;
      tally.name(entry, item.record.Id);
      for (Group__c grp : item.groupsIn(b)) {
        entry.groups += tally.isOff(grp.Id) ? 0 : 1;
      }
      tally.add(entry);
    }
  }

  /** The other programs' time blocks (in time order, as SetTimePlanReader has them) and groups. */
  private static Map<Id, SetTimePlan.ProgramPlan> plansOf(
    Map<Id, Program__c> others
  ) {
    Map<Id, SetTimePlan.ProgramPlan> plans = new Map<Id, SetTimePlan.ProgramPlan>();
    for (Program__c other : others.values()) {
      SetTimePlan.ProgramPlan plan = new SetTimePlan.ProgramPlan(other);
      for (TimeBlock__c block : other.TimeBlocks__r) {
        plan.addBlock(block);
      }
      plans.put(other.Id, plan);
    }
    for (Group__c grp : [
      SELECT Id, Availability__c, Division__c, Division__r.Program__c
      FROM Group__c
      WHERE Division__r.Program__c IN :others.keySet()
      WITH USER_MODE
      ORDER BY Id
    ]) {
      plans.get(grp.Division__r.Program__c).groups.add(grp);
    }
    return plans;
  }

  /** Each recurring activity's named divisions and groups (one naming none isn't listed). */
  private static Map<Id, Set<Id>> coverageOf(
    List<RecurringActivity__c> recurring
  ) {
    Map<Id, Set<Id>> result = new Map<Id, Set<Id>>();
    if (recurring.isEmpty()) {
      return result;
    }
    Set<Id> recurringIds = new Map<Id, RecurringActivity__c>(recurring)
      .keySet();
    for (Coverage__c row : [
      SELECT RecurringActivity__c, Division__c, Group__c
      FROM Coverage__c
      WHERE RecurringActivity__c IN :recurringIds
      WITH USER_MODE
      ORDER BY Id
    ]) {
      if (!result.containsKey(row.RecurringActivity__c)) {
        result.put(row.RecurringActivity__c, new Set<Id>());
      }
      Set<Id> named = result.get(row.RecurringActivity__c);
      named.add(row.Division__c != null ? row.Division__c : row.Group__c);
    }
    return result;
  }
}
