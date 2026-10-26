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
  static void aChangeIsANewAnswerByWhoeverChangedItToday() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Id answerId = only(willow.Id).Id;
      Test.setCreatedDate(answerId, Datetime.newInstance(2026, 7, 3, 12, 0, 0));
      Test.startTest();
      Id changed = LearnedController.changeLearned(
        willow.Id,
        answerId,
        'fixed'
      );
      Boolean refused = false;
      try {
        LearnedController.changeLearned(willow.Id, changed, 'Main');
      } catch (AuraHandledException e) {
        refused = true;
        Assert.areEqual(
          'That answer can\'t be given to this question.',
          e.getMessage()
        );
      }
      Id again = LearnedController.changeLearned(willow.Id, answerId, 'fixed');
      Test.stopTest();
      Assert.isTrue(refused, 'not one of its choices');
      Assert.isNull(
        again,
        'the old answer is gone: the screen shows the latest'
      );
      Assert.areNotEqual(answerId, changed, 'a new record');
      List<LearnedAnswers.Learned> rows = LearnedController.getLearned(
        willow.Id
      );
      Assert.areEqual(1, rows.size());
      Assert.areEqual(changed, rows[0].id);
      Assert.areEqual('fixed', rows[0].answer);
      Assert.isTrue(rows[0].byYou);
      Assert.areEqual(Date.today(), rows[0].answeredOn);
    }
  }

  @IsTest
  static void undoOfAChangeBringsBackTheOldAnswerWithItsDate() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Id oldId = only(willow.Id).Id;
      Datetime answered = Datetime.newInstance(2026, 7, 3, 12, 0, 0);
      Test.setCreatedDate(oldId, answered);
      Id newId = LearnedController.changeLearned(willow.Id, oldId, 'fixed');
      Test.startTest();
      Boolean undone = LearnedController.undoChangeLearned(
        willow.Id,
        newId,
        oldId
      );
      Test.stopTest();
      Assert.isTrue(undone);
      ImportAnswer__c back = [
        SELECT Id, Answer__c, CreatedDate
        FROM ImportAnswer__c
        WHERE Camp__c = :willow.Id
      ];
      Assert.areEqual(oldId, back.Id);
      Assert.areEqual('activity', back.Answer__c);
      Assert.areEqual(answered, back.CreatedDate, 'who and when kept');
    }
  }

  @IsTest
  static void undoOfAChangeNeverOverwritesANewerAnswer() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      String question = 'kind|Lunch';
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ question => 'activity' }
      );
      Id oldId = only(willow.Id).Id;
      Id newId = LearnedController.changeLearned(willow.Id, oldId, 'fixed');
      // Forgotten since, and an import answered the question again.
      LearnedController.forgetLearned(willow.Id, newId);
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ question => 'recurring' }
      );
      Test.startTest();
      Boolean undone = LearnedController.undoChangeLearned(
        willow.Id,
        newId,
        oldId
      );
      Test.stopTest();
      Assert.isFalse(undone);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM ImportAnswer__c WHERE Camp__c = :willow.Id]
      );
      Assert.areEqual('recurring', only(willow.Id).Answer__c);
    }
  }

  @IsTest
  static void undoOfAChangeRefusedWhenAnImportChangedTheNewAnswer() {
    User importer = ShoreshTestData.scheduler();
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Id oldId = only(willow.Id).Id;
      Id newId = LearnedController.changeLearned(willow.Id, oldId, 'fixed');
      // Another person's import answers the question again, on the same record.
      System.runAs(importer) {
        Database.update(
          new ImportAnswer__c(Id = newId, Answer__c = 'recurring'),
          AccessLevel.SYSTEM_MODE
        );
      }
      Test.startTest();
      Boolean undone = LearnedController.undoChangeLearned(
        willow.Id,
        newId,
        oldId
      );
      Test.stopTest();
      Assert.isFalse(undone);
      ImportAnswer__c kept = only(willow.Id);
      Assert.areEqual(newId, kept.Id);
      Assert.areEqual('recurring', kept.Answer__c);
    }
  }

  @IsTest
  static void aChangeWhoseSaveIsRefusedKeepsTheOldAnswer() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Id oldId = only(willow.Id).Id;
      LearnedAnswers.refuseSave = true;
      Test.startTest();
      Boolean refused = false;
      try {
        LearnedController.changeLearned(willow.Id, oldId, 'fixed');
      } catch (AuraHandledException e) {
        refused = true;
      }
      Test.stopTest();
      Assert.isTrue(refused);
      ImportAnswer__c kept = only(willow.Id);
      Assert.areEqual(oldId, kept.Id, 'the old answer is back');
      Assert.areEqual('activity', kept.Answer__c);
    }
  }

  @IsTest
  static void undoOfAChangeWhoseOldAnswerCannotComeBackKeepsTheNewOne() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Id oldId = only(willow.Id).Id;
      Id newId = LearnedController.changeLearned(willow.Id, oldId, 'fixed');
      LearnedUndo.refuseUndelete = true;
      Test.startTest();
      Boolean undone = LearnedController.undoChangeLearned(
        willow.Id,
        newId,
        oldId
      );
      Test.stopTest();
      Assert.isFalse(undone);
      ImportAnswer__c kept = only(willow.Id);
      Assert.areEqual(newId, kept.Id, 'the new answer stays');
      Assert.areEqual('fixed', kept.Answer__c);
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
      Id changed = LearnedController.changeLearned(willow.Id, cedars, 'fixed');
      Boolean forgotten = LearnedController.forgetLearned(willow.Id, cedars);
      Test.stopTest();
      Assert.isNull(changed);
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
        SELECT Id, CreatedById
        FROM ImportAnswer__c
        WHERE Camp__c = :willow.Id
      ];
      // Answered long ago: the record that comes back is that one, not one made today.
      Datetime answered = Datetime.newInstance(2026, 7, 3, 12, 0, 0);
      Test.setCreatedDate(before.Id, answered);
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
        SELECT Id, QuestionKey__c, Answer__c, CreatedById, CreatedDate
        FROM ImportAnswer__c
        WHERE Camp__c = :willow.Id
      ];
      Assert.areEqual(before.Id, back.Id, 'the same record, not a new one');
      Assert.areEqual(question, back.QuestionKey__c);
      Assert.areEqual('deleted', back.Answer__c);
      Assert.areEqual(before.CreatedById, back.CreatedById);
      Assert.areEqual(answered, back.CreatedDate, 'the original record');
    }
  }

  @IsTest
  static void undoNeverOverwritesANewerAnswer() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      String question = 'kind|Lunch';
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ question => 'fixed' }
      );
      Id forgotten = only(willow.Id).Id;
      LearnedController.forgetLearned(willow.Id, forgotten);
      // An import answers the same question again since.
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ question => 'activity' }
      );
      Test.startTest();
      Boolean restored = LearnedController.restoreLearned(willow.Id, forgotten);
      Test.stopTest();
      Assert.isFalse(restored, 'the screen shows the latest instead');
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM ImportAnswer__c WHERE Camp__c = :willow.Id]
      );
      Assert.areEqual('activity', only(willow.Id).Answer__c);
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
