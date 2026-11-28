/**
 * INGEST-2.34: an activity whose cells name its weeks comes in off in the season's other weeks
 * (WeekException__c), and Undo last import takes the weeks off away with it. Acts as a
 * scheduler. Made-up camp only (ImportTestPlans).
 */
@IsTest
private class ImportWeeksOffTest {
  @IsTest
  static void aNewActivitysWeeksOffComeInAndUndoTakesThemAway() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Id week = ShoreshTestData.weeks(season.Id, 1)[0].Id;
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(swimOffIn(season.Id, week))
      );
      List<WeekException__c> off = [
        SELECT Activity__r.Name
        FROM WeekException__c
        WHERE Week__c = :week
      ];
      Assert.areEqual(1, off.size(), 'Swim is off in the week');
      Assert.areEqual('Swim', off[0].Activity__r.Name);
      Test.startTest();
      ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM WeekException__c WHERE Week__c = :week],
        'Undo takes the week off away with the activity'
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Activity__c WHERE Season__c = :season.Id]
      );
    }
  }

  /** A new camp's plan with its new Swim off in one week. */
  private static Map<String, Object> swimOffIn(Id seasonId, Id week) {
    Map<String, Object> plan = ImportTestPlans.newCamp(seasonId);
    // Swim is the camp's first activity (ImportTestPlans.newCamp).
    Map<String, Object> swim = (Map<String, Object>) ((List<Object>) plan.get(
      'activities'
    ))[0];
    swim.put('offWeeks', new List<Object>{ week });
    return plan;
  }
}
