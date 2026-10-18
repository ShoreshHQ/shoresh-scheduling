/**
 * Import last year, part 2: the imported version, remembered answers, and Undo last import.
 * Every test acts as a scheduler. Made-up camp only (ImportTestPlans).
 */
@IsTest
private class ImportUndoTest {
  // The camp most tests start from is built once for the class (setup) and read back in each
  // test (keptSeason). The tests that need a full season still build their own.
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Season__c season;
    System.runAs(scheduler) {
      season = seasonWithWeek();
    }
    ShoreshTestData.keepIds(
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

  @IsTest
  static void lastYearsWeekIsSavedAsAVersion() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      Test.startTest();
      ImportSetupSaves.Result result = importWithVersion(season);
      Test.stopTest();
      Assert.areEqual(1, result.added.get('Version'));
      Schedule__c version = [
        SELECT
          Id,
          Name,
          Status__c,
          Origin__c,
          VersionReason__c,
          (SELECT Grid__c, Date__c FROM Days__r)
        FROM Schedule__c
        WHERE Program__r.Season__c = :season.Id
      ];
      Assert.areEqual('Imported from maple-grove.xlsx', version.Name);
      Assert.areEqual('Version', version.Status__c);
      Assert.areEqual('Imported', version.Origin__c);
      Assert.areEqual('Imported', version.VersionReason__c);
      ScheduleGrid grid = ScheduleGrid.fromText(version.Days__r[0].Grid__c);
      Id swim = [
        SELECT Id
        FROM Activity__c
        WHERE Name = 'Swim' AND Season__c = :season.Id
      ]
      .Id;
      Assert.areEqual(
        String.valueOf(swim),
        grid.items[0].id,
        'keys become record Ids'
      );
      Assert.areEqual('', grid.items[2].id, 'a trip is noted, not set up');
      Assert.areEqual('Zoo trip', grid.items[2].name);
      Assert.areEqual(4, grid.groups.size());
    }
  }

  @IsTest
  static void answersAreRememberedAndForgotten() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      Map<String, Object> plan = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(
        plan,
        'remember',
        ImportTestPlans.entry(
          new List<Object>{ 'key', 'kind|Library', 'answer', 'recurring' }
        )
      );
      ImportController.saveSetup(JSON.serialize(plan));
      ImportController.saveSetup(JSON.serialize(plan));
      List<ImportAnswers.Answer> answers = ImportController.getAnswers(
        season.Camp__c
      );
      Assert.areEqual(1, answers.size(), 'one answer per question');
      Assert.areEqual('kind|Library', answers[0].key);
      Assert.areEqual('recurring', answers[0].answer);
      Map<String, Object> forget = ImportTestPlans.emptyPlan(season.Id);
      ((List<Object>) forget.get('forget')).add('kind|Library');
      ImportController.saveSetup(JSON.serialize(forget));
      Assert.areEqual(0, ImportController.getAnswers(season.Camp__c).size());
    }
  }

  @IsTest
  static void undoRemovesWhatTheImportAdded() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = importWithVersion(season);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(0, count('Program__c', season.Id));
      Assert.areEqual(0, count('Activity__c', season.Id));
      Assert.areEqual(0, count('Location__c', season.Id));
      Assert.areEqual(0, count('Coverage__c', season.Id));
      Assert.isTrue(undone.removed > 10, 'removed ' + undone.removed);
      Assert.isTrue(undone.keptEdited.isEmpty() && undone.keptInUse.isEmpty());
      Assert.isNotNull(
        [SELECT UndoneAt__c FROM Import__c WHERE Id = :result.importId]
        .UndoneAt__c
      );
      try {
        ImportController.undoImport(result.importId);
        Assert.fail('an import is undone once');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage().contains('already undone'),
          e.getMessage()
        );
      }
    }
  }

  @IsTest
  static void undoKeepsWhatWasEditedSince() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = importWithVersion(season);
      Activity__c swim = [
        SELECT Id
        FROM Activity__c
        WHERE Name = 'Swim' AND Season__c = :season.Id
      ];
      Database.update(
        new Activity__c(Id = swim.Id, Length__c = 2),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Swim' }, undone.keptEdited);
      Assert.areEqual(1, count('Activity__c', season.Id));
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Name = 'Boating']
      );
    }
  }

  @IsTest
  static void undoKeepsWhatIsStillInUse() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = importWithVersion(season);
      Group__c bunk1 = [
        SELECT Id
        FROM Group__c
        WHERE Name = 'Bunk 1' AND Division__r.Program__r.Season__c = :season.Id
      ];
      Week__c week = [
        SELECT Id
        FROM Week__c
        WHERE Season__c = :season.Id
        LIMIT 1
      ];
      ShoreshTestData.saveWeekExceptions(
        new List<WeekException__c>{
          new WeekException__c(Week__c = week.Id, Group__c = bunk1.Id)
        },
        null
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.isTrue(
        undone.keptInUse.contains('Bunk 1'),
        String.valueOf(undone.keptInUse)
      );
      Assert.isTrue(
        undone.keptInUse.contains('Juniors'),
        'its division holds it'
      );
      Assert.isTrue(undone.keptInUse.contains('Main'), 'its program holds it');
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Group__c
          WHERE Division__r.Program__r.Season__c = :season.Id
        ]
      );
      Assert.areEqual(0, count('Activity__c', season.Id));
    }
  }

  @IsTest
  static void undoPutsBackWhatTheImportChanged() {
    // Its own camp (a full season), made by the scheduler setup made.
    System.runAs(scheduler(ShoreshTestData.keptIds())) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      TimeBlock__c period1 = [
        SELECT Id, EndTime__c
        FROM TimeBlock__c
        WHERE Program__r.Season__c = :season.Id AND Name = 'Period 1'
      ];
      Map<String, Object> plan = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(
        plan,
        'timeBlocks',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            period1.Id,
            'id',
            period1.Id,
            'start',
            '09:00',
            'end',
            '09:50'
          }
        )
      );
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(plan)
      );
      Assert.areEqual(
        Time.newInstance(9, 50, 0, 0),
        [SELECT EndTime__c FROM TimeBlock__c WHERE Id = :period1.Id].EndTime__c
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(1, undone.restored);
      Assert.areEqual(
        period1.EndTime__c,
        [SELECT EndTime__c FROM TimeBlock__c WHERE Id = :period1.Id].EndTime__c
      );
    }
  }

  @IsTest
  static void onlyTheLastImportCanBeUndone() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result first = ImportController.saveSetup(
        JSON.serialize(ImportTestPlans.newCamp(season.Id))
      );
      Map<String, Object> second = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(
        second,
        'locations',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            'L|Barn',
            'name',
            'Barn',
            'groupsThatFit',
            1
          }
        )
      );
      ImportSetupSaves.Result later = ImportController.saveSetup(
        JSON.serialize(second)
      );
      // The earlier import is dated before: an undone record can't be dated after its change.
      Test.setCreatedDate(first.importId, Datetime.now().addMinutes(-1));
      try {
        ImportController.undoImport(first.importId);
        Assert.fail('only the last import can be undone');
      } catch (AuraHandledException e) {
        Assert.areEqual('Only the last import can be undone.', e.getMessage());
      }
      ImportController.undoImport(later.importId);
      Assert.areEqual(0, [SELECT COUNT() FROM Location__c WHERE Name = 'Barn']);
    }
  }

  @IsTest
  static void aRenamedVersionAndWhatHoldsItAreKept() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = importWithVersion(season);
      Schedule__c version = [
        SELECT Id
        FROM Schedule__c
        WHERE Program__r.Season__c = :season.Id
      ];
      Database.update(
        new Schedule__c(Id = version.Id, Name = 'Last summer'),
        AccessLevel.USER_MODE
      );
      Group__c bunk2 = [
        SELECT Id
        FROM Group__c
        WHERE Name = 'Bunk 2' AND Division__r.Program__r.Season__c = :season.Id
      ];
      Database.update(
        new Group__c(Id = bunk2.Id, Name = 'Bunk Two'),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.isTrue(
        undone.keptEdited.contains('Last summer'),
        String.valueOf(undone.keptEdited)
      );
      Assert.isTrue(undone.keptEdited.contains('Bunk Two'));
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Schedule__c WHERE Id = :version.Id],
        'the renamed version stays'
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Group__c WHERE Id = :bunk2.Id],
        'the renamed group stays'
      );
      Assert.isTrue(
        undone.keptInUse.contains('Main') &&
        undone.keptInUse.contains('Juniors'),
        String.valueOf(undone.keptInUse)
      );
    }
  }

  @IsTest
  static void anImportedActivityUsedAsARainPlanIsKept() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = importWithVersion(season);
      Activity__c swim = [
        SELECT Id
        FROM Activity__c
        WHERE Name = 'Swim' AND Season__c = :season.Id
      ];
      Activity__c hike = new Activity__c(
        Season__c = season.Id,
        Name = 'Hike',
        Length__c = 1,
        TimesPerWeekMin__c = 1,
        TimesPerWeekMax__c = 1,
        GroupsAtOnce__c = 1,
        RainPlan__c = swim.Id
      );
      Database.insert(hike, AccessLevel.USER_MODE);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.isTrue(
        undone.keptInUse.contains('Swim'),
        String.valueOf(undone.keptInUse)
      );
      Assert.areEqual(
        swim.Id,
        [SELECT RainPlan__c FROM Activity__c WHERE Id = :hike.Id].RainPlan__c
      );
    }
  }

  @IsTest
  static void numbersAndDaysArePutBack() {
    // Its own camp (a full season), made by the scheduler setup made.
    System.runAs(scheduler(ShoreshTestData.keptIds())) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Program__c main = [
        SELECT Id, Friday__c
        FROM Program__c
        WHERE Season__c = :season.Id
        LIMIT 1
      ];
      Activity__c swim = ShoreshTestData.activity(season.Id, 'Swim', null);
      Database.insert(swim, AccessLevel.SYSTEM_MODE);
      Map<String, Object> plan = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(
        plan,
        'programs',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            main.Id,
            'id',
            main.Id,
            'days',
            ImportTestPlans.WEEK
          }
        )
      );
      ImportTestPlans.add(
        plan,
        'activities',
        ImportTestPlans.entry(
          new List<Object>{ 'key', swim.Id, 'id', swim.Id, 'length', 2 }
        )
      );
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(plan)
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(2, undone.restored);
      Assert.areEqual(
        main.Friday__c,
        [SELECT Friday__c FROM Program__c WHERE Id = :main.Id].Friday__c
      );
      Assert.areEqual(
        1,
        [SELECT Length__c FROM Activity__c WHERE Id = :swim.Id].Length__c
      );
    }
  }

  @IsTest
  static void aGroupMovedIntoANewDivisionGoesHomeAndTheDivisionGoes() {
    // Its own camp (a full season), made by the scheduler setup made.
    System.runAs(scheduler(ShoreshTestData.keptIds())) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Program__c main = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :season.Id
        LIMIT 1
      ];
      Group__c groupA = [
        SELECT Id, Division__c
        FROM Group__c
        WHERE Name = 'Group A'
        LIMIT 1
      ];
      Map<String, Object> plan = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(
        plan,
        'divisions',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            'D|Seniors',
            'programKey',
            main.Id,
            'name',
            'Seniors',
            'sortOrder',
            2
          }
        )
      );
      ImportTestPlans.add(
        plan,
        'groups',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            groupA.Id,
            'id',
            groupA.Id,
            'divisionKey',
            'D|Seniors'
          }
        )
      );
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(plan)
      );
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        groupA.Division__c,
        [SELECT Division__c FROM Group__c WHERE Id = :groupA.Id].Division__c
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Division__c
          WHERE Name = 'Seniors' AND Program__c = :main.Id
        ]
      );
      Assert.isTrue(
        undone.keptInUse.isEmpty(),
        String.valueOf(undone.keptInUse)
      );
    }
  }

  @IsTest
  static void aVersionAloneIsRemoved() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result built = ImportController.saveSetup(
        JSON.serialize(ImportTestPlans.newCamp(season.Id))
      );
      Map<String, Object> versionOnly = ImportTestPlans.emptyPlan(season.Id);
      Program__c main = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :season.Id
      ];
      Map<String, Object> withVersion = ImportTestPlans.newCamp(season.Id);
      ImportTestPlans.addVersion(
        withVersion,
        [
          SELECT Id, StartDate__c
          FROM Week__c
          WHERE Season__c = :season.Id
          LIMIT 1
        ]
      );
      Map<String, Object> version = (Map<String, Object>) ((List<Object>) withVersion.get(
        'versions'
      ))[0];
      version.put('programKey', main.Id);
      Map<String, Object> grid = (Map<String, Object>) ((Map<String, Object>) ((List<Object>) version.get(
          'days'
        ))[0])
        .get('grid');
      Map<String, Id> ids = new Map<String, Id>();
      for (TimeBlock__c b : [
        SELECT Id, Name
        FROM TimeBlock__c
        WHERE Program__c = :main.Id
      ]) {
        ids.put(b.Name, b.Id);
      }
      for (Group__c g : [
        SELECT Id, Name
        FROM Group__c
        WHERE Division__r.Program__c = :main.Id
      ]) {
        ids.put(g.Name, g.Id);
      }
      ids.put(
        'Swim',
        [
          SELECT Id
          FROM Activity__c
          WHERE Name = 'Swim' AND Season__c = :season.Id
        ]
        .Id
      );
      ids.put(
        'Lunch',
        [SELECT Id FROM FixedActivity__c WHERE Program__c = :main.Id].Id
      );
      for (Object entry : (List<Object>) grid.get('b')) {
        ((List<Object>) entry)
          .set(0, ids.get((String) ((List<Object>) entry)[1]));
      }
      for (Object entry : (List<Object>) grid.get('g')) {
        ((List<Object>) entry)
          .set(0, ids.get((String) ((List<Object>) entry)[1]));
      }
      for (Object entry : (List<Object>) grid.get('i')) {
        List<Object> item = (List<Object>) entry;
        item.set(
          1,
          ids.containsKey((String) item[2])
            ? (Object) ids.get((String) item[2])
            : ''
        );
      }
      ((List<Object>) versionOnly.get('versions')).add(version);
      ImportSetupSaves.Result later = ImportController.saveSetup(
        JSON.serialize(versionOnly)
      );
      Test.setCreatedDate(built.importId, Datetime.now().addMinutes(-1));
      Test.startTest();
      ImportController.undoImport(later.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Schedule__c WHERE Program__c = :main.Id]
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Program__c WHERE Id = :main.Id],
        'the setup stays'
      );
      Assert.isNotNull(built.importId);
    }
  }

  /** An import that changes Swim's length to 2 and adds a place, Barn. */
  private static ImportSetupSaves.Result swimLengthImport(
    Season__c season,
    Activity__c swim
  ) {
    Map<String, Object> plan = ImportTestPlans.emptyPlan(season.Id);
    ImportTestPlans.add(
      plan,
      'activities',
      ImportTestPlans.entry(
        new List<Object>{ 'key', swim.Id, 'id', swim.Id, 'length', 2 }
      )
    );
    ImportTestPlans.add(
      plan,
      'locations',
      ImportTestPlans.entry(
        new List<Object>{ 'key', 'L|Barn', 'name', 'Barn', 'groupsThatFit', 1 }
      )
    );
    return ImportController.saveSetup(JSON.serialize(plan));
  }

  @IsTest
  static void aRefusalStopsTheWholeUndoAndSaysWhy() {
    // Its own camp (a full season), made by the scheduler setup made.
    System.runAs(scheduler(ShoreshTestData.keptIds())) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Activity__c swim = ShoreshTestData.activity(season.Id, 'Swim', null);
      Database.insert(swim, AccessLevel.SYSTEM_MODE);
      ImportSetupSaves.Result result = swimLengthImport(season, swim);
      // What Undo would put back is now refused by a rule (length at least 1).
      Import__c done = [
        SELECT Id, Changed__c
        FROM Import__c
        WHERE Id = :result.importId
      ];
      List<Object> changed = (List<Object>) JSON.deserializeUntyped(
        done.Changed__c
      );
      ((Map<String, Object>) ((Map<String, Object>) changed[0]).get('before'))
        .put('Length__c', 0);
      done.Changed__c = JSON.serialize(changed);
      Database.update(done, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      try {
        ImportController.undoImport(result.importId);
        Assert.fail('a refusal stops the Undo');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage()
            .startsWith(
              'Nothing was undone. Swim: couldn\'t put back what it was before. '
            ),
          e.getMessage()
        );
      }
      Test.stopTest();
      // Nothing half undone: Barn is still there, Swim still 2, and the import can be retried.
      Assert.areEqual(1, [SELECT COUNT() FROM Location__c WHERE Name = 'Barn']);
      Assert.areEqual(
        2,
        [SELECT Length__c FROM Activity__c WHERE Id = :swim.Id].Length__c
      );
      Assert.areEqual(result.importId, ImportUndo.latest(season.Id));
    }
  }

  @IsTest
  static void aChangedRecordDeletedSinceIsNamed() {
    // Its own camp (a full season), made by the scheduler setup made.
    System.runAs(scheduler(ShoreshTestData.keptIds())) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Activity__c swim = ShoreshTestData.activity(season.Id, 'Swim', null);
      Database.insert(swim, AccessLevel.SYSTEM_MODE);
      ImportSetupSaves.Result result = swimLengthImport(season, swim);
      Database.delete(swim, AccessLevel.USER_MODE);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Swim' }, undone.gone);
      Assert.areEqual(0, undone.restored);
      Assert.areEqual(1, undone.removed);
    }
  }

  @IsTest
  static void importsInTheSameSecondGoByTheirNumber() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result first = ImportController.saveSetup(
        JSON.serialize(ImportTestPlans.newCamp(season.Id))
      );
      Map<String, Object> second = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(
        second,
        'locations',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            'L|Barn',
            'name',
            'Barn',
            'groupsThatFit',
            1
          }
        )
      );
      ImportSetupSaves.Result later = ImportController.saveSetup(
        JSON.serialize(second)
      );
      Datetime sameSecond = Datetime.now().addMinutes(-1);
      Test.setCreatedDate(first.importId, sameSecond);
      Test.setCreatedDate(later.importId, sameSecond);
      Assert.areEqual(later.importId, ImportUndo.latest(season.Id));
      try {
        ImportController.undoImport(first.importId);
        Assert.fail('the later number is the last import');
      } catch (AuraHandledException e) {
        Assert.areEqual('Only the last import can be undone.', e.getMessage());
      }
      ImportController.undoImport(later.importId);
      Assert.areEqual(0, [SELECT COUNT() FROM Location__c WHERE Name = 'Barn']);
    }
  }

  @IsTest
  static void afterAnUndoNoEarlierImportCanBeUndone() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result first = ImportController.saveSetup(
        JSON.serialize(ImportTestPlans.newCamp(season.Id))
      );
      Map<String, Object> second = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(
        second,
        'locations',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            'L|Barn',
            'name',
            'Barn',
            'groupsThatFit',
            1
          }
        )
      );
      ImportSetupSaves.Result later = ImportController.saveSetup(
        JSON.serialize(second)
      );
      Test.setCreatedDate(first.importId, Datetime.now().addMinutes(-1));
      Test.startTest();
      ImportController.undoImport(later.importId);
      // Greg, 2026-10-17: Undo goes back one import only. Roots offers nothing now.
      Assert.isNull(SeasonSetupController.getSeasonSetup(season.Id).lastImport);
      try {
        ImportController.undoImport(first.importId);
        Assert.fail('the import before an undone one stays');
      } catch (AuraHandledException e) {
        Assert.areEqual('Only the last import can be undone.', e.getMessage());
      }
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Program__c WHERE Season__c = :season.Id]
      );
      // The next import brings Undo back, for that import.
      ImportSetupSaves.Result next = ImportController.saveSetup(
        JSON.serialize(second)
      );
      Assert.areEqual(
        next.importId,
        SeasonSetupController.getSeasonSetup(season.Id).lastImport.Id
      );
      Test.stopTest();
    }
  }

  @IsTest
  static void aProgramWithAPublishedScheduleIsKept() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(ImportTestPlans.newCamp(season.Id))
      );
      Program__c main = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :season.Id
      ];
      Database.insert(
        new Schedule__c(
          Program__c = main.Id,
          Week__c = [SELECT Id FROM Week__c WHERE Season__c = :season.Id]
          .Id,
          Name = 'Published',
          Status__c = 'Published',
          Origin__c = 'Manual'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      // Kept as in use (the schedule is inside it), not refused by history protection.
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Main' }, undone.keptInUse);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Schedule__c WHERE Program__c = :main.Id]
      );
      Assert.isNull(SeasonSetupController.getSeasonSetup(season.Id).lastImport);
    }
  }

  @IsTest
  static void aPublishedImportedVersionKeepsItsProgram() {
    Map<String, Id> kept = ShoreshTestData.keptIds();
    System.runAs(scheduler(kept)) {
      Season__c season = keptSeason(kept);
      ImportSetupSaves.Result result = importWithVersion(season);
      Schedule__c version = [
        SELECT Id, Name, Program__c
        FROM Schedule__c
        WHERE Program__r.Season__c = :season.Id
      ];
      version.Status__c = 'Published';
      Database.update(version, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ version.Name }, undone.keptEdited);
      Assert.isTrue(
        undone.keptInUse.contains('Main'),
        String.join(undone.keptInUse, ', ')
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Schedule__c WHERE Id = :version.Id]
      );
    }
  }
}
