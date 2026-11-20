/** A published schedule for tests that need published history, as Publish leaves one. */
@IsTest
public class PublishedTestData {
  /** The program's week published: published history. */
  public static Schedule__c schedule(Id programId, Id weekId) {
    Schedule__c schedule = new Schedule__c(
      Program__c = programId,
      Week__c = weekId,
      Name = 'Published',
      Status__c = 'Published',
      Origin__c = 'Manual'
    );
    PublishedGuard.allow();
    try {
      Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    } finally {
      PublishedGuard.done();
    }
    return schedule;
  }
}
