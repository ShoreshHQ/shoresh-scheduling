/**
 * An elective set's time (repo ADR 0027) is in a time block of its own season, never another's:
 * ElectiveSetupTriggers refuses one that isn't, before it is saved. Its last block (a double
 * period, ELECT-7.5) is a later block of the same program; a set with no time has none.
 */
public with sharing class ElectiveSetSeasonBlocks {
  public static void refuse(
    List<ElectiveSet__c> sets,
    SetupSeasons.LazyLabels labelsBySeason,
    Map<Id, ElectiveSet__c> oldSets
  ) {
    Set<Id> blockIds = blockIdsOf(sets);
    if (blockIds.isEmpty()) {
      return;
    }
    // System mode, as the trigger's other checks (ADR 0001 point 6): only the block's season,
    // program and order are read, and the refusal says nothing about the other season.
    Map<Id, TimeBlock__c> blocks = new Map<Id, TimeBlock__c>(
      [
        SELECT
          Id,
          Program__c,
          Program__r.Name,
          Program__r.Season__c,
          StartTime__c,
          SortOrder__c
        FROM TimeBlock__c
        WHERE Id IN :blockIds
        WITH SYSTEM_MODE
      ]
    );
    for (ElectiveSet__c item : sets) {
      refuseOne(item, blocks, labelsBySeason);
    }
    // ELECT-7.4: never moved away from who it is for.
    ElectiveSetMoves.refuse(sets, oldSets, blocks);
  }

  /** The blocks the sets name. No time, no last block: clearing the time clears it. */
  private static Set<Id> blockIdsOf(List<ElectiveSet__c> sets) {
    Set<Id> blockIds = new Set<Id>();
    for (ElectiveSet__c item : sets) {
      if (item.TimeBlock__c == null) {
        item.LastTimeBlock__c = null;
      }
      blockIds.add(item.TimeBlock__c);
      blockIds.add(item.LastTimeBlock__c);
    }
    blockIds.remove(null);
    return blockIds;
  }

  /** A block of another season, or a last block that isn't later in the same program. */
  private static void refuseOne(
    ElectiveSet__c item,
    Map<Id, TimeBlock__c> blocks,
    SetupSeasons.LazyLabels labelsBySeason
  ) {
    TimeBlock__c block = blocks.get(item.TimeBlock__c);
    if (block == null) {
      return;
    }
    CampLabels labels;
    if (block.Program__r.Season__c != item.Season__c) {
      labels = labelsBySeason.get(item.Season__c);
      item.TimeBlock__c.addError(
        'That ' +
          labels.singularInSentence('TimeBlock') +
          ' belongs to another ' +
          labels.singularInSentence('Season') +
          '.'
      );
    } else if (
      item.LastTimeBlock__c != null &&
      !isLater(blocks.get(item.LastTimeBlock__c), block)
    ) {
      labels = labelsBySeason.get(item.Season__c);
      item.LastTimeBlock__c.addError(
        'Choose a later ' +
          labels.singularInSentence('TimeBlock') +
          ' of the same ' +
          labels.singularInSentence('Program') +
          '.'
      );
    }
  }

  /** ELECT-7.5: last is a block of first's program after it, in the day's order. */
  private static Boolean isLater(TimeBlock__c last, TimeBlock__c first) {
    if (last == null || last.Program__c != first.Program__c) {
      return false;
    }
    Integer lastStart = minuteOf(last.StartTime__c);
    Integer firstStart = minuteOf(first.StartTime__c);
    if (lastStart != firstStart) {
      return lastStart > firstStart;
    }
    Decimal lastSort = last.SortOrder__c == null ? 0 : last.SortOrder__c;
    Decimal firstSort = first.SortOrder__c == null ? 0 : first.SortOrder__c;
    return lastSort > firstSort;
  }

  /** Minutes after midnight; a block with no start comes first, as it sorts. */
  private static Integer minuteOf(Time value) {
    return value == null ? -1 : value.hour() * 60 + value.minute();
  }
}
