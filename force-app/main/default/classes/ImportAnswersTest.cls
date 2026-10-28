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

  // MEMO-2.1
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

  // MEMO-2.1
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

  @IsTest
  static void capitalsAreADifferentAnswerAndReplaceIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.save(willow.Id, plan('kind|Lunch', 'fixed'));
      ImportAnswer__c before = only(willow.Id);
      Test.startTest();
      ImportAnswers.save(willow.Id, plan('kind|Lunch', 'Fixed'));
      Test.stopTest();
      ImportAnswer__c after = only(willow.Id);
      Assert.areNotEqual(before.Id, after.Id, 'a new record');
      Assert.areEqual('Fixed', after.Answer__c);
    }
  }

  @IsTest
  static void aRefusedSaveKeepsTheOldAnswer() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.save(willow.Id, plan('kind|Lunch', 'activity'));
      ImportAnswer__c before = only(willow.Id);
      ImportAnswers.refuseSave = true;
      Test.startTest();
      Boolean refused = false;
      try {
        ImportAnswers.save(willow.Id, plan('kind|Lunch', 'fixed'));
      } catch (ShoreshException e) {
        refused = true;
      }
      Test.stopTest();
      Assert.isTrue(refused);
      ImportAnswer__c kept = only(willow.Id);
      Assert.areEqual(before.Id, kept.Id, 'the old answer is back');
      Assert.areEqual('activity', kept.Answer__c);
    }
  }

  // MEMO-3.2, MEMO-3.3
  @IsTest
  static void savesTheQuestionsShapeAndWhetherItFollowedASuggestion() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportPlan given = new ImportPlan(
        JSON.serialize(
          new Map<String, Object>{
            'remember' => new List<Object>{
              new Map<String, Object>{
                'key' => 'kind|Lunch 1',
                'answer' => 'recurring',
                'shape' => 'weeks|some|one',
                'suggested' => true
              },
              new Map<String, Object>{
                'key' => 'kind|Lunch 2',
                'answer' => 'recurring'
              }
            }
          }
        )
      );
      Test.startTest();
      ImportAnswers.save(willow.Id, given);
      List<ImportAnswers.Answer> rows = ImportAnswers.forCamp(willow.Id);
      Test.stopTest();
      Map<String, ImportAnswers.Answer> byKey = new Map<String, ImportAnswers.Answer>();
      for (ImportAnswers.Answer row : rows) {
        byKey.put(row.key, row);
      }
      Assert.areEqual('weeks|some|one', byKey.get('kind|Lunch 1').shape);
      Assert.isTrue(byKey.get('kind|Lunch 1').fromSuggestion);
      Assert.isNull(byKey.get('kind|Lunch 2').shape);
      Assert.isFalse(
        byKey.get('kind|Lunch 2').fromSuggestion,
        'picked without a suggestion'
      );
      Assert.isNotNull(byKey.get('kind|Lunch 1').savedAt, 'when it was saved');
      Assert.areEqual(
        byKey.get('kind|Lunch 1').savedAt,
        byKey.get('kind|Lunch 2').savedAt,
        'one import\'s answers are saved together'
      );
    }
  }

  @IsTest
  static void readsNewestFirstAsTheLearnedScreenDoes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Old' => 'activity' }
      );
      Id old = [SELECT Id FROM ImportAnswer__c WHERE Camp__c = :willow.Id].Id;
      Test.setCreatedDate(old, Datetime.newInstance(2026, 7, 3, 12, 0, 0));
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'pattern|numbered|lunch' => 'forgotten' }
      );
      Test.startTest();
      List<ImportAnswers.Answer> rows = ImportAnswers.forCamp(willow.Id);
      List<LearnedAnswers.Learned> learned = LearnedAnswers.forCamp(willow.Id);
      Test.stopTest();
      // Past 5000 the oldest are left out: never the newest answer or marker.
      Assert.areEqual('pattern|numbered|lunch', rows[0].key);
      Assert.areEqual('kind|Old', rows[1].key);
      Assert.areEqual(learned[0].question, rows[0].key, 'the same order');
    }
  }
}
