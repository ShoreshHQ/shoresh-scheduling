/** Groups: a move to another division is checked first; a saved group is checked for clashes. */
public with sharing class GroupTriggerHandler {
  public static void handle(
    System.TriggerOperation operation,
    List<Group__c> groups,
    Map<Id, Group__c> before
  ) {
    if (operation == System.TriggerOperation.BEFORE_UPDATE) {
      GroupMoves.refuseOtherPrograms(groups, before);
    } else {
      SetTimeTriggers.groupsSaved(groups, before);
    }
  }
}
