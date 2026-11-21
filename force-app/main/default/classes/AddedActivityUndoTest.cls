/**
 * LOCK-4.12 and LOCK-5.5: an activity typed into a cell on Manual Build or Generated Schedule
 * starts at 0 times a week, and Undo of that step takes it off again only while nothing else uses
 * it. As a scheduler with the Shoresh Scheduler permission set; synthetic camp (SetTimeTestData:
 * Group A, Group B, Group C; Period 1, Period 2, Lunch; Main runs Monday to Thursday).
 */
@IsTest
private class AddedActivityUndoTest {
  // One take-off, well under 100 for a whole request (CLAUDE.md); about 12 by count.
  private static final Integer QUERY_BOUND = 16;

  private class Week {
    Map<String, Id> ids;
    Id draftId;
    Date monday;
  }

  private static Week manualWeek() {
    Week week = new Week();
    week.ids = SetTimeTestData.camp();
    SlotRunsTestData.useBlocks(
      new List<Id>{
        week.ids.get('Period 1'),
        week.ids.get('Period 2'),
        week.ids.get('Lunch')
      }
    );
    ManualBuildViews.DraftView view = ManualBuildController.startBlankWeek(
      week.ids.get('Main'),
      week.ids.get('Week 1')
    );
    week.draftId = view.schedule.schedule.id;
    week.monday = view.schedule.days[0].dateValue;
    return week;
  }

  /** Group A's Monday Period 2, from one item to another, as the screen saves a step. */
  private static void put(Week week, String before, String after) {
    ManualBuildController.saveSlots(
      week.draftId,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            week.monday,
            week.ids.get('Group A'),
            week.ids.get('Period 2')
          ),
          new List<String>{ before },
          new List<String>{ after }
        )
      }
    );
  }

  private static Boolean exists(Id activityId) {
    return [
        SELECT COUNT()
        FROM Activity__c
        WHERE Id = :activityId
        WITH SYSTEM_MODE
      ] == 1;
  }

  // LOCK-4.12
  @IsTest
  static void anActivityTypedIntoACellStartsAtZeroTimesAWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      Week week = manualWeek();
      Test.startTest();
      ManualBuildViews.ActivityOption added = ManualBuildController.addActivity(
        week.draftId,
        'Zoo trip'
      );
      Test.stopTest();
      Activity__c saved = [
        SELECT TimesPerWeekMin__c, TimesPerWeekMax__c, NoWeeklyMax__c
        FROM Activity__c
        WHERE Id = :added.id
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(0, saved.TimesPerWeekMin__c);
      Assert.areEqual(0, saved.TimesPerWeekMax__c);
      Assert.isFalse(saved.NoWeeklyMax__c);
      Assert.areEqual(0, added.minPerWeek);
      Assert.areEqual(0, added.maxPerWeek);
    }
  }

  // LOCK-5.5
  @IsTest
  static void undoTakesOffTheActivityItsStepAddedWhenNothingElseUsesIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Week week = manualWeek();
      Id zoo = ManualBuildController.addActivity(week.draftId, 'swsw').id;
      put(week, '', 'A:' + zoo);
      // The Undo's own save first: the cell is Open again.
      put(week, 'A:' + zoo, '');
      Test.startTest();
      Integer before = Limits.getQueries();
      Boolean removed = ManualBuildController.removeAddedActivity(
        week.draftId,
        zoo
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(removed);
      Assert.isFalse(exists(zoo));
      Assert.isTrue(used <= QUERY_BOUND, 'Taking it off used ' + used);
    }
  }

  // LOCK-5.5
  @IsTest
  static void undoKeepsTheActivityWhereAnotherCellOrAVersionHasIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Week week = manualWeek();
      Id zoo = ManualBuildController.addActivity(week.draftId, 'Zoo trip').id;
      put(week, '', 'A:' + zoo);
      ManualBuildController.saveVersion(week.draftId, 'With the zoo trip');
      put(week, 'A:' + zoo, '');
      Test.startTest();
      // The version kept since still holds it.
      Assert.isFalse(
        ManualBuildController.removeAddedActivity(week.draftId, zoo)
      );
      Test.stopTest();
      Assert.isTrue(exists(zoo));
    }
  }

  // LOCK-5.5
  @IsTest
  static void undoKeepsTheActivityOnceItIsSetUpOnActivities() {
    System.runAs(ShoreshTestData.scheduler()) {
      Week week = manualWeek();
      Id zoo = ManualBuildController.addActivity(week.draftId, 'Zoo trip').id;
      Id pond = ManualBuildController.addActivity(week.draftId, 'Pond').id;
      // Zoo trip given who can do it; Pond changed on Activities since it was made.
      insert as user new ActivityEligibility__c(
        Activity__c = zoo,
        Group__c = week.ids.get('Group A')
      );
      update as user new Activity__c(Id = pond, TimesPerWeekMax__c = 1);
      Test.setCreatedDate(pond, Datetime.now().addDays(-1));
      Test.startTest();
      Assert.isFalse(
        ManualBuildController.removeAddedActivity(week.draftId, zoo)
      );
      Assert.isFalse(
        ManualBuildController.removeAddedActivity(week.draftId, pond)
      );
      Test.stopTest();
      Assert.isTrue(exists(zoo));
      Assert.isTrue(exists(pond));
    }
  }

  // LOCK-4.12, LOCK-5.5
  @IsTest
  static void generatedScheduleAddsAtZeroAndTakesOffTheSameWay() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      ManualBuildViews.ActivityOption added = GeneratedScheduleController.addActivity(
        draftId,
        'Zoo trip'
      );
      Boolean removed = GeneratedScheduleController.removeAddedActivity(
        draftId,
        added.id
      );
      Test.stopTest();
      Assert.areEqual(0, added.minPerWeek);
      Assert.areEqual(0, added.maxPerWeek);
      Assert.isTrue(removed);
      Assert.isFalse(exists(added.id));
    }
  }
}
