/**
 * For FixedOverExamplesTest: one shared fixed-over example (ShoreshFixedOverExamples.json) set up
 * on SetTimeTestData's camp as Camp Setup saves it, and what AgentFixedOver.of says for its save,
 * in the same words as what the example expects. Run as the scheduler.
 */
@IsTest
public class FixedOverExampleCamp {
  private Map<String, Object> example;
  private Map<String, Id> ids;
  private Id savedId;

  private FixedOverExampleCamp(Map<String, Object> example) {
    this.example = example;
  }

  /** [what the example expects, what AgentFixedOver.of says], each as words. */
  public static List<String> expectedAndSaid(Map<String, Object> example) {
    FixedOverExampleCamp camp = new FixedOverExampleCamp(example);
    camp.setUp();
    return new List<String>{
      wordsOf((Map<String, Object>) example.get('asks')),
      camp.said()
    };
  }

  private static List<Object> listOf(Map<String, Object> source, String key) {
    Object value = source.get(key);
    return value == null ? new List<Object>() : (List<Object>) value;
  }

  private List<Id> idsOf(Map<String, Object> source, String key) {
    List<Id> result = new List<Id>();
    for (Object name : listOf(source, key)) {
      result.add(ids.get((String) name));
    }
    return result;
  }

  private List<RunsIn.WeekOff> weeksOff(
    Map<String, Object> source,
    Integer row
  ) {
    List<RunsIn.WeekOff> result = new List<RunsIn.WeekOff>();
    for (Id week : idsOf(source, 'weeksOff')) {
      result.add(SetTimeTestData.weekOff(row, null, week));
    }
    return result;
  }

  private void setUp() {
    ids = SetTimeTestData.camp();
    Program__c program = new Program__c(Id = ids.get('Main'));
    for (Object day : listOf(example, 'programAlsoRuns')) {
      program.put(
        SetTimePlan.dayField(Program__c.SObjectType, (String) day),
        true
      );
    }
    Database.update(program, AccessLevel.SYSTEM_MODE);
    List<Group__c> groups = new List<Group__c>();
    for (Id grp : idsOf(example, 'onlyMornings')) {
      groups.add(new Group__c(Id = grp, Availability__c = 'MorningOnly'));
    }
    Database.update(groups, AccessLevel.SYSTEM_MODE);
    saveRecurring();
    Map<String, Object> saved = (Map<String, Object>) example.get('saved');
    if (saved != null) {
      savedId = SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.fixed(
            ids,
            (String) saved.get('name'),
            (String) saved.get('timeBlock')
          )
        },
        SetTimeTestData.extras(weeksOff(saved, 0), null, null)
      )[0];
    }
  }

  /** The recurring activities, each for the groups it covers (none: everyone), in one save. */
  private void saveRecurring() {
    List<SObject> rows = new List<SObject>();
    List<RunsIn.WeekOff> marks = new List<RunsIn.WeekOff>();
    List<SetTimeWho.Who> who = new List<SetTimeWho.Who>();
    for (Object each : listOf(example, 'recurring')) {
      Map<String, Object> spec = (Map<String, Object>) each;
      RecurringActivity__c item = new RecurringActivity__c(
        Program__c = ids.get('Main'),
        Name = (String) spec.get('name'),
        TimeBlock__c = ids.get((String) spec.get('timeBlock')),
        Length__c = (Integer) spec.get('length')
      );
      for (Object day : listOf(spec, 'days')) {
        item.put(
          SetTimePlan.dayField(RecurringActivity__c.SObjectType, (String) day),
          true
        );
      }
      marks.addAll(weeksOff(spec, rows.size()));
      List<Id> covers = idsOf(spec, 'covers');
      if (!covers.isEmpty()) {
        who.add(SetTimeTestData.who(rows.size(), null, covers));
      }
      rows.add(item);
    }
    SetTimeTestData.save(
      rows,
      SetTimeTestData.extras(marks, null, who.isEmpty() ? null : who)
    );
  }

  /** The save: a new fixed activity, or the saved one with only the fields given. */
  private FixedActivity__c record() {
    Map<String, Object> save = (Map<String, Object>) example.get('save');
    FixedActivity__c result = savedId == null
      ? new FixedActivity__c(Program__c = ids.get('Main'))
      : new FixedActivity__c(Id = savedId);
    if (save.containsKey('name')) {
      result.Name = (String) save.get('name');
    }
    if (save.containsKey('timeBlock')) {
      result.TimeBlock__c = ids.get((String) save.get('timeBlock'));
    }
    return result;
  }

  /** The weeks ticked off in the save, and the saved one's marks ticked back on. */
  private ScreenSaves.Extras extras() {
    List<Id> backOnWeeks = idsOf(example, 'weeksBackOn');
    List<Id> backOn = new List<Id>(
      new Map<Id, WeekException__c>(
          [
            SELECT Id
            FROM WeekException__c
            WHERE FixedActivity__c = :savedId AND Week__c IN :backOnWeeks
            WITH SYSTEM_MODE
          ]
        )
        .keySet()
    );
    return SetTimeTestData.extras(weeksOff(example, 0), backOn, null);
  }

  /** What AgentFixedOver.of says for the save, as words. */
  private String said() {
    FixedActivity__c fixed = record();
    ScreenSaves.Extras given = extras();
    AgentSetupRecords.Found found = new AgentSetupRecords.Found();
    found.seasonId = ids.get('Season');
    found.programId = ids.get('Main');
    found.labels = CampLabels.forCamp(ids.get('Camp'));
    Map<Id, RecurringActivity__c> recurring = new Map<Id, RecurringActivity__c>(
      [SELECT Id, Name FROM RecurringActivity__c WITH SYSTEM_MODE]
    );

    Test.startTest();
    Integer before = Limits.getQueries();
    AgentFixedOver.Ask ask = AgentFixedOver.of(fixed, given, found);
    Integer queries = Limits.getQueries() - before;
    Test.stopTest();

    Assert.isTrue(queries < 30, 'Queries: ' + queries);
    if (ask == null) {
      return wordsOf(null);
    }
    Map<Id, String> nameOf = new Map<Id, String>();
    for (String name : ids.keySet()) {
      nameOf.put(ids.get(name), name);
    }
    List<Object> around = new List<Object>();
    for (SetTimeAround.Piece piece : ask.around) {
      String target = recurring.get(piece.target).Name;
      around.add(
        new Map<String, Object>{
          'target' => piece.seenName == target
            ? target
            : target + ' seen as ' + piece.seenName,
          'timeBlock' => nameOf.get(piece.timeBlock),
          'length' => piece.length,
          'seenTimeBlock' => nameOf.get(piece.seenTimeBlock),
          'seenLength' => piece.seenLength
        }
      );
    }
    return wordsOf(
      new Map<String, Object>{
        'heading' => ask.heading,
        'line' => ask.line,
        'around' => around
      }
    );
  }

  /** An ask as the examples say it, a piece a line: "Field day: Period 1 x1 (seen Period 1 x3)". */
  private static String wordsOf(Map<String, Object> asks) {
    if (asks == null) {
      return 'No question';
    }
    List<String> lines = new List<String>{
      (String) asks.get('heading'),
      (String) asks.get('line')
    };
    for (Object each : listOf(asks, 'around')) {
      Map<String, Object> piece = (Map<String, Object>) each;
      lines.add(
        piece.get('target') +
          ': ' +
          piece.get('timeBlock') +
          ' x' +
          piece.get('length') +
          ' (seen ' +
          piece.get('seenTimeBlock') +
          ' x' +
          piece.get('seenLength') +
          ')'
      );
    }
    return String.join(lines, '\n');
  }
}
