/**
 * Names on a choices sheet the director added as activities (ChoicesImport; repo ADR 0017 choice
 * 14): made in the season, each offered in the elective set as proposed, and every choice pointed
 * at an activity of the season. In user mode.
 */
public with sharing class ChoicesImportActivities {
  private ChoicesImport.Request request;
  private ChoicesImportPlace place;

  public ChoicesImportActivities(
    ChoicesImport.Request given,
    ChoicesImportPlace forPlace
  ) {
    request = given;
    place = forPlace;
  }

  /**
   * Names the director added as activities: made in the season (unless one of that name is
   * already there), each offered in the set as proposed, so it is confirmed on the Electives
   * screen before it gets campers (plan §2). Every choice is then pointed at an activity of the
   * season. Returns how many activities were made.
   */
  public Integer add() {
    Map<String, Id> seasonIds = seasonActivities();
    Map<String, Id> added = new Map<String, Id>();
    List<Activity__c> made = new List<Activity__c>();
    for (
      String name : request.addActivities == null
        ? new List<String>()
        : request.addActivities
    ) {
      String key = ChoicesImport.fold(name);
      if (String.isBlank(key) || added.containsKey(key)) {
        continue;
      }
      added.put(key, seasonIds.get(key));
      if (!seasonIds.containsKey(key)) {
        made.add(
          new Activity__c(Season__c = request.seasonId, Name = name.trim())
        );
      }
    }
    Database.insert(made, AccessLevel.USER_MODE);
    for (Activity__c activity : made) {
      added.put(ChoicesImport.fold(activity.Name), activity.Id);
      seasonIds.put(ChoicesImport.fold(activity.Name), activity.Id);
    }
    new ChoicesImportLinked(request, place).pointAt();
    pointAtActivities(added, new Set<Id>(seasonIds.values()));
    offerProposed(new Set<Id>(added.values()));
    return made.size();
  }

  private Map<String, Id> seasonActivities() {
    Map<String, Id> result = new Map<String, Id>();
    for (Activity__c activity : [
      SELECT Id, Name
      FROM Activity__c
      WHERE Season__c = :request.seasonId
      WITH USER_MODE
    ]) {
      result.put(ChoicesImport.fold(activity.Name), activity.Id);
    }
    return result;
  }

  /** A choice being added takes its new activity; every choice's activity is the season's. */
  private void pointAtActivities(Map<String, Id> added, Set<Id> inSeason) {
    for (ChoicesImport.SheetCamper sheetCamper : request.campers) {
      for (ChoicesImport.SheetChoice choice : sheetCamper.choices) {
        if (String.isNotBlank(choice.add)) {
          choice.a = added.get(ChoicesImport.fold(choice.add));
          choice.add = null;
        }
        if (choice.a != null && !inSeason.contains(choice.a)) {
          throw new ShoreshException(
            ChoicesImport.rowWords(sheetCamper) +
            'a choice names an activity that is no longer in this season. Reload the page.'
          );
        }
      }
    }
  }

  /** Each added activity offered in the set, proposed, unless the set already offers it. */
  private void offerProposed(Set<Id> activityIds) {
    activityIds.remove(null);
    if (activityIds.isEmpty()) {
      return;
    }
    for (Offering__c offering : [
      SELECT Activity__c
      FROM Offering__c
      WHERE ElectiveSet__c = :place.electiveSet.Id
      WITH USER_MODE
    ]) {
      activityIds.remove(offering.Activity__c);
    }
    List<Offering__c> offerings = new List<Offering__c>();
    for (Id activityId : activityIds) {
      offerings.add(
        new Offering__c(
          ElectiveSet__c = place.electiveSet.Id,
          Activity__c = activityId,
          Proposed__c = true
        )
      );
    }
    Database.insert(offerings, AccessLevel.USER_MODE);
  }
}
