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
        SELECT Id, Program__c, NoDivision__c, Program__r.Season__r.Camp__c
        FROM Division__c
        WHERE Id IN :divisionIds
        WITH SYSTEM_MODE
      ]
    );
    // One set of camp words per camp, read once (a bulk update may move many groups).
    Map<Id, CampLabels> labelsByCamp = new Map<Id, CampLabels>();
    for (Group__c grp : groups) {
      if (!moves.containsKey(grp.Id)) {
        continue;
      }
      Division__c target = divisions.get(grp.Division__c);
      Division__c origin = divisions.get(moves.get(grp.Id));
      Id campId = origin.Program__r.Season__r.Camp__c;
      if (!labelsByCamp.containsKey(campId)) {
        labelsByCamp.put(campId, CampLabels.forCamp(campId));
      }
      CampLabels labels = labelsByCamp.get(campId);
      String problem = whyNot(target, origin, labels);
      if (problem != null) {
        grp.addError(problem);
      }
    }
  }

  /** Why a group can't move there, or null. */
  private static String whyNot(
    Division__c target,
    Division__c origin,
    CampLabels labels
  ) {
    // DIV-1.1: another group's holding record is no division to join.
    if (target == null || target.NoDivision__c) {
      // No name here: the screen puts the row's name in front ("Bunk 3": Pick its unit.).
      return 'Pick its ' + labels.singularInSentence('Division') + '.';
    }
    if (target.Program__c != origin.Program__c) {
      return labels.plural('Group') +
        ' can move only to another ' +
        labels.singularInSentence('Division') +
        ' of their own ' +
        labels.singularInSentence('Program') +
        '.';
    }
    return null;
  }
}
