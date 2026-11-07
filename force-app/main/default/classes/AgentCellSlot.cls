/**
 * What an AI names for a cell, as a slot: one of the season's activities, or one of its elective
 * sets as the screens' drawers place it (API-1.124). A name both have is refused, never guessed.
 */
public with sharing class AgentCellSlot {
  public static String named(String asked, Id seasonId) {
    String wanted = IncomingBatch.fold(asked);
    List<String> names = new List<String>();
    String activitySlot = activityIn(seasonId, wanted, names);
    String electiveSlot = electiveIn(seasonId, wanted);
    if (activitySlot != null && electiveSlot != null) {
      throw new ShoreshException(
        '"' +
          asked.left(80) +
          '" is both an activity and an elective set in this season, so Shoresh can\'t tell which you mean.'
      );
    }
    if (activitySlot != null || electiveSlot != null) {
      return activitySlot != null ? activitySlot : electiveSlot;
    }
    throw new ShoreshException(
      'There is no activity or elective set called "' +
        asked.left(80) +
        '" in this season. ' +
        AgentWeeks.namesSaid('activities', names)
    );
  }

  private static String activityIn(
    Id seasonId,
    String wanted,
    List<String> names
  ) {
    String found;
    for (Activity__c activity : [
      SELECT Id, Name
      FROM Activity__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Name
    ]) {
      if (IncomingBatch.fold(activity.Name) == wanted) {
        found = 'A:' + activity.Id;
      }
      names.add(activity.Name);
    }
    return found;
  }

  private static String electiveIn(Id seasonId, String wanted) {
    for (ElectiveSet__c electiveSet : [
      SELECT Id, Name
      FROM ElectiveSet__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Name
    ]) {
      if (IncomingBatch.fold(electiveSet.Name) == wanted) {
        return 'E:' + electiveSet.Id;
      }
    }
    return null;
  }
}
