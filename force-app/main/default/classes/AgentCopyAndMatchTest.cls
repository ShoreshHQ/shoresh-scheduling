/**
 * Copy season and "Update to match setup" through an agent or the command line
 * (docs/protocol/api.md API-1.61 to API-1.64), on GeneratedTestData's synthetic camp: each the
 * screen's own preview and save, refused with nothing saved when what the AI saw has changed.
 */
@IsTest
private class AgentCopyAndMatchTest {
  /** One request to a door; answers [status, sentence]. */
  private static List<Object> ask(
    Object door,
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
    AgentAskFirstTestCalls.answer(door);
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

  // API-1.62, INGEST-5.10: the AI's copy is the new season's last import; its Undo takes it away.
  @IsTest
  static void ingest510TheAisCopyIsUndoneByTheAisUndo() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Season__c season = season();
      Integer before = seasons();
      // The Copy the AI's copy_season makes (its answer is copyIsTheCopyPagesCopyWithTheDatesSeen's);
      // the AI's ask-first preview of the undo then fits beside it before the test starts.
      SeasonSetupController.copySeason(
        season.Id,
        'Next summer',
        season.StartDate__c.addDays(364)
      );
      Id copyId = [SELECT Id FROM Season__c WHERE Name = 'Next summer'].Id;
      Map<String, Object> undo = new Map<String, Object>{
        'season' => 'Next summer',
        'seen' => ImportUndo.latest(copyId)
      };
      undo.put(
        AgentAskFirst.FIELD,
        AgentAskFirstTestCalls.confirmFor(new AgentUndoImport(), undo)
      );
      Test.startTest();
      List<Object> undone = ask(new AgentUndoImport(), 'POST', undo);
      Test.stopTest();
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(
        (String) undone[1]
      );
      Assert.areEqual(true, result.get('seasonRemoved'));
      Assert.areEqual(before, seasons());
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
      // The ask-first question says, in plain words, that Shoresh stays where it is.
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(
        JSON.serialize(copyAsk(season, 'Next summer', seen))
      );
      RestContext.response = new RestResponse();
      AgentRequest.answer(new AgentCopySeason());
      String question = (String) ((Map<String, Object>) JSON.deserializeUntyped(
          RestContext.response.responseBody.toString()
        ))
        .get('message');
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
      Assert.isTrue(
        question.contains(
          '"' +
            season.Name +
            '" itself is unchanged, and Shoresh doesn\'t switch to "Next summer": name it to work in it.'
        ),
        question
      );
      Assert.areEqual(400, noSeen[0], String.valueOf(noSeen[1]));
      Assert.areEqual(409, refused[0], String.valueOf(refused[1]));
      Assert.areEqual(before, afterRefused, 'nothing copied when refused');
      Assert.areEqual(400, taken[0], String.valueOf(taken[1]));
      Assert.areEqual(200, copied[0], String.valueOf(copied[1]));
      Assert.isTrue(
        ((String) copied[1]).contains('undo_import'),
        String.valueOf(copied[1])
      );
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

  /**
   * The one change the week shows, and the week as read: [key, seen, whether it replaces a
   * placement made by hand]. One read: a test camp's setup and week fill most of a test's queries.
   */
  private static List<String> shown(Id draftId) {
    SetupMatch.Preview preview = SetupMatchController.getSetupChanges(draftId);
    return new List<String>{
      preview.changes[0].key,
      AgentUpdateToMatch.seenOf(preview.revisions),
      String.valueOf(preview.changes[0].takesChoices)
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
          WHERE SourceSchedule__c = :draftId
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
      Boolean replacesHand = Boolean.valueOf(read.remove(2));
      Map<String, Object> yes = updateAsk(weekAsked, read);
      Test.startTest();
      // The person's yes, asked first, so the request counted is the confirmed update alone
      // (API-1.106).
      String confirm = AgentAskFirstTestCalls.confirmFor(
        new AgentUpdateToMatch(),
        yes
      );
      if (confirm != null) {
        yes.put(AgentAskFirst.FIELD, confirm);
      }
      Integer before = Limits.getQueries();
      List<Object> done = ask(new AgentUpdateToMatch(), 'POST', yes);
      Integer queries = Limits.getQueries() - before;
      Boolean matched = SetupMatchController.getSetupChanges(draftId)
        .changes.isEmpty();
      Test.stopTest();
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.isTrue(matched, 'the week matches setup after the update');
      // API-1.148: only the version the screen's update keeps, when it keeps one (a placement
      // made by hand replaced), as the screen keeps it.
      List<Schedule__c> kept = [
        SELECT Name, VersionReason__c
        FROM Schedule__c
        WHERE SourceSchedule__c = :draftId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(replacesHand ? 1 : 0, kept.size(), String.valueOf(kept));
      for (Schedule__c version : kept) {
        Assert.areEqual(SetupMatch.BEFORE_UPDATE, version.Name);
        Assert.areEqual(ManualVersions.AUTO_SAVED, version.VersionReason__c);
      }
      Assert.isTrue(queries < 49, 'Update used ' + queries + ' queries');
    }
  }

  // API-1.106, API-1.64: an update that replaces a placement made by hand asks first, naming the
  // cell, and changes nothing until the person's yes.
  @IsTest
  static void anUpdateThatReplacesAHandPlacementAsksFirst() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id draftId = weekWithSwimGone(GeneratedTestData.camp());
      Map<String, Object> weekAsked = weekAsk(draftId);
      List<String> read = shown(draftId);
      Assert.areEqual('true', read.remove(2), 'Swim was placed by hand');
      Map<String, Object> asked = updateAsk(weekAsked, read);
      // A test camp's setup and week fill most of the queries before the test starts.
      Test.startTest();
      String confirm = AgentAskFirstTestCalls.confirmFor(
        new AgentUpdateToMatch(),
        asked
      );
      String preview = (String) ((Map<String, Object>) JSON.deserializeUntyped(
          RestContext.response.responseBody.toString()
        ))
        .get('preview');
      String asIs = WeekTickets.stamp(ScheduleDays.read(draftId));
      Map<String, Object> yes = asked.clone();
      yes.put(AgentAskFirst.FIELD, confirm);
      List<Object> done = ask(new AgentUpdateToMatch(), 'POST', yes);
      Boolean matched = SetupMatchController.getSetupChanges(draftId)
        .changes.isEmpty();
      Test.stopTest();
      Assert.isNotNull(confirm, 'asks first');
      Assert.isTrue(
        preview.contains(
          'replacing what was placed by hand: Group A · Monday · Lunch: Swim -> Open (Deleted from setup)'
        ),
        preview
      );
      Assert.isTrue(preview.contains(SetupMatch.BEFORE_UPDATE), preview);
      Assert.areEqual(
        read[1],
        AgentUpdateToMatch.seenOf(asIs),
        'nothing changed before the yes'
      );
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.isTrue(matched, 'updated on the yes');
    }
  }

  // API-1.64, API-1.14: the screen has no Undo for an update; Undo says so, changing nothing.
  @IsTest
  static void anUpdateHasNoUndoAsOnTheScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id draftId = weekWithSwimGone(GeneratedTestData.camp());
      Map<String, Object> weekAsked = weekAsk(draftId);
      List<String> read = shown(draftId);
      read.remove(2);
      Test.startTest();
      List<Object> done = ask(
        new AgentUpdateToMatch(),
        'POST',
        updateAsk(weekAsked, read)
      );
      String updated = WeekTickets.stamp(ScheduleDays.read(draftId));
      Map<String, Object> undoAsked = new Map<String, Object>(weekAsked);
      undoAsked.put(
        'held',
        AgentUndoTestCalls.held(AgentUndoTestCalls.undoIn(RestContext.response))
      );
      Integer before = Limits.getQueries();
      List<Object> undone = ask(new AgentUndo(), 'POST', undoAsked);
      Integer queries = Limits.getQueries() - before;
      String after = WeekTickets.stamp(ScheduleDays.read(draftId));
      Test.stopTest();
      Assert.isTrue(queries < 40, 'Undo used ' + queries + ' queries');
      Assert.areEqual(200, done[0], String.valueOf(done[1]));
      Assert.areEqual(400, undone[0], String.valueOf(undone[1]));
      Assert.isTrue(
        String.valueOf(undone[1])
          .startsWith(
            'The screen has no Undo for "Update to match setup", so nothing was undone.'
          ),
        String.valueOf(undone[1])
      );
      Assert.areEqual(updated, after, 'the update stays, nothing changed');
    }
  }

  // API-1.142: a date that doesn't exist is refused through the tool, never moved to one that does.
  @IsTest
  static void copyRefusesADateThatDoesNotExist() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Database.insert(
        new Season__c(
          Camp__c = camp.Id,
          Name = 'Summer',
          Status__c = 'Planning',
          StartDate__c = Date.newInstance(2027, 6, 28),
          EndDate__c = Date.newInstance(2027, 8, 6)
        ),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(
        JSON.serialize(
          new Map<String, Object>{
            'season' => 'Summer',
            'name' => 'Summer two',
            'start_date' => '2027-02-30'
          }
        )
      );
      RestContext.response = new RestResponse();
      AgentRequest.answer(new AgentCopySeason());
      Test.stopTest();
      String said = RestContext.response.responseBody.toString();
      Assert.areEqual(400, RestContext.response.statusCode, said);
      Assert.isTrue(said.contains('as a date like'), said);
      Assert.areEqual(1, [SELECT COUNT() FROM Season__c]);
    }
  }
}
