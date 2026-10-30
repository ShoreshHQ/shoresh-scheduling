/**
 * Each send to a camp's saved destination: posted, then kept, so a failed one shows on Settings
 * (API-6.3): the last send of each thing to each destination, when it failed, in its own sentence.
 *
 * Posting happens just after the Flow action, not in the same go: Salesforce allows no post to
 * another system after a save, or a job started, in the same go, so a camp's Flow that sends two
 * things in a row would fail on the second. The records were already read, as the user, by the
 * Flow action (OutgoingDoors); this only posts them and keeps what happened.
 */
public with sharing class SendLog implements Queueable, Database.AllowsCallouts {
  private static final Integer MOST_SHOWN = 200;
  // Sends refused before any post (kept as they are), and the posts to make.
  private List<Send__c> sends;
  private List<Delivery> deliveries;

  /** One post to make: where, what (and as which kind of file), and the send it is kept on. */
  public class Delivery {
    public Send__c log;
    public String destination;
    public String body;
    public String contentType;
  }

  /** Posts the deliveries and keeps the sends, just after this go. */
  public static void deliver(List<Send__c> sends, List<Delivery> deliveries) {
    if (!sends.isEmpty() || !deliveries.isEmpty()) {
      System.enqueueJob(new SendLog(sends, deliveries));
    }
  }

  private SendLog(List<Send__c> sends, List<Delivery> deliveries) {
    this.sends = sends;
    this.deliveries = deliveries;
  }

  /**
   * Every post first, then the sends kept (no post may follow a save). Shoresh's own record of
   * what it did, like an import's, so kept in system mode: whoever made the send need only see
   * the season (the Flow action found it in user mode).
   */
  public void execute(QueueableContext context) {
    List<Send__c> kept = new List<Send__c>(sends);
    for (Delivery each : deliveries) {
      kept.add(each.log);
      try {
        OutgoingDoors.post(each.destination, each.body, each.contentType);
      } catch (Exception e) {
        each.log.Problem__c =
          'Couldn\'t send ' +
          each.log.What__c +
          ' to ' +
          each.destination +
          ': ' +
          (e instanceof ShoreshException
            ? e.getMessage()
            : ScreenErrors.of(e).getMessage());
      }
    }
    Database.insert(kept, AccessLevel.SYSTEM_MODE);
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
