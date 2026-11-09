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
      List<Object> blank = sent(
        new AgentCreateCamp(),
        new Map<String, Object>{ 'name' => ' ' }
      );
      Assert.areEqual(400, blank[0]);
      Assert.areEqual('Say the camp\'s name (name).', blank[1]);
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
      Map<String, Object> wrongCamp = newSeason('Summer');
      wrongCamp.put('camp', 'Camp Elm');
      Assert.isTrue(
        String.valueOf(sent(new AgentCreateSeason(), wrongCamp)[1])
          .contains('No camp called "Camp Elm"')
      );
      // A date that isn't one, or doesn't exist, isn't moved to one that does.
      for (String day : new List<String>{ 'soon', '2027-02-30' }) {
        Map<String, Object> asked = newSeason('Summer');
        asked.put('camp', 'camp oak');
        asked.put('start_date', day);
        List<Object> refused = sent(new AgentCreateSeason(), asked);
        Assert.areEqual(400, refused[0], String.valueOf(refused[1]));
        Assert.isTrue(String.valueOf(refused[1]).contains('that exists'));
      }
      Map<String, Object> longName = newSeason('x'.repeat(81));
      longName.put('camp', 'Camp Oak');
      List<Object> tooLong = sent(new AgentCreateSeason(), longName);
      Assert.areEqual(400, tooLong[0]);
      Assert.isTrue(
        String.valueOf(tooLong[1]).contains('longer than 80 characters'),
        String.valueOf(tooLong[1])
      );
      Map<String, Object> backwards = newSeason('Summer');
      backwards.put('camp', 'Camp Oak');
      backwards.put('end_date', '2027-01-01');
      List<Object> answer = sent(new AgentCreateSeason(), backwards);
      Test.stopTest();
      Assert.areEqual(400, answer[0], String.valueOf(answer[1]));
      Assert.isTrue(String.valueOf(answer[1]).startsWith('Season not created'));
      Assert.areEqual(0, [SELECT COUNT() FROM Season__c]);
    }
  }

  // API-1.140: an AI finds a season by its name, so two of one name would lock it out of both.
  @IsTest
  static void aNameAnotherSeasonHasIsRefusedAndTheAnswerSaysTheSeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      ShoreshTestData.camp('Camp Willow');
      Test.startTest();
      Map<String, Object> asked = newSeason('Summer');
      Assert.areEqual(200, sent(new AgentCreateSeason(), asked)[0]);
      Map<String, Object> answered = (Map<String, Object>) JSON.deserializeUntyped(
        RestContext.response.responseBody.toString()
      );
      Assert.areEqual('Summer', answered.get('season'));
      List<Object> again = sent(new AgentCreateSeason(), asked);
      Test.stopTest();
      Assert.areEqual(400, again[0]);
      Assert.isTrue(String.valueOf(again[1]).contains('already a season'));
      Assert.areEqual(1, [SELECT COUNT() FROM Season__c]);
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

  // API-1.141: each kind, numbered, in the camp's words, a holding record's group counted but not
  // the record; saved schedules last.
  @IsTest
  static void aSeasonsLinesCountEachKindInTheCampsWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds;
      Id seasonId = ids.get('Season');
      Id programId = ids.get('Main');
      Division__c holding = new Division__c(
        Program__c = programId,
        Name = 'Solo',
        NoDivision__c = true
      );
      Database.insert(holding, AccessLevel.USER_MODE);
      Database.insert(
        new List<SObject>{
          new Group__c(Division__c = holding.Id, Name = 'Solo'),
          new SpecialDay__c(Season__c = seasonId, Name = 'Color War'),
          new SpecialEvent__c(Season__c = seasonId, Name = 'Campfire')
        },
        AccessLevel.USER_MODE
      );
      ShoreshTestData.savedVersion(programId, ids.get('Week 1'), 'Kept');
      Integer divisions = [
        SELECT COUNT()
        FROM Division__c
        WHERE Program__r.Season__c = :seasonId AND NoDivision__c = FALSE
      ];
      Integer groups = [
        SELECT COUNT()
        FROM Group__c
        WHERE Division__r.Program__r.Season__c = :seasonId
      ];
      CampLabels.TermLabel bunk = new CampLabels.TermLabel();
      bunk.term = 'Group';
      bunk.singular = 'Bunk';
      bunk.plural = 'Bunks';
      SeasonSetupController.saveCampLabels(
        camp.Id,
        new List<CampLabels.TermLabel>{ bunk }
      );
      Test.startTest();
      String all = String.join(SeasonContents.of(seasonId), '|');
      Test.stopTest();
      Assert.isTrue(all.contains(divisions + ' Division'), all);
      Assert.isTrue(all.contains(groups + ' Bunks'), all);
      Assert.isTrue(all.contains('|1 Special day|1 Special event|'), all);
      Assert.isTrue(
        all.endsWith(' saved schedule') || all.endsWith(' saved schedules'),
        all
      );
      Assert.isTrue(all.indexOf(' Week') < all.indexOf(' Program'), all);
    }
  }

  // API-1.141: asked and done in one request, on a season with something in it, inside the limits.
  @IsTest
  static void aYesOnAFullSeasonFitsOneRequest() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds;
      for (Integer i = 0; i < 3; i++) {
        ShoreshTestData.savedVersion(
          ids.get('Main'),
          ids.get('Week 1'),
          'Kept ' + i
        );
      }
      String name = [SELECT Name FROM Season__c WHERE Id = :ids.get('Season')]
      .Name;
      Map<String, Object> body = new Map<String, Object>{ 'season' => name };
      String confirm = AgentAskFirstTestCalls.confirmFor(
        new AgentDeleteSeason(),
        body
      );
      body.put(AgentAskFirst.FIELD, confirm);
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
      RestContext.response = new RestResponse();
      AgentWeeks.answer(new AgentDeleteSeason());
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(
        200,
        RestContext.response.statusCode,
        RestContext.response.responseBody.toString()
      );
      Assert.isTrue(queries < 90, 'Queries: ' + queries);
      Assert.areEqual(0, [SELECT COUNT() FROM Season__c WHERE Name = :name]);
    }
  }

  // API-1.141: a yes is for the very season asked about, not another given the same name since.
  @IsTest
  static void aYesIsForTheSeasonAskedAbout() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c first = new Season__c(
        Camp__c = camp.Id,
        Name = 'Summer',
        Status__c = 'Planning',
        StartDate__c = Date.newInstance(2027, 6, 28),
        EndDate__c = Date.newInstance(2027, 8, 6)
      );
      Database.insert(first, AccessLevel.USER_MODE);
      Map<String, Object> body = new Map<String, Object>{
        'season' => 'Summer'
      };
      String confirm = AgentAskFirstTestCalls.confirmFor(
        new AgentDeleteSeason(),
        body
      );
      Database.delete(first, AccessLevel.USER_MODE);
      Database.insert(first.clone(false), AccessLevel.USER_MODE);
      body.put(AgentAskFirst.FIELD, confirm);
      Test.startTest();
      RestContext.request = new RestRequest();
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
      RestContext.response = new RestResponse();
      AgentWeeks.answer(new AgentDeleteSeason());
      Test.stopTest();
      Assert.areEqual(409, RestContext.response.statusCode);
      Assert.areEqual(1, [SELECT COUNT() FROM Season__c]);
    }
  }

  private static Season__c madeSeason(Id campId, String name, Integer year) {
    Season__c season = new Season__c(
      Camp__c = campId,
      Name = name,
      Status__c = 'Planning',
      StartDate__c = Date.newInstance(year, 6, 28),
      EndDate__c = Date.newInstance(year, 8, 6)
    );
    Database.insert(season, AccessLevel.USER_MODE);
    return season;
  }

  private static Map<String, Object> changed(
    String season,
    Map<String, Object> fields,
    Map<String, Object> seen
  ) {
    return new Map<String, Object>{
      'season' => season,
      'fields' => fields,
      'seen' => seen
    };
  }

  // API-1.142, WEEK-4.2
  @IsTest
  static void theShortWeekChoiceIsTheFormsSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = madeSeason(camp.Id, 'Summer', 2027);
      Test.startTest();
      // list_seasons says it, and what it says is what a change sends back.
      Map<String, Object> listed = (Map<String, Object>) ((List<Object>) AgentSeasons.answer()
        .get('seasons'))[0];
      Assert.areEqual('keep', listed.get('short_week'));
      List<Object> stale = sent(
        new AgentChangeSeason(),
        changed(
          'Summer',
          new Map<String, Object>{ 'short_week' => 'lower' },
          new Map<String, Object>{ 'short_week' => 'lower' }
        )
      );
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      List<Object> unknown = sent(
        new AgentChangeSeason(),
        changed(
          'Summer',
          new Map<String, Object>{ 'short_week' => 'sometimes' },
          new Map<String, Object>{ 'short_week' => 'keep' }
        )
      );
      Assert.areEqual(400, unknown[0]);
      Assert.isTrue(String.valueOf(unknown[1]).contains('Say keep or lower'));
      Assert.isFalse(
        [SELECT ShrinkShortWeek__c FROM Season__c WHERE Id = :season.Id]
        .ShrinkShortWeek__c
      );
      List<Object> answer = sent(
        new AgentChangeSeason(),
        changed(
          'Summer',
          new Map<String, Object>{ 'short_week' => 'Lower' },
          new Map<String, Object>{ 'short_week' => 'keep' }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, answer[0], String.valueOf(answer[1]));
      Assert.isTrue(
        [SELECT ShrinkShortWeek__c FROM Season__c WHERE Id = :season.Id]
        .ShrinkShortWeek__c
      );
      Assert.areEqual(
        'lower',
        ((Map<String, Object>) ((List<Object>) AgentSeasons.answer()
            .get('seasons'))[0])
          .get('short_week')
      );
    }
  }

  // API-1.142, API-1.57
  @IsTest
  static void changeSeasonRefusesANameAnotherSeasonHas() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = madeSeason(camp.Id, 'Summer', 2027);
      madeSeason(camp.Id, 'Winter', 2028);
      Test.startTest();
      List<Object> taken = sent(
        new AgentChangeSeason(),
        changed(
          'Summer',
          new Map<String, Object>{ 'name' => 'winter' },
          new Map<String, Object>{ 'name' => 'Summer' }
        )
      );
      Assert.areEqual(400, taken[0], String.valueOf(taken[1]));
      Assert.isTrue(String.valueOf(taken[1]).contains('already a season'));
      // Its own name in other capitals is its own, and saved.
      List<Object> capitals = sent(
        new AgentChangeSeason(),
        changed(
          'Summer',
          new Map<String, Object>{ 'name' => 'SUMMER' },
          new Map<String, Object>{ 'name' => 'Summer' }
        )
      );
      Test.stopTest();
      Assert.areEqual(200, capitals[0], String.valueOf(capitals[1]));
      Assert.isTrue(
        [SELECT Name FROM Season__c WHERE Id = :season.Id].Name.equals('SUMMER')
      );
    }
  }

  private class AlwaysPublished implements PublishedHistory.Finder {
    public Set<Id> withPublishedHistory(Set<Id> recordIds) {
      return recordIds;
    }
  }
}
