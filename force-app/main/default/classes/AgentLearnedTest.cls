/**
 * "What Shoresh has learned" through an agent (docs/protocol/api.md API-1.93 to API-1.97): the
 * read, and Change, Forget, Forget pattern and Undo as the screen does them, each refused when
 * what was read has changed since. Made-up camp only.
 */
@IsTest
private class AgentLearnedTest {
  private static final String SEASON = 'Summer 2031 (made up)';

  private static Id camp() {
    Camp__c record = ShoreshTestData.camp('Pine Hollow (made up)');
    ShoreshTestData.season(record.Id, SEASON);
    ImportAnswers.rememberEach(
      record.Id,
      new Map<String, String>{ 'kind|Lunch' => 'fixed' }
    );
    return record.Id;
  }

  private static ImportAnswer__c only(Id campId) {
    return [
      SELECT Id, Answer__c
      FROM ImportAnswer__c
      WHERE Camp__c = :campId AND QuestionKey__c = 'kind|Lunch'
      LIMIT 1
    ];
  }

  private static List<Object> post(
    AgentWeeks.Action action,
    Map<String, Object> body
  ) {
    body.put('season', SEASON);
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentWeeks.answer(action);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  /** The undo an answer gave, as it said it: undo "<undo>". */
  private static String undoOf(Object said) {
    return String.valueOf(said).substringAfter('undo "').substringBefore('"');
  }

  // API-1.93: what the screen reads, as JSON: the answers and their history.
  @IsTest
  static void readsWhatTheScreenReads() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'GET';
      RestContext.request.addParameter('season', SEASON);
      RestContext.response = new RestResponse();
      Test.startTest();
      AgentLearned.get();
      Test.stopTest();
      Assert.areEqual(200, RestContext.response.statusCode);
      Map<String, Object> read = (Map<String, Object>) JSON.deserializeUntyped(
        RestContext.response.responseBody.toString()
      );
      Assert.areEqual(1, ((List<Object>) read.get('answers')).size());
      Assert.isNotNull(read.get('events'));
      Assert.isNotNull(read.get('setup'));
    }
  }

  // API-1.94, API-1.97: Change while the answer is as seen, and its Undo.
  @IsTest
  static void changesAndChangesBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id campId = camp();
      Id oldId = only(campId).Id;
      Test.startTest();
      List<Object> stale = post(
        new AgentChangeLearned(),
        new Map<String, Object>{
          'answer_id' => oldId,
          'answer' => 'recurring',
          'seen' => 'Fixed'
        }
      );
      List<Object> notAChoice = post(
        new AgentChangeLearned(),
        new Map<String, Object>{
          'answer_id' => oldId,
          'answer' => 'lunchy',
          'seen' => 'fixed'
        }
      );
      List<Object> changed = post(
        new AgentChangeLearned(),
        new Map<String, Object>{
          'answer_id' => oldId,
          'answer' => 'recurring',
          'seen' => 'fixed'
        }
      );
      String recurring = only(campId).Answer__c;
      List<Object> undone = post(
        new AgentUndoLearned(),
        new Map<String, Object>{ 'undo' => undoOf(changed[1]) }
      );
      Test.stopTest();
      Assert.areEqual(409, stale[0], 'capitals count in seen');
      Assert.areEqual(400, notAChoice[0]);
      Assert.isTrue(String.valueOf(notAChoice[1]).contains('recurring'));
      Assert.areEqual(200, changed[0], String.valueOf(changed[1]));
      Assert.areEqual('recurring', recurring);
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual(oldId, only(campId).Id, 'the old answer is back');
      Assert.areEqual('fixed', only(campId).Answer__c);
    }
  }

  // API-1.95, API-1.97: Forget while the answer is as seen, and its Undo, only once.
  @IsTest
  static void forgetsAndRemembersAgain() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id campId = camp();
      Id answerId = only(campId).Id;
      Test.startTest();
      List<Object> forgot = post(
        new AgentForgetLearned(),
        new Map<String, Object>{ 'answer_id' => answerId, 'seen' => 'fixed' }
      );
      List<Object> again = post(
        new AgentForgetLearned(),
        new Map<String, Object>{ 'answer_id' => answerId, 'seen' => 'fixed' }
      );
      List<Object> back = post(
        new AgentUndoLearned(),
        new Map<String, Object>{ 'undo' => undoOf(forgot[1]) }
      );
      List<Object> twice = post(
        new AgentUndoLearned(),
        new Map<String, Object>{ 'undo' => undoOf(forgot[1]) }
      );
      Test.stopTest();
      Assert.areEqual(200, forgot[0], String.valueOf(forgot[1]));
      Assert.areEqual(409, again[0], 'already forgotten');
      Assert.areEqual(200, back[0], String.valueOf(back[1]));
      Assert.areEqual(answerId, only(campId).Id);
      Assert.areEqual(409, twice[0], 'only what was just done is undone');
    }
  }

  // API-1.96, API-1.97: Forget pattern while its mark is as seen; its answers stay.
  @IsTest
  static void forgetsAPatternAndUndoesIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id campId = camp();
      Test.startTest();
      List<Object> stale = post(
        new AgentForgetPattern(),
        new Map<String, Object>{
          'pattern' => 'pattern:numbered:Lunch',
          'seen' => 'a0X000000000001'
        }
      );
      List<Object> forgot = post(
        new AgentForgetPattern(),
        new Map<String, Object>{
          'pattern' => 'pattern:numbered:Lunch',
          'seen' => 'none'
        }
      );
      Integer marks = [
        SELECT COUNT()
        FROM ImportAnswer__c
        WHERE Camp__c = :campId AND QuestionKey__c LIKE 'pattern|%'
      ];
      List<Object> undone = post(
        new AgentUndoLearned(),
        new Map<String, Object>{ 'undo' => undoOf(forgot[1]) }
      );
      Test.stopTest();
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(200, forgot[0], String.valueOf(forgot[1]));
      Assert.areEqual(1, marks);
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM ImportAnswer__c
          WHERE Camp__c = :campId AND QuestionKey__c LIKE 'pattern|%'
        ]
      );
      Assert.areEqual('fixed', only(campId).Answer__c, 'its answers stay');
    }
  }
}
