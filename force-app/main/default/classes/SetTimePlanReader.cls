/**
 * Builds a SetTimePlan for each season that has fixed or recurring activities. System mode on
 * purpose: the clash check is a backstop that must see every record in the season, including
 * any the person saving cannot see.
 */
public with sharing class SetTimePlanReader {
  private final Map<Id, SetTimePlan> plans = new Map<Id, SetTimePlan>();
  private final Map<Id, SetTimePlan.ProgramPlan> programs = new Map<Id, SetTimePlan.ProgramPlan>();
  private final Map<Id, Id> seasonByProgram = new Map<Id, Id>();

  /** Season Id => its plan, only for seasons with at least one fixed or recurring activity. */
  public static Map<Id, SetTimePlan> read(Set<Id> seasonIds) {
    SetTimePlanReader reader = new SetTimePlanReader();
    List<FixedActivity__c> fixed = [
      SELECT
        Id,
        Name,
        Program__c,
        Program__r.Season__c,
        TimeBlock__c,
        Length__c,
        Location__c,
        (SELECT Week__c FROM WeekExceptions__r)
      FROM FixedActivity__c
      WHERE Program__r.Season__c IN :seasonIds
      WITH SYSTEM_MODE
      ORDER BY
        Program__r.SortOrder__c NULLS LAST,
        SortOrder__c NULLS LAST,
        Name,
        Id
    ];
    List<RecurringActivity__c> recurring = [
      SELECT
        Id,
        Name,
        Program__c,
        Program__r.Season__c,
        TimeBlock__c,
        Length__c,
        Location__c,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c,
        (SELECT Week__c FROM WeekExceptions__r),
        (SELECT Division__c, Group__c FROM Coverages__r)
      FROM RecurringActivity__c
      WHERE Program__r.Season__c IN :seasonIds
      WITH SYSTEM_MODE
      ORDER BY
        Program__r.SortOrder__c NULLS LAST,
        SortOrder__c NULLS LAST,
        Name,
        Id
    ];
    Set<Id> used = new Set<Id>();
    for (FixedActivity__c item : fixed) {
      used.add(item.Program__r.Season__c);
    }
    for (RecurringActivity__c item : recurring) {
      used.add(item.Program__r.Season__c);
    }
    if (used.isEmpty()) {
      return reader.plans;
    }
    reader.readSeasons(used);
    reader.readPrograms(used);
    for (FixedActivity__c item : fixed) {
      reader.addFixed(item);
    }
    for (RecurringActivity__c item : recurring) {
      reader.addRecurring(item);
    }
    return reader.plans;
  }

  private void readSeasons(Set<Id> seasonIds) {
    for (Season__c season : [
      SELECT Id, Camp__c
      FROM Season__c
      WHERE Id IN :seasonIds
      WITH SYSTEM_MODE
    ]) {
      SetTimePlan plan = new SetTimePlan();
      plan.campId = season.Camp__c;
      plans.put(season.Id, plan);
    }
    for (Week__c week : [
      SELECT Id, Name, Season__c
      FROM Week__c
      WHERE Season__c IN :seasonIds
      WITH SYSTEM_MODE
      ORDER BY StartDate__c, SortOrder__c, Id
    ]) {
      plans.get(week.Season__c).weekIds.add(week.Id);
      plans.get(week.Season__c).weekNames.put(week.Id, week.Name);
    }
    for (Id seasonId : plans.keySet()) {
      if (plans.get(seasonId).weekIds.isEmpty()) {
        plans.get(seasonId).weekIds.add(seasonId);
      }
    }
    for (Location__c location : [
      SELECT Id, Name, Season__c, GroupsThatFit__c
      FROM Location__c
      WHERE Season__c IN :seasonIds
      WITH SYSTEM_MODE
    ]) {
      plans.get(location.Season__c).locations.put(location.Id, location);
    }
  }

  private void readPrograms(Set<Id> seasonIds) {
    for (Program__c program : [
      SELECT
        Id,
        Name,
        Season__c,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c,
        (
          SELECT Id, Name, StartTime__c, EndTime__c, PartOfDay__c
          FROM TimeBlocks__r
          ORDER BY StartTime__c, SortOrder__c, Id
        )
      FROM Program__c
      WHERE Season__c IN :seasonIds
      WITH SYSTEM_MODE
    ]) {
      SetTimePlan.ProgramPlan plan = new SetTimePlan.ProgramPlan(program);
      for (TimeBlock__c block : program.TimeBlocks__r) {
        plan.addBlock(block);
      }
      programs.put(program.Id, plan);
      seasonByProgram.put(program.Id, program.Season__c);
    }
    for (Group__c grp : [
      SELECT Id, Name, Availability__c, Division__c, Division__r.Program__c
      FROM Group__c
      WHERE Division__r.Program__r.Season__c IN :seasonIds
      WITH SYSTEM_MODE
      ORDER BY
        Division__r.SortOrder__c NULLS LAST,
        Division__r.Name,
        SortOrder__c NULLS LAST,
        Name,
        Id
    ]) {
      programs.get(grp.Division__r.Program__c).groups.add(grp);
    }
  }

  private SetTimePlan.Item itemFor(SObject record, String term) {
    Id programId = (Id) record.get('Program__c');
    SetTimePlan plan = plans.get(seasonByProgram.get(programId));
    SetTimePlan.Item item = new SetTimePlan.Item();
    item.record = record;
    item.term = term;
    item.name = (String) record.get('Name');
    item.program = programs.get(programId);
    item.start = item.program.blockIndex.get((Id) record.get('TimeBlock__c'));
    Decimal length = (Decimal) record.get('Length__c');
    item.length = length == null ? 1 : length.intValue();
    item.locationId = (Id) record.get('Location__c');
    Set<Id> weeksOff = new Set<Id>();
    for (
      WeekException__c mark : record.getSObjects('WeekExceptions__r') == null
        ? new List<WeekException__c>()
        : (List<WeekException__c>) record.getSObjects('WeekExceptions__r')
    ) {
      weeksOff.add(mark.Week__c);
    }
    for (Id weekId : plan.weekIds) {
      if (!weeksOff.contains(weekId)) {
        item.weekIds.add(weekId);
      }
    }
    plan.items.add(item);
    return item;
  }

  private void addFixed(FixedActivity__c record) {
    SetTimePlan.Item item = itemFor(record, 'FixedActivity');
    for (String day : SetTimePlan.WEEKDAYS) {
      if (item.program.days.contains(day)) {
        item.days.add(day);
      }
    }
    for (Group__c grp : item.program.groups) {
      item.groupIds.add(grp.Id);
    }
  }

  private void addRecurring(RecurringActivity__c record) {
    SetTimePlan.Item item = itemFor(record, 'RecurringActivity');
    for (String day : SetTimePlan.WEEKDAYS) {
      if ((Boolean) record.get(day + '__c') == true) {
        item.days.add(day);
      }
    }
    Set<Id> named = new Set<Id>();
    for (Coverage__c row : record.Coverages__r) {
      named.add(row.Division__c);
      named.add(row.Group__c);
    }
    for (Group__c grp : item.program.groups) {
      if (
        named.isEmpty() ||
        named.contains(grp.Id) ||
        named.contains(grp.Division__c)
      ) {
        item.groupIds.add(grp.Id);
      }
    }
  }
}
