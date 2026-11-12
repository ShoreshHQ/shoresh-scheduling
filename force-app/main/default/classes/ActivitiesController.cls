/** Server side of the activity details panel on the Activities screen (who can do it, more rules). */
public with sharing class ActivitiesController {
  /**
   * Saves the rules sent and who can do it (null: unchanged), only while each is as the director
   * saw it (its ticket); otherwise nothing is saved and the answer says what someone else
   * changed, as a setup row's does (ActivityDetails, ADR 0011 choice 5). The screen sends who
   * as null when only a rule changed, but Lightning hands a null list here as an empty one, which
   * would read as "everyone" sent without what was seen (refused as "Who can do it wasn't saved").
   * Who is sent only with what was seen in it, so an empty list without it is who left out.
   */
  @AuraEnabled
  public static RowSaves.Result saveActivityDetails(
    Activity__c rules,
    List<Id> whoCanDoIt,
    SeenSaves.Ticket ticket
  ) {
    try {
      return ActivityDetails.save(rules, whoSent(whoCanDoIt, ticket), ticket);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

  /** Who can do it as sent: null (left as it is) when Lightning turned the screen's null into []. */
  private static List<Id> whoSent(
    List<Id> whoCanDoIt,
    SeenSaves.Ticket ticket
  ) {
    return whoCanDoIt != null &&
      whoCanDoIt.isEmpty() &&
      ticket?.seenWho == null
      ? null
      : whoCanDoIt;
  }
}
