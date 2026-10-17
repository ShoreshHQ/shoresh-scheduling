/**
 * Manual Build's "Start a blank week" (desktop placeFixedEvents): one grid per day the program runs
 * in the week, with the program's time blocks, its groups that are at camp that week, and its fixed
 * and recurring activities placed where setup puts them. Everything else is Open. The same setup
 * always gives the same grids. Setup is read in user mode (ProgramReads); where the set-time items
 * fall is slice 3b's SetTimePlan.
 */
public with sharing class BlankWeek {
  // 1 January 1900 was a Monday.
  private static final Date A_MONDAY = Date.newInstance(1900, 1, 1);
  private static final List<String> ALL_DAYS = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  };

  private List<TimeBlock__c> blocks;
  private List<Group__c> groups;
  private List<SetTimePlan.Item> items;

  /** The week's days, ready to save into a new schedule. */
  public static List<ScheduleDaySaves.DaySave> days(Id programId, Id weekId) {
    Program__c program = ProgramReads.programOf(programId);
    Week__c week = ProgramReads.weekOf(weekId, program);
    BlankWeek blank = new BlankWeek();
    blank.blocks = checkedBlocks(program);
    blank.groups = checkedGroups(program, week);
    blank.items = setTimeItems(program, weekId);
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    for (Date day : runDays(program, week)) {
      saves.add(
        new ScheduleDaySaves.DaySave(day, blank.grid(weekdayOf(day)), null)
      );
    }
    return saves;
  }

  /** "Monday" for a date, whatever the user's language. */
  public static String weekdayOf(Date day) {
    return ALL_DAYS[Math.mod(A_MONDAY.daysBetween(day), 7)];
  }

  /** "HH:mm" for a time block's start or end. */
  public static String clock(Time value) {
    return value == null ? '' : String.valueOf(value).left(5);
  }

  /** The days of the week the program runs. */
  private static List<Date> runDays(Program__c program, Week__c week) {
    List<Date> result = new List<Date>();
    for (
      Date day = week.StartDate__c; day <= week.EndDate__c; day = day.addDays(1)
    ) {
      if (runsOn(program, weekdayOf(day))) {
        result.add(day);
      }
    }
    if (result.isEmpty()) {
      throw new ShoreshException(
        program.Name + ' does not run on any day of ' + week.Name + '.'
      );
    }
    return result;
  }

  private static Boolean runsOn(Program__c program, String weekday) {
    return SetTimePlan.WEEKDAYS.contains(weekday) &&
      (Boolean) program.get(
        SetTimePlan.dayField(Program__c.SObjectType, weekday)
      ) == true;
  }

  private static List<TimeBlock__c> checkedBlocks(Program__c program) {
    List<TimeBlock__c> result = ProgramReads.blocksOf(program.Id);
    if (result.isEmpty()) {
      CampLabels labels = CampLabels.forCamp(program.Season__r.Camp__c);
      throw new ShoreshException(
        'Add ' +
          labels.pluralInSentence('TimeBlock') +
          ' to ' +
          program.Name +
          ' first.'
      );
    }
    return result;
  }

  private static List<Group__c> checkedGroups(
    Program__c program,
    Week__c week
  ) {
    List<Group__c> result = ProgramReads.groupsAtCamp(program.Id, week.Id);
    if (result.isEmpty()) {
      CampLabels labels = CampLabels.forCamp(program.Season__r.Camp__c);
      throw new ShoreshException(
        'No ' +
          labels.pluralInSentence('Group') +
          ' of ' +
          program.Name +
          ' are at camp in ' +
          week.Name +
          '.'
      );
    }
    return result;
  }

  private ScheduleGrid grid(String weekday) {
    BlankDay day = new BlankDay(blocks, groups);
    for (SetTimePlan.Item item : items) {
      if (item.runDays().contains(weekday)) {
        day.place(item);
      }
    }
    return day.grid;
  }

  /**
   * The program's fixed and recurring activities that run this week. SetTimePlanReader reads in
   * system mode (it backs the clash check); here the scheduler must be able to read both kinds.
   */
  private static List<SetTimePlan.Item> setTimeItems(
    Program__c program,
    Id weekId
  ) {
    if (
      !FixedActivity__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED)
        .isAccessible() ||
      !RecurringActivity__c.SObjectType.getDescribe(
          SObjectDescribeOptions.DEFERRED
        )
        .isAccessible()
    ) {
      throw new ShoreshException(
        'You don\'t have access to this camp\'s set times. Ask a Salesforce admin.'
      );
    }
    SetTimePlan plan = SetTimePlanReader.read(new Set<Id>{ program.Season__c })
      .get(program.Season__c);
    List<SetTimePlan.Item> result = new List<SetTimePlan.Item>();
    for (
      SetTimePlan.Item item : plan == null
        ? new List<SetTimePlan.Item>()
        : plan.items
    ) {
      if (
        item.program.program.Id == program.Id &&
        item.weekIds.contains(weekId) &&
        item.start != null
      ) {
        result.add(item);
      }
    }
    return result;
  }
}
