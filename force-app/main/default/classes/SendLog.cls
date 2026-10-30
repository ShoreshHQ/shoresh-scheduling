/**
 * Each send to a camp's saved destination, kept so a failed one shows on Settings (API-6.3):
 * the last send of each thing to each destination, when it failed, in its own sentence.
 */
public with sharing class SendLog {
  private static final Integer MOST_SHOWN = 200;

  /**
   * Keeps the sends. Shoresh's own record of what it did, like an import's: whoever made the
   * send need only see the season (it found it in user mode).
   */
  public static void keep(List<Send__c> sends) {
    if (!sends.isEmpty()) {
      Database.insert(sends, AccessLevel.SYSTEM_MODE);
    }
  }

  /** The sentence of each destination's last send of each thing, where that send failed. */
  public static List<String> failedLast(Id seasonId) {
    List<String> failed = new List<String>();
    Set<String> seen = new Set<String>();
    for (Send__c send : [
      SELECT System__c, What__c, Problem__c
      FROM Send__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Name DESC
      LIMIT :MOST_SHOWN
    ]) {
      String key = (send.System__c + '|' + send.What__c).toLowerCase();
      if (seen.add(key) && String.isNotBlank(send.Problem__c)) {
        failed.add(send.Problem__c);
      }
    }
    return failed;
  }
}
