/**
 * The CORE protocol's terms that live in Apex (docs/protocol/core.md, layer 1). Synthetic only.
 */
@IsTest
private class CoreTermsTest {
  // CORE-1.6
  @IsTest
  static void aBlockIsMorningOrAfternoonByItsStartTime() {
    TimeBlock__c block = new TimeBlock__c(
      StartTime__c = Time.newInstance(13, 30, 0, 0),
      EndTime__c = Time.newInstance(14, 15, 0, 0)
    );
    System.runAs(ShoreshTestData.scheduler()) {
      Assert.areEqual(
        'Morning',
        TimeBlockTriggerHandler.partOfDayFor(Time.newInstance(11, 59, 0, 0))
      );
      Assert.areEqual(
        'Afternoon',
        TimeBlockTriggerHandler.partOfDayFor(Time.newInstance(12, 0, 0, 0))
      );
      TimeBlockTriggerHandler.beforeSave(new List<TimeBlock__c>{ block }, null);
    }
    Assert.areEqual('Afternoon', block.PartOfDay__c);
  }
}
