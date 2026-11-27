/**
 * What Generate and Rebuild build from (GeneratedInputs): each activity with its When it runs, so
 * the engine never places it in a box unticked (ADR 0031 piece A), and who leads it, so Generated
 * Schedule's Why list and its Print and Excel menus know each activity's leaders (piece B).
 * Synthetic data only.
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

  // CORE-6.20, PUB-6.13: Generated Schedule checks and prints its week with these inputs, so they
  // carry who leads each activity (live bugs: its Why list never showed a leader in two places at
  // once, and its Print and Excel menus never offered a staff member's week).
  @IsTest
  static void theBuildsInputsCarryWhoLeadsIt() {
    Map<String, Id> ids = KeptCamp.keptIds();
    GeneratedTestData.ids = ids;
    System.runAs(KeptCamp.scheduler(ids)) {
      StaffMember__c dana = new StaffMember__c(
        Season__c = ids.get('Season'),
        Name = 'Dana'
      );
      Database.insert(dana, AccessLevel.USER_MODE);
      Database.insert(
        new ActivityLeader__c(
          Activity__c = ids.get('Soccer'),
          StaffMember__c = dana.Id
        ),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Activity__c soccer = new Map<Id, Activity__c>(read.activities)
        .get(ids.get('Soccer'));
      Assert.areEqual(1, soccer.Leaders__r.size());
      Assert.areEqual(dana.Id, soccer.Leaders__r[0].StaffMember__c);
      Assert.areEqual('Dana', soccer.Leaders__r[0].StaffMember__r.Name);
    }
  }
}
