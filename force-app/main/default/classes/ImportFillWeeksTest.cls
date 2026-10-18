/**
 * Import last year into a season with no weeks: its weeks are added from its dates in the same
 * save, as "Fill in weeks" adds them, and last year's week is kept as a version in the one
 * chosen (Greg: an import adds what's missing; coordinator, 2026-10-17). Undo removes them.
 * Made-up camp only (ImportTestPlans).
 */
@IsTest
private class ImportFillWeeksTest {
  private static final Date FIRST_MONDAY = Date.newInstance(2026, 6, 29);

  private static Season__c seasonWithoutWeeks() {
    Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
    // 29 June to 7 August 2026: six weeks.
    return ShoreshTestData.season(camp.Id, 'Summer 2026');
  }

  /** The plan the screen sends: six weeks to fill, and last year's week in the second one. */
  private static Map<String, Object> planFillingWeeks(
    Season__c season,
    Integer weeks
  ) {
    Map<String, Object> plan = ImportTestPlans.newCamp(season.Id);
    List<Object> fill = new List<Object>();
    for (Integer i = 0; i < weeks; i++) {
      fill.add(
        new Map<String, Object>{
          'start' => String.valueOf(FIRST_MONDAY.addDays(7 * i)),
          'name' => 'Week ' + (i + 1)
        }
      );
    }
    plan.put('fillWeeks', fill);
    Date second = FIRST_MONDAY.addDays(7);
    ImportTestPlans.addVersion(plan, new Week__c(StartDate__c = second));
    Map<String, Object> version = (Map<String, Object>) ((List<Object>) plan.get(
      'versions'
    ))[0];
    version.remove('weekId');
    version.put('weekKey', 'Week:' + String.valueOf(second));
    return plan;
  }

  @IsTest
  static void theWeeksAreAddedAndLastYearsWeekIsKeptInTheOneChosen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonWithoutWeeks();
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(planFillingWeeks(season, 6))
      );
      Test.stopTest();
      List<Week__c> weeks = [
        SELECT Id, Name, StartDate__c, EndDate__c
        FROM Week__c
        WHERE Season__c = :season.Id
        ORDER BY StartDate__c
      ];
      Assert.areEqual(6, weeks.size());
      Assert.areEqual(6, result.added.get('Week'), 'the summary counts them');
      Assert.areEqual('Week 1', weeks[0].Name);
      Assert.areEqual(FIRST_MONDAY.addDays(4), weeks[0].EndDate__c);
      Assert.areEqual(1, result.added.get('Version'));
      Schedule__c version = [
        SELECT Week__c
        FROM Schedule__c
        WHERE Program__r.Season__c = :season.Id
      ];
      Assert.areEqual(weeks[1].Id, version.Week__c);
    }
  }

  @IsTest
  static void undoRemovesTheWeeksItAdded() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonWithoutWeeks();
      ImportSetupSaves.Result result = ImportController.saveSetup(
        JSON.serialize(planFillingWeeks(season, 6))
      );
      Test.startTest();
      ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Week__c WHERE Season__c = :season.Id]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Program__r.Season__c = :season.Id
        ]
      );
    }
  }

  @IsTest
  static void weeksThatNoLongerMatchTheSeasonsDatesAreRefusedAndNothingIsSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = seasonWithoutWeeks();
      Test.startTest();
      try {
        ImportController.saveSetup(JSON.serialize(planFillingWeeks(season, 5)));
        Assert.fail('Weeks the season no longer gives were added.');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('dates changed'), e.getMessage());
      }
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Week__c WHERE Season__c = :season.Id]
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Program__c WHERE Season__c = :season.Id]
      );
    }
  }
}
