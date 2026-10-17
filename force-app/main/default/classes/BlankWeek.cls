/**
 * Manual Build's "Start a blank week" (desktop placeFixedEvents): one grid per day the program runs
 * in the week, with the program's time blocks, its groups that are at camp that week, and its fixed
 * and recurring activities placed where setup puts them. Everything else is Open. The same setup
 * always gives the same grids. Setup is read in user mode; where the set-time items fall is slice
 * 3b's SetTimePlan.
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

  /** The week's days, ready to save into a new schedule. */
  public static List<ScheduleDaySaves.DaySave> days(Id programId, Id weekId) {
    Program__c program = programOf(programId);
    Week__c week = weekOf(weekId, program);
    CampLabels labels = CampLabels.forCamp(program.Season__r.Camp__c);
    List<TimeBlock__c> blocks = blocksOf(programId);
    if (blocks.isEmpty()) {
      throw new ShoreshException(
        'Add ' +
          labels.pluralInSentence('TimeBlock') +
          ' to ' +
          program.Name +
          ' first.'
      );
    }
    List<Group__c> groups = groupsAtCamp(programId, weekId);
    if (groups.isEmpty()) {
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
    List<SetTimePlan.Item> items = setTimeItems(program, weekId);
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    for (
      Date day = week.StartDate__c; day <= week.EndDate__c; day = day.addDays(1)
    ) {
      String weekday = weekdayOf(day);
      if (
        SetTimePlan.WEEKDAYS.contains(weekday) &&
        (Boolean) program.get(
          SetTimePlan.dayField(Program__c.SObjectType, weekday)
        ) == true
      ) {
        saves.add(
          new ScheduleDaySaves.DaySave(
            day,
            grid(blocks, groups, items, weekday),
            null
          )
        );
      }
    }
    if (saves.isEmpty()) {
      throw new ShoreshException(
        program.Name + ' does not run on any day of ' + week.Name + '.'
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

  private static ScheduleGrid grid(
    List<TimeBlock__c> blocks,
    List<Group__c> groups,
    List<SetTimePlan.Item> items,
    String weekday
  ) {
    ScheduleGrid grid = new ScheduleGrid();
    Map<Id, Integer> blockIndex = new Map<Id, Integer>();
    for (TimeBlock__c block : blocks) {
      blockIndex.put(block.Id, grid.blocks.size());
      grid.blocks.add(
        new ScheduleGrid.Block(block.Id, block.Name)
          .at(clock(block.StartTime__c), clock(block.EndTime__c))
      );
    }
    Map<Id, Integer> groupIndex = new Map<Id, Integer>();
    for (Group__c grp : groups) {
      groupIndex.put(grp.Id, grid.groups.size());
      grid.groups.add(new ScheduleGrid.GroupRef(grp.Id, grp.Name));
      List<String> row = new List<String>();
      for (TimeBlock__c block : blocks) {
        row.add('');
      }
      grid.rows.add(row);
    }
    for (SetTimePlan.Item item : items) {
      if (item.runDays().contains(weekday)) {
        place(grid, item, blockIndex, groupIndex);
      }
    }
    return grid;
  }

  /**
   * One fixed or recurring activity, in every group it takes. A cell already taken is left as it
   * is: setup refuses such clashes (slice 3b), so it only happens with setup saved around them.
   */
  private static void place(
    ScheduleGrid grid,
    SetTimePlan.Item item,
    Map<Id, Integer> blockIndex,
    Map<Id, Integer> groupIndex
  ) {
    List<Integer> span = item.span();
    if (span.isEmpty()) {
      return;
    }
    String position = null;
    for (Group__c grp : item.groupsIn(span[0])) {
      Integer g = groupIndex.get(grp.Id);
      if (g == null) {
        continue;
      }
      List<String> row = grid.rows[g];
      Integer first = blockIndex.get(item.program.blocks[span[0]].Id);
      if (!free(row, first, span.size())) {
        continue;
      }
      if (position == null) {
        grid.items.add(
          new ScheduleGrid.Item(
            item.term == 'FixedActivity' ? 'F' : 'R',
            item.record.Id,
            item.name
          )
        );
        position = String.valueOf(grid.items.size());
      }
      row[first] = position;
      for (Integer b = first + 1; b < first + span.size(); b++) {
        row[b] = ScheduleGrid.CARRIES_ON;
      }
    }
  }

  private static Boolean free(List<String> row, Integer first, Integer length) {
    for (Integer b = first; b < first + length; b++) {
      if (b >= row.size() || String.isNotBlank(row[b])) {
        return false;
      }
    }
    return true;
  }

  private static Program__c programOf(Id programId) {
    List<Program__c> found = [
      SELECT
        Id,
        Name,
        Season__c,
        Season__r.Camp__c,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c
      FROM Program__c
      WHERE Id = :programId
      WITH USER_MODE
    ];
    if (found.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you do not have access to it.'
      );
    }
    return found[0];
  }

  private static Week__c weekOf(Id weekId, Program__c program) {
    List<Week__c> found = [
      SELECT Id, Name, StartDate__c, EndDate__c, Season__c
      FROM Week__c
      WHERE Id = :weekId
      WITH USER_MODE
    ];
    if (found.isEmpty() || found[0].Season__c != program.Season__c) {
      CampLabels labels = CampLabels.forCamp(program.Season__r.Camp__c);
      throw new ShoreshException(
        'That ' +
          labels.singularInSentence('Week') +
          ' is not in ' +
          program.Name +
          '\'s ' +
          labels.singularInSentence('Season') +
          '.'
      );
    }
    return found[0];
  }

  /** In the order of the day, as the set-time plan orders them. */
  public static List<TimeBlock__c> blocksOf(Id programId) {
    return [
      SELECT Id, Name, StartTime__c, EndTime__c, PartOfDay__c
      FROM TimeBlock__c
      WHERE Program__c = :programId
      WITH USER_MODE
      ORDER BY StartTime__c, SortOrder__c, Id
    ];
  }

  /** The program's groups in order, without those away this week. */
  private static List<Group__c> groupsAtCamp(Id programId, Id weekId) {
    Set<Id> away = new Set<Id>();
    for (WeekException__c mark : [
      SELECT Group__c
      FROM WeekException__c
      WHERE Week__c = :weekId AND Group__r.Division__r.Program__c = :programId
      WITH USER_MODE
    ]) {
      away.add(mark.Group__c);
    }
    List<Group__c> result = new List<Group__c>();
    for (Group__c grp : groupsOf(programId)) {
      if (!away.contains(grp.Id)) {
        result.add(grp);
      }
    }
    return result;
  }

  /** In the order the screens and the set-time plan list them. */
  public static List<Group__c> groupsOf(Id programId) {
    return [
      SELECT Id, Name, Availability__c, Division__c
      FROM Group__c
      WHERE Division__r.Program__c = :programId
      WITH USER_MODE
      ORDER BY
        Division__r.SortOrder__c NULLS LAST,
        Division__r.Name,
        SortOrder__c NULLS LAST,
        Name,
        Id
    ];
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
      !FixedActivity__c.SObjectType.getDescribe().isAccessible() ||
      !RecurringActivity__c.SObjectType.getDescribe().isAccessible()
    ) {
      throw new ShoreshException(
        'You don\'t have access to this camp\'s set times. Ask a Salesforce admin.'
      );
    }
    SetTimePlan plan = SetTimePlanReader.read(new Set<Id>{ program.Season__c })
      .get(program.Season__c);
    List<SetTimePlan.Item> result = new List<SetTimePlan.Item>();
    if (plan == null) {
      return result;
    }
    for (SetTimePlan.Item item : plan.items) {
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
