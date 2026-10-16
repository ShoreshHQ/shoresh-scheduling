/** Server side of the activity details panel on the Activities screen (who can do it, more rules). */
public with sharing class ActivitiesController {
  @AuraEnabled
  public static void saveActivityDetails(
    Activity__c rules,
    List<Id> whoCanDoIt
  ) {
    try {
      ActivityDetails.save(rules, whoCanDoIt);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
