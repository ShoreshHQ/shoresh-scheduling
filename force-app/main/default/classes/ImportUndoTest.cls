/**
 * Import last year, part 2: the imported version, remembered answers, and Undo last import.
 * Every test acts as a scheduler. Made-up camp only (ImportTestPlans).
 */
@IsTest
private class ImportUndoTest {
  private static Season__c seasonWithWeek() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
    ShoreshTestData.weeks(season.Id, 1);
    return season;
  }

  private static ImportSetupSaves.Result importWithVersion(Season__c season) {
    Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
    ImportTestPlans.addVersion(plan, [SELECT Id, StartDate__c FROM Week__c WHERE Season__c = :season.Id LIMIT 1]);
    return ImportController.saveSetup(JSON.serialize(plan));
  }

  private static Integer count(String objectName, Id seasonId, String seasonPath) {
    return Database.countQuery(
      'SELECT COUNT() FROM ' + objectName + ' WHERE ' + seasonPath + ' = \\'' + seasonId + '\\'',
      AccessLevel.SYSTEM_MODE
    );
  }

  @IsTest
  static void lastYearsWeekIsSavedAsAVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonWithWeek();
      Test.startTest();
      ImportSetupSaves.Result result = importWithVersion(season);
      Test.stopTest();
      Assert.areEqual(1, result.added.get('Version'));
      Schedule__c version = [
        SELECT Id, Name, Status__c, Origin__c, VersionReason__c, (SELECT Grid__c, Date__c FROM Days__r)
        FROM Schedule__c
        WHERE Program__r.Season__c = :season.Id
      ];
      Assert.areEqual('Imported from maple-grove.xlsx', version.Name);
      Assert.areEqual('Version', version.Status__c);
      Assert.areEqual('Imported', version.Origin__c);
      Assert.areEqual('Imported', version.VersionReason__c);
      ScheduleGrid grid = ScheduleGrid.fromText(version.Days__r[0].Grid__c);
      Id swim = [SELECT Id FROM Activity__c WHERE Name = 'Swim' AND Season__c = :season.Id].Id;
      Assert.areEqual(String.valueOf(swim), grid.items[0].id, 'keys become record Ids');
      Assert.areEqual('', grid.items[2].id, 'a trip is noted, not set up');
      Assert.areEqual('Zoo trip', grid.items[2].name);
      Assert.areEqual(4, grid.groups.size());
    }
  }

  @IsTest
  static void answersAreRememberedAndForgotten() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonWithWeek();
      Map<String, Object> plan = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(plan, 'remember', ImportTestPlans.entry(new List<Object>{ 'key', 'kind|Library', 'answer', 'recurring' }));
      ImportController.saveSetup(JSON.serialize(plan));
      ImportController.saveSetup(JSON.serialize(plan));
      List<ImportAnswers.Answer> answers = ImportController.getAnswers(season.Camp__c);
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
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonWithWeek();
      ImportSetupSaves.Result result = importWithVersion(season);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(0, count('Program__c', season.Id, 'Season__c'));
      Assert.areEqual(0, count('Activity__c', season.Id, 'Season__c'));
      Assert.areEqual(0, count('Location__c', season.Id, 'Season__c'));
      Assert.areEqual(0, count('Coverage__c', season.Id, 'Season__c'));
      Assert.isTrue(undone.removed > 10, 'removed ' + undone.removed);
      Assert.isTrue(undone.keptEdited.isEmpty() && undone.keptInUse.isEmpty());
      Assert.isNotNull([SELECT UndoneAt__c FROM Import__c WHERE Id = :result.importId].UndoneAt__c);
      try {
        ImportController.undoImport(result.importId);
        Assert.fail('an import is undone once');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('already undone'), e.getMessage());
      }
    }
  }

  @IsTest
  static void undoKeepsWhatWasEditedSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonWithWeek();
      ImportSetupSaves.Result result = importWithVersion(season);
      Activity__c swim = [SELECT Id FROM Activity__c WHERE Name = 'Swim' AND Season__c = :season.Id];
      Database.update(new Activity__c(Id = swim.Id, Length__c = 2), AccessLevel.USER_MODE);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(new List<String>{ 'Swim' }, undone.keptEdited);
      Assert.areEqual(1, count('Activity__c', season.Id, 'Season__c'));
      Assert.areEqual(0, [SELECT COUNT() FROM Activity__c WHERE Name = 'Boating']);
    }
  }

  @IsTest
  static void undoKeepsWhatIsStillInUse() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonWithWeek();
      ImportSetupSaves.Result result = importWithVersion(season);
      Group__c bunk1 = [SELECT Id FROM Group__c WHERE Name = 'Bunk 1' AND Division__r.Program__r.Season__c = :season.Id];
      Week__c week = [SELECT Id FROM Week__c WHERE Season__c = :season.Id LIMIT 1];
      ShoreshTestData.saveWeekExceptions(new List<WeekException__c>{ new WeekException__c(Week__c = week.Id, Group__c = bunk1.Id) }, null);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.isTrue(undone.keptInUse.contains('Bunk 1'), String.valueOf(undone.keptInUse));
      Assert.isTrue(undone.keptInUse.contains('Juniors'), 'its division holds it');
      Assert.isTrue(undone.keptInUse.contains('Main'), 'its program holds it');
      Assert.areEqual(1, [SELECT COUNT() FROM Group__c WHERE Division__r.Program__r.Season__c = :season.Id]);
      Assert.areEqual(0, count('Activity__c', season.Id, 'Season__c'));
    }
  }

  @IsTest
  static void undoPutsBackWhatTheImportChanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      TimeBlock__c period1 = [SELECT Id, EndTime__c FROM TimeBlock__c WHERE Program__r.Season__c = :season.Id AND Name = 'Period 1'];
      Map<String, Object> plan = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(plan, 'timeBlocks', ImportTestPlans.entry(new List<Object>{
        'key', period1.Id, 'id', period1.Id, 'start', '09:00', 'end', '09:50'
      }));
      ImportSetupSaves.Result result = ImportController.saveSetup(JSON.serialize(plan));
      Assert.areEqual(Time.newInstance(9, 50, 0, 0), [SELECT EndTime__c FROM TimeBlock__c WHERE Id = :period1.Id].EndTime__c);
      Test.startTest();
      ImportUndo.Result undone = ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(1, undone.restored);
      Assert.areEqual(period1.EndTime__c, [SELECT EndTime__c FROM TimeBlock__c WHERE Id = :period1.Id].EndTime__c);
    }
  }

  @IsTest
  static void onlyTheLastImportCanBeUndone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonWithWeek();
      ImportSetupSaves.Result first = ImportController.saveSetup(JSON.serialize(ImportTestPlans.newCamp(season.Id)));
      Map<String, Object> second = ImportTestPlans.emptyPlan(season.Id);
      ImportTestPlans.add(second, 'locations', ImportTestPlans.entry(new List<Object>{ 'key', 'L|Barn', 'name', 'Barn', 'groupsThatFit', 1 }));
      ImportSetupSaves.Result later = ImportController.saveSetup(JSON.serialize(second));
      Test.setCreatedDate(later.importId, Datetime.now().addMinutes(1));
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
}
