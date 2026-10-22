/**
 * Things you delete stay deleted (Greg, decision 45): a delete on a setup screen is remembered
 * for the camp with the import answers, and an import that brings the item back forgets it.
 * Made-up camps only; every record is made by the scheduler, inside the same System.runAs.
 */
@IsTest
private class SetupDeletionsTest {
  private static Map<String, String> answersOf(Id campId) {
    Map<String, String> result = new Map<String, String>();
    for (ImportAnswers.Answer answer : ImportController.getAnswers(campId)) {
      result.put(answer.key, answer.answer);
    }
    return result;
  }

  @IsTest
  static void aDeleteOnASetupScreenIsRememberedForTheCamp() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Program__c program = ShoreshTestData.program(season.Id, 'Juniors');
      Division__c division = ShoreshTestData.division(program.Id, 'Main');
      Group__c bunk = ShoreshTestData.groupIn(division.Id, 'Bunk 3');
      TimeBlock__c block = ShoreshTestData.timeBlock(
        program.Id,
        'Period 2',
        10
      );
      Location__c pool = new Location__c(
        Season__c = season.Id,
        Name = 'Pool',
        GroupsThatFit__c = 1
      );
      Database.insert(pool, AccessLevel.SYSTEM_MODE);
      Activity__c archery = ShoreshTestData.activity(
        season.Id,
        'Archery',
        null
      );
      Database.insert(archery, AccessLevel.SYSTEM_MODE);

      Test.startTest();
      SeasonSetupController.deleteRecord(archery.Id);
      Integer queries = Limits.getQueries();
      SeasonSetupController.deleteRecord(bunk.Id);
      SeasonSetupController.deleteRecord(block.Id);
      SeasonSetupController.deleteRecord(pool.Id);
      Assert.isTrue(
        queries < 30,
        'One delete stays well under 100 queries: ' + queries
      );
      Test.stopTest();

      Map<String, String> answers = answersOf(camp.Id);
      Assert.areEqual(
        new Map<String, String>{
          'deleted|Activity||Archery' => 'deleted',
          'deleted|Group|Juniors|Bunk 3' => 'deleted',
          'deleted|TimeBlock|Juniors|Period 2' => 'deleted',
          'deleted|Location||Pool' => 'deleted'
        },
        answers
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WITH USER_MODE],
        'the delete itself still happens'
      );
    }
  }

  @IsTest
  static void deletingTheSameNameTwiceIsOneAnswer() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Activity__c first = ShoreshTestData.activity(season.Id, 'Swim', null);
      Database.insert(first, AccessLevel.SYSTEM_MODE);
      SeasonSetupController.deleteRecord(first.Id);
      // Made again by hand, then deleted again.
      Activity__c second = ShoreshTestData.activity(season.Id, 'Swim', null);
      Database.insert(second, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      SeasonSetupController.deleteRecord(second.Id);
      Test.stopTest();
      Assert.areEqual(1, answersOf(camp.Id).size());
    }
  }

  @IsTest
  static void aRefusedDeleteRemembersNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Map<String, Id> ids = ShoreshTestData.placesAndActivities(season.Id);
      Test.startTest();
      try {
        // Swim happens at the Pool: the location can't go yet.
        SeasonSetupController.deleteRecord(ids.get('Pool'));
        Assert.fail('refused');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('Swim'), e.getMessage());
      }
      Test.stopTest();
      Assert.areEqual(0, answersOf(camp.Id).size());
    }
  }

  @IsTest
  static void aSeasonDeleteIsNotRemembered() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Test.startTest();
      SeasonSetupController.deleteRecord(season.Id);
      Test.stopTest();
      Assert.areEqual(0, answersOf(camp.Id).size());
    }
  }

  @IsTest
  static void anImportThatBringsItBackForgetsTheDeletion() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      ShoreshTestData.weeks(season.Id, 1);
      Activity__c swim = ShoreshTestData.activity(season.Id, 'Swim', null);
      Database.insert(swim, AccessLevel.SYSTEM_MODE);
      SeasonSetupController.deleteRecord(swim.Id);
      Map<String, Object> plan = ImportTestPlans.emptyPlan(season.Id);
      ((List<Object>) plan.get('forget')).add('deleted|Activity||Swim');
      Test.startTest();
      ImportController.saveSetup(JSON.serialize(plan));
      Test.stopTest();
      Assert.areEqual(0, answersOf(camp.Id).size());
    }
  }
}
