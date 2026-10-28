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
          new Map<String, Object>{ 'id' => boating.Id, 'name' => 'Boating' }
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
      Assert.areEqual(1, result.removed.get('Activity'));
      Assert.areEqual(0, leftAfterRemove, 'removed');
      Assert.areEqual(1, undone.restored, 'brought back by Undo');
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Activity__c WHERE Id = :boating.Id WITH USER_MODE],
        'back, with its who list'
      );
      Assert.isTrue(
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Activity__c = :boating.Id
          WITH USER_MODE
        ] > 0,
        'what went with it (who can do it) came back too'
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
}
