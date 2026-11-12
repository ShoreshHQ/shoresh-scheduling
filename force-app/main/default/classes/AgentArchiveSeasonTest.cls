/**
 * Archiving and bringing back a season through an AI (docs/protocol/api.md API-1.145; WEEK-1.9 to
 * WEEK-1.12): archive_season and bring_back_season, list_seasons marking archived seasons, and
 * delete_season's refusal saying the season can be archived. Every test acts as a scheduler with
 * only the Shoresh Scheduler permission set. Names are made up.
 */
@IsTest
private class AgentArchiveSeasonTest {
  private class AlwaysPublished implements PublishedHistory.Finder {
    public Set<Id> withPublishedHistory(Set<Id> recordIds) {
      return recordIds;
    }
  }

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

  private static Map<String, Object> season(String name) {
    return new Map<String, Object>{ 'season' => name };
  }

  private static Boolean archivedNow(Id seasonId) {
    return [
      SELECT Archived__c
      FROM Season__c
      WHERE Id = :seasonId
      WITH SYSTEM_MODE
    ]
    .Archived__c;
  }

  // API-1.145, WEEK-1.9: delete_season refused for published history says it can be archived;
  // archive_season then archives it, named only.
  @IsTest
  static void aPublishedSeasonIsArchivedNotDeleted() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c summer = ShoreshTestData.season(camp.Id, 'Summer');
      PublishedHistory.finder = new AlwaysPublished();
      Test.startTest();
      List<Object> refused = sent(new AgentDeleteSeason(), season('Summer'));
      List<Object> unnamed = sent(
        new AgentArchiveSeason(),
        new Map<String, Object>()
      );
      List<Object> archived = sent(new AgentArchiveSeason(), season('Summer'));
      List<Object> again = sent(new AgentArchiveSeason(), season('Summer'));
      Test.stopTest();
      Assert.areEqual(400, refused[0]);
      String said = String.valueOf(refused[1]);
      Assert.isTrue(
        said.endsWith('It can be archived instead (archive_season).'),
        said
      );
      Assert.isFalse(said.contains('Finished'), said);
      Assert.areEqual(400, unnamed[0]);
      Assert.areEqual('Say which season to archive (season).', unnamed[1]);
      Assert.areEqual(200, archived[0], String.valueOf(archived[1]));
      Assert.isTrue(
        String.valueOf(archived[1]).startsWith('Archived "Summer".'),
        String.valueOf(archived[1])
      );
      Assert.areEqual(400, again[0]);
      Assert.areEqual(
        '"Summer" is already archived. Nothing was changed.',
        again[1]
      );
      Assert.isTrue(archivedNow(summer.Id));
    }
  }

  // API-1.145, ADR 0029 choice 8: an AI may do what the screen offers, no more. The screen offers
  // Archive only for a season ever published, so archive_season refuses one never published,
  // saying to delete it instead, with nothing changed.
  @IsTest
  static void aSeasonNeverPublishedIsNotArchived() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c summer = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Test.startTest();
      List<Object> refused = sent(
        new AgentArchiveSeason(),
        season('Summer 2027')
      );
      Test.stopTest();
      Assert.areEqual(400, refused[0]);
      Assert.areEqual(
        '"Summer 2027" was never published, so it can\'t be archived. It can be deleted instead (delete_season).',
        refused[1]
      );
      Assert.isFalse(archivedNow(summer.Id));
    }
  }

  // API-1.145, WEEK-1.10: an AI's change in an archived season is refused with only what is
  // wrong; delete_season on it is refused before anyone is asked.
  @IsTest
  static void anAisChangeInAnArchivedSeasonIsRefusedSayingWhy() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c summer = ShoreshTestData.season(camp.Id, 'Summer');
      SeasonArchive.archive(summer.Id);
      Test.startTest();
      List<Object> renamed = sent(
        new AgentChangeSeason(),
        new Map<String, Object>{
          'season' => 'Summer',
          'fields' => new Map<String, Object>{ 'name' => 'Summer 2' },
          'seen' => new Map<String, Object>{ 'name' => 'Summer' }
        }
      );
      List<Object> deleted = sent(new AgentDeleteSeason(), season('Summer'));
      Test.stopTest();
      Assert.areNotEqual(200, renamed[0], String.valueOf(renamed[1]));
      String said = String.valueOf(renamed[1]);
      Assert.isTrue(
        said.contains('"Summer" is archived, so it can\'t be changed.'),
        said
      );
      Assert.isFalse(said.contains('Bring it back'), said);
      Assert.areEqual(400, deleted[0]);
      Assert.isTrue(
        String.valueOf(deleted[1]).contains('is archived'),
        String.valueOf(deleted[1])
      );
      Assert.isFalse(String.valueOf(deleted[1]).contains('archive_season'));
      Assert.areEqual(1, [SELECT COUNT() FROM Season__c]);
    }
  }

  // API-1.145, WEEK-1.12: bring_back_season brings an archived season back, named only.
  @IsTest
  static void anArchivedSeasonIsBroughtBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c summer = ShoreshTestData.season(camp.Id, 'Summer');
      SeasonArchive.archive(summer.Id);
      Test.startTest();
      Boolean marked =
        ((Map<String, Object>) ((List<Object>) AgentSeasons.answer()
            .get('seasons'))[0])
          .get('archived') == true;
      List<Object> back = sent(new AgentBringBackSeason(), season('Summer'));
      List<Object> again = sent(new AgentBringBackSeason(), season('Summer'));
      Test.stopTest();
      Assert.isTrue(marked);
      Assert.areEqual(200, back[0], String.valueOf(back[1]));
      Assert.areEqual(
        'Brought back "Summer". It can be changed again.',
        back[1]
      );
      Assert.areEqual(400, again[0]);
      Assert.areEqual(
        '"Summer" isn\'t archived. Nothing was changed.',
        again[1]
      );
      Assert.isFalse(archivedNow(summer.Id));
    }
  }
}
