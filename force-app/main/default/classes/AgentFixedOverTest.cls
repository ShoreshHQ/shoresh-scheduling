/**
 * API-1.147 (CORE-3.9 for an AI): a fixed activity added or changed over a recurring activity asks
 * the Fixed activities table's own question first, and on the yes leaves what the screen's yes
 * leaves: the fixed activity saved and the recurring activity kept at its other time blocks. On
 * SetTimeTestData's camp: Period 1 (9:00), Period 2 (10:00), Lunch (12:00); Main runs Monday to
 * Thursday. The screen's side of the same case: shoreshProgram.test.js (CORE-3.9) and
 * SetTimeAroundTest.
 */
@IsTest
private class AgentFixedOverTest {
  /** POST add or change in the camp's season; answers [status, sentence]. */
  private static List<Object> post(String action, Map<String, Object> fields) {
    Map<String, Object> body = new Map<String, Object>{
      'season' => 'Summer 2026',
      'program' => 'Main'
    };
    body.putAll(fields);
    RestContext.request = new RestRequest();
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    RestContext.response = new RestResponse();
    AgentWeeks.answer(
      action == 'change'
        ? (AgentWeeks.Action) new AgentChangeSetup()
        : new AgentAddSetup()
    );
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
    return new List<Object>{
      RestContext.response.statusCode,
      answer.get('message')
    };
  }

  /** The same request again with the confirm the first answer gave. */
  private static Map<String, Object> withConfirm(
    Map<String, Object> fields,
    String confirm
  ) {
    Map<String, Object> result = new Map<String, Object>(fields);
    result.put(AgentAskFirst.FIELD, confirm);
    return result;
  }

  /** Field day: Period 1 for the length given, on Mondays, for Group A, in the Gym, off Week 2. */
  private static Id fieldDay(Map<String, Id> ids, Integer length) {
    RecurringActivity__c fieldDay = SetTimeTestData.recurring(
      ids,
      'Field day',
      'Period 1'
    );
    fieldDay.Length__c = length;
    fieldDay.Location__c = ids.get('Gym');
    return SetTimeTestData.save(
      new List<SObject>{ fieldDay },
      SetTimeTestData.extras(
        new List<RunsIn.WeekOff>{
          SetTimeTestData.weekOff(0, null, ids.get('Week 2'))
        },
        null,
        new List<SetTimeWho.Who>{
          SetTimeTestData.who(0, null, new List<Id>{ ids.get('Group A') })
        }
      )
    )[0];
  }

  private static List<RecurringActivity__c> fieldDays() {
    return [
      SELECT Id, TimeBlock__c, Length__c, Monday__c, Tuesday__c, Location__c
      FROM RecurringActivity__c
      WHERE Name = 'Field day'
      WITH SYSTEM_MODE
      ORDER BY TimeBlock__r.StartTime__c
    ];
  }

  // API-1.147: an add asks the screen's question, saves nothing, and the yes splits as the screen's.
  @IsTest
  static void aFixedActivityAddedOverARecurringOneAsksTheScreensQuestionAndSplitsItOnTheYes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id fieldDayId = fieldDay(ids, 3);
      Map<String, Object> rest = new Map<String, Object>{
        'kind' => 'fixed activity',
        'name' => 'Rest',
        'fields' => new Map<String, Object>{ 'time_block' => 'Period 2' }
      };
      Test.startTest();
      List<Object> asked = post('add', rest);
      String confirm = AgentAskFirstTestCalls.confirmIn(RestContext.response);
      Integer afterAsking = [
        SELECT COUNT()
        FROM FixedActivity__c
        WITH SYSTEM_MODE
      ];
      Integer before = Limits.getQueries();
      List<Object> yes = post('add', withConfirm(rest, confirm));
      Integer queries = Limits.getQueries() - before;
      Test.stopTest();

      String question = String.valueOf(asked[1]);
      Assert.areEqual(200, asked[0], question);
      Assert.isTrue(question.startsWith(AgentAskFirst.NOT_YET), question);
      Assert.isTrue(
        question.contains(
          'What is “Field day” at Period 2 on Monday, where “Rest” is? ' +
          '“Field day” keeps its other time blocks every day it runs; “Rest” keeps Period 2.'
        ),
        question
      );
      Assert.isNotNull(confirm, question);
      Assert.areEqual(0, afterAsking, 'Asking saves nothing');

      String said = String.valueOf(yes[1]);
      Assert.areEqual(200, yes[0], said);
      Assert.isTrue(said.startsWith('Added the fixed activity "Rest"'), said);
      Assert.isTrue(
        said.endsWith(
          '“Field day” keeps its other time blocks every day it runs; “Rest” keeps Period 2.'
        ),
        said
      );
      Assert.isTrue(queries < 90, 'Queries: ' + queries);
      Assert.areEqual(
        ids.get('Period 2'),
        [
          SELECT TimeBlock__c
          FROM FixedActivity__c
          WHERE Name = 'Rest'
          WITH SYSTEM_MODE
        ]
        .TimeBlock__c
      );
      // What the screen's yes leaves (SetTimeAroundTest): Field day at Period 1, its copy at Lunch.
      List<RecurringActivity__c> pieces = fieldDays();
      Assert.areEqual(2, pieces.size());
      Assert.areEqual(fieldDayId, pieces[0].Id);
      Assert.areEqual(ids.get('Period 1'), pieces[0].TimeBlock__c);
      Assert.areEqual(1, pieces[0].Length__c);
      RecurringActivity__c copy = pieces[1];
      Assert.areEqual(ids.get('Lunch'), copy.TimeBlock__c);
      Assert.areEqual(1, copy.Length__c);
      Assert.isTrue(copy.Monday__c);
      Assert.isFalse(copy.Tuesday__c);
      Assert.areEqual(ids.get('Gym'), copy.Location__c);
      Assert.areEqual(
        ids.get('Group A'),
        [
          SELECT Group__c
          FROM Coverage__c
          WHERE RecurringActivity__c = :copy.Id
          WITH SYSTEM_MODE
        ]
        .Group__c
      );
      Assert.areEqual(
        ids.get('Week 2'),
        [
          SELECT Week__c
          FROM WeekException__c
          WHERE RecurringActivity__c = :copy.Id
          WITH SYSTEM_MODE
        ]
        .Week__c
      );
    }
  }

  // API-1.147: a change asks too, and the yes keeps the recurring activity at its other block.
  @IsTest
  static void aFixedActivityMovedOverARecurringOneAsksFirstAndSplitsItOnTheYes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      fieldDay(ids, 2);
      Id restId = SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Rest', 'Lunch') }
      )[0];
      Map<String, Object> move = new Map<String, Object>{
        'kind' => 'fixed activity',
        'name' => 'Rest',
        'fields' => new Map<String, Object>{ 'time_block' => 'Period 2' },
        'seen' => new Map<String, Object>{ 'time_block' => 'Lunch' }
      };
      Test.startTest();
      List<Object> asked = post('change', move);
      String confirm = AgentAskFirstTestCalls.confirmIn(RestContext.response);
      List<Object> yes = post('change', withConfirm(move, confirm));
      Test.stopTest();

      String question = String.valueOf(asked[1]);
      Assert.areEqual(200, asked[0], question);
      Assert.isTrue(
        question.contains(
          'What is “Field day” at Period 2 on Monday, where “Rest” is?'
        ),
        question
      );
      String said = String.valueOf(yes[1]);
      Assert.areEqual(200, yes[0], said);
      Assert.isTrue(said.startsWith('Changed the fixed activity "Rest"'), said);
      Assert.areEqual(
        ids.get('Period 2'),
        [
          SELECT TimeBlock__c
          FROM FixedActivity__c
          WHERE Id = :restId
          WITH SYSTEM_MODE
        ]
        .TimeBlock__c
      );
      List<RecurringActivity__c> pieces = fieldDays();
      Assert.areEqual(1, pieces.size());
      Assert.areEqual(ids.get('Period 1'), pieces[0].TimeBlock__c);
      Assert.areEqual(1, pieces[0].Length__c);
    }
  }

  // API-1.147: a confirm given before the recurring activity changed is refused, nothing saved.
  @IsTest
  static void aConfirmFromBeforeTheRecurringActivityChangedSavesNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id fieldDayId = fieldDay(ids, 2);
      Map<String, Object> rest = new Map<String, Object>{
        'kind' => 'fixed activity',
        'name' => 'Rest',
        'fields' => new Map<String, Object>{ 'time_block' => 'Period 2' }
      };
      Test.startTest();
      post('add', rest);
      String confirm = AgentAskFirstTestCalls.confirmIn(RestContext.response);
      // Someone else makes Field day 3 long: the same question, other pieces.
      update as user new RecurringActivity__c(Id = fieldDayId, Length__c = 3);
      List<Object> stale = post('add', withConfirm(rest, confirm));
      Test.stopTest();
      Assert.areEqual(409, stale[0], String.valueOf(stale[1]));
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM FixedActivity__c WITH SYSTEM_MODE]
      );
      Assert.areEqual(1, fieldDays().size());
      Assert.areEqual(3, fieldDays()[0].Length__c);
    }
  }

  // API-1.147 counter-cases: no question when nothing is under it, and the screen's refusal when
  // the recurring activity sits only where the fixed one goes and can't go around it.
  @IsTest
  static void noQuestionWhenNothingIsUnderItAndTheScreensRefusalWhenItCantGoAround() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.recurring(ids, 'Swim', 'Lunch') }
      );
      Test.startTest();
      List<Object> clear = post(
        'add',
        new Map<String, Object>{
          'kind' => 'fixed activity',
          'name' => 'Rest',
          'fields' => new Map<String, Object>{ 'time_block' => 'Period 1' }
        }
      );
      List<Object> onSwim = post(
        'add',
        new Map<String, Object>{
          'kind' => 'fixed activity',
          'name' => 'Lunch break',
          'fields' => new Map<String, Object>{ 'time_block' => 'Lunch' }
        }
      );
      Test.stopTest();
      Assert.areEqual(200, clear[0], String.valueOf(clear[1]));
      Assert.isTrue(
        String.valueOf(clear[1]).startsWith('Added the fixed activity "Rest"'),
        String.valueOf(clear[1])
      );
      Assert.areEqual(400, onSwim[0], String.valueOf(onSwim[1]));
      Assert.isTrue(
        String.valueOf(onSwim[1]).startsWith('"Lunch break" not added.'),
        String.valueOf(onSwim[1])
      );
      Assert.isTrue(
        String.valueOf(onSwim[1]).contains('"Swim"'),
        String.valueOf(onSwim[1])
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM FixedActivity__c
          WHERE Name = 'Lunch break'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  /** Asked, then the yes with the confirm it gave: [question, yes status, yes answer]. */
  private static List<Object> askedThenYes(
    String action,
    Map<String, Object> fields
  ) {
    List<Object> asked = post(action, fields);
    String confirm = AgentAskFirstTestCalls.confirmIn(RestContext.response);
    Assert.isNotNull(confirm, String.valueOf(asked[1]));
    List<Object> yes = post(action, withConfirm(fields, confirm));
    return new List<Object>{ asked[1], yes[0], yes[1] };
  }

  /** Swim: at Period 1 for that long on the days given, for everyone. */
  private static Id swimOn(
    Map<String, Id> ids,
    Integer length,
    List<Schema.SObjectField> days
  ) {
    RecurringActivity__c item = SetTimeTestData.recurring(
      ids,
      'Swim',
      'Period 1'
    );
    item.Monday__c = false;
    for (Schema.SObjectField day : days) {
      item.put(day, true);
    }
    item.Length__c = length;
    return SetTimeTestData.save(new List<SObject>{ item })[0];
  }

  /** Each piece of a recurring activity, in the order of the day: "Period 1 x1". */
  private static List<String> piecesOf(String name) {
    List<String> result = new List<String>();
    for (RecurringActivity__c item : [
      SELECT TimeBlock__r.Name, Length__c
      FROM RecurringActivity__c
      WHERE Name = :name
      WITH SYSTEM_MODE
      ORDER BY TimeBlock__r.StartTime__c
    ]) {
      result.add(item.TimeBlock__r.Name + ' x' + item.Length__c.intValue());
    }
    return result;
  }

  private static Map<String, Object> restAt(String block) {
    return new Map<String, Object>{
      'kind' => 'fixed activity',
      'name' => 'Rest',
      'fields' => new Map<String, Object>{ 'time_block' => block }
    };
  }

  // API-1.147: two recurring activities under it: "What are ... keep their", each split as the
  // screen splits it (the runs fixedOver gives, saved by SetTimeAround).
  @IsTest
  static void twoRecurringActivitiesUnderItAreAskedAboutTogetherAndEachSplit() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      fieldDay(ids, 3);
      swimOn(
        ids,
        2,
        new List<Schema.SObjectField>{ RecurringActivity__c.Tuesday__c }
      );
      Test.startTest();
      List<Object> answers = askedThenYes('add', restAt('Period 2'));
      Test.stopTest();
      String question = String.valueOf(answers[0]);
      Assert.isTrue(
        question.contains(
          'What are “Field day” and “Swim” at Period 2 on Monday and Tuesday, where “Rest” is? ' +
          '“Field day” and “Swim” keep their other time blocks every day they run; “Rest” keeps Period 2.'
        ),
        question
      );
      Assert.areEqual(200, answers[1], String.valueOf(answers[2]));
      Assert.areEqual(
        new List<String>{ 'Period 1 x1', 'Lunch x1' },
        piecesOf('Field day')
      );
      Assert.areEqual(new List<String>{ 'Period 1 x1' }, piecesOf('Swim'));
    }
  }

  // API-1.147: a recurring activity every day a Monday-to-Friday program runs is asked about
  // "on Monday to Friday", as dayList says it.
  @IsTest
  static void aWholeWeekOfDaysIsSaidAsARange() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Database.update(
        new Program__c(Id = ids.get('Main'), Friday__c = true),
        AccessLevel.SYSTEM_MODE
      );
      swimOn(
        ids,
        2,
        new List<Schema.SObjectField>{
          RecurringActivity__c.Monday__c,
          RecurringActivity__c.Tuesday__c,
          RecurringActivity__c.Wednesday__c,
          RecurringActivity__c.Thursday__c,
          RecurringActivity__c.Friday__c
        }
      );
      Test.startTest();
      List<Object> answers = askedThenYes('add', restAt('Period 2'));
      Test.stopTest();
      String question = String.valueOf(answers[0]);
      Assert.isTrue(
        question.contains(
          'What is “Swim” at Period 2 on Monday to Friday, where “Rest” is?'
        ),
        question
      );
      Assert.areEqual(200, answers[1], String.valueOf(answers[2]));
      Assert.areEqual(new List<String>{ 'Period 1 x1' }, piecesOf('Swim'));
    }
  }

  // API-1.147: a recurring activity on only some of the program's days is asked about on those.
  @IsTest
  static void aRecurringActivityOnSomeDaysIsAskedAboutOnThoseDays() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      swimOn(
        ids,
        3,
        new List<Schema.SObjectField>{
          RecurringActivity__c.Tuesday__c,
          RecurringActivity__c.Thursday__c
        }
      );
      Test.startTest();
      List<Object> answers = askedThenYes('add', restAt('Period 2'));
      Test.stopTest();
      String question = String.valueOf(answers[0]);
      Assert.isTrue(
        question.contains(
          'What is “Swim” at Period 2 on Tuesday and Thursday, where “Rest” is?'
        ),
        question
      );
      Assert.areEqual(200, answers[1], String.valueOf(answers[2]));
      Assert.areEqual(
        new List<String>{ 'Period 1 x1', 'Lunch x1' },
        piecesOf('Swim')
      );
      RecurringActivity__c copy = [
        SELECT Monday__c, Tuesday__c, Thursday__c
        FROM RecurringActivity__c
        WHERE Name = 'Swim' AND TimeBlock__r.Name = 'Lunch'
        WITH SYSTEM_MODE
      ];
      Assert.isFalse(copy.Monday__c);
      Assert.isTrue(copy.Tuesday__c && copy.Thursday__c);
    }
  }

  // API-1.147: a fixed activity moved, and in this save run only in a week the recurring one is
  // off, never meets it: nothing is asked and nothing split, as on the screen.
  @IsTest
  static void weeksOffOnTheFixedActivityMeanTheyNeverMeet() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      // Field day is off Week 2.
      fieldDay(ids, 3);
      SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Rest', 'Lunch') },
        SetTimeTestData.extras(
          new List<RunsIn.WeekOff>{
            SetTimeTestData.weekOff(0, null, ids.get('Week 1')),
            SetTimeTestData.weekOff(0, null, ids.get('Week 3')),
            SetTimeTestData.weekOff(0, null, ids.get('Week 4')),
            SetTimeTestData.weekOff(0, null, ids.get('Week 5')),
            SetTimeTestData.weekOff(0, null, ids.get('Week 6'))
          },
          null,
          null
        )
      );
      Test.startTest();
      List<Object> moved = post(
        'change',
        new Map<String, Object>{
          'kind' => 'fixed activity',
          'name' => 'Rest',
          'fields' => new Map<String, Object>{ 'time_block' => 'Period 2' },
          'seen' => new Map<String, Object>{ 'time_block' => 'Lunch' }
        }
      );
      Test.stopTest();
      String said = String.valueOf(moved[1]);
      Assert.areEqual(200, moved[0], said);
      Assert.isFalse(said.startsWith(AgentAskFirst.NOT_YET), said);
      Assert.areEqual(new List<String>{ 'Period 1 x3' }, piecesOf('Field day'));
    }
  }
}
