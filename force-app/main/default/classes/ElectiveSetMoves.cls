/**
 * ELECT-7.4: a saved elective set whose time block moves to another program than a division or
 * group its who rows name is refused, so it is never placed for no one without a word, unless
 * the same save replaces who it is for (SetTimeWho.willReplace): its new rows are checked
 * against the new block's program instead (ElectiveSetWhoRows). Only a set whose block changed
 * is read. ElectiveSetSeasonBlocks calls it before the sets are saved.
 *
 * System mode on purpose, as the trigger's other checks (ADR 0001 point 6): only the programs
 * the rows name are read, and the refusal names only the set's own program.
 */
public with sharing class ElectiveSetMoves {
  /** blocks: each block named, with its program and the program's name. */
  public static void refuse(
    List<ElectiveSet__c> sets,
    Map<Id, ElectiveSet__c> oldSets,
    Map<Id, TimeBlock__c> blocks
  ) {
    Set<Id> movedIds = movedOf(sets, oldSets);
    if (movedIds.isEmpty()) {
      return;
    }
    Map<Id, Set<Id>> programsNamed = programsNamedBy(movedIds);
    for (ElectiveSet__c item : sets) {
      TimeBlock__c block = blocks.get(item.TimeBlock__c);
      if (namesOtherProgram(programsNamed.get(item.Id), block)) {
        // The program by the camp's own name: "Choose Who for Teens in the same change."
        item.TimeBlock__c.addError(
          'Choose Who for ' + block.Program__r.Name + ' in the same change.'
        );
      }
    }
  }

  /** The saved sets given another time block, whose who this save doesn't replace. */
  private static Set<Id> movedOf(
    List<ElectiveSet__c> sets,
    Map<Id, ElectiveSet__c> oldSets
  ) {
    Set<Id> result = new Set<Id>();
    for (ElectiveSet__c item : sets) {
      ElectiveSet__c was = oldSets == null ? null : oldSets.get(item.Id);
      if (isMove(item, was) && !SetTimeWho.replaces(item.Id)) {
        result.add(item.Id);
      }
    }
    return result;
  }

  private static Boolean isMove(ElectiveSet__c item, ElectiveSet__c was) {
    return was != null &&
      item.TimeBlock__c != null &&
      item.TimeBlock__c != was.TimeBlock__c;
  }

  /** The programs each set's who rows name. */
  private static Map<Id, Set<Id>> programsNamedBy(Set<Id> setIds) {
    Map<Id, Set<Id>> result = new Map<Id, Set<Id>>();
    for (Coverage__c row : [
      SELECT
        ElectiveSet__c,
        Division__r.Program__c,
        Group__r.Division__r.Program__c
      FROM Coverage__c
      WHERE ElectiveSet__c IN :setIds
      WITH SYSTEM_MODE
    ]) {
      if (!result.containsKey(row.ElectiveSet__c)) {
        result.put(row.ElectiveSet__c, new Set<Id>());
      }
      result.get(row.ElectiveSet__c).add(programOf(row));
    }
    return result;
  }

  private static Id programOf(Coverage__c row) {
    return row.Division__c != null
      ? row.Division__r.Program__c
      : row.Group__r.Division__r.Program__c;
  }

  private static Boolean namesOtherProgram(Set<Id> named, TimeBlock__c block) {
    if (named == null || block == null) {
      return false;
    }
    Set<Id> others = new Set<Id>(named);
    others.remove(block.Program__c);
    return !others.isEmpty();
  }
}
