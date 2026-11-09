/**
 * Starting through an AI (docs/protocol/api.md API-1.139 to API-1.141): the first tool with no camp
 * yet, a camp named, a blank season, and Delete season's question and refusals. Every test acts as
 * a scheduler with only the Shoresh Scheduler permission set. Names are made up.
 */
@IsTest
private class AgentCampSeasonTest {
  private static List<Object> sent(
    AgentWeeks.Action action,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentAskFirstTestCalls.answer(action);
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static Map<String, Object> newSeason(String name) {
    return new Map<String, Object>{
      'name' => name,
      'start_date' => '2027-06-28',
      'end_date' => '2027-08-06'
    };
  }

  // API-1.139
  @IsTest
  static void theFirstToolsWorkWithNoCampYet() {
    System.runAs(ShoreshTestData.scheduler()) {
      Test.startTest();
      Map<String, Object> asked = AgentSeasons.answer();
      Assert.isNull(asked.get('opens_on'));
      Assert.isTrue(((List<Object>) asked.get('seasons')).isEmpty());
      Assert.isTrue(((List<Object>) asked.get('camps')).isEmpty());
      // No camp yet: nothing to add a season to, said as such.
      List<Object> noCamp = sent(new AgentCreateSeason(), newSeason('Summer'));
      Assert.areEqual(400, noCamp[0]);
      Assert.isTrue(
        String.valueOf(noCamp[1]).startsWith('There is no camp yet')
      );
      Assert.areEqual(
        400,
        sent(new AgentCreateCamp(), new Map<String, Object>{ 'name' => ' ' })[0]
      );
      List<Object> made = sent(
        new AgentCreateCamp(),
        new Map<String, Object>{ 'name' => 'Camp Willow' }
      );
      Test.stopTest();
      Assert.areEqual(200, made[0], String.valueOf(made[1]));
      Assert.areEqual('Created the camp "Camp Willow".', made[1]);
      Assert.areEqual(
        new List<Object>{ 'Camp Willow' },
        (List<Object>) AgentSeasons.answer().get('camps')
      );
    }
  }

  // API-1.139
  @IsTest
  static void aCampIsOnlyForWhenThereIsNoneAsOnTheScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      ShoreshTestData.camp('Camp Willow');
      Test.startTest();
      List<Object> answer = sent(
        new AgentCreateCamp(),
        new Map<String, Object>{ 'name' => 'Camp Oak' }
      );
      Test.stopTest();
      Assert.areEqual(400, answer[0]);
      Assert.areEqual(
        'A camp is set up already: Camp Willow. Nothing was changed.',
        answer[1]
      );
      Assert.areEqual(1, [SELECT COUNT() FROM Camp__c]);
    }
  }

  // API-1.140
  @IsTest
  static void aBlankSeasonIsTheScreensNewSeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      ShoreshTestData.camp('Camp Willow');
      Test.startTest();
      List<Object> answer = sent(new AgentCreateSeason(), newSeason('Summer'));
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Season__c season = [
        SELECT Name, Status__c, StartDate__c, EndDate__c
        FROM Season__c
      ];
      Assert.areEqual('Summer', season.Name);
      Assert.areEqual('Planning', season.Status__c);
      Assert.areEqual(Date.newInstance(2027, 6, 28), season.StartDate__c);
      Assert.areEqual(Date.newInstance(2027, 8, 6), season.EndDate__c);
      Assert.areEqual(
        new List<String>{ 'Nothing set up in it yet' },
        SeasonContents.of(season.Id)
      );
    }
  }

  // API-1.140
  @IsTest
  static void aSeasonIsRefusedWhatTheScreenRefuses() {
    System.runAs(ShoreshTestData.scheduler()) {
      ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.camp('Camp Oak');
      Test.startTest();
      // Two camps and none named: asked, never picked.
      List<Object> which = sent(new AgentCreateSeason(), newSeason('Summer'));
      Assert.areEqual(400, which[0]);
      Assert.isTrue(String.valueOf(which[1]).contains('Say which camp'));
      Map<String, Object> asked = newSeason('Summer');
      asked.put('camp', 'camp oak');
      asked.put('start_date', 'soon');
      Assert.areEqual(400, sent(new AgentCreateSeason(), asked)[0]);
      asked = newSeason('Summer');
      asked.put('camp', 'Camp Oak');
      asked.put('end_date', '2027-01-01');
      List<Object> backwards = sent(new AgentCreateSeason(), asked);
      Test.stopTest();
      Assert.areEqual(400, backwards[0], String.valueOf(backwards[1]));
      Assert.isTrue(
        String.valueOf(backwards[1]).startsWith('Season not created')
      );
      Assert.areEqual(0, [SELECT COUNT() FROM Season__c]);
    }
  }

  // API-1.141
  @IsTest
  static void aSeasonsDeleteAsksTheScreensQuestionWithWhatGoesWithIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(camp.Id);
      Season__c season = [SELECT Id, Name FROM Season__c];
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(
        JSON.serialize(new Map<String, Object>{ 'season' => season.Name })
      );
      String asked = new AgentDeleteSeason().preview();
      Test.stopTest();
      SetupDelete.Preview screen = SetupDelete.preview(season.Id);
      Assert.areEqual('Delete ' + season.Name + '?', screen.label);
      Assert.areEqual(
        screen.label + ' ' + String.join(screen.lines, ', ') + '.',
        asked
      );
    }
  }

  // API-1.141
  @IsTest
  static void aYesDeletesTheSeasonThroughTheScreensDelete() {
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
      List<Object> answer = sent(
        new AgentDeleteSeason(),
        new Map<String, Object>{ 'season' => 'Summer' }
      );
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.areEqual('Deleted "Summer".', answer[1]);
      Assert.areEqual(0, [SELECT COUNT() FROM Season__c]);
      Assert.areEqual(1, [SELECT COUNT() FROM Camp__c]);
    }
  }

  // API-1.141
  @IsTest
  static void aSeasonIsDeletedOnlyByNameAndPublishedHistoryRefusesIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = new Season__c(
        Camp__c = camp.Id,
        Name = 'Summer',
        Status__c = 'Planning',
        StartDate__c = Date.newInstance(2027, 6, 28),
        EndDate__c = Date.newInstance(2027, 8, 6)
      );
      Database.insert(season, AccessLevel.USER_MODE);
      Test.startTest();
      // The one season the screens open on is never assumed.
      Assert.areEqual(
        400,
        sent(new AgentDeleteSeason(), new Map<String, Object>())[0]
      );
      PublishedHistory.finder = new AlwaysPublished();
      List<Object> answer = sent(
        new AgentDeleteSeason(),
        new Map<String, Object>{ 'season' => 'Summer' }
      );
      Test.stopTest();
      Assert.areEqual(400, answer[0], String.valueOf(answer[1]));
      String said = String.valueOf(answer[1]);
      Assert.isTrue(said.contains('Nothing was removed'), said);
      Assert.isTrue(said.contains('kept as history'), said);
      Assert.isFalse(said.contains('Mark it Finished'), said);
      Assert.areEqual(1, [SELECT COUNT() FROM Season__c]);
    }
  }

  // API-1.141
  @IsTest
  static void aSeasonsLinesCountEachKindInTheCampsWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(camp.Id);
      Id seasonId = ShoreshTestData.lastSeasonIds.get('Season');
      Test.startTest();
      List<String> lines = SeasonContents.of(seasonId);
      Test.stopTest();
      String all = String.join(lines, '|');
      Assert.isTrue(all.contains('Week'), all);
      Assert.isTrue(all.contains('Program'), all);
      Assert.isTrue(all.contains('Time block'), all);
      Assert.isTrue(all.contains(' Group'), all);
    }
  }

  private class AlwaysPublished implements PublishedHistory.Finder {
    public Set<Id> withPublishedHistory(Set<Id> recordIds) {
      return recordIds;
    }
  }
}
