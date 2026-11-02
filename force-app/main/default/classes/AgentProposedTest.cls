/**
 * Proposed offerings read and confirmed through an agent or the command line (docs/protocol/api.md
 * API-1.100, API-1.101), on a made-up camp: Camp Setup's own Confirm, refused with nothing changed
 * when the offering is no longer proposed. Every record is made by the scheduler, inside the same
 * System.runAs.
 */
@IsTest
private class AgentProposedTest {
  private static List<Object> ask(
    AgentWeeks.Action door,
    String method,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = method;
    if (method == 'GET') {
      for (String key : body.keySet()) {
        RestContext.request.addParameter(key, String.valueOf(body.get(key)));
      }
    } else {
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    }
    RestContext.response = new RestResponse();
    AgentWeeks.answer(door);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  /** Chugim offers Archery (confirmed) and Drama (proposed); Bechira offers Drama (proposed). */
  private static void offeringsCamp() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
    List<Activity__c> activities = new List<Activity__c>{
      ShoreshTestData.activity(season.Id, 'Archery', null),
      ShoreshTestData.activity(season.Id, 'Drama', null)
    };
    Database.insert(activities, AccessLevel.USER_MODE);
    List<ElectiveSet__c> sets = new List<ElectiveSet__c>{
      new ElectiveSet__c(Season__c = season.Id, Name = 'Chugim'),
      new ElectiveSet__c(Season__c = season.Id, Name = 'Bechira')
    };
    Database.insert(sets, AccessLevel.USER_MODE);
    Database.insert(
      new List<Offering__c>{
        new Offering__c(
          ElectiveSet__c = sets[0].Id,
          Activity__c = activities[0].Id
        ),
        new Offering__c(
          ElectiveSet__c = sets[0].Id,
          Activity__c = activities[1].Id,
          Proposed__c = true
        ),
        new Offering__c(
          ElectiveSet__c = sets[1].Id,
          Activity__c = activities[1].Id,
          Proposed__c = true
        )
      },
      AccessLevel.USER_MODE
    );
  }

  private static Map<String, Object> confirm(String setName, String seen) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => 'Summer 2027',
      'activity' => 'Drama'
    };
    if (setName != null) {
      body.put('elective_set', setName);
    }
    if (seen != null) {
      body.put('seen', seen);
    }
    return body;
  }

  private static Boolean proposed(String setName) {
    return [
      SELECT Proposed__c
      FROM Offering__c
      WHERE ElectiveSet__r.Name = :setName AND Activity__r.Name = 'Drama'
      WITH SYSTEM_MODE
    ]
    .Proposed__c;
  }

  // API-1.100
  @IsTest
  static void readSaysWhatIsProposed() {
    System.runAs(ShoreshTestData.scheduler()) {
      offeringsCamp();
      Test.startTest();
      List<Object> read = ask(
        new AgentReadProposed(),
        'GET',
        new Map<String, Object>{ 'season' => 'Summer 2027' }
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      String said = (String) read[1];
      Assert.isTrue(said.contains('Drama (elective set Bechira)'), said);
      Assert.isTrue(said.contains('Drama (elective set Chugim)'), said);
      Assert.isFalse(said.contains('Archery'), said);
    }
  }

  // API-1.100
  @IsTest
  static void nothingProposedIsSaidAndAnUnknownFieldRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      ShoreshTestData.season(camp.Id, 'Summer 2027');
      Test.startTest();
      List<Object> none = ask(
        new AgentReadProposed(),
        'GET',
        new Map<String, Object>{ 'season' => 'Summer 2027' }
      );
      List<Object> unknown = ask(
        new AgentReadProposed(),
        'GET',
        new Map<String, Object>{ 'season' => 'Summer 2027', 'week' => 'W' }
      );
      Test.stopTest();
      Assert.areEqual(200, none[0], String.valueOf(none[1]));
      Assert.isTrue(
        ((String) none[1]).contains('every offering is confirmed'),
        String.valueOf(none[1])
      );
      Assert.areEqual(400, unknown[0], String.valueOf(unknown[1]));
    }
  }

  // API-1.101
  @IsTest
  static void confirmIsCampSetupsOwnWithProposedSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      offeringsCamp();
      Test.startTest();
      Integer before = Limits.getQueries();
      List<Object> done = ask(
        new AgentConfirmProposed(),
        'POST',
        confirm('chugim', 'proposed')
      );
      Integer queries = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.isTrue(queries < 30, queries + ' queries for one confirm');
      Assert.isFalse(proposed('Chugim'), 'Confirmed');
      Assert.isTrue(proposed('Bechira'), 'The other set\'s stays proposed');
    }
  }

  // API-1.101
  @IsTest
  static void confirmedSinceOrUnseenOrUnsaidIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      offeringsCamp();
      Test.startTest();
      List<Object> unseen = ask(
        new AgentConfirmProposed(),
        'POST',
        confirm('Chugim', null)
      );
      List<Object> twoSets = ask(
        new AgentConfirmProposed(),
        'POST',
        confirm(null, 'proposed')
      );
      ask(new AgentConfirmProposed(), 'POST', confirm('Chugim', 'proposed'));
      List<Object> again = ask(
        new AgentConfirmProposed(),
        'POST',
        confirm('Chugim', 'proposed')
      );
      Test.stopTest();
      Assert.areEqual(400, unseen[0], String.valueOf(unseen[1]));
      Assert.areEqual(400, twoSets[0], String.valueOf(twoSets[1]));
      Assert.isTrue(
        ((String) twoSets[1]).contains('Bechira, Chugim'),
        String.valueOf(twoSets[1])
      );
      Assert.areEqual(409, again[0], String.valueOf(again[1]));
      Assert.isTrue(proposed('Bechira'), 'Nothing else changed');
    }
  }
}
