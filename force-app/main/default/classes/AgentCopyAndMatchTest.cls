/**
 * Copy season and "Update to match setup" through an agent or the command line
 * (docs/protocol/api.md API-1.61 to API-1.64), on GeneratedTestData's synthetic camp: each the
 * screen's own preview and save, refused with nothing saved when what the AI saw has changed.
 */
@IsTest
private class AgentCopyAndMatchTest {
  /** One request to a door; answers [status, sentence]. */
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

  private static Season__c season() {
    return [
      SELECT Id, Name, Camp__c, StartDate__c, EndDate__c
      FROM Season__c
      WHERE Id = :GeneratedTestData.ids.get('Season')
      WITH SYSTEM_MODE
    ];
  }

  private static Map<String, Object> copyAsk(
    Season__c season,
    String name,
    Map<String, Object> seen
  ) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => season.Name,
      'name' => name,
      'start_date' => String.valueOf(season.StartDate__c.addDays(364))
    };
    if (seen != null) {
      body.put('seen', seen);
    }
    return body;
  }

  private static Integer seasons() {
    return [SELECT COUNT() FROM Season__c WITH SYSTEM_MODE];
  }

  // API-1.61
  @IsTest
  static void copyReadIsTheCopyPagesPreview() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Season__c season = season();
      Date start = season.StartDate__c.addDays(364);
      Test.startTest();
      List<Object> read = ask(
        new AgentReadSeasonCopy(),
        'GET',
        new Map<String, Object>{
          'season' => season.Name,
          'start_date' => String.valueOf(start)
        }
      );
      List<Object> noDate = ask(
        new AgentReadSeasonCopy(),
        'GET',
        new Map<String, Object>{ 'season' => season.Name }
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Map<String, String> seen = AgentCopySeason.seenOf(
        SeasonSetupController.previewCopy(season.Id, start)
      );
      for (String key : seen.keySet()) {
        Assert.isTrue(
          ((String) read[1]).contains(key + ': ' + seen.get(key)),
          key + ' in: ' + read[1]
        );
      }
      Assert.areEqual(400, noDate[0], String.valueOf(noDate[1]));
    }
  }

  // API-1.62
  @IsTest
  static void copyIsTheCopyPagesCopyWithTheDatesSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Season__c season = season();
      Map<String, Object> seen = new Map<String, Object>();
      Map<String, String> dates = AgentCopySeason.seenOf(
        SeasonSetupController.previewCopy(
          season.Id,
          season.StartDate__c.addDays(364)
        )
      );
      for (String key : dates.keySet()) {
        seen.put(key, dates.get(key));
      }
      Map<String, Object> stale = seen.clone();
      stale.put(AgentCopySeason.WHOLE, 'something else');
      Integer before = seasons();
      Test.startTest();
      List<Object> noSeen = ask(
        new AgentCopySeason(),
        'POST',
        copyAsk(season, 'Next summer', null)
      );
      List<Object> refused = ask(
        new AgentCopySeason(),
        'POST',
        copyAsk(season, 'Next summer', stale)
      );
      Integer afterRefused = seasons();
      List<Object> taken = ask(
        new AgentCopySeason(),
        'POST',
        copyAsk(season, season.Name, seen)
      );
      List<Object> copied = ask(
        new AgentCopySeason(),
        'POST',
        copyAsk(season, 'Next summer', seen)
      );
      Test.stopTest();
      Assert.areEqual(400, noSeen[0], String.valueOf(noSeen[1]));
      Assert.areEqual(409, refused[0], String.valueOf(refused[1]));
      Assert.areEqual(before, afterRefused, 'nothing copied when refused');
      Assert.areEqual(400, taken[0], String.valueOf(taken[1]));
      Assert.areEqual(200, copied[0], String.valueOf(copied[1]));
      Season__c copy = [
        SELECT CopiedFrom__c, StartDate__c
        FROM Season__c
        WHERE Name = 'Next summer'
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(season.Id, copy.CopiedFrom__c);
      Assert.areEqual(season.StartDate__c.addDays(364), copy.StartDate__c);
      Assert.areEqual(season.StartDate__c, season().StartDate__c);
    }
  }

  /** The generated week with Swim in Group A's Monday Lunch, then Swim deleted from setup. */
  private static Id weekWithSwimGone(Map<String, Id> ids) {
    GeneratedWeek.Save request = GeneratedTestData.filled(
      GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE,
        1
      ),
      'Gym games'
    );
    GeneratedTestData.put(
      request.days[0],
      GeneratedTestData.at(GeneratedTestData.GROUP_A, GeneratedTestData.LUNCH),
      'Swim'
    );
    Id draftId = GeneratedTestData.save(request).scheduleId;
    Database.delete(ids.get('Swim'), AccessLevel.SYSTEM_MODE);
    return draftId;
  }

  private static Map<String, Object> weekAsk(Id draftId) {
    Schedule__c draft = [
      SELECT Week__r.Name, Program__r.Name
      FROM Schedule__c
      WHERE Id = :draftId
      WITH SYSTEM_MODE
    ];
    return new Map<String, Object>{
      'season' => season().Name,
      'week' => draft.Week__r.Name,
      'program' => draft.Program__r.Name
    };
  }

  // API-1.63
  @IsTest
  static void setupChangesAreTheScreensListWithTheWeekSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id draftId = weekWithSwimGone(GeneratedTestData.camp());
      Map<String, Object> weekAsked = weekAsk(draftId);
      Test.startTest();
      List<Object> read = ask(new AgentReadSetupChanges(), 'GET', weekAsked);
      Test.stopTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      String said = (String) read[1];
      Assert.areEqual(200, read[0], said);
      Assert.isTrue(said.contains(preview.changes[0].key), said);
      Assert.isTrue(said.contains('Swim -> Open (Deleted from setup)'), said);
      Assert.isTrue(
        said.contains(AgentUpdateToMatch.seenOf(preview.revisions)),
        said
      );
    }
  }

  /** The week's change asked for: its key, with the week as read (seen) unless told. */
  private static Map<String, Object> updateAsk(
    Map<String, Object> weekAsked,
    List<String> keyAndSeen
  ) {
    Map<String, Object> body = weekAsked.clone();
    body.put('changes', new List<Object>{ keyAndSeen[0] });
    body.put('seen', keyAndSeen[1]);
    return body;
  }

  /** The one change the week shows, and the week as read: [key, seen]. */
  private static List<String> shown(Id draftId) {
    SetupMatch.Preview preview = SetupMatchController.getSetupChanges(draftId);
    return new List<String>{
      preview.changes[0].key,
      AgentUpdateToMatch.seenOf(preview.revisions)
    };
  }

  // API-1.64
  @IsTest
  static void updateIsRefusedWhenTheWeekOrSetupChangedSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id draftId = weekWithSwimGone(GeneratedTestData.camp());
      Map<String, Object> weekAsked = weekAsk(draftId);
      List<String> read = shown(draftId);
      Test.startTest();
      List<Object> stale = ask(
        new AgentUpdateToMatch(),
        'POST',
        updateAsk(weekAsked, new List<String>{ read[0], 'not the week' })
      );
      List<Object> unknown = ask(
        new AgentUpdateToMatch(),
        'POST',
        updateAsk(weekAsked, new List<String>{ 'no such change', read[1] })
      );
      Test.stopTest();
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(409, unknown[0], String.valueOf(unknown[1]));
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE
            SourceSchedule__c = :draftId
            AND VersionReason__c = :AgentWeeks.THROUGH_AGENT
          WITH SYSTEM_MODE
        ],
        'nothing kept or changed when refused'
      );
    }
  }

  // API-1.64
  @IsTest
  static void updateIsTheScreensUpdateWithTheWeekSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id draftId = weekWithSwimGone(GeneratedTestData.camp());
      Map<String, Object> weekAsked = weekAsk(draftId);
      List<String> read = shown(draftId);
      Test.startTest();
      Integer before = Limits.getQueries();
      List<Object> done = ask(
        new AgentUpdateToMatch(),
        'POST',
        updateAsk(weekAsked, read)
      );
      Integer queries = Limits.getQueries() - before;
      Boolean matched = SetupMatchController.getSetupChanges(draftId)
        .changes.isEmpty();
      Test.stopTest();
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.isTrue(matched, 'the week matches setup after the update');
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE
            SourceSchedule__c = :draftId
            AND VersionReason__c = :AgentWeeks.THROUGH_AGENT
          WITH SYSTEM_MODE
        ],
        'one version kept, marked through an agent'
      );
      Assert.isTrue(queries < 100, 'Update used ' + queries + ' queries');
    }
  }

  // API-1.64
  @IsTest
  static void anUpdateIsUndoneByUndo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id draftId = weekWithSwimGone(GeneratedTestData.camp());
      Map<String, Object> weekAsked = weekAsk(draftId);
      List<String> read = shown(draftId);
      Test.startTest();
      List<Object> done = ask(
        new AgentUpdateToMatch(),
        'POST',
        updateAsk(weekAsked, read)
      );
      List<Object> undone = ask(new AgentUndo(), 'POST', weekAsked);
      Test.stopTest();
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
    }
  }
}
