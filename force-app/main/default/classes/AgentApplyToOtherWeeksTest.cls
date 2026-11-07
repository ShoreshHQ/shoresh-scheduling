/**
 * apply_to_other_weeks through an agent or the command line (docs/protocol/api.md API-1.124), on
 * SetTimeTestData's synthetic camp with numbered days: it asks first, its confirm holds only for
 * the weeks as they were, and the answer lists what locks keep and what can't go.
 */
@IsTest
private class AgentApplyToOtherWeeksTest {
  private static final Date W1 = Date.newInstance(2026, 6, 29);

  private static Map<String, Id> ids;

  private static Id numberedCampWithSwim() {
    SetTimeGuard.defer();
    try {
      ids = SetTimeTestData.camp();
      SetTimeGuard.checkPending();
    } finally {
      SetTimeGuard.resume();
    }
    Database.update(
      new Season__c(Id = ids.get('Season'), NumberedDays__c = true),
      AccessLevel.SYSTEM_MODE
    );
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    Id source = ManualDrafts.startWith(
        new GeneratedSetup(ids.get('Main'), ids.get('Week 1'))
      )
      .draftId;
    SlotEdits.Result saved = ManualBuildController.saveSlots(
      source,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(W1, ids.get('Group A'), ids.get('Period 2')),
          new List<String>{ '' },
          new List<String>{ 'A:' + ids.get('Swim') }
        )
      }
    );
    Assert.isTrue(saved.conflicts.isEmpty());
    return source;
  }

  private static Map<String, Object> ask(Map<String, Object> more) {
    Map<String, Object> body = new Map<String, Object>{
      'week' => 'Week 1',
      'to_week' => 'Week 2',
      'program' => 'Main'
    };
    body.putAll(more);
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestURI = '/v1/apply_to_other_weeks';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentApplyToOtherWeeks.post();
    return new Map<String, Object>{
      'status' => RestContext.response.statusCode,
      'message' => ((Map<String, Object>) JSON.deserializeUntyped(
          RestContext.response.responseBody.toString()
        ))
        .get('message')
    };
  }

  private static String confirmIn(String message) {
    return message.substringAfter('confirm: "').substringBefore('"');
  }

  private static Integer manualDraftsOfWeek2() {
    Id week = ids.get('Week 2');
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE Week__c = :week AND Status__c = 'Draft' AND Origin__c = 'Manual'
      WITH SYSTEM_MODE
    ];
  }

  // API-1.124, API-1.106: nothing without its confirm; with it, the screen's own apply.
  @IsTest
  static void itAsksFirstThenAppliesWithItsConfirm() {
    System.runAs(ShoreshTestData.scheduler()) {
      numberedCampWithSwim();
      Test.startTest();
      Map<String, Object> first = ask(new Map<String, Object>());
      String words = (String) first.get('message');
      Assert.areEqual(200, first.get('status'), words);
      Assert.isTrue(words.startsWith(AgentAskFirst.NOT_YET), words);
      Assert.isTrue(words.contains('1 cell changes'), words);
      Assert.areEqual(0, manualDraftsOfWeek2(), 'Nothing done yet');
      Map<String, Object> done = ask(
        new Map<String, Object>{ 'confirm' => confirmIn(words) }
      );
      Test.stopTest();
      Assert.areEqual(200, done.get('status'), (String) done.get('message'));
      Assert.isTrue(
        ((String) done.get('message')).startsWith('Applied Week 1 to Week 2'),
        (String) done.get('message')
      );
      Assert.areEqual(1, manualDraftsOfWeek2());
    }
  }

  // API-1.124, API-1.106: a confirm from before someone saved either week is refused.
  @IsTest
  static void aConfirmFromBeforeAChangeIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id source = numberedCampWithSwim();
      Test.startTest();
      String words = (String) ask(new Map<String, Object>()).get('message');
      SlotEdits.Result saved = ManualBuildController.saveSlots(
        source,
        new List<SlotEdits.Edit>{
          SlotRunsTestData.edit(
            SlotRunsTestData.at(W1, ids.get('Group B'), ids.get('Period 1')),
            new List<String>{ '' },
            new List<String>{ 'A:' + ids.get('Soccer') }
          )
        }
      );
      Assert.isTrue(saved.conflicts.isEmpty());
      Map<String, Object> refused = ask(
        new Map<String, Object>{ 'confirm' => confirmIn(words) }
      );
      Test.stopTest();
      Assert.areEqual(409, refused.get('status'));
      Assert.areEqual(0, manualDraftsOfWeek2());
    }
  }

  // API-1.124: a week that isn't the season's is refused, naming the weeks there are.
  @IsTest
  static void aWeekThatIsntThereIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      numberedCampWithSwim();
      Test.startTest();
      Map<String, Object> refused = ask(
        new Map<String, Object>{ 'to_week' => 'Week 99' }
      );
      Test.stopTest();
      Assert.areEqual(400, refused.get('status'));
      Assert.areEqual(0, manualDraftsOfWeek2());
    }
  }
}
