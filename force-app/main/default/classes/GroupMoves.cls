/**
 * A group can move to another division of its own program (Greg, 2026-10-16), never to another
 * program's: who its program's activities and recurring activities cover, and its week ticks,
 * all belong to that program.
 */
public with sharing class GroupMoves {
  public static void refuseOtherPrograms(
    List<Group__c> groups,
    Map<Id, Group__c> before
  ) {
    Map<Id, Id> moves = new Map<Id, Id>();
    Set<Id> divisionIds = new Set<Id>();
    for (Group__c grp : groups) {
      Id previous = before.get(grp.Id).Division__c;
      if (grp.Division__c != previous) {
        moves.put(grp.Id, previous);
        divisionIds.add(previous);
        divisionIds.add(grp.Division__c);
      }
    }
    if (moves.isEmpty()) {
      return;
    }
    Map<Id, Division__c> divisions = new Map<Id, Division__c>(
      [
        SELECT Id, Program__c, Program__r.Season__r.Camp__c
        FROM Division__c
        WHERE Id IN :divisionIds
        WITH SYSTEM_MODE
      ]
    );
    for (Group__c grp : groups) {
      if (!moves.containsKey(grp.Id)) {
        continue;
      }
      Division__c target = divisions.get(grp.Division__c);
      Division__c origin = divisions.get(moves.get(grp.Id));
      if (target.Program__c != origin.Program__c) {
        CampLabels labels = CampLabels.forCamp(
          origin.Program__r.Season__r.Camp__c
        );
        grp.addError(
          labels.plural('Group') +
            ' can move only to another ' +
            labels.singularInSentence('Division') +
            ' of their own ' +
            labels.singularInSentence('Program') +
            '.'
        );
      }
    }
  }
}
