/**
 * Remembered answers (ADR 0006 §19, repo ADR 0021): who gave each and when, read with the
 * answers; an import that answers again differently replaces the record, the same answer keeps it.
 */
@IsTest
private class ImportAnswersTest {
  private static ImportPlan plan(String question, String answer) {
    return new ImportPlan(
      JSON.serialize(
        new Map<String, Object>{
          'remember' => new List<Object>{
            new Map<String, Object>{ 'key' => question, 'answer' => answer }
          }
        }
      )
    );
  }

  private static ImportAnswer__c only(Id campId) {
    return [
      SELECT Id, Answer__c, CreatedById, CreatedDate
      FROM ImportAnswer__c
      WHERE Camp__c = :campId
    ];
  }

  @IsTest
  static void anImportAnsweringDifferentlyReplacesTheAnswerAsItsOwn() {
    User first = ShoreshTestData.scheduler();
    User second = ShoreshTestData.scheduler();
    Camp__c willow;
    ImportAnswer__c before;
    System.runAs(first) {
      willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.save(willow.Id, plan('kind|Lunch', 'activity'));
      before = only(willow.Id);
      Test.setCreatedDate(
        before.Id,
        Datetime.newInstance(2026, 7, 3, 12, 0, 0)
      );
    }
    System.runAs(second) {
      Test.startTest();
      Integer queries = Limits.getQueries();
      ImportAnswers.save(willow.Id, plan('kind|Lunch', 'fixed'));
      queries = Limits.getQueries() - queries;
      Test.stopTest();
      ImportAnswer__c after = only(willow.Id);
      Assert.areEqual(1, queries, 'one query, then the writes');
      Assert.areNotEqual(before.Id, after.Id, 'a new record');
      Assert.areEqual('fixed', after.Answer__c);
      Assert.areEqual(second.Id, after.CreatedById);
      Assert.areEqual(Date.today(), after.CreatedDate.date());
    }
  }

  @IsTest
  static void theSameAnswerAgainKeepsWhoGaveItFirstAndWhen() {
    User first = ShoreshTestData.scheduler();
    User second = ShoreshTestData.scheduler();
    Camp__c willow;
    ImportAnswer__c before;
    Datetime answered = Datetime.newInstance(2026, 7, 3, 12, 0, 0);
    System.runAs(first) {
      willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'fixed' }
      );
      before = only(willow.Id);
      Test.setCreatedDate(before.Id, answered);
    }
    System.runAs(second) {
      Test.startTest();
      ImportAnswers.save(willow.Id, plan('kind|Lunch', 'fixed'));
      // Capitals are a different answer: replaced, not kept.
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Swim' => 'Fixed' }
      );
      Test.stopTest();
      ImportAnswer__c after = [
        SELECT Id, CreatedById, CreatedDate
        FROM ImportAnswer__c
        WHERE Key__c = :ImportAnswers.keyOf(willow.Id, 'kind|Lunch')
      ];
      Assert.areEqual(before.Id, after.Id, 'left untouched');
      Assert.areEqual(first.Id, after.CreatedById);
      Assert.areEqual(answered, after.CreatedDate);
    }
  }

  @IsTest
  static void readsWhoAndWhenInTheCampsTimeZone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.save(willow.Id, plan('kind|Lunch', 'fixed'));
      // 2am on 3 Jul in London is still 2 Jul in New York, the camp's time zone.
      Test.setCreatedDate(
        only(willow.Id).Id,
        Datetime.newInstanceGmt(2026, 7, 3, 2, 0, 0)
      );
      Test.startTest();
      Integer queries = Limits.getQueries();
      List<ImportAnswers.Answer> answers = ImportController.getAnswers(
        willow.Id
      );
      queries = Limits.getQueries() - queries;
      Test.stopTest();
      Assert.areEqual(1, queries, 'one query, whatever the number');
      Assert.areEqual('kind|Lunch', answers[0].key);
      Assert.isTrue(answers[0].byYou);
      Assert.areEqual('Scheduler', answers[0].byName);
      Assert.areEqual(Date.newInstance(2026, 7, 2), answers[0].answeredOn);
    }
  }

  @IsTest
  static void anAnswerBySomeoneNoLongerHereHasNoName() {
    User former = ShoreshTestData.scheduler();
    User reader = ShoreshTestData.scheduler();
    Camp__c willow;
    System.runAs(former) {
      willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.save(willow.Id, plan('kind|Lunch', 'fixed'));
    }
    System.runAs(new User(Id = UserInfo.getUserId())) {
      update new User(Id = former.Id, IsActive = false);
    }
    System.runAs(reader) {
      Test.startTest();
      List<ImportAnswers.Answer> answers = ImportAnswers.forCamp(willow.Id);
      Test.stopTest();
      Assert.isFalse(answers[0].byYou);
      Assert.isNull(answers[0].byName, 'the screen says "a former user"');
    }
  }
}
