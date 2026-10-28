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

  // INGEST-4.6
  @IsTest
  static void theDirectorsSpecialDayOnThatDayWins() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      ShoreshTestData.weeks(season.Id, 1);
      SpecialDay__c colorWar = new SpecialDay__c(
        Season__c = season.Id,
        Name = 'Color War'
      );
      insert as user colorWar;
      SpecialDates.place(colorWar.Id, weekOf(season.Id).Id, 'Friday');
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(planWithSpecialDay(season))
      );
      Test.stopTest();
      Assert.isNull(result.added.get('SpecialDay'));
      List<SpecialDate__c> onFriday = [
        SELECT SpecialDay__r.Name
        FROM SpecialDate__c
        WHERE Season__c = :season.Id
      ];
      Assert.areEqual(1, onFriday.size());
      Assert.areEqual('Color War', onFriday[0].SpecialDay__r.Name);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM SpecialDay__c WHERE Season__c = :season.Id]
      );
    }
  }
}
