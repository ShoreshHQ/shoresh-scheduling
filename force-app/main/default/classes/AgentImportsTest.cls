/**
 * Import a list, Import worksheet and Undo last import through an agent or the command line
 * (docs/protocol/api.md API-1.80 to API-1.83), on a made-up camp: what the screen reads is read
 * with the setup's stamp, the screen's own save runs only while the setup still has that stamp,
 * and Undo undoes only the last import as read. Records are made inside the scheduler's runAs.
 */
@IsTest
private class AgentImportsTest {
  private static final String SEASON = 'Summer 2031 (made up)';

  /** The made-up camp: a season with a gym; answers the season's Id. */
  private static Id camp() {
    Camp__c record = ShoreshTestData.camp('Pine Hollow (made up)');
    Season__c season = ShoreshTestData.season(record.Id, SEASON);
    Location__c gym = new Location__c(
      Season__c = season.Id,
      Name = 'Gym',
      GroupsThatFit__c = 2
    );
    insert as user gym;
    return season.Id;
  }

  /** A GET of what the screen reads; answers [status, the answer as JSON]. */
  private static List<Object> read(Boolean workbook) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.addParameter('season', SEASON);
    RestContext.response = new RestResponse();
    if (workbook) {
      AgentImportWorksheet.get();
    } else {
      AgentImportList.get();
    }
    return new List<Object>{
      RestContext.response.statusCode,
      JSON.deserializeUntyped(RestContext.response.responseBody.toString())
    };
  }

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

  private static String activities(Id seasonId, String name) {
    return JSON.serialize(
      ImportTestPlans.listPlan(
        seasonId,
        new List<Object>{
          ImportTestPlans.newActivity(
            name,
            new Map<String, Object>(),
            new List<Object>()
          )
        }
      )
    );
  }

  private static Map<String, Object> save(String seen, String plan) {
    return new Map<String, Object>{
      'season' => SEASON,
      'seen' => seen,
      'plan' => plan
    };
  }

  private static Integer named(String name) {
    return [SELECT COUNT() FROM Activity__c WHERE Name = :name];
  }

  // API-1.80
  @IsTest
  static void aListIsTheScreensSaveOnlyWhileTheSetupIsAsRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id seasonId = camp();
      Test.startTest();
      List<Object> first = read(false);
      Integer queries = Limits.getQueries();
      Map<String, Object> answer = (Map<String, Object>) first[1];
      String seen = (String) answer.get('seen');
      List<Object> wrong = ask(
        new AgentImportList(),
        'POST',
        save('0000000000000000', activities(seasonId, 'Canoeing'))
      );
      List<Object> none = ask(
        new AgentImportList(),
        'POST',
        save('', activities(seasonId, 'Canoeing'))
      );
      List<Object> elsewhere = ask(
        new AgentImportList(),
        'POST',
        save(
          seen,
          activities(ShoreshTestData.camp('Other (made up)').Id, 'Canoeing')
        )
      );
      List<Object> saved = ask(
        new AgentImportList(),
        'POST',
        save(seen, activities(seasonId, 'Canoeing'))
      );
      // The setup changed with that save: the review read before it is refused.
      List<Object> stale = ask(
        new AgentImportList(),
        'POST',
        save(seen, activities(seasonId, 'Kayaking'))
      );
      Test.stopTest();
      Assert.areEqual(200, first[0]);
      Assert.isTrue(queries < 100, 'one read stays well under the limit');
      Assert.isNotNull(answer.get('setup'));
      Assert.isNotNull(answer.get('answers'));
      Assert.areEqual(16, seen.length());
      Assert.areEqual(409, wrong[0], String.valueOf(wrong[1]));
      Assert.areEqual(400, none[0]);
      Assert.areEqual(400, elsewhere[0]);
      Assert.areEqual(200, saved[0], String.valueOf(saved[1]));
      Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(
        (String) saved[1]
      );
      Assert.areEqual(
        1,
        ((Map<String, Object>) result.get('added')).get('Activity')
      );
      Assert.areEqual(409, stale[0]);
      Assert.areEqual(1, named('Canoeing'));
      Assert.areEqual(0, named('Kayaking'));
    }
  }

  // API-1.81
  @IsTest
  static void aWorksheetIsTheScreensSaveWithTheSetupSeen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id seasonId = camp();
      String plan = JSON.serialize(
        ImportTestPlans.workbookPlan(
          seasonId,
          new List<Object>{
            ImportTestPlans.rec(
              'Location',
              'Location:Lake',
              new Map<String, Object>{
                'Name' => 'Lake',
                'GroupsThatFit__c' => 1
              }
            )
          },
          new List<Object>()
        )
      );
      Test.startTest();
      List<Object> first = read(true);
      String seen = (String) ((Map<String, Object>) first[1]).get('seen');
      List<Object> saved = ask(
        new AgentImportWorksheet(),
        'POST',
        save(seen, plan)
      );
      Test.stopTest();
      Assert.areEqual(200, first[0]);
      Assert.areEqual(200, saved[0], String.valueOf(saved[1]));
      Assert.areEqual(1, [SELECT COUNT() FROM Location__c WHERE Name = 'Lake']);
      Assert.areEqual(
        'camp.xlsx',
        [SELECT Files__c FROM Import__c WHERE Season__c = :seasonId].Files__c
      );
    }
  }

  // API-1.82, API-1.83
  @IsTest
  static void undoIsTheScreensUndoOfTheLastImportRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id seasonId = camp();
      Id older = ImportController.saveList(activities(seasonId, 'Canoeing'))
        .importId;
      Id last = ImportController.saveList(activities(seasonId, 'Kayaking'))
        .importId;
      Map<String, Object> asked = new Map<String, Object>{ 'season' => SEASON };
      Test.startTest();
      List<Object> listed = ask(new AgentReadLastImports(), 'GET', asked);
      List<Object> earlier = ask(
        new AgentUndoImport(),
        'POST',
        new Map<String, Object>{ 'season' => SEASON, 'seen' => older }
      );
      List<Object> undone = ask(
        new AgentUndoImport(),
        'POST',
        new Map<String, Object>{ 'season' => SEASON, 'seen' => last }
      );
      List<Object> again = ask(
        new AgentUndoImport(),
        'POST',
        new Map<String, Object>{ 'season' => SEASON, 'seen' => last }
      );
      List<Object> after = ask(new AgentReadLastImports(), 'GET', asked);
      Test.stopTest();
      Assert.areEqual(200, listed[0], String.valueOf(listed[1]));
      String said = (String) listed[1];
      Assert.isTrue(
        said.contains('Last import: activities.csv (Activities)'),
        said
      );
      Assert.isTrue(said.contains('seen: "' + last + '"'), said);
      Assert.areEqual(409, earlier[0], String.valueOf(earlier[1]));
      Assert.areEqual(200, undone[0], String.valueOf(undone[1]));
      Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(
        (String) undone[1]
      );
      Assert.isTrue((Integer) result.get('removed') >= 1);
      Assert.areEqual(0, named('Kayaking'));
      Assert.areEqual(1, named('Canoeing'), 'only the last import is undone');
      Assert.areEqual(400, again[0]);
      Assert.isTrue(((String) after[1]).startsWith('Nothing imported'));
    }
  }
}
