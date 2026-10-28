/**
 * The history behind "What Shoresh has learned" (repo ADR 0023): every change to what a camp
 * remembers is kept as an event, in the same save, by whoever made it; the screen reads them
 * newest first, camp by camp.
 */
@IsTest
private class LearnedEventsTest {
  private static ImportPlan plan(Map<String, Object> lists) {
    return new ImportPlan(JSON.serialize(lists));
  }

  private static Map<String, Object> entry(String key, String answer) {
    return new Map<String, Object>{ 'key' => key, 'answer' => answer };
  }

  private static List<LearnedEvent__c> events(Id campId) {
    return [
      SELECT What__c, QuestionKey__c, Answer__c, Shape__c, AnswerId__c
      FROM LearnedEvent__c
      WHERE Camp__c = :campId
      ORDER BY CreatedDate, Id
    ];
  }

  private static ImportAnswer__c answerOf(Id campId) {
    return [
      SELECT Id, Answer__c
      FROM ImportAnswer__c
      WHERE Camp__c = :campId
      LIMIT 1
    ];
  }

  private static List<String> whats(Id campId) {
    List<String> result = new List<String>();
    for (LearnedEvent__c e : events(campId)) {
      result.add(e.What__c + ':' + e.Answer__c);
    }
    return result;
  }

  // MEMO-7.3, MEMO-7.5
  @IsTest
  static void anImportKeepsEachNewAnswerWhatItForgotAndWhatItAutoApplied() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.save(
        willow.Id,
        plan(
          new Map<String, Object>{
            'remember' => new List<Object>{ entry('kind|Lunch', 'activity') }
          }
        )
      );
      Id first = answerOf(willow.Id).Id;
      Map<String, Object> second = new Map<String, Object>{
        'remember' => new List<Object>{
          entry('kind|Lunch', 'activity'),
          entry('kind|Swim', 'activity')
        },
        'autoApplied' => new List<Object>{ entry('kind|Specialty 4', 'fixed') }
      };
      Test.startTest();
      Integer before = Limits.getQueries();
      ImportAnswers.save(willow.Id, plan(second));
      Integer queries = Limits.getQueries() - before;
      ImportAnswers.save(
        willow.Id,
        plan(
          new Map<String, Object>{ 'forget' => new List<Object>{ 'kind|Swim' } }
        )
      );
      Test.stopTest();
      Assert.areEqual(1, queries, 'no query of its own');
      List<LearnedEvent__c> rows = events(willow.Id);
      Assert.areEqual(4, rows.size(), String.valueOf(rows));
      Assert.areEqual('answered', rows[0].What__c);
      Assert.areEqual(first, rows[0].AnswerId__c);
      // The same answer again is no new event: it is still the first one's.
      Set<String> seen = new Set<String>();
      for (LearnedEvent__c e : rows) {
        seen.add(e.What__c + ':' + e.QuestionKey__c + ':' + e.Answer__c);
      }
      Assert.isTrue(seen.contains('answered:kind|Swim:activity'));
      Assert.isTrue(seen.contains('auto:kind|Specialty 4:fixed'));
      Assert.isTrue(seen.contains('forgotten:kind|Swim:activity'));
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM ImportAnswer__c WHERE Camp__c = :willow.Id],
        'an auto-applied answer is never saved as an answer'
      );
    }
  }

  // MEMO-7.3
  @IsTest
  static void changeForgetAndUndoEachAddAnEventAndNoneIsEdited() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Id first = answerOf(willow.Id).Id;
      Test.startTest();
      Id changed = LearnedController.changeLearned(willow.Id, first, 'fixed');
      Assert.isTrue(
        LearnedController.undoChangeLearned(willow.Id, changed, first)
      );
      Assert.isTrue(LearnedController.forgetLearned(willow.Id, first));
      Assert.isTrue(LearnedController.restoreLearned(willow.Id, first));
      Test.stopTest();
      Assert.areEqual(
        new List<String>{
          'answered:activity',
          'changed:fixed',
          'undone:activity',
          'forgotten:activity',
          'undone:activity'
        },
        whats(willow.Id)
      );
      List<LearnedEvent__c> rows = events(willow.Id);
      Assert.areEqual(changed, rows[1].AnswerId__c);
      Assert.areEqual(first, rows[2].AnswerId__c, 'the answer back');
    }
  }

  // MEMO-7.3, MEMO-4.5
  @IsTest
  static void forgetPatternAndItsUndoAreKept() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      Test.startTest();
      List<Id> ids = LearnedController.forgetLearnedPattern(
        willow.Id,
        'numbered',
        'lunch'
      );
      Assert.isTrue(LearnedController.forgetLearned(willow.Id, ids[0]));
      Test.stopTest();
      List<LearnedEvent__c> rows = events(willow.Id);
      Assert.areEqual(2, rows.size());
      Assert.areEqual('forgotten', rows[0].What__c);
      Assert.areEqual('pattern|numbered|lunch', rows[0].QuestionKey__c);
      Assert.areEqual(ids[0], rows[0].AnswerId__c);
      Assert.areEqual('undone', rows[1].What__c);
      Assert.isNull(rows[1].AnswerId__c, 'the marker is gone, not back');
    }
  }

  // MEMO-7.3
  @IsTest
  static void aRefusedSaveKeepsNoEvent() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'activity' }
      );
      Id first = answerOf(willow.Id).Id;
      LearnedAnswers.refuseSave = true;
      Test.startTest();
      try {
        LearnedController.changeLearned(willow.Id, first, 'fixed');
        Assert.fail('the save was refused');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e);
      }
      Test.stopTest();
      Assert.areEqual(
        new List<String>{ 'answered:activity' },
        whats(willow.Id)
      );
    }
  }

  // MEMO-7.2
  @IsTest
  static void readsACampsHistoryNewestFirstWithWhoAndWhenInOneQuery() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      Camp__c cedar = ShoreshTestData.camp('Camp Cedar');
      ImportAnswers.rememberEach(
        willow.Id,
        new Map<String, String>{ 'kind|Lunch' => 'fixed' }
      );
      ImportAnswers.rememberEach(
        cedar.Id,
        new Map<String, String>{ 'kind|Swim' => 'activity' }
      );
      Test.startTest();
      Integer before = Limits.getQueries();
      List<LearnedEvents.Event> rows = LearnedController.getLearnedHistory(
        willow.Id
      );
      Integer queries = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(1, queries);
      Assert.areEqual(1, rows.size(), 'only this camp\'s');
      Assert.areEqual('answered', rows[0].what);
      Assert.areEqual('kind|Lunch', rows[0].question);
      Assert.areEqual('fixed', rows[0].answer);
      Assert.isTrue(rows[0].byYou);
      Assert.areEqual('Scheduler', rows[0].byName);
      Assert.areEqual(Date.today(), rows[0].answeredOn);
      Assert.areEqual(answerOf(willow.Id).Id, rows[0].answerId);
    }
  }
}
