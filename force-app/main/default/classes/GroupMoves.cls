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
      if (target == null) {
        grp.addError(needsDivision(grp.Name, labels));
      } else if (target.Program__c != origin.Program__c) {
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

  /** "Bunk 3 needs a unit." / "Bunk 3 needs an age group." */
  private static String needsDivision(String name, CampLabels labels) {
    String word = labels.singularInSentence('Division');
    String article = 'aeiouAEIOU'.contains(word.left(1)) ? 'an ' : 'a ';
    return name + ' needs ' + article + word + '.';
  }
}
