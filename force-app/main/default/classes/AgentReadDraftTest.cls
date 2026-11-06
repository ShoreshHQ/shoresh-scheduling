/**
 * A week's draft read through an agent or the command line (docs/protocol/api.md API-1.123):
 * /v1/read_week_draft answers exactly what /v1/week_checks answers, the week its screen opens
 * (Generated Schedule's or Manual Build's), on GeneratedTestData's camp. The cells are laid out
 * outside Salesforce by the screens' own modules (their tests: connect.test.js).
 */
@IsTest
private class AgentReadDraftTest {
  /** GET at this address for Week 1 of Main (on this screen, when named); answers [status, body]. */
  private static List<Object> read(String schedule) {
    return read('Main', schedule);
  }

  /** The same for another program. */
  private static List<Object> read(String program, String schedule) {
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'GET';
    RestContext.request.params.putAll(
      new Map<String, String>{
        'season' => [
          SELECT Name
          FROM Season__c
          WHERE Id = :GeneratedTestData.ids.get('Season')
          WITH SYSTEM_MODE
        ]
        .Name,
        'week' => 'Week 1',
        'program' => program
      }
    );
    if (schedule != null) {
      RestContext.request.params.put('schedule', schedule);
    }
    RestContext.response = new RestResponse();
    AgentReadDraft.get();
    return new List<Object>{
      RestContext.response.statusCode,
      JSON.deserializeUntyped(RestContext.response.responseBody.toString())
    };
  }

  // API-1.123
  @IsTest
  static void aDraftIsReadAsItsScreenReadsIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      GeneratedTestData.generated();
      Test.startTest();
      List<Object> draft = read(null);
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(200, draft[0], String.valueOf(draft[1]));
      Assert.isTrue(queries < 100, queries + ' queries');
      Map<String, Object> body = (Map<String, Object>) draft[1];
      Assert.areEqual(
        new Set<String>{
          'inputs',
          'setup',
          'labels',
          'setup_changes',
          'accepted',
          'season'
        },
        body.keySet()
      );
      // The week as read: the seen its cell edits, locks and unlocks hand back.
      Assert.isNotNull(
        ((Map<String, Object>) body.get('inputs')).get('revision')
      );
    }
  }

  /** Teens beside Main: one time block, one group, a fixed activity at the Gym every day. */
  private static Id teens(Map<String, Id> ids) {
    Program__c teens = ShoreshTestData.program(ids.get('Season'), 'Teens');
    TimeBlock__c block = new TimeBlock__c(
      Program__c = teens.Id,
      Name = 'Swim hour',
      StartTime__c = Time.newInstance(10, 30, 0, 0),
      EndTime__c = Time.newInstance(11, 15, 0, 0),
      PartOfDay__c = 'Morning',
      SortOrder__c = 1
    );
    Database.insert(block, AccessLevel.SYSTEM_MODE);
    Division__c division = ShoreshTestData.division(teens.Id, 'Teen groups');
    Database.insert(
      new List<SObject>{
        new Group__c(
          Division__c = division.Id,
          Name = 'Teen 1',
          Availability__c = 'AllDay',
          SortOrder__c = 1
        ),
        new FixedActivity__c(
          Program__c = teens.Id,
          Name = 'Morning dip',
          TimeBlock__c = block.Id,
          Length__c = 1,
          Location__c = ids.get('Gym')
        )
      },
      AccessLevel.SYSTEM_MODE
    );
    return teens.Id;
  }

  // API-1.123
  @IsTest
  static void aWeekWithAnotherProgramAndASpecialDayIsReadWhole() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      // No clash check on this setup, so it fits in one test's queries beside a generated week.
      SetTimeGuard.defer();
      try {
        teens(ids);
        SpecialDates.place(
          SpecialScheduleTestData.addDay(ids.get('Season'), 'Field Day'),
          ids.get('Week 1'),
          'Tuesday'
        );
      } finally {
        SetTimeGuard.resume();
      }
      GeneratedTestData.generated();
      Test.startTest();
      List<Object> draft = read(null);
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(200, draft[0], String.valueOf(draft[1]));
      Assert.isTrue(queries < 100, queries + ' queries');
      Map<String, Object> inputs = (Map<String, Object>) ((Map<String, Object>) draft[1])
        .get('inputs');
      Assert.isFalse(((List<Object>) inputs.get('otherPrograms')).isEmpty());
      List<Object> replaced = (List<Object>) ((Map<String, Object>) inputs.get(
          'specials'
        ))
        .get('days');
      Assert.areEqual(1, replaced.size());
      Assert.areEqual(
        'Field Day',
        ((Map<String, Object>) replaced[0]).get('name')
      );
    }
  }

  // API-1.123
  @IsTest
  static void anotherProgramsWeekIsItsOwn() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = ManualDrafts.start(teens(ids), ids.get('Week 1')).draftId;
      Test.startTest();
      List<Object> read = read('Teens', 'Manual Build');
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.isTrue(queries < 100, queries + ' queries');
      Assert.areEqual(
        String.valueOf(draftId),
        ((Map<String, Object>) ((Map<String, Object>) ((Map<String, Object>) ((Map<String, Object>) read[1])
                .get('draft'))
              .get('schedule'))
            .get('schedule'))
          .get('id')
      );
    }
  }

  // API-1.123
  @IsTest
  static void aWeekNeverBuiltHasNoDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      List<Object> generated = read(null);
      List<Object> manual = read('Manual Build');
      Test.stopTest();
      Assert.areEqual(400, generated[0]);
      Assert.areEqual(
        'Week 1 hasn\'t been built for Main yet, so it has no draft.',
        ((Map<String, Object>) generated[1]).get('message')
      );
      Assert.areEqual(400, manual[0]);
      Assert.areEqual(
        'Week 1 hasn\'t been started on Manual Build for Main yet.',
        ((Map<String, Object>) manual[1]).get('message')
      );
    }
  }

  // API-1.123
  @IsTest
  static void aManualBuildWeekIsItsOwnDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = ManualDrafts.start(
          GeneratedTestData.ids.get('Main'),
          GeneratedTestData.ids.get('Week 1')
        )
        .draftId;
      Test.startTest();
      List<Object> read = read('Manual Build');
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.areEqual(200, read[0], String.valueOf(read[1]));
      Assert.isTrue(queries < 100, queries + ' queries');
      Map<String, Object> schedule = (Map<String, Object>) ((Map<String, Object>) ((Map<String, Object>) read[1])
          .get('draft'))
        .get('schedule');
      Assert.areEqual(
        String.valueOf(draftId),
        ((Map<String, Object>) schedule.get('schedule')).get('id')
      );
    }
  }
}
