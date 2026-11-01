/**
 * A new setup record as Camp Setup's table starts its Add row (docs/protocol/api.md API-1.50): in
 * its season or program, last in order, with what that table's new row starts with.
 */
public with sharing class AgentSetupNewRow {
  // Each kind's order field, and the parent its table's rows sit under (a group: its program,
  // through its division).
  private static final Map<String, Schema.SObjectField> ORDER = new Map<String, Schema.SObjectField>{
    'Week' => Week__c.SortOrder__c,
    'Program' => Program__c.SortOrder__c,
    'Division' => Division__c.SortOrder__c,
    'Group' => Group__c.SortOrder__c,
    'TimeBlock' => TimeBlock__c.SortOrder__c,
    'LocationType' => LocationType__c.SortOrder__c,
    'Location' => Location__c.SortOrder__c,
    'Activity' => Activity__c.SortOrder__c,
    'FixedActivity' => FixedActivity__c.SortOrder__c,
    'RecurringActivity' => RecurringActivity__c.SortOrder__c,
    'SpecialDay' => SpecialDay__c.SortOrder__c,
    'SpecialEvent' => SpecialEvent__c.SortOrder__c
  };
  private static final Map<String, Schema.SObjectField> PARENT = new Map<String, Schema.SObjectField>{
    'Week' => Week__c.Season__c,
    'Program' => Program__c.Season__c,
    'Division' => Division__c.Program__c,
    'TimeBlock' => TimeBlock__c.Program__c,
    'LocationType' => LocationType__c.Season__c,
    'Location' => Location__c.Season__c,
    'Activity' => Activity__c.Season__c,
    'FixedActivity' => FixedActivity__c.Program__c,
    'RecurringActivity' => RecurringActivity__c.Program__c,
    'SpecialDay' => SpecialDay__c.Season__c,
    'SpecialEvent' => SpecialEvent__c.Season__c,
    'ElectiveSet' => ElectiveSet__c.Season__c
  };

  /**
   * The table's new row: in its season or program, last in order, with what that table's new row
   * starts with (shoreshCampSetup and shoreshProgram's defaults).
   */
  public static SObject of(AgentSetupRecords.Found found) {
    Schema.SObjectField order = ORDER.get(found.term);
    SObject row = found.term == 'Group'
      ? new Group__c()
      : PARENT.get(found.term).getDescribe().getSObjectType().newSObject();
    Boolean inProgram = AgentSetupFields.inProgram(found.term);
    Id parentId = inProgram ? found.programId : found.seasonId;
    List<SObject> siblings = siblings(found.term, parentId);
    if (found.term != 'Group') {
      row.put(PARENT.get(found.term), parentId);
    }
    if (order != null) {
      row.put(order, next(siblings, order));
    }
    defaults(found.term, row, siblings);
    return row;
  }

  /** The rows already in that table: its season's or program's of that kind. */
  private static List<SObject> siblings(String term, Id parentId) {
    if (term == 'Group') {
      return [
        SELECT SortOrder__c
        FROM Group__c
        WHERE Division__r.Program__c = :parentId
        WITH USER_MODE
      ];
    }
    Schema.SObjectField parent = PARENT.get(term);
    Schema.SObjectType type = parent.getDescribe().getSObjectType();
    List<String> columns = new List<String>{ 'Id' };
    if (ORDER.containsKey(term)) {
      columns.add(ShoreshSchema.queryName(ORDER.get(term)));
    }
    if (term == 'Program') {
      for (String day : AgentSetupFields.days()) {
        columns.add(
          ShoreshSchema.queryName(AgentSetupFields.fieldOf('Program', day))
        );
      }
    }
    return Database.queryWithBinds(
      'SELECT ' +
        String.join(columns, ', ') +
        ' FROM ' +
        ShoreshSchema.queryName(type) +
        ' WHERE ' +
        ShoreshSchema.queryName(parent) +
        ' = :parentId',
      new Map<String, Object>{ 'parentId' => parentId },
      AccessLevel.USER_MODE
    );
  }

  /** What the table's new row starts with, beyond its parent and order. */
  private static void defaults(
    String term,
    SObject row,
    List<SObject> siblings
  ) {
    switch on term {
      when 'Program' {
        // The days the camp's other programs run; Monday to Friday for the first one.
        for (String day : AgentSetupFields.days()) {
          Schema.SObjectField field = AgentSetupFields.fieldOf('Program', day);
          Boolean runs = siblings.isEmpty() && !day.startsWith('s');
          for (SObject other : siblings) {
            runs = runs || other.get(field) == true;
          }
          row.put(field, runs);
        }
      }
      when 'Group' {
        row.put(Group__c.Availability__c, 'AllDay');
      }
      when 'Location' {
        row.put(Location__c.GroupsThatFit__c, 1);
      }
      when 'Activity' {
        // Defaults for an activity added by hand (Greg, 2026-10-16).
        row.put(Activity__c.Length__c, 1);
        row.put(Activity__c.TimesPerWeekMin__c, 1);
        row.put(Activity__c.TimesPerWeekMax__c, 1);
        row.put(Activity__c.Priority__c, 'Low');
        row.put(Activity__c.Outdoor__c, false);
        row.put(Activity__c.GroupsAtOnce__c, 1);
        row.put(Activity__c.NoWeeklyMax__c, false);
        row.put(Activity__c.NoGroupLimit__c, false);
      }
      when 'FixedActivity', 'RecurringActivity' {
        // A recurring activity starts with no day ticked (Greg, 2026-10-16).
        row.put(
          term == 'FixedActivity'
            ? FixedActivity__c.Length__c
            : RecurringActivity__c.Length__c,
          1
        );
      }
    }
  }

  /** After the last row: one more than the highest, so rows keep their order (the table's). */
  private static Decimal next(
    List<SObject> rows,
    Schema.SObjectField sortOrder
  ) {
    Decimal highest;
    for (SObject row : rows) {
      Decimal order = (Decimal) row.get(sortOrder);
      if (order != null && (highest == null || order > highest)) {
        highest = order;
      }
    }
    return highest == null ? rows.size() + 1 : highest + 1;
  }
}
