/**
 * The camp's words, the season itself and "Same location?" through an agent or the command line
 * (docs/protocol/api.md API-1.56 to API-1.58), on GeneratedTestData's synthetic camp: each the
 * screen's own save, refused with nothing saved when what the AI saw has changed, capitals and all.
 */
@IsTest
private class AgentCampSetupTest {
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

  // API-1.56
  @IsTest
  static void campWordsAreTheCampWordsScreensSaveWithTheWordsSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Season__c season = season();
      Test.startTest();
      List<Object> read = ask(
        new AgentReadCampWords(),
        'GET',
        new Map<String, Object>{ 'season' => season.Name }
      );
      // Capitals count: the word read was "Group / Groups".
      List<Object> stale = ask(
        new AgentChangeCampWords(),
        'POST',
        new Map<String, Object>{
          'season' => season.Name,
          'words' => new Map<String, Object>{ 'Group' => 'Bunk / Bunks' },
          'seen' => new Map<String, Object>{ 'Group' => 'group / groups' }
        }
      );
      Integer afterStale = [SELECT COUNT() FROM CampLabel__c WITH SYSTEM_MODE];
      List<Object> changed = ask(
        new AgentChangeCampWords(),
        'POST',
        new Map<String, Object>{
          'season' => season.Name,
          'words' => new Map<String, Object>{ 'group' => 'Bunk / Bunks' },
          'seen' => new Map<String, Object>{ 'group' => 'Group / Groups' }
        }
      );
      List<Object> half = ask(
        new AgentChangeCampWords(),
        'POST',
        new Map<String, Object>{
          'season' => season.Name,
          'words' => new Map<String, Object>{ 'Bunk' => 'Cabin' },
          'seen' => new Map<String, Object>{ 'Bunk' => 'Bunk / Bunks' }
        }
      );
      List<Object> back = ask(
        new AgentChangeCampWords(),
        'POST',
        new Map<String, Object>{
          'season' => season.Name,
          'words' => new Map<String, Object>{ 'Group' => '(blank)' },
          'seen' => new Map<String, Object>{ 'Group' => 'Bunk / Bunks' }
        }
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.isTrue(
        String.valueOf(read[1]).contains('; Group: Group / Groups;'),
        String.valueOf(read[1])
      );
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(0, afterStale);
      Assert.areEqual(200, changed[0], String.valueOf(changed[1]));
      Assert.isTrue(
        String.valueOf(changed[1]).endsWith(': Group: Bunk / Bunks.'),
        String.valueOf(changed[1])
      );
      Assert.areEqual(400, half[0]);
      Assert.isTrue(
        String.valueOf(half[1])
          .startsWith('Camp words not saved. Give "Group" both'),
        String.valueOf(half[1])
      );
      Assert.areEqual(200, back[0], String.valueOf(back[1]));
      Assert.areEqual(0, [SELECT COUNT() FROM CampLabel__c WITH SYSTEM_MODE]);
    }
  }

  // API-1.57
  @IsTest
  static void seasonIsTheSeasonFormsSaveWithWhatListSeasonsSaid() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Season__c season = season();
      Test.startTest();
      List<Object> stale = ask(
        new AgentChangeSeason(),
        'POST',
        new Map<String, Object>{
          'season' => season.Name,
          'fields' => new Map<String, Object>{ 'name' => 'Summer two' },
          'seen' => new Map<String, Object>{
            'name' => season.Name.toUpperCase()
          }
        }
      );
      List<Object> unseen = ask(
        new AgentChangeSeason(),
        'POST',
        new Map<String, Object>{
          'season' => season.Name,
          'fields' => new Map<String, Object>{ 'end_date' => '2026-08-14' },
          'seen' => new Map<String, Object>{ 'name' => season.Name }
        }
      );
      List<Object> changed = ask(
        new AgentChangeSeason(),
        'POST',
        new Map<String, Object>{
          'season' => season.Name,
          'fields' => new Map<String, Object>{
            'name' => 'Summer two',
            'end_date' => '2026-08-14'
          },
          'seen' => new Map<String, Object>{
            'name' => season.Name,
            'end_date' => String.valueOf(season.EndDate__c)
          }
        }
      );
      Test.stopTest();
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(400, unseen[0], String.valueOf(unseen[1]));
      Assert.areEqual(200, changed[0], String.valueOf(changed[1]));
      Season__c now = season();
      Assert.areEqual('Summer two', now.Name);
      Assert.areEqual(Date.newInstance(2026, 8, 14), now.EndDate__c);
      Assert.areEqual(season.StartDate__c, now.StartDate__c);
    }
  }

  // API-1.58
  @IsTest
  static void mergeIsTheSameLocationQuestionsWithThePlacesSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Season__c season = season();
      Id pool = GeneratedTestData.ids.get('Pool');
      Location__c other = new Location__c(
        Season__c = season.Id,
        Name = 'pool',
        GroupsThatFit__c = 2
      );
      Database.insert(other, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      List<Object> read = ask(
        new AgentSameLocations(),
        'GET',
        new Map<String, Object>{ 'season' => season.Name, 'name' => 'POOL' }
      );
      // Capitals count: "POOL" is neither place's name.
      List<Object> stale = ask(
        new AgentMergeLocations(),
        'POST',
        new Map<String, Object>{
          'season' => season.Name,
          'name' => 'Pool',
          'seen' => new Map<String, Object>{ 'Pool' => '1', 'POOL' => '2' }
        }
      );
      Integer afterStale = [
        SELECT COUNT()
        FROM Location__c
        WHERE Id = :other.Id
        WITH SYSTEM_MODE
      ];
      List<Object> merged = ask(
        new AgentMergeLocations(),
        'POST',
        new Map<String, Object>{
          'season' => season.Name,
          'name' => 'Pool',
          'seen' => new Map<String, Object>{ 'Pool' => '1', 'pool' => '2' }
        }
      );
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.isTrue(
        String.valueOf(read[1])
          .contains(
            '"Pool" (groups_that_fit 1, 1 activity here); "pool" (groups_that_fit 2, 0 activities here). Camp Setup would keep "Pool" with groups_that_fit 2.'
          ),
        String.valueOf(read[1])
      );
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(1, afterStale);
      Assert.areEqual(200, merged[0], String.valueOf(merged[1]));
      Assert.isTrue(
        String.valueOf(merged[1])
          .startsWith('Merged into "Pool" (groups_that_fit 2): "pool" deleted'),
        String.valueOf(merged[1])
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Location__c WHERE Id = :other.Id WITH SYSTEM_MODE]
      );
      Assert.areEqual(
        2,
        [
          SELECT GroupsThatFit__c
          FROM Location__c
          WHERE Id = :pool
          WITH SYSTEM_MODE
        ]
        .GroupsThatFit__c
      );
    }
  }
}
