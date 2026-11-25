/**
 * Undo of the cells an import took out of an older imported week (ImportSupersededCells.putBack;
 * docs/import/review.md INGEST-5.8). Every test acts as a scheduler, with a made-up camp.
 */
@IsTest
private class ImportSupersededCellsTest {
  private static Season__c newSeason() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    return ShoreshTestData.season(camp.Id, 'Summer 2027');
  }

  /** A first import bringing one week in as its imported version. */
  private static void importedWeek(Season__c season) {
    List<Week__c> weeks = ShoreshTestData.weeks(season.Id, 1);
    Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
    ImportTestPlans.addVersion(plan, weeks[0]);
    ImportController.saveSetup(JSON.serialize(plan));
  }

  /** The imported week's one day, with its version's name. */
  private static ScheduleDay__c importedDay(Id seasonId) {
    return [
      SELECT Id, Grid__c, Schedule__r.Name
      FROM ScheduleDay__c
      WHERE
        Schedule__r.Program__r.Season__c = :seasonId
        AND Schedule__r.Name = 'Imported from maple-grove.xlsx'
      WITH USER_MODE
      LIMIT 1
    ];
  }

  // INGEST-5.8: a day changed since only in capitals is an edit; Undo keeps it and names it.
  @IsTest
  static void ingest58UndoKeepsADayChangedOnlyInCapitals() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      importedWeek(season);
      ScheduleDay__c day = importedDay(season.Id);
      String upper = day.Grid__c.toUpperCase();
      Assert.isFalse(day.Grid__c.equals(upper), 'has lower case to change');
      ImportUndo.Result result = new ImportUndo.Result();
      Test.startTest();
      ImportSupersededCells.putBack(
        new List<ImportLogEntries.CellsOut>{
          new ImportLogEntries.CellsOut(day, upper)
        },
        result
      );
      Test.stopTest();
      Assert.areEqual(0, result.restored);
      Assert.areEqual(
        new List<String>{ 'Imported from maple-grove.xlsx' },
        result.keptEdited
      );
      Assert.areEqual(day.Grid__c, importedDay(season.Id).Grid__c);
    }
  }

  // INGEST-5.8: a day deleted since has nothing to put back, and Undo's summary says so.
  @IsTest
  static void ingest58UndoNamesADayDeletedSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = newSeason();
      importedWeek(season);
      ScheduleDay__c day = importedDay(season.Id);
      ImportLogEntries.CellsOut entry = new ImportLogEntries.CellsOut(
        day,
        day.Grid__c
      );
      // Deleted since, as Undo of a later import or a season's clean-up would.
      ImportedWeekGuard.allow();
      try {
        Database.delete(
          new ScheduleDay__c(Id = day.Id),
          AccessLevel.SYSTEM_MODE
        );
      } finally {
        ImportedWeekGuard.done();
      }
      ImportUndo.Result result = new ImportUndo.Result();
      Test.startTest();
      ImportSupersededCells.putBack(
        new List<ImportLogEntries.CellsOut>{ entry },
        result
      );
      Test.stopTest();
      Assert.areEqual(0, result.restored);
      Assert.areEqual(
        new List<String>{ 'Imported from maple-grove.xlsx' },
        result.gone
      );
    }
  }
}
