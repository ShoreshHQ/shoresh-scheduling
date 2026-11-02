/** Server side of the activity details panel on the Activities screen (who can do it, more rules). */
public with sharing class ActivitiesController {
  /**
   * Saves the rules sent and who can do it (null: unchanged), only while each is as the director
   * saw it (its ticket); otherwise nothing is saved and the answer says what someone else
   * changed, as a setup row's does (ActivityDetails, ADR 0011 choice 5).
   */
  @AuraEnabled
  public static RowSaves.Result saveActivityDetails(
    Activity__c rules,
    List<Id> whoCanDoIt,
    SeenSaves.Ticket ticket
  ) {
    try {
      return ActivityDetails.save(rules, whoCanDoIt, ticket);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }
}
