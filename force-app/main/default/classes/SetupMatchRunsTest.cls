/**
 * "Update to match setup" (SetupMatch) and When it runs (ADR 0031 piece A), as a scheduler with
 * the Shoresh Scheduler permission set. Synthetic camp (SetTimeTestData): Week 1's Manual Build
 * starts with Swim in Group A's Monday Period 2.
 */
@IsTest
private class SetupMatchRunsTest {
  private static final Date MONDAY = SetupMatchTestData.MONDAY;

  /** Week 1's Manual Build, with Swim in Group A's Monday Period 2, as the screen saves it. */
  private static Id started(Map<String, Id> ids) {
    Id draft = ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      )
      .schedule.schedule.id;
    SlotEdits.Result result = ManualBuildController.saveSlots(
      draft,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(MONDAY, ids.get('Group A'), ids.get('Period 2')),
          new List<String>{ '' },
          new List<String>{ 'A:' + ids.get('Swim') }
        )
      }
    );
    Assert.isTrue(result.conflicts.isEmpty());
    return draft;
  }

  // GEN-3.16: a placement where its activity no longer runs is shown as Update to match setup
  // shows a closure, never refused.
  @IsTest
  static void aPlacementWhereItsActivityNoLongerRunsGetsADot() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetupMatchTestData.camp();
      Id draftId = started(ids);
      Database.insert(
        new ActivityOffTime__c(
          Activity__c = ids.get('Swim'),
          TimeBlock__c = ids.get('Period 2'),
          Day__c = 'Monday'
        ),
        AccessLevel.USER_MODE
      );
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Test.stopTest();
      Assert.areEqual(
        SetupMatchRules.NOT_RUNNING_THEN,
        SetupMatchTestData.dotsOf(preview)
          .get(
            String.valueOf(MONDAY) +
              '|' +
              ids.get('Group A') +
              '|' +
              ids.get('Period 2')
          )
      );
    }
  }
}
