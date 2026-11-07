/**
 * Undo last import and a week built since (INGEST-5.10). Acts as a scheduler. Made-up camp only
 * (ImportTestPlans).
 */
@IsTest
private class ImportUndoBuiltWeeksTest {
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Season__c season;
    System.runAs(scheduler) {
      season = seasonWithWeek();
    }
    KeptCamp.keepIds(
      new Map<String, Id>{
        'Camp' => season.Camp__c,
        'Season' => season.Id,
        'Scheduler' => scheduler.Id
      }
    );
  }

  /** The season (with one week) setup built. */
  private static Season__c keptSeason(Map<String, Id> kept) {
    return new Season__c(Id = kept.get('Season'), Camp__c = kept.get('Camp'));
  }

  /** The scheduler setup built the camp as. */
  private static User scheduler(Map<String, Id> kept) {
    return new User(Id = kept.get('Scheduler'));
  }

  private static Season__c seasonWithWeek() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
    ShoreshTestData.weeks(season.Id, 1);
    return season;
  }

  private static ImportSetupSaves.Result importWithVersion(Season__c season) {
    Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
    ImportTestPlans.addVersion(
      plan,
      [
        SELECT Id, StartDate__c
        FROM Week__c
        WHERE Season__c = :season.Id
        LIMIT 1
      ]
    );
    return ImportController.saveSetup(JSON.serialize(plan));
  }

  /** How many of a kind of record (with a Season__c field) the season has. */
  private static Integer count(String objectName, Id seasonId) {
    return Database.countQueryWithBinds(
      'SELECT COUNT() FROM ' + objectName + ' WHERE Season__c = :seasonId',
      new Map<String, Object>{ 'seasonId' => seasonId },
      AccessLevel.SYSTEM_MODE
    );
  }

  // INGEST-5.10: a week built since is using what its cells name, so Undo keeps those and names
  // them; what nothing built uses still goes, and so does the import's own version.
  @IsTest
  static void undoKeepsWhatAWeekBuiltSinceUses() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = importWithVersion(season);
      Program__c program = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :season.Id
        WITH USER_MODE
        LIMIT 1
      ];
      Week__c week = [
        SELECT Id, StartDate__c
        FROM Week__c
        WHERE Season__c = :season.Id
        WITH USER_MODE
        LIMIT 1
      ];
      Group__c bunk = [
        SELECT Id, Name
        FROM Group__c
        WHERE Division__r.Program__c = :program.Id
        WITH USER_MODE
        LIMIT 1
      ];
      TimeBlock__c block = [
        SELECT Id, Name
        FROM TimeBlock__c
        WHERE Program__c = :program.Id
        WITH USER_MODE
        LIMIT 1
      ];
      List<Activity__c> activities = [
        SELECT Id, Name
        FROM Activity__c
        WHERE Season__c = :season.Id
        WITH USER_MODE
        ORDER BY Name
      ];
      Assert.isTrue(activities.size() >= 2, 'needs one used and one not');
      Schedule__c built = new Schedule__c(
        Program__c = program.Id,
        Week__c = week.Id,
        Name = ManualDrafts.NAME,
        Status__c = ManualDrafts.DRAFT,
        Origin__c = ManualDrafts.MANUAL
      );
      Database.insert(built, AccessLevel.USER_MODE);
      ScheduleGrid grid = new ScheduleGrid();
      grid.blocks.add(
        new ScheduleGrid.Block(block.Id, block.Name).at('09:00', '10:00')
      );
      grid.groups.add(new ScheduleGrid.GroupRef(bunk.Id, bunk.Name));
      grid.items.add(
        new ScheduleGrid.Item('A', activities[0].Id, activities[0].Name)
      );
      grid.rows.add(new List<String>{ '1' });
      ScheduleDaySaves.write(
        built.Id,
        new List<ScheduleDaySaves.DaySave>{
          new ScheduleDaySaves.DaySave(week.StartDate__c, grid, null)
        }
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      String keptNames = String.valueOf(undone.keptInUse);
      Assert.isTrue(undone.keptInUse.contains(activities[0].Name), keptNames);
      Assert.isTrue(undone.keptInUse.contains(bunk.Name), keptNames);
      Assert.isTrue(undone.keptInUse.contains(block.Name), keptNames);
      Assert.areEqual(
        1,
        count('Activity__c', season.Id),
        'only the one in use'
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Week__c = :week.Id
          WITH USER_MODE
        ],
        'the built week stays, the imported version goes'
      );
    }
  }
}
