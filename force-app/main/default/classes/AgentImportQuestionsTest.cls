/**
 * An AI reopens the questions the person's last import left for later (docs/protocol/api.md
 * API-1.144), as Roots' import questions left does: the very files it read, or one refusal.
 */
@IsTest
private class AgentImportQuestionsTest {
  private static final String OPEN_FILES = '[{"name":"maple-grove.xlsx","sheets":[]}]';

  private static Season__c newSeason() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    return ShoreshTestData.season(camp.Id, 'Summer 2027');
  }

  // API-1.144: an AI asks for the last import's questions and gets the very files it read; none
  // open is said.
  @IsTest
  static void anAgentReopensTheQuestionsTheLastImportLeft() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Object> read = afterAnOpenImport(true);
      Assert.areEqual(OPEN_FILES, read.get('open_files'));
    }
  }

  // API-1.144
  @IsTest
  static void anAgentReadsNoQuestionsUnlessItAsks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Object> plain = afterAnOpenImport(false);
      Assert.isFalse(plain.containsKey('open_files'));
    }
  }

  private static Map<String, Object> afterAnOpenImport(Boolean open) {
    Season__c season = newSeason();
    Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
    plan.put(
      'open',
      new List<Object>{
        new Map<String, Object>{
          'key' => 'kind|Archery',
          'title' => 'Archery?'
        }
      }
    );
    plan.put('fileData', OPEN_FILES);
    ImportController.saveSetup(JSON.serialize(plan));
    String name = [SELECT Name FROM Season__c WHERE Id = :season.Id].Name;
    Test.startTest();
    Map<String, Object> read = asked(name, open);
    Test.stopTest();
    return read;
  }

  // API-1.144
  @IsTest
  static void anAgentIsToldWhenNoImportHasQuestionsLeft() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      String name = [SELECT Name FROM Season__c WHERE Id = :season.Id].Name;
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'GET';
      RestContext.request.params.put('season', name);
      RestContext.request.params.put('open_questions', 'true');
      RestContext.response = new RestResponse();
      AgentImportLastYear.get();
      Test.stopTest();
      Assert.areEqual(400, RestContext.response.statusCode);
      Assert.isTrue(
        RestContext.response.responseBody.toString()
          .contains('no import with questions left')
      );
    }
  }

  // API-1.144: an import whose questions were all answered leaves none to reopen, said the same way.
  @IsTest
  static void anAgentIsToldWhenTheLastImportLeftNoQuestions() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
      plan.put('fileData', OPEN_FILES);
      ImportController.saveSetup(JSON.serialize(plan));
      String name = [SELECT Name FROM Season__c WHERE Id = :season.Id].Name;
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'GET';
      RestContext.request.params.put('season', name);
      RestContext.request.params.put('open_questions', 'true');
      RestContext.response = new RestResponse();
      AgentImportLastYear.get();
      Test.stopTest();
      Assert.areEqual(400, RestContext.response.statusCode);
      Assert.isTrue(
        RestContext.response.responseBody.toString()
          .contains('no import with questions left')
      );
    }
  }

  private static Map<String, Object> asked(String season, Boolean open) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.params.put('season', season);
    if (open) {
      RestContext.request.params.put('open_questions', 'true');
    }
    RestContext.response = new RestResponse();
    AgentImportLastYear.get();
    String body = RestContext.response.responseBody.toString();
    Assert.areEqual(200, RestContext.response.statusCode, body);
    return (Map<String, Object>) JSON.deserializeUntyped(body);
  }
}
