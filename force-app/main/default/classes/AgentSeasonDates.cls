/**
 * The season form's two dates (docs/protocol/api.md API-1.57): sent together, as the form sends them.
 */
public with sharing class AgentSeasonDates {
  /** The form sends the two dates together: the last day may not come before the first. */
  public static void together(
    Season__c record,
    Map<String, Object> given,
    Season__c now
  ) {
    Boolean start = given.containsKey('start_date');
    Boolean last = given.containsKey('end_date');
    if (start && !last) {
      record.EndDate__c = now.EndDate__c;
    } else if (last && !start) {
      record.StartDate__c = now.StartDate__c;
    }
  }
}
