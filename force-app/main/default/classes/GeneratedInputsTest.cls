/**
 * What Generate and Rebuild build from (GeneratedInputs): each activity with its When it runs, so
 * the engine never places it in a box unticked (ADR 0031 piece A). Synthetic data only.
 */
@IsTest
private class GeneratedInputsTest {
  @TestSetup
  static void makeCamp() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      ids = GeneratedTestData.camp();
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  // GEN-3.14: what Generate and Rebuild build from carries When it runs, so the engine never
  // places an activity in a box unticked (live bug: Rebuild put Archery back in its off box).
  @IsTest
  static void theBuildsInputsCarryWhenItRuns() {
    Map<String, Id> ids = KeptCamp.keptIds();
    GeneratedTestData.ids = ids;
    System.runAs(KeptCamp.scheduler(ids)) {
      Database.insert(
        new ActivityOffTime__c(
          Activity__c = ids.get('Soccer'),
          TimeBlock__c = ids.get('Lunch'),
          Day__c = 'Monday'
        ),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Activity__c soccer = new Map<Id, Activity__c>(read.activities)
        .get(ids.get('Soccer'));
      Assert.isNotNull(soccer, 'Soccer is among the inputs');
      Assert.areEqual(1, soccer.OffTimes__r.size());
      Assert.areEqual(ids.get('Lunch'), soccer.OffTimes__r[0].TimeBlock__c);
      Assert.areEqual('Monday', soccer.OffTimes__r[0].Day__c);
    }
  }
}
