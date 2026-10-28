/**
 * Groups: a move to another division is checked first; a saved group is checked for clashes; an
 * empty holding record of a group with no division is removed (DIV-1.1).
 */
public with sharing class GroupTriggerHandler {
  public static void handle(
    System.TriggerOperation operation,
    List<Group__c> groups,
    Map<Id, Group__c> before
  ) {
    if (operation == System.TriggerOperation.BEFORE_UPDATE) {
      GroupMoves.refuseOtherPrograms(groups, before);
    } else if (operation == System.TriggerOperation.AFTER_DELETE) {
      // DIV-1.1: a holding record whose group is gone goes too.
      NoDivisions.removeEmpty(NoDivisions.left(null, before));
    } else {
      SetTimeTriggers.groupsSaved(groups, before);
      if (operation == System.TriggerOperation.AFTER_UPDATE) {
        // DIV-1.1: a group moved out of its holding record leaves none behind.
        NoDivisions.removeEmpty(NoDivisions.left(groups, before));
      }
    }
  }
}
