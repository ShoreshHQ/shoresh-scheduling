/**
 * Import last year and a special schedule from a file through an agent or the command line
 * (docs/protocol/api.md API-1.84, API-1.85), and a large camp worksheet saved through the agent's
 * door within one request's query limit (API-1.81), on made-up camps. Records are made inside
 * the scheduler's runAs.
 */
@IsTest
private class AgentImportsMoreTest {
  private static final String SEASON = 'Summer 2032 (made up)';

  private static Id camp() {
    Camp__c record = ShoreshTestData.camp('Cedar Brook (made up)');
    return ShoreshTestData.season(record.Id, SEASON).Id;
  }

  /** A GET of what the screen reads; answers its seen. */
  private static String seenBy(String door) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.addParameter('season', SEASON);
    RestContext.response = new RestResponse();
    if (door == 'lastYear') {
      AgentImportLastYear.get();
    } else {
      AgentImportWorksheet.get();
    }
    Assert.areEqual(200, RestContext.response.statusCode);
    Map<String, Object> read = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    if (door == 'lastYear') {
      Assert.isTrue(
        read.containsKey('imported'),
        'what earlier imports brought in'
      );
    }
    return (String) read.get('seen');
  }

  /** One POST to a door; answers [status, sentence]. */
  private static List<Object> post(
    AgentWeeks.Action door,
    Map<String, Object> body
  ) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
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

  private static Map<String, Object> save(String seen, Object plan) {
    return new Map<String, Object>{
      'season' => SEASON,
      'seen' => seen,
      'plan' => JSON.serialize(plan)
    };
  }

  // API-1.84
  @IsTest
  static void lastYearIsTheScreensSaveOnlyWhileTheSetupIsAsRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id seasonId = camp();
      String seen = seenBy('lastYear');
      Test.startTest();
      List<Object> saved = post(
        new AgentImportLastYear(),
        save(seen, ImportTestPlans.newCamp(seasonId))
      );
      Integer saving = Limits.getQueries();
      Test.stopTest();
      List<Object> stale = post(
        new AgentImportLastYear(),
        save(seen, ImportTestPlans.newCamp(seasonId))
      );
      Assert.areEqual(200, saved[0], String.valueOf(saved[1]));
      Assert.isTrue(saving < 100, 'one save within the limit: ' + saving);
      Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(
        (String) saved[1]
      );
      Assert.isNotNull(result.get('importId'));
      Assert.isTrue(
        !((Map<String, Object>) result.get('added')).isEmpty(),
        'the camp was added'
      );
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Import__c WHERE Season__c = :seasonId]
      );
    }
  }

  // API-1.81: a whole camp's worksheet, many rows a sheet, in one request through the door.
  @IsTest
  static void aLargeWorksheetSavesWithinOneRequestsQueryLimit() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id seasonId = camp();
      List<Object> records = largeCamp();
      String seen = seenBy('worksheet');
      Test.startTest();
      List<Object> saved = post(
        new AgentImportWorksheet(),
        save(
          seen,
          ImportTestPlans.workbookPlan(seasonId, records, new List<Object>())
        )
      );
      Integer saving = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(200, saved[0], String.valueOf(saved[1]));
      Assert.isTrue(
        saving < 80,
        'a large worksheet keeps room under the 100-query limit: ' + saving
      );
      Assert.areEqual(
        200,
        [SELECT COUNT() FROM Activity__c WHERE Season__c = :seasonId]
      );
      Assert.areEqual(
        96,
        [
          SELECT COUNT()
          FROM Group__c
          WHERE Division__r.Program__r.Season__c = :seasonId
        ]
      );
    }
  }

  /**
   * Two programs, each with 6 divisions of 8 groups, 10 time blocks and 4 fixed activities; 40
   * locations and 200 activities: about 470 rows across the sheets.
   */
  private static List<Object> largeCamp() {
    List<Object> records = new List<Object>();
    for (Integer l = 0; l < 40; l++) {
      records.add(
        ImportTestPlans.rec(
          'Location',
          'Location:Place ' + l,
          new Map<String, Object>{
            'Name' => 'Place ' + l,
            'GroupsThatFit__c' => 2
          }
        )
      );
    }
    records.addAll(programRecords('Program:Program 0', 'Program 0'));
    records.addAll(programRecords('Program:Program 1', 'Program 1'));
    for (Integer a = 0; a < 200; a++) {
      records.add(
        ImportTestPlans.newActivity(
          'Activity ' + a,
          new Map<String, Object>{
            'Location__c' => 'Location:Place ' + Math.mod(a, 40)
          },
          new List<Object>()
        )
      );
    }
    return records;
  }

  /** One program: its divisions and groups, time blocks and fixed activities. */
  private static List<Object> programRecords(String program, String name) {
    List<Object> records = new List<Object>();
    Map<String, Object> days = new Map<String, Object>{ 'Name' => name };
    for (String day : ImportTestPlans.WEEK) {
      days.put(day + '__c', true);
    }
    records.add(ImportTestPlans.rec('Program', program, days));
    records.addAll(divisionRecords(program, name));
    for (Integer b = 0; b < 10; b++) {
      String start = String.valueOf(8 + b).leftPad(2, '0') + ':00';
      String finish = String.valueOf(8 + b).leftPad(2, '0') + ':45';
      records.add(
        ImportTestPlans.linked(
          ImportTestPlans.rec(
            'TimeBlock',
            'TimeBlock:' + program + ':Period ' + b,
            new Map<String, Object>{
              'Name' => 'Period ' + b,
              'StartTime__c' => start,
              'EndTime__c' => finish,
              'PartOfDay__c' => 8 + b < 12 ? 'Morning' : 'Afternoon'
            }
          ),
          new Map<String, Object>{ 'Program__c' => program }
        )
      );
    }
    for (Integer f = 0; f < 4; f++) {
      records.add(
        ImportTestPlans.linked(
          ImportTestPlans.rec(
            'FixedActivity',
            'FixedActivity:' + program + ':Meal ' + f,
            new Map<String, Object>{ 'Name' => 'Meal ' + f, 'Length__c' => 1 }
          ),
          new Map<String, Object>{
            'Program__c' => program,
            'TimeBlock__c' => 'TimeBlock:' +
            program +
            ':Period ' +
            f,
            'Location__c' => null
          }
        )
      );
    }
    return records;
  }

  /** A program's six divisions of eight groups. */
  private static List<Object> divisionRecords(String program, String name) {
    List<Object> records = new List<Object>();
    for (Integer d = 0; d < 6; d++) {
      String division = 'Division:' + program + ':Unit ' + d;
      records.add(
        ImportTestPlans.linked(
          ImportTestPlans.rec(
            'Division',
            division,
            new Map<String, Object>{ 'Name' => 'Unit ' + d }
          ),
          new Map<String, Object>{ 'Program__c' => program }
        )
      );
      for (Integer g = 0; g < 8; g++) {
        records.add(
          ImportTestPlans.linked(
            ImportTestPlans.rec(
              'Group',
              'Group:' + division + ':' + name + ' bunk ' + d + '-' + g,
              new Map<String, Object>{
                'Name' => name +
                ' bunk ' +
                d +
                '-' +
                g,
                'Availability__c' => 'AllDay'
              }
            ),
            new Map<String, Object>{ 'Division__c' => division }
          )
        );
      }
    }
    return records;
  }

  // API-1.85
  @IsTest
  static void aSpecialScheduleFromAFileIsThePagesImportAtTheRevisionRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id eventId = SpecialScheduleTestData.colorWar(ids);
      String season = [
        SELECT Name
        FROM Season__c
        WHERE Id = :ids.get('Season')
        WITH SYSTEM_MODE
      ]
      .Name;
      String seen = AgentSpecials.revisionOf(SpecialPlans.read(eventId));
      Map<String, Object> file = new Map<String, Object>{
        'season' => season,
        'special' => 'Color War',
        'file_name' => 'color-war.csv',
        'blocks' => new List<Object>{
          new Map<String, Object>{
            'name' => '',
            'startTime' => '09:00',
            'endTime' => '09:45'
          },
          new Map<String, Object>{
            'name' => 'Relays',
            'startTime' => '09:50',
            'endTime' => '11:20'
          }
        },
        'columns' => new List<Object>{
          new Map<String, Object>{
            'name' => 'Blue',
            'cells' => new List<Object>{ 'Tug of war', 'Relay race' }
          },
          new Map<String, Object>{
            'name' => 'Gold',
            'cells' => new List<Object>{ 'Relay race', '' }
          }
        },
        'no_times' => new List<Object>(),
        'places' => 0,
        'page_count' => 1
      };
      Map<String, Object> wrong = file.clone();
      wrong.put('seen', '99');
      Map<String, Object> asRead = file.clone();
      asRead.put('seen', seen);
      Test.startTest();
      List<Object> stale = post(new AgentImportSpecialSchedule(), wrong);
      List<Object> imported = post(new AgentImportSpecialSchedule(), asRead);
      List<Object> again = post(new AgentImportSpecialSchedule(), asRead);
      Test.stopTest();
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(200, imported[0], String.valueOf(imported[1]));
      Assert.isTrue(
        ((String) imported[1])
          .startsWith('Imported color-war.csv: 3 cells filled.'),
        String.valueOf(imported[1])
      );
      Assert.areEqual(409, again[0], String.valueOf(again[1]));
    }
  }
}
