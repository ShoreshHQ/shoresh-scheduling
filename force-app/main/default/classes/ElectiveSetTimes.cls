/**
 * An elective set's time (repo ADR 0027; ELECT-7.1 to 7.3): a time block and its days, where a
 * fresh week (BlankWeek) places the set across the groups at camp then. Read with the program's
 * time blocks, in the same query, so building a week costs no query more than before.
 */
public with sharing class ElectiveSetTimes {
  private static final List<Schema.SObjectField> FIELDS = new List<Schema.SObjectField>{
    ElectiveSet__c.TimeBlock__c,
    ElectiveSet__c.Monday__c,
    ElectiveSet__c.Tuesday__c,
    ElectiveSet__c.Wednesday__c,
    ElectiveSet__c.Thursday__c,
    ElectiveSet__c.Friday__c,
    ElectiveSet__c.Saturday__c,
    ElectiveSet__c.Sunday__c
  };

  /** Whether the user can read sets' times; someone who can't starts weeks without them. */
  public static Boolean readable() {
    if (!Schema.sObjectType.ElectiveSet__c.isAccessible()) {
      return false;
    }
    for (Schema.SObjectField field : FIELDS) {
      if (!field.getDescribe().isAccessible()) {
        return false;
      }
    }
    return true;
  }

  /**
   * The program's time blocks (as ProgramReads.blocksOf), each with the elective sets at it in
   * name order, so the same setup gives the same week. One query: the sets come as a subquery.
   */
  public static List<TimeBlock__c> blocksOf(Id programId) {
    if (!readable()) {
      return ProgramReads.blocksOf(programId);
    }
    return [
      SELECT
        Id,
        Name,
        StartTime__c,
        EndTime__c,
        PartOfDay__c,
        SortOrder__c,
        (
          SELECT
            Id,
            Name,
            TimeBlock__c,
            Monday__c,
            Tuesday__c,
            Wednesday__c,
            Thursday__c,
            Friday__c,
            Saturday__c,
            Sunday__c
          FROM ElectiveSets__r
          ORDER BY Name, Id
        )
      FROM TimeBlock__c
      WHERE Program__c = :programId
      WITH USER_MODE
      ORDER BY StartTime__c, SortOrder__c, Id
    ];
  }

  /** Each set with a time, on a day of the week ("Tuesday"), placed in the day at it. */
  public static void placeAll(
    BlankDay day,
    List<TimeBlock__c> blocks,
    String weekday
  ) {
    if (!readable()) {
      return;
    }
    Schema.SObjectField onDay = SetTimePlan.dayField(
      ElectiveSet__c.SObjectType,
      weekday
    );
    for (TimeBlock__c block : blocks) {
      for (ElectiveSet__c electiveSet : setsAt(block)) {
        if (onDay != null && electiveSet.get(onDay) == true) {
          placeSet(day, electiveSet, block);
        }
      }
    }
  }

  /** A block's sets, when it was read with them (blocksOf); none otherwise. */
  private static List<ElectiveSet__c> setsAt(TimeBlock__c block) {
    try {
      return block.ElectiveSets__r;
    } catch (SObjectException e) {
      return new List<ElectiveSet__c>();
    }
  }

  /**
   * An elective set at its time: in the block, every group of the day at camp then, as one set
   * cell, as a director would type it. A slot already taken (a fixed or recurring activity there
   * first) is left as it is and named in the day's notPlaced.
   */
  public static void placeSet(
    BlankDay day,
    ElectiveSet__c electiveSet,
    TimeBlock__c block
  ) {
    Integer b = block == null ? null : day.blockAt(block.Id);
    if (b == null) {
      return;
    }
    String position = null;
    for (ScheduleGrid.GroupRef ref : day.grid.groups) {
      Group__c grp = day.groupOf(ref.id);
      if (grp == null || !SetTimePlan.atCamp(grp, block)) {
        continue;
      }
      List<String> row = day.rowOf(grp.Id);
      if (String.isNotBlank(row[b])) {
        day.notPlaced.add(electiveSet.Name + ' · ' + grp.Name);
        continue;
      }
      if (position == null) {
        day.grid.items.add(
          new ScheduleGrid.Item('E', electiveSet.Id, electiveSet.Name)
        );
        position = String.valueOf(day.grid.items.size());
      }
      row[b] = position;
    }
  }
}
