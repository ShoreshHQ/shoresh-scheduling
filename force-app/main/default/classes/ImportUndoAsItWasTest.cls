/**
 * docs/import/review.md INGEST-5.10: Undo last import restores the camp as it was. Each test
 * takes the whole camp (CampSnapshot) before the import or Copy season, undoes it, and takes it
 * again: every record and every field must match. Acts as a scheduler, on GeneratedTestData's
 * made-up camp with an elective set added, built once for the class.
 */
@IsTest
private class ImportUndoAsItWasTest {
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      ids = GeneratedTestData.camp();
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      Offering__c swim = new Offering__c(
        ElectiveSet__c = chugim.Id,
        Activity__c = ids.get('Swim'),
        Seats__c = 12
      );
      Database.insert(swim, AccessLevel.USER_MODE);
      LinkedChoice__c doubleSwim = new LinkedChoice__c(
        ElectiveSet__c = chugim.Id,
        Name = 'Swim double',
        Offering__c = swim.Id,
        AppliesTo__c = 'OnlyThese',
        SortOrder__c = 1
      );
      Database.insert(doubleSwim, AccessLevel.USER_MODE);
      Database.insert(
        new List<SObject>{
          new LinkedChoiceTime__c(
            LinkedChoice__c = doubleSwim.Id,
            Weekday__c = 'Monday',
            TimeBlock__c = ids.get('Period 1')
          ),
          new Coverage__c(
            Season__c = ids.get('Season'),
            LinkedChoice__c = doubleSwim.Id,
            Division__c = ids.get('Juniors')
          )
        },
        AccessLevel.USER_MODE
      );
      // A block with no name of its own is named by its times, and follows them.
      Database.update(
        new TimeBlock__c(Id = ids.get('Period 2'), Name = null),
        AccessLevel.USER_MODE
      );
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  private static Season__c season(Map<String, Id> kept) {
    return [
      SELECT Id, Name, StartDate__c
      FROM Season__c
      WHERE Id = :kept.get('Season')
      WITH SYSTEM_MODE
    ];
  }

  /**
   * Copy season and Undo are each a request of their own. Undo runs as a job, which a test runs
   * at Test.stopTest() with limits of its own; what it returns and the queries it took are kept.
   */
  private class UndoJob implements Queueable {
    private final Id importId;
    UndoJob(Id importId) {
      this.importId = importId;
    }
    public void execute(QueueableContext context) {
      undone = ImportController.undoImport(importId);
      undoQueries = Limits.getQueries();
    }
  }
  private static ImportUndo.Result undone;
  private static Integer undoQueries;

  /** Copies the kept season as 'Next summer' and returns the copy's Id. */
  private static Id copySeason(Map<String, Id> kept) {
    Season__c last = season(kept);
    return SeasonSetupController.copySeason(
      last.Id,
      'Next summer',
      last.StartDate__c.addDays(364)
    );
  }

  @IsTest
  static void ingest510UndoingCopySeasonTakesTheWholeCopyAway() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(new User(Id = kept.get('Scheduler'))) {
      String before = CampSnapshot.of();
      Test.startTest();
      Id copyId = copySeason(kept);
      System.enqueueJob(new UndoJob(ImportUndo.latest(copyId)));
      Test.stopTest();
      // Undo of a copy is one request: well under Salesforce's 100 queries for a real camp.
      Assert.isTrue(undoQueries <= 70, 'queries: ' + undoQueries);
      Assert.isTrue(undone.seasonRemoved);
      Assert.areEqual(new List<String>(), undone.keptEdited);
      Assert.areEqual(new List<String>(), undone.keptInUse);
      Assert.areEqual(before, CampSnapshot.of());
    }
  }

  @IsTest
  static void ingest510ACopyChangedSinceKeepsTheChangeAndItsSeason() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(new User(Id = kept.get('Scheduler'))) {
      Test.startTest();
      Id copyId = copySeason(kept);
      Activity__c swim = [
        SELECT Id
        FROM Activity__c
        WHERE Season__c = :copyId AND Name = 'Swim'
      ];
      swim.Length__c = 2;
      Database.update(swim, AccessLevel.USER_MODE);
      Id importId = ImportUndo.latest(copyId);
      System.enqueueJob(new UndoJob(importId));
      Test.stopTest();
      Assert.isFalse(undone.seasonRemoved);
      Assert.areEqual(new List<String>{ 'Swim' }, undone.keptEdited);
      Assert.isTrue(
        undone.keptInUse.contains('Next summer'),
        String.valueOf(undone.keptInUse)
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Activity__c WHERE Season__c = :copyId]
      );
      Assert.isNotNull(
        [SELECT UndoneAt__c FROM Import__c WHERE Id = :importId].UndoneAt__c
      );
    }
  }

  @IsTest
  static void ingest510WhatTriggersWorkedOutGoesBackToo() {
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(new User(Id = kept.get('Scheduler'))) {
      Id seasonId = kept.get('Season');
      Id period2 = kept.get('Period 2');
      String before = CampSnapshot.of();
      Map<String, Object> plan = ImportTestPlans.emptyPlan(seasonId);
      // Period 2 moves: its name follows its times (TimeBlockTriggerHandler).
      ImportTestPlans.add(
        plan,
        'timeBlocks',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            period2,
            'id',
            period2,
            'start',
            '10:15',
            'end',
            '11:00'
          }
        )
      );
      // Flagpole moves to Period 2: its last block is worked out again
      // (SetTimeItemTriggerHandler).
      ImportTestPlans.add(
        plan,
        'fixedActivities',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            kept.get('Flagpole'),
            'id',
            kept.get('Flagpole'),
            'blockKey',
            period2,
            'length',
            1
          }
        )
      );
      // The import and Undo are each a request: the import gets limits of its own.
      Test.startTest();
      Id importId = ImportController.saveSetup(JSON.serialize(plan)).importId;
      Test.stopTest();
      TimeBlock__c moved = [
        SELECT Name
        FROM TimeBlock__c
        WHERE Id = :period2
      ];
      FixedActivity__c flagpole = [
        SELECT LastTimeBlock__c
        FROM FixedActivity__c
        WHERE Id = :kept.get('Flagpole')
      ];
      Assert.isTrue(moved.Name.contains('10:15'), moved.Name);
      Assert.areEqual(period2, flagpole.LastTimeBlock__c);
      ImportController.undoImport(importId);
      Assert.areEqual(before, CampSnapshot.of());
    }
  }
}
