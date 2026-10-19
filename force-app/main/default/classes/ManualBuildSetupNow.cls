/**
 * Setup's names now for a Manual Build draft's days (ManualBuildNamesNow), for a save's answer
 * (SlotSaves.save) and for Publish (SchedulePublish), on the program's time blocks and groups as
 * already read. What the days place is read by Id, one query for each kind they place (none for a
 * kind they don't); a time block or group the program no longer has is looked up only when there
 * is one, so what is still there is what ScheduleRefs would find. Runs in user mode.
 */
public with sharing class ManualBuildSetupNow {
  public static ManualBuildNamesNow of(
    List<ScheduleDays.DayGrid> days,
    List<TimeBlock__c> blocks,
    List<Group__c> groups
  ) {
    Map<String, Set<Id>> placed = new Map<String, Set<Id>>{
      'block' => new Set<Id>(),
      'group' => new Set<Id>()
    };
    for (ScheduleDays.DayGrid day : days) {
      if (day.grid != null) {
        collect(day.grid, placed);
      }
    }
    List<SObject> records = new List<SObject>();
    records.addAll(blocks);
    records.addAll(groups);
    records.addAll(placedRecords(placed));
    placed.get('block').removeAll(new Map<Id, TimeBlock__c>(blocks).keySet());
    placed.get('group').removeAll(new Map<Id, Group__c>(groups).keySet());
    return new ManualBuildNamesNow(records, blocks)
      .alsoThere(elsewhere(placed.get('block'), placed.get('group')));
  }

  private static void collect(ScheduleGrid grid, Map<String, Set<Id>> placed) {
    for (ScheduleGrid.Block block : grid.blocks) {
      add(placed, 'block', block.id);
    }
    for (ScheduleGrid.GroupRef grp : grid.groups) {
      add(placed, 'group', grp.id);
    }
    for (ScheduleGrid.Item item : grid.items) {
      add(placed, item.kind, item.id);
    }
  }

  private static void add(
    Map<String, Set<Id>> placed,
    String kind,
    String savedId
  ) {
    Id recordId = ManualBuildNamesNow.idOf(savedId);
    if (recordId == null) {
      return;
    }
    if (!placed.containsKey(kind)) {
      placed.put(kind, new Set<Id>());
    }
    placed.get(kind).add(recordId);
  }

  /** The activities and fixed and recurring activities placed, with their names now. */
  private static List<SObject> placedRecords(Map<String, Set<Id>> placed) {
    List<SObject> records = new List<SObject>();
    Set<Id> activityIds = placed.get('A');
    Set<Id> fixedIds = placed.get('F');
    Set<Id> recurringIds = placed.get('R');
    if (activityIds != null) {
      records.addAll(
        [
          SELECT Id, Name
          FROM Activity__c
          WHERE Id IN :activityIds
          WITH USER_MODE
        ]
      );
    }
    if (fixedIds != null) {
      records.addAll(
        [
          SELECT Id, Name
          FROM FixedActivity__c
          WHERE Id IN :fixedIds
          WITH USER_MODE
        ]
      );
    }
    if (recurringIds != null) {
      records.addAll(
        [
          SELECT Id, Name
          FROM RecurringActivity__c
          WHERE Id IN :recurringIds
          WITH USER_MODE
        ]
      );
    }
    return records;
  }

  /** Time blocks and groups not the program's now that are still there (a bunk moved away). */
  private static Set<String> elsewhere(Set<Id> blockIds, Set<Id> groupIds) {
    Set<String> found = new Set<String>();
    if (!blockIds.isEmpty()) {
      for (TimeBlock__c row : [
        SELECT Id
        FROM TimeBlock__c
        WHERE Id IN :blockIds
        WITH USER_MODE
      ]) {
        found.add(String.valueOf(row.Id));
      }
    }
    if (!groupIds.isEmpty()) {
      for (Group__c row : [
        SELECT Id
        FROM Group__c
        WHERE Id IN :groupIds
        WITH USER_MODE
      ]) {
        found.add(String.valueOf(row.Id));
      }
    }
    return found;
  }
}
