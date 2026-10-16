/**
 * Fixed and recurring activities: the time block must be one of the program's own, and the
 * location must belong to the same season. Also remembers the last time block each covers.
 */
public with sharing class SetTimeItemTriggerHandler {
  // What each time block and location named belongs to: its program, or its season.
  private Map<Id, Id> ownerOf;
  private String term;

  /** Before save: the checks above. After save: the clash check (SetTimeGuard). */
  public static void handle(
    System.TriggerOperation operation,
    List<SObject> items,
    String term
  ) {
    if (
      operation == System.TriggerOperation.BEFORE_INSERT ||
      operation == System.TriggerOperation.BEFORE_UPDATE
    ) {
      beforeSave(items, term);
    } else {
      SetTimeTriggers.itemsSaved(items);
    }
  }

  public static void beforeSave(List<SObject> items, String term) {
    Set<Id> programIds = new Set<Id>();
    Set<Id> blockIds = new Set<Id>();
    Set<Id> locationIds = new Set<Id>();
    for (SObject item : items) {
      programIds.add((Id) item.get('Program__c'));
      blockIds.add((Id) item.get('TimeBlock__c'));
      locationIds.add((Id) item.get('Location__c'));
    }
    // Ids are unique across objects: one map of what each block and location belongs to.
    Map<Id, Id> ownerOf = new Map<Id, Id>();
    // The blocks named, and every block of the programs, in the order of the day.
    List<TimeBlock__c> blocks = [
      SELECT Id, Program__c
      FROM TimeBlock__c
      WHERE Id IN :blockIds OR Program__c IN :programIds
      WITH SYSTEM_MODE
      ORDER BY StartTime__c, SortOrder__c, Id
    ];
    for (TimeBlock__c block : blocks) {
      ownerOf.put(block.Id, block.Program__c);
    }
    for (Location__c location : [
      SELECT Id, Season__c
      FROM Location__c
      WHERE Id IN :locationIds
      WITH SYSTEM_MODE
    ]) {
      ownerOf.put(location.Id, location.Season__c);
    }
    Map<Id, Program__c> programs = new Map<Id, Program__c>(
      [
        SELECT Id, Season__c
        FROM Program__c
        WHERE Id IN :programIds
        WITH SYSTEM_MODE
      ]
    );
    SetTimeItemTriggerHandler handler = new SetTimeItemTriggerHandler();
    handler.ownerOf = ownerOf;
    handler.term = term;
    for (SObject item : items) {
      handler.check(item, programs.get((Id) item.get('Program__c')));
    }
    rememberLastBlocks(items, blocks);
  }

  /**
   * Fills in the last time block each item covers now (its time block, then length - 1 more, cut
   * short at the end of the day). If time blocks change later so that it covers different ones,
   * Needs attention says so until its time block or length is changed, or the new coverage is
   * kept (the screens send the last block it now covers).
   */
  private static Boolean blocksTouched(SObject item, SObject was) {
    return was == null ||
      (Id) item.get('TimeBlock__c') != (Id) was.get('TimeBlock__c') ||
      (Decimal) item.get('Length__c') != (Decimal) was.get('Length__c') ||
      (Id) item.get('LastTimeBlock__c') != (Id) was.get('LastTimeBlock__c');
  }

  private static void rememberLastBlocks(
    List<SObject> items,
    List<TimeBlock__c> blocksInOrder
  ) {
    Map<Id, List<Id>> blocksByProgram = new Map<Id, List<Id>>();
    for (TimeBlock__c block : blocksInOrder) {
      if (!blocksByProgram.containsKey(block.Program__c)) {
        blocksByProgram.put(block.Program__c, new List<Id>());
      }
      blocksByProgram.get(block.Program__c).add(block.Id);
    }
    // On an update, only a new time block or length, or a confirmed last block (Keep), sets it
    // again: renaming or moving an item leaves a changed-blocks note in place (Greg, 2026-10-16).
    Map<Id, SObject> before = Trigger.isExecuting && Trigger.isUpdate
      ? Trigger.oldMap
      : null;
    for (SObject item : items) {
      if (before != null && !blocksTouched(item, before.get(item.Id))) {
        continue;
      }
      item.put(
        'LastTimeBlock__c',
        lastBlockOf(item, blocksByProgram.get((Id) item.get('Program__c')))
      );
    }
  }

  /** The last block it covers, given its program's blocks in order; null if it has none. */
  private static Id lastBlockOf(SObject item, List<Id> blocks) {
    Integer start = blocks == null
      ? -1
      : blocks.indexOf((Id) item.get('TimeBlock__c'));
    // A blank length counts as 1, as on the screens and in the clash check.
    Decimal given = (Decimal) item.get('Length__c');
    Integer length = given == null ? 1 : given.intValue();
    return start < 0 ||
      length < 1
      ? null
      : blocks[Math.min(start + length, blocks.size()) - 1];
  }

  private void check(SObject item, Program__c program) {
    if (program == null) {
      return;
    }
    Id blockProgram = ownerOf.get((Id) item.get('TimeBlock__c'));
    Id locationSeason = ownerOf.get((Id) item.get('Location__c'));
    Boolean otherBlock = blockProgram != null && blockProgram != program.Id;
    Boolean otherLocation =
      locationSeason != null &&
      locationSeason != program.Season__c;
    if (!otherBlock && !otherLocation) {
      return;
    }
    // Only a refusal needs the camp's words.
    CampLabels labels = SetupSeasons.labelsBySeason(
        new Set<Id>{ program.Season__c }
      )
      .get(program.Season__c);
    if (otherBlock) {
      item.addError(
        'TimeBlock__c',
        'This ' +
          labels.singularInSentence('TimeBlock') +
          ' belongs to a different ' +
          labels.singularInSentence('Program') +
          ' than the ' +
          labels.singularInSentence(term) +
          '.'
      );
    }
    if (otherLocation) {
      item.addError(
        'Location__c',
        SetupSeasons.otherSeason(labels, 'Location', term)
      );
    }
  }
}
