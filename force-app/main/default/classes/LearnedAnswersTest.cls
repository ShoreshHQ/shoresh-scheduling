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
  static void anAnswerByAFormerUserHasNoNameAndTheCampsDate() {
    User former = ShoreshTestData.scheduler();
    Camp__c willow;
    System.runAs(former) {
      willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'fixed' }
      );
      // 2am on 3 Jul in London is still 2 Jul in New York, the camp's time zone.
      Test.setCreatedDate(
        only(willow.Id).Id,
        Datetime.newInstanceGmt(2026, 7, 3, 2, 0, 0)
      );
    }
    System.runAs(new User(Id = UserInfo.getUserId())) {
      update new User(Id = former.Id, IsActive = false);
    }
    System.runAs(ShoreshTestData.scheduler()) {
      Test.startTest();
      List<LearnedAnswers.Learned> rows = LearnedController.getLearned(
        willow.Id
      );
      Test.stopTest();
      Assert.isFalse(rows[0].byYou);
      Assert.isNull(rows[0].byName, 'the screen says "a former user"');
      Assert.areEqual(Date.newInstance(2026, 7, 2), rows[0].answeredOn);
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
      // The new answer is edited in place by someone else (no import does this now: an import's
      // different answer replaces the record, ADR 0021 choice 9); Undo must still refuse it.
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

  // MEMO-3.3
  @IsTest
  static void aChangeKeepsTheShapeAndIsPickedWithoutASuggestion() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      insert new ImportAnswer__c(
        Camp__c = willow.Id,
        Key__c = ImportAnswers.keyOf(willow.Id, 'kind|Lunch'),
        QuestionKey__c = 'kind|Lunch',
        Answer__c = 'activity',
        Shape__c = 'weeks|everyone|one',
        FromSuggestion__c = true
      );
      Test.startTest();
      Id changed = LearnedController.changeLearned(
        willow.Id,
        only(willow.Id).Id,
        'fixed'
      );
      Test.stopTest();
      LearnedAnswers.Learned row = LearnedController.getLearned(willow.Id)[0];
      Assert.areEqual(changed, row.id);
      Assert.areEqual('weeks|everyone|one', row.shape);
      Assert.isFalse(row.fromSuggestion);
      Assert.isNotNull(row.savedAt);
    }
  }

  // MEMO-4.5
  @IsTest
  static void forgettingAPatternKeepsItsAnswersAndCanBeUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      Camp__c cedar = ShoreshTestData.camp('Camp Cedar');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{
          'kind|Lunch 1' => 'recurring',
          'kind|Lunch 2' => 'recurring'
        }
      );
      Test.startTest();
      List<Id> first = LearnedController.forgetLearnedPattern(
        willow.Id,
        'numbered',
        'lunch'
      );
      List<Id> second = LearnedController.forgetLearnedPattern(
        willow.Id,
        'numbered',
        'lunch'
      );
      Boolean undone = LearnedController.undoChangeLearned(
        willow.Id,
        second[0],
        second[1]
      );
      Boolean refused = false;
      try {
        LearnedController.forgetLearnedPattern(willow.Id, 'search', 'lunch');
      } catch (AuraHandledException e) {
        refused = true;
      }
      Test.stopTest();
      Assert.areEqual(1, first.size(), 'no marker before');
      Assert.areEqual(2, second.size(), 'the earlier marker replaced');
      Assert.areEqual(first[0], second[1]);
      Assert.isTrue(undone, 'Undo brings the earlier marker back');
      Assert.isTrue(refused, 'only a template from the fixed list');
      // A long text can't be sorted in a query: by question here (keys are unique per camp).
      Map<String, ImportAnswer__c> byQuestion = new Map<String, ImportAnswer__c>();
      for (ImportAnswer__c saved : [
        SELECT Id, QuestionKey__c, Answer__c
        FROM ImportAnswer__c
        WHERE Camp__c = :willow.Id
        ORDER BY Id
      ]) {
        byQuestion.put(saved.QuestionKey__c, saved);
      }
      List<String> questions = new List<String>(byQuestion.keySet());
      questions.sort();
      Assert.areEqual(
        new List<String>{
          'kind|Lunch 1',
          'kind|Lunch 2',
          'pattern|numbered|lunch'
        },
        questions,
        'both answers stay, with one marker'
      );
      Assert.areEqual(first[0], byQuestion.get('pattern|numbered|lunch').Id);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ImportAnswer__c WHERE Camp__c = :cedar.Id],
        'another camp untouched'
      );
    }
  }

  // MEMO-4.5
  @IsTest
  static void aPatternMarkerEscapesItsPartsAsTheScreenReadsThem() {
    Test.startTest();
    String marker = LearnedAnswers.markerOf(
      'numbered',
      'lunch|day\\|camp\\\\1'
    );
    Test.stopTest();
    // c/shoreshPatterns shoreshPatterns.test.js expects this same string.
    Assert.areEqual('pattern|numbered|lunch\\|day\\\\\\|camp\\\\\\\\1', marker);
  }

  // MEMO-3.2
  @IsTest
  static void aChangeHereIsMarkedAsNoImport() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Test.startTest();
      LearnedController.changeLearned(willow.Id, only(willow.Id).Id, 'fixed');
      Test.stopTest();
      LearnedAnswers.Learned row = LearnedController.getLearned(willow.Id)[0];
      Assert.isTrue(row.fromLearned);
      Assert.isFalse(ImportAnswers.forCamp(willow.Id)[0].fromSuggestion);
      Assert.isTrue(ImportAnswers.forCamp(willow.Id)[0].fromLearned);
    }
  }
}
