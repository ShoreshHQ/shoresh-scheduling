/**
 * Finalizing elective seats and reopening them through an AI (docs/protocol/api.md API-1.23,
 * API-1.70), and a big save or clear the AI reads (API-1.66, API-1.71) while it is still being written or after it stopped, on
 * AgentElectivesTestData's camp (two campers, both choosing Drama). Records are made inside the
 * scheduler's runAs.
 */
@IsTest
private class AgentFinalizeTest {
  private static final Map<String, Object> NONE = new Map<String, Object>();

  private static String status() {
    return [
      SELECT Status__c
      FROM ElectiveRun__c
      WHERE Id = :AgentElectivesTestData.runId
      WITH SYSTEM_MODE
    ]
    .Status__c;
  }

  // API-1.23, API-1.106: Finalize through an AI asks first, then is the screen's Finalize: the
  // seats being worked on become the final ones; a second Finalize is refused, nothing changed.
  @IsTest
  static void finalizeAsksFirstThenMakesTheSeatsFinal() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      AgentElectivesTestData.assigned();
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(
        JSON.serialize(AgentElectivesTestData.asked(NONE))
      );
      RestContext.response = new RestResponse();
      AgentFinalize.post();
      String asked = RestContext.response.responseBody.toString();
      String before = status();
      List<Object> finalized = AgentElectivesTestData.send(
        'finalize_electives',
        'POST',
        AgentElectivesTestData.asked(NONE)
      );
      List<Object> again = AgentElectivesTestData.send(
        'finalize_electives',
        'POST',
        AgentElectivesTestData.asked(NONE)
      );
      Test.stopTest();
      Assert.isTrue(
        asked.contains('This finalizes Chugim in Week 1'),
        'The web address asks first: ' + asked
      );
      Assert.areEqual(
        ElectiveRunState.COMMITTED,
        before,
        'Nothing finalized on the ask'
      );
      Assert.areEqual(200, finalized[0], String.valueOf(finalized[1]));
      Assert.areEqual('Finalized Chugim in Week 1.', finalized[1]);
      Assert.areEqual(ElectiveRunState.FINAL_STATUS, status());
      Assert.areEqual(400, again[0], String.valueOf(again[1]));
      Assert.areEqual('Chugim in Week 1 is already finalized.', again[1]);
    }
  }

  // API-1.23: with no elective set named, a season with two is asked which, naming both, and
  // nothing is finalized.
  @IsTest
  static void finalizeAsksWhichSetWhenTheSeasonHasTwo() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      AgentElectivesTestData.assigned();
      Database.insert(
        new ElectiveSet__c(
          Season__c = AgentElectivesTestData.ids.get('Season'),
          Name = 'Evening'
        ),
        AccessLevel.USER_MODE
      );
      Map<String, Object> noSet = AgentElectivesTestData.asked(NONE);
      noSet.remove('elective_set');
      Test.startTest();
      List<Object> asked = AgentElectivesTestData.send(
        'finalize_electives',
        'POST',
        noSet
      );
      Test.stopTest();
      Assert.areEqual(400, asked[0], String.valueOf(asked[1]));
      Assert.areEqual(
        'Say which elective set (elective_set): Chugim, Evening.',
        asked[1]
      );
      Assert.areEqual(ElectiveRunState.COMMITTED, status());
    }
  }

  // API-1.70: seats still being worked on can't be reopened as a new draft; nothing is made.
  @IsTest
  static void seatsStillADraftAreNotReopened() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      AgentElectivesTestData.assigned();
      Map<String, Object> seen = new Map<String, Object>{
        'seen' => AgentElectivesTestData.seen(AgentElectivesTestData.revision())
      };
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(
        JSON.serialize(AgentElectivesTestData.asked(seen))
      );
      RestContext.response = new RestResponse();
      AgentStartNewElectiveVersion.post();
      Test.stopTest();
      Assert.areEqual(409, RestContext.response.statusCode);
      Assert.areEqual(
        'Chugim in Week 1 already has a draft being changed, so nothing was reopened. Read it with read_elective_seats_now.',
        ((Map<String, Object>) JSON.deserializeUntyped(
            RestContext.response.responseBody.toString()
          ))
          .get('message')
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM ElectiveRun__c
          WHERE NewVersionOf__c = :AgentElectivesTestData.runId
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  /** The run's big save as Salesforce has it part way: done of total, and why it stopped. */
  private static void bigSave(Integer done, Integer total, String problem) {
    Database.update(
      new ElectiveRun__c(
        Id = AgentElectivesTestData.runId,
        SaveDone__c = done,
        SaveTotal__c = total,
        SaveProblem__c = problem
      ),
      AccessLevel.SYSTEM_MODE
    );
  }

  private static String seatsNow() {
    return (String) AgentElectivesTestData.send(
      'elective_seats_now',
      'GET',
      AgentElectivesTestData.asked(NONE)
    )[1];
  }

  // API-1.66: a big save of seats still being written is read with how far it has got.
  @IsTest
  static void aBigSaveStillGoingIsReadWithHowFar() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      bigSave(9000, 12000, null);
      Test.startTest();
      String read = seatsNow();
      Test.stopTest();
      Assert.isTrue(
        read.contains('Still saving: 9,000 of 12,000 written.'),
        read
      );
    }
  }

  // API-1.66: a big save that stopped is read with how far it got and why.
  @IsTest
  static void aBigSaveThatStoppedIsReadWithWhy() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      bigSave(9000, 12000, 'Salesforce stopped it before the end.');
      Test.startTest();
      String read = seatsNow();
      Test.stopTest();
      Assert.isTrue(
        read.contains(
          'The last save stopped after 9,000 of 12,000: Salesforce stopped it before the end.'
        ),
        read
      );
    }
  }

  /** The end-of-season Clear's read, of a finalized week whose clear is part way. */
  private static String clearNow(String problem) {
    AgentElectivesTestData.camp();
    AgentElectivesTestData.finalized();
    bigSave(9000, 12000, problem);
    Map<String, Object> season = new Map<String, Object>{
      'season' => AgentElectivesTestData.asked(NONE).get('season')
    };
    Test.startTest();
    String read = (String) AgentElectivesTestData.send(
      'electives_to_clear',
      'GET',
      season
    )[1];
    Test.stopTest();
    return read;
  }

  // API-1.71: a big clear still going is read with how far it has got.
  @IsTest
  static void aBigClearStillGoingIsReadWithHowFar() {
    System.runAs(ShoreshTestData.scheduler()) {
      String read = clearNow(null);
      Assert.isTrue(
        read.contains('Still clearing: 9,000 of 12,000 gone.'),
        read
      );
    }
  }

  // API-1.71: a big clear that stopped is read with how far it got and why.
  @IsTest
  static void aBigClearThatStoppedIsReadWithWhy() {
    System.runAs(ShoreshTestData.scheduler()) {
      String read = clearNow('Salesforce stopped it before the end.');
      Assert.isTrue(
        read.contains(
          'The last clear stopped after 9,000 of 12,000: Salesforce stopped it before the end.'
        ),
        read
      );
    }
  }
}
