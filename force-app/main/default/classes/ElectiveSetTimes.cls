/**
 * An elective set's time (repo ADR 0027; ELECT-7.1 to 7.5): a time block, a last block for a
 * double period, its days, and who it is for, where a fresh week (BlankWeek) places the set across
 * the groups at camp then (ElectiveSetPlacing). Read with the program's time blocks, in the same
 * query; who each set is for (ElectiveSetWho) is one query more, only when the program has a set.
 * Someone who can't read a set's last block or who it is for gets its time as before ADR 0027's
 * amendment: its block alone, for every group.
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
    return Schema.sObjectType.ElectiveSet__c.isAccessible() && canRead(FIELDS);
  }

  /** ELECT-7.5: whether the user can read a set's last block. */
  public static Boolean lastReadable() {
    return canRead(
      new List<Schema.SObjectField>{ ElectiveSet__c.LastTimeBlock__c }
    );
  }

  /** Whether the user can read every one of these fields. */
  public static Boolean canRead(List<Schema.SObjectField> fields) {
    for (Schema.SObjectField field : fields) {
      if (!field.getDescribe().isAccessible()) {
        return false;
      }
    }
    return true;
  }

  /**
   * The program's time blocks (as ProgramReads.blocksOf), each with the elective sets at it in
   * name order, so the same setup gives the same week. One query: the sets come as a subquery,
   * with their last block when the user can read it. Who the sets are for is read with them (one
   * query more, only when there is a set and the user can read it).
   */
  public static List<TimeBlock__c> blocksOf(Id programId) {
    if (!readable()) {
      return ProgramReads.blocksOf(programId);
    }
    List<String> setFields = new List<String>{ 'Id', 'Name' };
    for (Schema.SObjectField field : FIELDS) {
      setFields.add(ShoreshSchema.queryName(field));
    }
    if (lastReadable()) {
      setFields.add(ShoreshSchema.queryName(ElectiveSet__c.LastTimeBlock__c));
    }
    String startTime = ShoreshSchema.queryName(TimeBlock__c.StartTime__c);
    String sortOrder = ShoreshSchema.queryName(TimeBlock__c.SortOrder__c);
    List<TimeBlock__c> blocks = Database.queryWithBinds(
      'SELECT Id, Name, ' +
        startTime +
        ', ' +
        ShoreshSchema.queryName(TimeBlock__c.EndTime__c) +
        ', ' +
        ShoreshSchema.queryName(TimeBlock__c.PartOfDay__c) +
        ', ' +
        sortOrder +
        ', (SELECT ' +
        String.join(setFields, ', ') +
        ' FROM ' +
        ShoreshSchema.childRelationship(
          TimeBlock__c.SObjectType,
          ElectiveSet__c.TimeBlock__c
        ) +
        ' ORDER BY Name, Id) FROM ' +
        ShoreshSchema.queryName(TimeBlock__c.SObjectType) +
        ' WHERE ' +
        ShoreshSchema.queryName(TimeBlock__c.Program__c) +
        ' = :programId ORDER BY ' +
        startTime +
        ', ' +
        sortOrder +
        ', Id',
      new Map<String, Object>{ 'programId' => programId },
      AccessLevel.USER_MODE
    );
    ElectiveSetWho.read(setIdsOf(blocks));
    return blocks;
  }

  private static Set<Id> setIdsOf(List<TimeBlock__c> blocks) {
    Set<Id> setIds = new Set<Id>();
    for (TimeBlock__c block : blocks) {
      for (ElectiveSet__c electiveSet : setsAt(block)) {
        setIds.add(electiveSet.Id);
      }
    }
    return setIds;
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
          ElectiveSetPlacing.place(
            day,
            electiveSet,
            ElectiveSetPlacing.spanOf(blocks, block, electiveSet)
          );
        }
      }
    }
  }

  /** A block's sets, when it was read with them (blocksOf); none otherwise. */
  private static List<ElectiveSet__c> setsAt(TimeBlock__c block) {
    try {
      return block.ElectiveSets__r == null
        ? new List<ElectiveSet__c>()
        : block.ElectiveSets__r;
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
    ElectiveSetPlacing.place(day, electiveSet, new List<TimeBlock__c>{ block });
  }
}
