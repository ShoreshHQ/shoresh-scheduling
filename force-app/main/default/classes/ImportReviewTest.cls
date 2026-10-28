/**
 * docs/import/review.md: questions kept for later (INGEST-5.5, 5.6), what an earlier import brought
 * in and no one changed since (INGEST-5.7), and what a second import removes as chosen (INGEST-5.8).
 * Every test acts as a scheduler, with a made-up camp (ImportTestPlans).
 */
@IsTest
private class ImportReviewTest {
  private static Season__c newSeason() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    return ShoreshTestData.season(camp.Id, 'Summer 2027');
  }

  private static ImportSetupSaves.Result firstImport(Id seasonId) {
    return ImportController.saveSetup(
      JSON.serialize(ImportTestPlans.newCamp(seasonId))
    );
  }

  private static Activity__c activityNamed(Id seasonId, String name) {
    return [
      SELECT Id, Name, Length__c
      FROM Activity__c
      WHERE Season__c = :seasonId AND Name = :name
      WITH USER_MODE
      LIMIT 1
    ];
  }

  private static Set<Id> untouched(Id seasonId) {
    return new Set<Id>(ImportController.getImported(seasonId));
  }

  @IsTest
  static void ingest57WhatAnImportBroughtInIsItsUntilChangedByHand() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c swim = activityNamed(season.Id, 'Swim');
      Activity__c boating = activityNamed(season.Id, 'Boating');
      // Made by hand: never the import's.
      Activity__c pottery = ShoreshTestData.activity(
        season.Id,
        'Pottery',
        null
      );
      insert as user pottery;
      Test.startTest();
      Set<Id> before = untouched(season.Id);
      boating.Length__c = 2;
      update as user boating;
      Set<Id> after = untouched(season.Id);
      Test.stopTest();
      Assert.isTrue(before.contains(swim.Id), 'imported, untouched');
      Assert.isTrue(before.contains(boating.Id), 'imported, untouched');
      Assert.isFalse(before.contains(pottery.Id), 'made by hand');
      Assert.isTrue(after.contains(swim.Id), 'still untouched');
      Assert.isFalse(after.contains(boating.Id), 'changed by hand since');
    }
  }

  @IsTest
  static void ingest57ASecondImportsUpdateKeepsItTheImports() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c swim = activityNamed(season.Id, 'Swim');
      Map<String, Object> second = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(
        second,
        'activities',
        new Map<String, Object>{
          'key' => swim.Id,
          'id' => swim.Id,
          'length' => 2
        }
      );
      Test.startTest();
      ImportController.saveSetup(JSON.serialize(second));
      Set<Id> afterUpdate = untouched(season.Id);
      swim.Length__c = 3;
      update as user swim;
      Set<Id> afterHand = untouched(season.Id);
      Test.stopTest();
      Assert.isTrue(afterUpdate.contains(swim.Id), 'updated by an import');
      Assert.isFalse(afterHand.contains(swim.Id), 'then changed by hand');
    }
  }

  @IsTest
  static void ingest57AnUndoneImportBroughtInNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      ImportSetupSaves.Result first = firstImport(season.Id);
      Activity__c swim = activityNamed(season.Id, 'Swim');
      swim.Length__c = 2;
      // Changed by hand, so Undo keeps it: it is the director's now.
      update as user swim;
      Test.startTest();
      ImportController.undoImport(first.importId);
      Set<Id> after = untouched(season.Id);
      Test.stopTest();
      Assert.isFalse(after.contains(swim.Id), 'its import was undone');
    }
  }

  @IsTest
  static void ingest58RemovesWhatAnImportBroughtInAndUndoBringsItBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c boating = activityNamed(season.Id, 'Boating');
      Map<String, Object> second = ImportTestPlans.emptyPlan(season.Id);
      second.put(
        'removals',
        new List<Object>{
          new Map<String, Object>{ 'id' => boating.Id, 'name' => 'Boating' },
          new Map<String, Object>{
            'id' => activityNamed(season.Id, 'Swim').Id,
            'name' => 'Swim'
          }
        }
      );
      Test.startTest();
      Integer queriesBefore = Limits.getQueries();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(second)
      );
      Integer queries = Limits.getQueries() - queriesBefore;
      Integer leftAfterRemove = [
        SELECT COUNT()
        FROM Activity__c
        WHERE Id = :boating.Id
        WITH USER_MODE
      ];
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(2, result.removed.get('Activity'), 'two in one save');
      Assert.areEqual(0, leftAfterRemove, 'removed');
      Assert.areEqual(2, undone.restored, 'brought back by Undo');
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Activity__c WHERE Id = :boating.Id WITH USER_MODE],
        'back, with its who list'
      );
      Assert.isTrue(
        queries < 40,
        'a second import stays well inside the limits'
      );
    }
  }

  @IsTest
  static void ingest58NeverRemovesWhatWasMadeOrChangedByHand() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c swim = activityNamed(season.Id, 'Swim');
      swim.Length__c = 2;
      update as user swim;
      Map<String, Object> second = ImportTestPlans.emptyPlan(season.Id);
      second.put(
        'removals',
        new List<Object>{
          new Map<String, Object>{ 'id' => swim.Id, 'name' => 'Swim' }
        }
      );
      String refusal;
      Test.startTest();
      try {
        ImportController.saveSetup(JSON.serialize(second));
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Test.stopTest();
      Assert.isNotNull(refusal, 'refused');
      Assert.isTrue(refusal.contains('Swim'), refusal);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Activity__c WHERE Id = :swim.Id WITH USER_MODE],
        'kept'
      );
    }
  }

  @IsTest
  static void ingest55OpenQuestionsAreKeptWithTheFilesAndShownOnRoots() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
      plan.put(
        'open',
        new List<Object>{
          new Map<String, Object>{
            'key' => 'kind|Archery',
            'title' => 'Is “Archery” at a set time, or an activity?'
          }
        }
      );
      String files = '[{"name":"maple-grove.xlsx","sheets":[]}]';
      plan.put('fileData', files);
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(plan)
      );
      String read = ImportController.getOpenFiles(result.importId);
      Import__c last = SeasonSetupReader.read(season.Id).lastImport;
      Test.stopTest();
      Assert.areEqual(files, read, 'the files as read, to answer them later');
      List<Object> open = (List<Object>) JSON.deserializeUntyped(last.Open__c);
      Assert.areEqual(1, open.size(), 'one question waits on Roots');
      Assert.areEqual(
        'kind|Archery',
        ((Map<String, Object>) open[0]).get('key')
      );
    }
  }

  @IsTest
  static void ingest56TheFilesAreOnlyForTheLastImportWithQuestionsOpen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      ImportSetupSaves.Result settled = firstImport(season.Id);
      String refusal;
      Test.startTest();
      try {
        ImportController.getOpenFiles(settled.importId);
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Test.stopTest();
      Assert.isNotNull(refusal, 'no questions were left open');
    }
  }

  private static Map<String, Object> removing(Id seasonId, Activity__c item) {
    Map<String, Object> plan = ImportTestPlans.emptyPlan(seasonId);
    plan.put(
      'removals',
      new List<Object>{
        new Map<String, Object>{ 'id' => item.Id, 'name' => item.Name }
      }
    );
    return plan;
  }

  private static String refusalOf(Map<String, Object> plan) {
    try {
      ImportController.saveSetup(JSON.serialize(plan));
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  @IsTest
  static void ingest58AnItemInUseIsKeptWithWhyAndItsRemovalRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c boating = activityNamed(season.Id, 'Boating');
      // Made by hand: Swim's rain plan is Boating, so Boating is in use.
      Activity__c swim = activityNamed(season.Id, 'Swim');
      Activity__c crafts = ShoreshTestData.activity(season.Id, 'Crafts', null);
      crafts.RainPlan__c = boating.Id;
      insert as user crafts;
      Test.startTest();
      ImportProvenance.Standing standing = ImportController.getImported(
        season.Id
      );
      String refusal = refusalOf(removing(season.Id, boating));
      Test.stopTest();
      Assert.areEqual(
        'Boating is Crafts\'s rain plan',
        standing.inUse.get(boating.Id)
      );
      Assert.isFalse(standing.inUse.containsKey(swim.Id), 'nothing uses Swim');
      Assert.isTrue(
        refusal.contains('Boating is Crafts\'s rain plan'),
        refusal
      );
      Assert.areEqual(
        boating.Id,
        [
          SELECT RainPlan__c
          FROM Activity__c
          WHERE Id = :crafts.Id
          WITH USER_MODE
        ]
        .RainPlan__c,
        'nothing pointing at it was cleared'
      );
    }
  }

  @IsTest
  static void ingest58AnItemOnAScheduleIsInUse() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      List<Week__c> weeks = ShoreshTestData.weeks(season.Id, 1);
      Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
      ImportTestPlans.addVersion(plan, weeks[0]);
      ImportController.saveSetup(JSON.serialize(plan));
      Activity__c swim = activityNamed(season.Id, 'Swim');
      Test.startTest();
      ImportProvenance.Standing standing = ImportController.getImported(
        season.Id
      );
      Test.stopTest();
      Assert.isTrue(
        standing.inUse.get(swim.Id).startsWith('Swim is on '),
        String.valueOf(standing.inUse)
      );
    }
  }

  @IsTest
  static void ingest57AHandChangeToAttachedRecordsIsAChange() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c boating = activityNamed(season.Id, 'Boating');
      Activity__c swim = activityNamed(season.Id, 'Swim');
      // Who can do Boating: a row deleted by hand.
      delete as user [
        SELECT Id
        FROM ActivityEligibility__c
        WHERE Activity__c = :boating.Id
        WITH USER_MODE
      ];
      Test.startTest();
      Set<Id> after = untouched(season.Id);
      String refusal = refusalOf(removing(season.Id, boating));
      Test.stopTest();
      Assert.isFalse(
        after.contains(boating.Id),
        'its who list changed by hand'
      );
      Assert.isTrue(after.contains(swim.Id), 'Swim untouched');
      Assert.isNotNull(refusal, 'never removed');
    }
  }

  @IsTest
  static void ingest57ChangedAndChangedBackStillCountsAsChanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      ImportSetupSaves.Result first = firstImport(season.Id);
      // The import was saved an hour ago; the director edits now, then sets it back.
      Test.setCreatedDate(first.importId, Datetime.now().addHours(-1));
      Activity__c swim = activityNamed(season.Id, 'Swim');
      Decimal length = swim.Length__c;
      swim.Length__c = length + 1;
      update as user swim;
      swim.Length__c = length;
      update as user swim;
      Test.startTest();
      Set<Id> after = untouched(season.Id);
      Test.stopTest();
      Assert.isFalse(after.contains(swim.Id), 'saved since the import');
    }
  }

  @IsTest
  static void ingest57AnUpdateMadeWithoutAskingIsCheckedAgainAtSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c swim = activityNamed(season.Id, 'Swim');
      // Changed by hand after the screen read the files.
      swim.Length__c = 3;
      update as user swim;
      Map<String, Object> second = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(
        second,
        'activities',
        new Map<String, Object>{
          'key' => swim.Id,
          'id' => swim.Id,
          'length' => 2,
          'auto' => true,
          'name' => 'Swim'
        }
      );
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(second)
      );
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Swim' }, result.leftAsIs);
      Assert.areEqual(3, activityNamed(season.Id, 'Swim').Length__c);
    }
  }

  @IsTest
  static void ingest57OnlyTheNewestImportsAreRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      firstImport(season.Id);
      Activity__c swim = activityNamed(season.Id, 'Swim');
      ImportController.saveSetup(
        JSON.serialize(ImportTestPlans.emptyPlan(season.Id))
      );
      Test.startTest();
      Set<Id> all = untouched(season.Id);
      ImportProvenance.maxImports = 1;
      Set<Id> newest = untouched(season.Id);
      Test.stopTest();
      Assert.isTrue(all.contains(swim.Id));
      Assert.isFalse(
        newest.contains(swim.Id),
        'its import is older than the newest one'
      );
    }
  }

  private static Integer filesOf(Id importId) {
    return [
      SELECT COUNT()
      FROM ContentDocumentLink
      WHERE LinkedEntityId = :importId
      WITH SYSTEM_MODE
    ];
  }

  private static Map<String, Object> withOpen(
    Map<String, Object> plan,
    Integer count,
    Integer titleLength
  ) {
    List<Object> open = new List<Object>();
    for (Integer i = 0; i < count; i++) {
      open.add(
        new Map<String, Object>{
          'key' => 'kind|Archery ' + i,
          'title' => 'Is Archery ' +
          i +
          ' at a set time? '.rightPad(titleLength, '.')
        }
      );
    }
    plan.put('open', open);
    plan.put('fileData', '[{"name":"maple-grove.xlsx","sheets":[]}]');
    return plan;
  }

  @IsTest
  static void ingest55KeptFilesGoOnceANewerImportOrUndoSupersedesThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      ImportSetupSaves.Result first = ImportController.saveSetup(
        JSON.serialize(withOpen(ImportTestPlans.newCamp(season.Id), 1, 40))
      );
      Integer keptAtFirst = filesOf(first.importId);
      Test.startTest();
      ImportSetupSaves.Result second = ImportController.saveSetup(
        JSON.serialize(withOpen(ImportTestPlans.emptyPlan(season.Id), 1, 40))
      );
      Integer firstAfterNewer = filesOf(first.importId);
      String refusal;
      try {
        ImportController.getOpenFiles(first.importId);
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      ImportController.undoImport(second.importId);
      Test.stopTest();
      Assert.areEqual(1, keptAtFirst, 'kept while its questions are open');
      Assert.areEqual(0, firstAfterNewer, 'a newer import supersedes it');
      Assert.isNotNull(refusal, 'reopening after a newer import is refused');
      Assert.areEqual(0, filesOf(second.importId), 'gone with its Undo');
    }
  }

  @IsTest
  static void ingest55QuestionsThatDoNotFitAreCountedAndRootsCountIsTrue() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      Map<String, Object> plan = withOpen(
        ImportTestPlans.newCamp(season.Id),
        150,
        1000
      );
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(plan)
      );
      Import__c last = SeasonSetupReader.read(season.Id).lastImport;
      Test.stopTest();
      Integer kept = ((List<Object>) JSON.deserializeUntyped(last.Open__c))
        .size();
      Assert.isTrue(result.openNotKept > 0, 'some did not fit');
      Assert.areEqual(150, kept + result.openNotKept, 'every question counted');
    }
  }

  /** A first import with its week kept as a version (Swim in it), and the week. */
  private static Week__c importedWeek(Season__c season) {
    List<Week__c> weeks = ShoreshTestData.weeks(season.Id, 1);
    Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
    ImportTestPlans.addVersion(plan, weeks[0]);
    ImportController.saveSetup(JSON.serialize(plan));
    return weeks[0];
  }

  /** A second import removing Swim, bringing the same week in again (or not). */
  private static Map<String, Object> removingSwim(
    Season__c season,
    Week__c week,
    Boolean sameWeek
  ) {
    Activity__c swim = activityNamed(season.Id, 'Swim');
    Map<String, Object> plan = removing(season.Id, swim);
    if (sameWeek) {
      Id programId = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :season.Id
        WITH USER_MODE
        LIMIT 1
      ]
      .Id;
      ImportTestPlans.add(
        plan,
        'versions',
        new Map<String, Object>{
          'programKey' => programId,
          'weekId' => week.Id,
          'name' => 'Imported from corrected.xlsx',
          'days' => new List<Object>()
        }
      );
    }
    return plan;
  }

  private static String firstWeekGrid(Id seasonId) {
    return [
      SELECT Grid__c
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__r.Season__c = :seasonId
        AND Schedule__r.Name = 'Imported from maple-grove.xlsx'
      WITH USER_MODE
      LIMIT 1
    ]
    .Grid__c;
  }

  @IsTest
  static void ingest58CellsOnlyInASupersededImportedWeekGoWithTheItemAndUndoPutsThemBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      Week__c week = importedWeek(season);
      Activity__c swim = activityNamed(season.Id, 'Swim');
      String gridBefore = firstWeekGrid(season.Id);
      Test.startTest();
      ImportProvenance.Standing standing = ImportController.getImported(
        season.Id
      );
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(removingSwim(season, week, true))
      );
      String gridAfter = firstWeekGrid(season.Id);
      ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.isFalse(
        standing.inUse.containsKey(swim.Id),
        'only its imported week'
      );
      Assert.areEqual(1, standing.versionUses.get(swim.Id).size());
      Assert.isTrue(gridBefore.contains(swim.Id));
      Assert.isFalse(gridAfter.contains(swim.Id), 'taken out of that week');
      Assert.areEqual(gridBefore, firstWeekGrid(season.Id), 'put back exactly');
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Activity__c WHERE Id = :swim.Id WITH USER_MODE]
      );
    }
  }

  @IsTest
  static void ingest58AnImportedWeekNotBroughtInAgainKeepsTheItem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      Week__c week = importedWeek(season);
      Test.startTest();
      String refusal = refusalOf(removingSwim(season, week, false));
      Test.stopTest();
      Assert.isTrue(
        refusal.contains('Swim is on Imported from maple-grove.xlsx'),
        refusal
      );
    }
  }
}
