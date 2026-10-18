/**
 * "Start from another week", as a scheduler with the Shoresh Scheduler permission set: the new
 * week begins as the chosen one, matched by weekday; what can't go is left Open and listed.
 * Synthetic camp (SetTimeTestData): Group A and Group B (Juniors), Group C (Seniors); Period 1,
 * Period 2, Lunch; Main runs Monday to Thursday.
 */
@IsTest
private class ManualWeekStartTest {
  private static final Date WEEK_1_MONDAY = Date.newInstance(2026, 6, 29);

  private static Map<String, Id> camp() {
    Map<String, Id> ids = SetTimeTestData.camp();
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    return ids;
  }

  /** Week 1's Manual Build with Swim in Group A's Monday Period 2. */
  private static Id weekOneWithSwim(Map<String, Id> ids) {
    Id draftId = ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      )
      .schedule.schedule.id;
    SlotEdits.Result result = ManualBuildController.saveSlots(
      draftId,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            WEEK_1_MONDAY,
            ids.get('Group A'),
            ids.get('Period 2')
          ),
          new List<String>{ '' },
          new List<String>{ 'A:' + ids.get('Swim') }
        )
      }
    );
    Assert.isTrue(result.conflicts.isEmpty());
    return draftId;
  }

  /** What a group's Monday Period 2 holds ('' Open, else the item's name). */
  private static String mondayPeriod2(
    ManualBuildViews.DraftView view,
    String groupName
  ) {
    ScheduleViews.DayView day = view.schedule.days[0];
    for (Integer g = 0; g < day.groups.size(); g++) {
      if (day.groups[g].name == groupName) {
        String token = day.rows[g].split(',', -1)[1];
        return String.isBlank(token)
          ? ''
          : day.items[Integer.valueOf(token) - 1].name;
      }
    }
    return null;
  }

  @IsTest
  static void aWeekStartsAsTheOtherWeekMatchedByWeekday() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id source = weekOneWithSwim(ids);
      Integer queriesBefore = Limits.getQueries();
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        source
      );
      // A fixed number of queries, whatever the size of the camp (nothing is read per day,
      // group or placement): well under the limit of 100.
      Integer queries = Limits.getQueries() - queriesBefore;
      Test.stopTest();
      Assert.isTrue(
        queries <= 40,
        'Start from another week used ' + queries + ' queries'
      );
      Assert.areEqual('Swim', mondayPeriod2(view, 'Group A'));
      Assert.areEqual('', mondayPeriod2(view, 'Group B'));
      Assert.isTrue(view.leftOut.isEmpty(), String.join(view.leftOut, '; '));
      // A new Manual Build draft for Week 2; Week 1's is unchanged.
      Assert.areEqual(
        'Draft',
        [
          SELECT Status__c
          FROM Schedule__c
          WHERE Id = :view.schedule.schedule.id
          WITH SYSTEM_MODE
        ]
        .Status__c
      );
      Assert.areNotEqual(source, view.schedule.schedule.id);
    }
  }

  @IsTest
  static void whatCantGoIsLeftOpenAndListed() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Database.insert(
        new WeekException__c(
          Week__c = ids.get('Week 3'),
          Group__c = ids.get('Group A')
        ),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      Id source = weekOneWithSwim(ids);
      // Group A is away in Week 3.
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 3'),
        source
      );
      Test.stopTest();
      Assert.areEqual(
        new List<String>{ 'Swim · Group A · Monday: not at camp this week' },
        view.leftOut
      );
    }
  }

  @IsTest
  static void anActivityClosedThatWeekIsLeftOut() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Database.insert(
        new WeekException__c(
          Week__c = ids.get('Week 2'),
          Activity__c = ids.get('Swim')
        ),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      Id source = weekOneWithSwim(ids);
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        source
      );
      Test.stopTest();
      Assert.areEqual('', mondayPeriod2(view, 'Group A'));
      Assert.areEqual(
        new List<String>{ 'Swim · Group A · Monday: not running this week' },
        view.leftOut
      );
    }
  }

  @IsTest
  static void aVersionCanBeTheStartAndTheListShowsWhatCanBe() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = weekOneWithSwim(ids);
      Id versionId = ManualBuildController.saveVersion(draftId, 'Week 1 plan');
      List<ManualBuildViews.WeekSource> sources = ManualBuildController.getWeekSources(
        ids.get('Main'),
        ids.get('Week 2')
      );
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        versionId
      );
      Test.stopTest();
      Set<Id> offered = new Set<Id>();
      for (ManualBuildViews.WeekSource source : sources) {
        offered.add(source.id);
        Assert.areEqual('Week 1', source.weekName);
      }
      Assert.areEqual(new Set<Id>{ draftId, versionId }, offered);
      Assert.areEqual('Swim', mondayPeriod2(view, 'Group A'));
    }
  }

  @IsTest
  static void aWeekAlreadyStartedIsLeftAsItIs() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id source = weekOneWithSwim(ids);
      Id weekTwo = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 2')
        )
        .schedule.schedule.id;
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        source
      );
      Test.stopTest();
      Assert.areEqual(weekTwo, view.schedule.schedule.id);
      Assert.areEqual('', mondayPeriod2(view, 'Group A'));
    }
  }

  @IsTest
  static void onlyThisProgramsSchedulesCanBeTheStart() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      String message;
      try {
        ManualBuildController.startFromWeek(
          ids.get('Main'),
          ids.get('Week 2'),
          ids.get('Main')
        );
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      Test.stopTest();
      Assert.areEqual(
        'That schedule was not found, or you do not have access to it.',
        message
      );
    }
  }

  @IsTest
  static void aWeekdayTheNewWeekLacksIsListedNotDropped() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      // Week 2 starts on its Tuesday (a holiday Monday): it has no Monday.
      Week__c weekTwo = [
        SELECT Id, StartDate__c
        FROM Week__c
        WHERE Id = :ids.get('Week 2')
        WITH SYSTEM_MODE
      ];
      Database.update(
        new Week__c(Id = weekTwo.Id, StartDate__c = weekTwo.StartDate__c + 1),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      Id source = weekOneWithSwim(ids);
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        source
      );
      Test.stopTest();
      Assert.areEqual(
        new List<String>{ 'Monday: not in this week' },
        view.leftOut
      );
    }
  }
}
