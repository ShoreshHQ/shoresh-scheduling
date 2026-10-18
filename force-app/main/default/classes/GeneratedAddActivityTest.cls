/**
 * "Add <name> to activities" from Generated Schedule (ADR 0010 §38), as a scheduler with the
 * Shoresh Scheduler permission set: a new name makes the season's activity with the starting
 * values of one added by hand, the same name again (spaces and capitals aside) gives that one,
 * an existing activity's name gives it; only from a Generated draft, never a version or Manual
 * Build's draft. Camp: GeneratedTestData. Synthetic data only.
 */
@IsTest
private class GeneratedAddActivityTest {
  // What one add may cost, well under 100 for a whole request (CLAUDE.md); about 8 by count.
  private static final Integer QUERY_BOUND = 15;

  @IsTest
  static void aNewNameIsAddedOnceWithHandAddedStartingValues() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      Integer before = Limits.getQueries();
      ManualBuildViews.ActivityOption added = GeneratedScheduleController.addActivity(
        draftId,
        '  Arts   and crafts '
      );
      Integer used = Limits.getQueries() - before;
      ManualBuildViews.ActivityOption again = GeneratedScheduleController.addActivity(
        draftId,
        'artsand Crafts'
      );
      ManualBuildViews.ActivityOption swim = GeneratedScheduleController.addActivity(
        draftId,
        'SWIM'
      );
      Test.stopTest();
      Assert.isTrue(used <= QUERY_BOUND, 'One add used ' + used + ' queries');
      Activity__c saved = [
        SELECT Name, Length__c, TimesPerWeekMax__c, Season__c
        FROM Activity__c
        WHERE Id = :added.id
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Arts and crafts', saved.Name);
      Assert.areEqual(1, saved.Length__c);
      Assert.areEqual(1, saved.TimesPerWeekMax__c);
      Assert.areEqual(ids.get('Season'), saved.Season__c);
      Assert.areEqual(1, added.length);
      Assert.isTrue(added.notFor.isEmpty());
      // Its setup record comes back too, for the screen's checks before the week is read again.
      Assert.areEqual(added.id, added.record.Id);
      Assert.areEqual(added.id, again.id);
      Assert.areEqual(ids.get('Swim'), swim.id);
    }
  }

  @IsTest
  static void anActivityIsAddedOnlyFromAGeneratedDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Schedule__c version = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Imported from last-summer.xlsx (made up)'
      );
      Id manualId = ManualDrafts.start(ids.get('Main'), ids.get('Week 1'))
        .draftId;
      Test.startTest();
      Assert.isTrue(
        refusal(version.Id).contains('can\'t be changed'),
        refusal(version.Id)
      );
      Assert.isTrue(
        refusal(manualId).contains('Generated Schedule can be saved here'),
        refusal(manualId)
      );
      Test.stopTest();
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Activity__c
          WHERE Name = 'Archery'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  private static String refusal(Id scheduleId) {
    try {
      GeneratedScheduleController.addActivity(scheduleId, 'Archery');
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return 'Added';
  }
}
