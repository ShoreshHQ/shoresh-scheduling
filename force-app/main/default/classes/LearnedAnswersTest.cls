/** "What Shoresh has learned" (repo ADR 0021): read, change, forget and Undo, camp by camp. */
@IsTest
private class LearnedAnswersTest {
  private static Map<String, String> answers(Integer count) {
    Map<String, String> result = new Map<String, String>();
    for (Integer i = 0; i < count; i++) {
      result.put('kind|Activity ' + i, 'activity');
    }
    return result;
  }

  private static ImportAnswer__c only(Id campId) {
    return [
      SELECT Id, QuestionKey__c, Answer__c
      FROM ImportAnswer__c
      WHERE Camp__c = :campId
      LIMIT 1
    ];
  }

  @IsTest
  static void readsACampsAnswersWithWhoAndWhenInOneQuery() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      Camp__c cedar = ShoreshTestData.camp('Camp Cedar');
      ImportAnswers.rememberEach(willow.Id, answers(150));
      ImportAnswers.rememberEach(
        cedar.Id,
        new Map<String, String>{ 'kind|Lunch' => 'fixed' }
      );
      Test.startTest();
      Integer before = Limits.getQueries();
      List<LearnedAnswers.Learned> rows = LearnedController.getLearned(
        willow.Id
      );
      Integer queries = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(1, queries, 'one query, whatever the number');
      Assert.areEqual(150, rows.size(), 'only this camp\'s answers');
      Assert.isTrue(rows[0].byYou);
      Assert.areEqual('Scheduler', rows[0].byName);
      Assert.areEqual(Date.today(), rows[0].answeredOn);
      Assert.areEqual('activity', rows[0].answer);
      Assert.isTrue(rows[0].question.startsWith('kind|Activity '));
    }
  }

  @IsTest
  static void changesAnAnswerOnlyToOneOfItsChoices() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Id answerId = only(willow.Id).Id;
      Test.startTest();
      Assert.isTrue(
        LearnedController.changeLearned(willow.Id, answerId, 'fixed')
      );
      Boolean refused = false;
      try {
        LearnedController.changeLearned(willow.Id, answerId, 'Main');
      } catch (AuraHandledException e) {
        refused = true;
        Assert.areEqual(
          'That answer can\'t be given to this question.',
          e.getMessage()
        );
      }
      Test.stopTest();
      Assert.isTrue(refused, 'not one of its choices');
      Assert.areEqual('fixed', only(willow.Id).Answer__c);
    }
  }

  @IsTest
  static void anAnswerThatIsANameIsOnlyForgotten() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{
          'program|Group A,Group B' => 'Main',
          'change|block|Main|Period 1|9:00-9:45' => 'keep'
        }
      );
      Test.startTest();
      Integer refused = 0;
      for (ImportAnswer__c row : [
        SELECT Id
        FROM ImportAnswer__c
        WHERE Camp__c = :willow.Id
      ]) {
        try {
          LearnedController.changeLearned(willow.Id, row.Id, 'change');
        } catch (AuraHandledException e) {
          refused++;
        }
      }
      Test.stopTest();
      Assert.areEqual(2, refused);
    }
  }

  @IsTest
  static void anotherCampsAnswerIsNeitherChangedNorForgotten() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      Camp__c cedar = ShoreshTestData.camp('Camp Cedar');
      ImportAnswers.rememberEach(
        cedar.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Id cedars = only(cedar.Id).Id;
      Test.startTest();
      Boolean changed = LearnedController.changeLearned(
        willow.Id,
        cedars,
        'fixed'
      );
      Boolean forgotten = LearnedController.forgetLearned(willow.Id, cedars);
      Test.stopTest();
      Assert.isFalse(changed);
      Assert.isFalse(forgotten);
      Assert.areEqual('activity', only(cedar.Id).Answer__c);
    }
  }

  @IsTest
  static void undoBringsBackTheSameRecordWithWhoAndWhen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      String question = 'deleted|Activity||Riflery';
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ question => 'deleted' }
      );
      ImportAnswer__c before = [
        SELECT Id, LastModifiedById, LastModifiedDate
        FROM ImportAnswer__c
        WHERE Camp__c = :willow.Id
      ];
      Test.startTest();
      Assert.isTrue(LearnedController.forgetLearned(willow.Id, before.Id));
      Assert.isFalse(
        LearnedController.forgetLearned(willow.Id, before.Id),
        'already gone'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ImportAnswer__c WHERE Camp__c = :willow.Id]
      );
      Assert.isTrue(LearnedController.restoreLearned(willow.Id, before.Id));
      Test.stopTest();
      ImportAnswer__c back = [
        SELECT Id, QuestionKey__c, Answer__c, LastModifiedById, LastModifiedDate
        FROM ImportAnswer__c
        WHERE Camp__c = :willow.Id
      ];
      Assert.areEqual(before.Id, back.Id, 'the same record, not a new one');
      Assert.areEqual(question, back.QuestionKey__c);
      Assert.areEqual('deleted', back.Answer__c);
      Assert.areEqual(before.LastModifiedById, back.LastModifiedById);
    }
  }

  @IsTest
  static void undoRemembersTheAnswerAgainWhenTheRecordCannotComeBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      String question = 'kind|Lunch';
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ question => 'fixed' }
      );
      Id forgotten = only(willow.Id).Id;
      LearnedController.forgetLearned(willow.Id, forgotten);
      // An import answers the same question again: the old record can't come back beside it.
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ question => 'activity' }
      );
      Test.startTest();
      Assert.isTrue(LearnedController.restoreLearned(willow.Id, forgotten));
      Test.stopTest();
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM ImportAnswer__c WHERE Camp__c = :willow.Id]
      );
      Assert.areEqual('fixed', only(willow.Id).Answer__c);
    }
  }

  @IsTest
  static void undoFindsOnlyThisCampsForgottenAnswers() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      Camp__c cedar = ShoreshTestData.camp('Camp Cedar');
      ImportAnswers.rememberEach(
        cedar.Id,
        new Map<String, String>{ 'kind|Lunch' => 'fixed' }
      );
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Swim' => 'activity' }
      );
      Id cedars = only(cedar.Id).Id;
      Id willows = only(willow.Id).Id;
      LearnedController.forgetLearned(cedar.Id, cedars);
      Test.startTest();
      Boolean other = LearnedController.restoreLearned(willow.Id, cedars);
      Boolean notForgotten = LearnedController.restoreLearned(
        willow.Id,
        willows
      );
      Test.stopTest();
      Assert.isFalse(other, 'another camp\'s answer');
      Assert.isFalse(notForgotten, 'nothing to bring back');
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ImportAnswer__c WHERE Camp__c = :cedar.Id]
      );
    }
  }

  @IsTest
  static void someoneWithoutShoreshCannotReadThem() {
    Camp__c willow = ShoreshTestData.camp('Camp Willow');
    ImportAnswers.rememberEach(
      willow.Id,
      new Map<String, String>{ 'kind|Lunch' => 'fixed' }
    );
    System.runAs(ShoreshTestData.outsider()) {
      Test.startTest();
      Boolean refused = false;
      try {
        LearnedController.getLearned(willow.Id);
      } catch (AuraHandledException e) {
        refused = true;
      }
      Test.stopTest();
      Assert.isTrue(refused);
    }
  }
}
