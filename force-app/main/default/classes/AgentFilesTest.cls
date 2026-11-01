/**
 * What a file is made from through an agent or the command line (docs/protocol/api.md API-1.86
 * to API-1.89): each door answers exactly what its screen reads before its Download, Excel or
 * Print, and changes nothing, on synthetic camps (GeneratedTestData, SpecialScheduleTestData,
 * AgentElectivesTestData). The files themselves are made by the screens' own modules in the
 * connector (connect.test.js filesAsTheScreensMakeThem).
 */
@IsTest
private class AgentFilesTest {
  /** One GET to a door; answers [status, the answer read]. */
  private static List<Object> read(
    AgentFiles.Read door,
    Map<String, String> params
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.params.putAll(params);
    RestContext.response = new RestResponse();
    AgentFiles.answer(door);
    return new List<Object>{
      RestContext.response.statusCode,
      JSON.deserializeUntyped(RestContext.response.responseBody.toString())
    };
  }

  private static String seasonName(Id seasonId) {
    return [SELECT Name FROM Season__c WHERE Id = :seasonId WITH SYSTEM_MODE]
    .Name;
  }

  private static Object asJson(Object value) {
    return JSON.deserializeUntyped(JSON.serialize(value));
  }

  // API-1.86
  @IsTest
  static void aScheduleFileIsTheScreensOpenOfTheVersionNamedOrTheNewest() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      GeneratedScheduleController.saveVersion(draftId, 'Plain');
      Map<String, String> week = new Map<String, String>{
        'season' => seasonName(GeneratedTestData.ids.get('Season')),
        'week' => 'Week 1',
        'program' => 'Main'
      };
      Map<String, String> named = week.clone();
      named.put('version', 'plain');
      Map<String, String> missing = week.clone();
      missing.put('version', 'Nope');
      Map<String, String> unknown = week.clone();
      unknown.put('colour', 'blue');
      Integer schedules = [SELECT COUNT() FROM Schedule__c WITH SYSTEM_MODE];
      Test.startTest();
      List<Object> newest = read(new AgentScheduleFile(), week);
      List<Object> asked = read(new AgentScheduleFile(), named);
      List<Object> none = read(new AgentScheduleFile(), missing);
      List<Object> refused = read(new AgentScheduleFile(), unknown);
      Test.stopTest();
      List<ScheduleViews.VersionRow> versions = SchedulesController.getVersions(
        GeneratedTestData.ids.get('Main'),
        GeneratedTestData.ids.get('Week 1')
      );
      Assert.areEqual(200, newest[0], String.valueOf(newest[1]));
      Map<String, Object> body = (Map<String, Object>) newest[1];
      Assert.areEqual('Week 1', body.get('week'));
      Assert.areEqual('Main', body.get('program'));
      Assert.areEqual(versions[0].name, body.get('version'));
      Assert.areEqual(
        asJson(SchedulesController.openSchedule(versions[0].id)),
        body.get('opened')
      );
      Assert.isTrue(
        ((Map<String, Object>) body.get('setup')).containsKey('activities'),
        'the season setup'
      );
      Assert.areEqual(200, asked[0], String.valueOf(asked[1]));
      Assert.areEqual('Plain', ((Map<String, Object>) asked[1]).get('version'));
      Assert.areEqual(400, none[0]);
      Assert.isTrue(
        String.valueOf(none[1]).contains('Plain'),
        'names the versions there are: ' + none[1]
      );
      Assert.areEqual(400, refused[0]);
      Assert.areEqual(
        schedules,
        [SELECT COUNT() FROM Schedule__c WITH SYSTEM_MODE],
        'nothing changed'
      );
    }
  }

  // API-1.87
  @IsTest
  static void aSpecialScheduleFileIsThePagesOwnRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      SpecialScheduleTestData.colorWar(ids);
      Map<String, String> asked = new Map<String, String>{
        'season' => seasonName(ids.get('Season')),
        'special' => 'color war'
      };
      Test.startTest();
      List<Object> file = read(new AgentSpecialScheduleFile(), asked);
      asked.put('special', 'Nope');
      List<Object> none = read(new AgentSpecialScheduleFile(), asked);
      Test.stopTest();
      Assert.areEqual(200, file[0], String.valueOf(file[1]));
      Map<String, Object> body = (Map<String, Object>) file[1];
      Map<String, Object> view = (Map<String, Object>) body.get('view');
      Assert.areEqual('Color War', view.get('name'));
      Assert.isTrue(view.containsKey('schedule'), 'the page own read');
      Assert.isTrue(body.containsKey('setup'), 'the season setup');
      Assert.areEqual(400, none[0]);
    }
  }

  /** The elective set and week AgentElectivesTestData made, as the web address names them. */
  private static Map<String, String> electiveAsked() {
    Map<String, String> asked = new Map<String, String>();
    Map<String, Object> fields = AgentElectivesTestData.asked(
      new Map<String, Object>()
    );
    for (String key : fields.keySet()) {
      asked.put(key, String.valueOf(fields.get(key)));
    }
    return asked;
  }

  // API-1.88
  @IsTest
  static void anElectiveFileIsRefusedBeforeFinalize() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      Test.startTest();
      List<Object> before = read(new AgentElectiveFile(), electiveAsked());
      Test.stopTest();
      Assert.areEqual(400, before[0]);
      Assert.isTrue(
        String.valueOf(before[1]).contains('isn\'t finalized yet'),
        String.valueOf(before[1])
      );
    }
  }

  // API-1.88
  @IsTest
  static void anElectiveFileIsTheScreensDownloadOfTheFinalRun() {
    System.runAs(ShoreshTestData.scheduler()) {
      AgentElectivesTestData.camp();
      AgentElectivesTestData.finalized();
      Test.startTest();
      List<Object> after = read(new AgentElectiveFile(), electiveAsked());
      Test.stopTest();
      Assert.areEqual(200, after[0], String.valueOf(after[1]));
      Map<String, Object> body = (Map<String, Object>) after[1];
      // The screen's own read (ElectiveSeatsController.runDownload) of that final run; compared
      // field by field, as reading it again here would pass this test's query limit.
      Map<String, Object> download = (Map<String, Object>) body.get('download');
      Map<String, Object> view = (Map<String, Object>) download.get('view');
      Map<String, Object> run = (Map<String, Object>) view.get('run');
      Assert.areEqual(
        String.valueOf(AgentElectivesTestData.runId),
        run.get('id')
      );
      Assert.areEqual('Week 1', download.get('weekName'));
      Assert.isNotNull(run.get('finalizedAt'), 'a final run');
      Assert.isTrue(body.containsKey('setup'), 'the season setup');
    }
  }

  // API-1.89
  @IsTest
  static void aSetupFileIsTheScreensSetupRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id seasonId = GeneratedTestData.ids.get('Season');
      Test.startTest();
      List<Object> file = read(
        new AgentSetupFile(),
        new Map<String, String>{ 'season' => seasonName(seasonId) }
      );
      Test.stopTest();
      Assert.areEqual(200, file[0], String.valueOf(file[1]));
      Season__c season = [
        SELECT Camp__c
        FROM Season__c
        WHERE Id = :seasonId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(
        JSON.deserializeUntyped(
          JSON.serialize(
            SeasonSetupController.getSeasonSetupInCamp(
              season.Camp__c,
              seasonId
            ),
            true
          )
        ),
        ((Map<String, Object>) file[1]).get('setup')
      );
    }
  }
}
