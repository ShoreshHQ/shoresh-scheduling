/**
 * What an action through an agent needs (docs/protocol/api.md API-1.11): one address is one verb, so a
 * read is a GET, and every other verb changes something and takes the right to change schedules.
 */
public with sharing class AgentAccess {
  public static void require() {
    if (RestContext.request.httpMethod != 'GET') {
      AgentWeeks.requireScheduler();
    }
  }
}
