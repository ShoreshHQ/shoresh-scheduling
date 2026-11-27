/**
 * Areas of camp (ADR 0031 piece C): a location's area, read with it by every screen and by
 * Generated Schedule's build, read and changed by an AI or the command line as the setup table's
 * own row save, and carried by Copy season. Synthetic data only.
 */
@IsTest
private class LocationAreasTest {
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids = new Map<String, Id>();
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      ids.putAll(ShoreshTestData.placesAndActivities(season.Id));
      ids.put('Season', season.Id);
      ids.put('Camp', camp.Id);
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  /**
   * A read or change of the season's Pool through the outside door; answers [status, sentence].
   */
  private static List<Object> pool(
    String season,
    String action,
    Map<String, Object> more
  ) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => season,
      'kind' => 'location',
      'name' => 'Pool'
    };
    body.putAll(more);
    RestContext.request = new RestRequest();
    RestContext.response = new RestResponse();
    if (action == 'read') {
      RestContext.request.httpMethod = 'GET';
      for (String key : body.keySet()) {
        RestContext.request.addParameter(key, String.valueOf(body.get(key)));
      }
      AgentRequest.answer(new AgentReadSetup());
    } else {
      RestContext.request.httpMethod = 'POST';
      RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
      AgentRequest.answer(new AgentChangeSetup());
    }
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  private static String areaOf(Id locationId) {
    return [
      SELECT Area__c
      FROM Location__c
      WHERE Id = :locationId
      WITH SYSTEM_MODE
    ]
    .Area__c;
  }

  // API-1.49
  @IsTest
  static void anAiReadsAndChangesALocationsAreaAsTheTableDoes() {
    Map<String, Id> ids = KeptCamp.keptIds();
    String season = [
      SELECT Name
      FROM Season__c
      WHERE Id = :ids.get('Season')
      WITH SYSTEM_MODE
    ]
    .Name;
    System.runAs(KeptCamp.scheduler(ids)) {
      Test.startTest();
      List<Object> before = pool(season, 'read', new Map<String, Object>());
      Integer queriesBefore = Limits.getQueries();
      List<Object> changed = pool(
        season,
        'change',
        new Map<String, Object>{
          'fields' => new Map<String, Object>{ 'area' => 'Lakefront' },
          'seen' => new Map<String, Object>{ 'area' => '(blank)' }
        }
      );
      Integer changeQueries = Limits.getQueries() - queriesBefore;
      List<Object> after = pool(season, 'read', new Map<String, Object>());
      List<Object> cleared = pool(
        season,
        'change',
        new Map<String, Object>{
          'fields' => new Map<String, Object>{ 'area' => '' },
          'seen' => new Map<String, Object>{ 'area' => 'Lakefront' }
        }
      );
      Test.stopTest();
      // One change is one request, well under Salesforce's 100 queries.
      Assert.isTrue(changeQueries <= 30, 'Queries: ' + changeQueries);
      Assert.areEqual(200, before[0], String.valueOf(before[1]));
      Assert.isTrue(
        String.valueOf(before[1]).contains('area: (blank)'),
        String.valueOf(before[1])
      );
      Assert.areEqual(200, changed[0], String.valueOf(changed[1]));
      Assert.areEqual(
        'Changed the location "Pool": area Lakefront.',
        changed[1]
      );
      Assert.isTrue(
        String.valueOf(after[1]).contains('area: Lakefront'),
        String.valueOf(after[1])
      );
      Assert.areEqual(200, cleared[0], String.valueOf(cleared[1]));
      Assert.isNull(areaOf(ids.get('Pool')));
    }
  }

  // ADR 0031 C1: every screen, and Generated Schedule's build, read it with the location.
  @IsTest
  static void everyScreenAndTheBuildReadTheArea() {
    Map<String, Id> ids = KeptCamp.keptIds();
    Database.update(
      new Location__c(Id = ids.get('Pool'), Area__c = 'Lakefront'),
      AccessLevel.SYSTEM_MODE
    );
    Id programId = [
      SELECT Id
      FROM Program__c
      WHERE Season__c = :ids.get('Season')
      WITH SYSTEM_MODE
      LIMIT 1
    ]
    .Id;
    Id weekId = [
      SELECT Id
      FROM Week__c
      WHERE Season__c = :ids.get('Season')
      WITH SYSTEM_MODE
      ORDER BY StartDate__c
      LIMIT 1
    ]
    .Id;
    System.runAs(KeptCamp.scheduler(ids)) {
      Test.startTest();
      List<Location__c> screens = SeasonSetupReader.locationsOf(
        ids.get('Season')
      );
      GeneratedInputs.Inputs inputs = GeneratedInputs.read(programId, weekId);
      Test.stopTest();
      Map<String, String> byName = new Map<String, String>();
      for (Location__c place : screens) {
        byName.put(place.Name, place.Area__c);
      }
      Assert.areEqual('Lakefront', byName.get('Pool'));
      Assert.isNull(byName.get('Gym'));
      for (Location__c place : inputs.locations) {
        Assert.areEqual(
          place.Id == ids.get('Pool') ? 'Lakefront' : null,
          place.Area__c
        );
      }
    }
  }

  // ADR 0031 C1
  @IsTest
  static void copySeasonCarriesTheArea() {
    Map<String, Id> ids = KeptCamp.keptIds();
    Database.update(
      new Location__c(Id = ids.get('Pool'), Area__c = 'Lakefront'),
      AccessLevel.SYSTEM_MODE
    );
    System.runAs(KeptCamp.scheduler(ids)) {
      Test.startTest();
      Id copyId = new SeasonCopier(
          ids.get('Season'),
          Date.newInstance(2027, 6, 28)
        )
        .copy('Summer 2027');
      Test.stopTest();
      Location__c copied = [
        SELECT Area__c
        FROM Location__c
        WHERE Season__c = :copyId AND CopiedFrom__c = :ids.get('Pool')
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Lakefront', copied.Area__c);
    }
  }
}
