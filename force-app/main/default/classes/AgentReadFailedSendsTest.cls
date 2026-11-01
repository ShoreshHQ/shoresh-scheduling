/**
 * read_failed_sends (docs/protocol/api.md API-1.91, API-1.92): the failed sends Settings shows,
 * in Settings' own sentences, with no web address in the answer. Made-up camp only.
 */
@IsTest
private class AgentReadFailedSendsTest {
  private static final String SEASON = 'Summer 2031 (made up)';

  private static Id camp() {
    Camp__c record = ShoreshTestData.camp('Pine Hollow (made up)');
    return ShoreshTestData.season(record.Id, SEASON).Id;
  }

  private static List<Object> ask(Map<String, String> params) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    for (String key : params.keySet()) {
      RestContext.request.addParameter(key, params.get(key));
    }
    RestContext.response = new RestResponse();
    AgentReadFailedSends.get();
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static Send__c send(Id seasonId, String to, String problem) {
    return new Send__c(
      Season__c = seasonId,
      System__c = to,
      What__c = 'the group schedule for Week 1',
      Problem__c = problem
    );
  }

  // API-1.91: the same list Settings shows (SendLog.failedLast), in its sentences.
  @IsTest
  static void failedSendsAreSettingsOwnList() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id seasonId = camp();
      String failed = 'Couldn\'t send the group schedule for Week 1 to formstack: formstack answered 503 Service Unavailable.';
      Database.insert(
        new List<Send__c>{
          send(seasonId, 'formstack', failed),
          send(
            seasonId,
            'campminder',
            'Couldn\'t send the group schedule for Week 1 to campminder: see https://hooks.example.test/abc?token=s3cret now.'
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      List<Object> listed = ask(new Map<String, String>{ 'season' => SEASON });
      List<Object> unknown = ask(
        new Map<String, String>{ 'season' => SEASON, 'retry' => 'true' }
      );
      Test.stopTest();
      Assert.areEqual(200, listed[0], String.valueOf(listed[1]));
      String said = (String) listed[1];
      Assert.isTrue(said.contains(failed), said);
      Assert.areEqual(2, SendLog.failedLast(seasonId).size());
      // API-1.92: no web address, so no token, ever reaches the AI.
      Assert.isFalse(said.contains('s3cret'), said);
      Assert.isFalse(said.contains('hooks.example.test'), said);
      Assert.isTrue(said.contains('see (a web address) now.'), said);
      Assert.areEqual(
        'to Formstack: (a web address) answered',
        AgentReadFailedSends.withoutAddresses(
          'to Formstack: callout:Formstack/in?key=s3cret answered'
        )
      );
      Assert.areEqual(400, unknown[0]);
    }
  }

  // API-1.91: a send that went through since is not failing, as on Settings.
  @IsTest
  static void nothingFailingIsSaid() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id seasonId = camp();
      Send__c failed = send(seasonId, 'formstack', 'Couldn\'t send it.');
      Send__c through = send(seasonId, 'formstack', null);
      Database.insert(
        new List<Send__c>{ failed, through },
        AccessLevel.SYSTEM_MODE
      );
      Test.setCreatedDate(failed.Id, Datetime.now().addHours(-1));
      Test.startTest();
      List<Object> listed = ask(new Map<String, String>{ 'season' => SEASON });
      Test.stopTest();
      Assert.areEqual(200, listed[0], String.valueOf(listed[1]));
      Assert.isTrue(((String) listed[1]).startsWith('No send from'));
    }
  }
}
