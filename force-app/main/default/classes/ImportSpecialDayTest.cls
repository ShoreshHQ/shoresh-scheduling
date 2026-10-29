/**
 * Import last year: one week's day with its own time blocks (docs/import/weeks.md INGEST-4.3)
 * comes in as a special day on that day, with its own blocks and the file's cells, and the
 * program's own time blocks are not touched; Undo takes it away again. Made-up camp only.
 */
@IsTest
private class ImportSpecialDayTest {
  private static Week__c weekOf(Id seasonId) {
    return [
      SELECT Id, StartDate__c
      FROM Week__c
      WHERE Season__c = :seasonId
      LIMIT 1
    ];
  }

  /** newCamp's plan, its week's version, and a short Friday as a special day. */
  private static Map<String, Object> planWithSpecialDay(Season__c season) {
    Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
    Week__c week = weekOf(season.Id);
    ImportTestPlans.addVersion(plan, week);
    Map<String, Object> grid = new Map<String, Object>{
      'b' => new List<Object>{
        new List<Object>{ 'b1', 'Period 1', '09:00', '09:45' },
        new List<Object>{ 'b2', 'Lunch', '12:00', '12:45' },
        new List<Object>{ 'b3', 'Activity A', '13:00', '14:30' }
      },
      'g' => new List<Object>{
        new List<Object>{ 'G|Bunk 1', 'Bunk 1' },
        new List<Object>{ 'G|Bunk 2', 'Bunk 2' },
        new List<Object>{ 'G|Bunk 3', 'Bunk 3' },
        new List<Object>{ 'G|Bunk 4', 'Bunk 4' }
      },
      'i' => new List<Object>{
        new List<Object>{ 'A', 'A|Swim', 'Swim' },
        new List<Object>{ 'F', 'F|P0|Lunch', 'Lunch' }
      },
      'r' => new List<Object>{ '1,2,1', '1,2,1', ',2,1', ',2,1' }
    };
    ImportTestPlans.add(
      plan,
      'specialDays',
      ImportTestPlans.entry(
        new List<Object>{
          'key',
          'SpecialDay:P0|Week 1|Friday',
          'name',
          'Week 1 Friday',
          'weekId',
          week.Id,
          'day',
          'Friday',
          'grid',
          grid
        }
      )
    );
    return plan;
  }

  private static Integer blocksOf(Id seasonId) {
    return [
      SELECT COUNT()
      FROM TimeBlock__c
      WHERE Program__r.Season__c = :seasonId
    ];
  }

  // INGEST-4.3
  @IsTest
  static void aWeeksOwnDayIsSavedAsASpecialDayWithItsOwnBlocks() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ShoreshTestData.weeks(season.Id, 1);
      Map<String, Object> without = ImportTestPlans.newCamp(season.Id);
      Integer programBlocks = ((List<Object>) without.get('timeBlocks')).size();
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(planWithSpecialDay(season))
      );
      Test.stopTest();
      Assert.areEqual(1, result.added.get('SpecialDay'));
      Assert.areEqual(
        programBlocks,
        blocksOf(season.Id),
        'the program gets none of the special day\'s blocks'
      );
      SpecialDay__c day = [
        SELECT Id, Name
        FROM SpecialDay__c
        WHERE Season__c = :season.Id
      ];
      Assert.areEqual('Week 1 Friday', day.Name);
      SpecialDate__c placed = [
        SELECT Week__c, Day__c
        FROM SpecialDate__c
        WHERE SpecialDay__c = :day.Id
      ];
      Assert.areEqual(weekOf(season.Id).Id, placed.Week__c);
      Assert.areEqual('Friday', placed.Day__c);
      ScheduleGrid grid = SpecialPlans.read(day.Id).grid;
      Assert.areEqual(3, grid.blocks.size());
      Assert.areEqual('b3', grid.blocks[2].id, 'its blocks are its own');
      Id bunk1 = [
        SELECT Id
        FROM Group__c
        WHERE Name = 'Bunk 1' AND Division__r.Program__r.Season__c = :season.Id
      ]
      .Id;
      Assert.areEqual(String.valueOf(bunk1), grid.groups[0].id);
      Id swim = [
        SELECT Id
        FROM Activity__c
        WHERE Name = 'Swim' AND Season__c = :season.Id
      ]
      .Id;
      Assert.areEqual(String.valueOf(swim), grid.items[0].id);
      Assert.areEqual('1', grid.rows[0][2], 'the file\'s cell is in its plan');
    }
  }

  // INGEST-4.12
  @IsTest
  static void oneSpecialDayOnEveryWeeksDay() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ShoreshTestData.weeks(season.Id, 3);
      Map<String, Object> plan = planWithSpecialDay(season);
      Id first = weekOf(season.Id).Id;
      List<Object> also = new List<Object>();
      for (Week__c w : [
        SELECT Id
        FROM Week__c
        WHERE Season__c = :season.Id AND Id != :first
        ORDER BY StartDate__c
      ]) {
        also.add(new Map<String, Object>{ 'weekId' => w.Id });
      }
      Map<String, Object> day = (Map<String, Object>) ((List<Object>) plan.get(
        'specialDays'
      ))[0];
      day.put('also', also);
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(plan)
      );
      Test.stopTest();
      Assert.areEqual(1, result.added.get('SpecialDay'), 'one special day');
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM PlanPart__c WHERE Season__c = :season.Id],
        'one plan, so its times are changed once for every week'
      );
      Assert.areEqual(
        3,
        [
          SELECT COUNT()
          FROM SpecialDate__c
          WHERE Season__c = :season.Id AND Day__c = 'Friday'
        ],
        'on Friday of each of the three weeks'
      );
    }
  }

  // INGEST-4.3
  @IsTest
  static void undoTakesTheSpecialDayAway() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ShoreshTestData.weeks(season.Id, 1);
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(planWithSpecialDay(season))
      );
      Test.startTest();
      ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM SpecialDay__c WHERE Season__c = :season.Id]
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM SpecialDate__c WHERE Season__c = :season.Id]
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM PlanPart__c WHERE Season__c = :season.Id]
      );
    }
  }

  /** A season with one week, and the import's plan for it. */
  private static Season__c season() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
    ShoreshTestData.weeks(season.Id, 1);
    return season;
  }

  private static String refusal(Map<String, Object> plan) {
    try {
      ImportController.saveSetup(JSON.serialize(plan));
    } catch (Exception e) {
      return e.getMessage();
    }
    return null;
  }

  // INGEST-4.6
  @IsTest
  static void aSpecialDayAddedSinceTheFilesWereReadRefusesTheWholeImport() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Season__c season = season();
      SpecialDay__c colorWar = new SpecialDay__c(
        Season__c = season.Id,
        Name = 'Color War'
      );
      insert as user colorWar;
      SpecialDates.place(colorWar.Id, weekOf(season.Id).Id, 'Friday');
      Test.startTest();
      String message = refusal(planWithSpecialDay(season));
      Test.stopTest();
      Assert.isNotNull(message, 'the import is refused, not cut short');
      Assert.isTrue(message.contains('Color War'), message);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM SpecialDay__c WHERE Season__c = :season.Id]
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Program__c WHERE Season__c = :season.Id],
        'nothing of the import is saved'
      );
    }
  }

  // INGEST-4.3
  @IsTest
  static void aSpecialDayBiggerThanOneScheduleRefusesTheWholeImport() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Season__c season = season();
      Map<String, Object> plan = planWithSpecialDay(season);
      Map<String, Object> entry = (Map<String, Object>) ((List<Object>) plan.get(
        'specialDays'
      ))[0];
      Map<String, Object> grid = (Map<String, Object>) entry.get('grid');
      List<Object> blocks = new List<Object>();
      for (Integer i = 0; i < 41; i++) {
        blocks.add(
          new List<Object>{
            'b' + (i + 1),
            'Block ' + (i + 1),
            String.valueOf(i / 4 + 6).leftPad(2, '0') +
            ':' +
            String.valueOf(Math.mod(i, 4) * 15).leftPad(2, '0'),
            String.valueOf(i / 4 + 6).leftPad(2, '0') +
            ':' +
            String.valueOf(Math.mod(i, 4) * 15 + 10).leftPad(2, '0')
          }
        );
      }
      grid.put('b', blocks);
      Test.startTest();
      String message = refusal(plan);
      Test.stopTest();
      Assert.isTrue(message.contains('too big'), message);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Program__c WHERE Season__c = :season.Id]
      );
    }
  }

  // INGEST-4.3
  @IsTest
  static void undoKeepsASpecialDayWhosePlanTheDirectorSavedSince() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Season__c season = season();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(planWithSpecialDay(season))
      );
      SpecialDay__c day = [
        SELECT Id
        FROM SpecialDay__c
        WHERE Season__c = :season.Id
      ];
      SpecialPlans.Plan plan = SpecialPlans.read(day.Id);
      plan.grid.rows[0][0] = '';
      SpecialPlans.write(day.Id, plan.grid, plan.revision);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.isTrue(
        undone.keptInUse.contains('Week 1 Friday'),
        String.valueOf(undone.keptInUse)
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM SpecialDay__c WHERE Season__c = :season.Id]
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM SpecialDate__c WHERE SpecialDay__c = :day.Id],
        'it stays on its day'
      );
      // What its schedule uses stays too, said so.
      ScheduleGrid kept = SpecialPlans.read(day.Id).grid;
      Assert.areEqual(
        4,
        [SELECT COUNT() FROM Group__c WHERE Id IN :groupIds(kept)],
        'its groups are kept'
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Activity__c
          WHERE Name = 'Swim' AND Season__c = :season.Id
        ],
        'its activity is kept'
      );
      Assert.isTrue(
        undone.keptInUse.contains('Swim (Week 1 Friday uses it)'),
        String.valueOf(undone.keptInUse)
      );
    }
  }

  private static Set<Id> groupIds(ScheduleGrid grid) {
    Set<Id> ids = new Set<Id>();
    for (ScheduleGrid.GroupRef groupRef : grid.groups) {
      ids.add(groupRef.id);
    }
    return ids;
  }
}
