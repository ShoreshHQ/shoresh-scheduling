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
    // The clash check runs once, at the end, as a screen save does (SetTimeGuard), not after
    // every insert: the setup leaves the test its queries.
    SetTimeGuard.defer();
    Map<String, Id> ids;
    try {
      ids = SetTimeTestData.camp();
      SetTimeGuard.checkPending();
    } finally {
      SetTimeGuard.resume();
    }
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

  /** One edit (SlotRunsTestData.edit) saved in a draft, with no conflict. */
  private static void put(Id draftId, SlotEdits.Edit edit) {
    putAll(draftId, new List<SlotEdits.Edit>{ edit });
  }

  /** Several edits saved in a draft at once, with no conflict. */
  private static void putAll(Id draftId, List<SlotEdits.Edit> edits) {
    SlotEdits.Result result = ManualBuildController.saveSlots(draftId, edits);
    Assert.isTrue(result.conflicts.isEmpty());
  }

  /** A group's Monday row as stored: tokens per block ('' Open, '^' carrying on). */
  private static List<String> mondayRow(
    ManualBuildViews.DraftView view,
    String groupName
  ) {
    ScheduleViews.DayView day = view.schedule.days[0];
    for (Integer g = 0; g < day.groups.size(); g++) {
      if (day.groups[g].name == groupName) {
        return day.rows[g].split(',', -1);
      }
    }
    return null;
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
      Id source = weekOneWithSwim(ids);
      Test.startTest();
      Integer queriesBefore = Limits.getQueries();
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        source
      );
      // A fixed number of queries, whatever the size of the camp (nothing is read per day,
      // group or placement), under the limit of 100 with room to spare.
      Integer queries = Limits.getQueries() - queriesBefore;
      Test.stopTest();
      Assert.isTrue(
        queries <= 70,
        'Start from another week used ' + queries + ' queries'
      );
      Assert.areEqual('Swim', mondayPeriod2(view, 'Group A'));
      Assert.areEqual('', mondayPeriod2(view, 'Group B'));
      Assert.isTrue(view.leftOut.isEmpty(), String.join(view.leftOut, '; '));
      Assert.isFalse(view.startedBySomeoneElse);
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
      // The screen says someone else started it, rather than claim a copy.
      Assert.isTrue(view.startedBySomeoneElse);
      Assert.isTrue(view.leftOut.isEmpty());
    }
  }

  @IsTest
  static void onlyThisProgramsManualBuildOrVersionsCanBeTheStart() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Program__c other = ShoreshTestData.program(ids.get('Season'), 'Other');
      Schedule__c otherVersion = ShoreshTestData.version(
        other.Id,
        ids.get('Week 1'),
        'Other plan'
      );
      Schedule__c generated = new Schedule__c(
        Program__c = ids.get('Main'),
        Week__c = ids.get('Week 1'),
        Name = 'Generated Schedule',
        Status__c = ManualDrafts.DRAFT,
        Origin__c = 'Generated'
      );
      Database.insert(generated, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      List<String> messages = new List<String>();
      for (
        Id sourceId : new List<Id>{
          ids.get('Main'),
          otherVersion.Id,
          generated.Id
        }
      ) {
        try {
          ManualBuildController.startFromWeek(
            ids.get('Main'),
            ids.get('Week 2'),
            sourceId
          );
          messages.add('started');
        } catch (AuraHandledException e) {
          messages.add(e.getMessage());
        }
      }
      Test.stopTest();
      String refused = 'That schedule was not found, or you do not have access to it.';
      Assert.areEqual(new List<String>{ refused, refused, refused }, messages);
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Week__c = :ids.get('Week 2')
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void theListOffersOtherWeeksManualBuildAndVersionsOnly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Database.insert(
        new Schedule__c(
          Program__c = ids.get('Main'),
          Week__c = ids.get('Week 1'),
          Name = 'Generated Schedule',
          Status__c = ManualDrafts.DRAFT,
          Origin__c = 'Generated'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      Id weekOne = weekOneWithSwim(ids);
      Id weekTwo = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 2')
        )
        .schedule.schedule.id;
      Id weekTwoVersion = ManualBuildController.saveVersion(weekTwo, 'Plan');
      List<ManualBuildViews.WeekSource> sources = ManualBuildController.getWeekSources(
        ids.get('Main'),
        ids.get('Week 2')
      );
      Test.stopTest();
      Set<Id> offered = new Set<Id>();
      for (ManualBuildViews.WeekSource source : sources) {
        offered.add(source.id);
      }
      // Week 1's Manual Build and this week's version; not this week's own draft, nor a
      // Generated draft.
      Assert.areEqual(new Set<Id>{ weekOne, weekTwoVersion }, offered);
    }
  }

  @IsTest
  static void aPlacementRunningSeveralBlocksIsCopiedWhole() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id source = weekOneWithSwim(ids);
      // The rest of the setup shares the start's queries (the camp and Week 1 had theirs).
      Test.startTest();
      String soccer = 'A:' + ids.get('Soccer');
      put(
        source,
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            WEEK_1_MONDAY,
            ids.get('Group B'),
            ids.get('Period 2')
          ),
          new List<String>{ '', '' },
          new List<String>{ soccer, '^' + soccer }
        )
      );
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        source
      );
      Test.stopTest();
      List<String> row = mondayRow(view, 'Group B');
      Assert.areEqual('Soccer', mondayPeriod2(view, 'Group B'));
      Assert.areEqual('^', row[2]);
      Assert.isTrue(view.leftOut.isEmpty(), String.join(view.leftOut, '; '));
    }
  }

  @IsTest
  static void whatIsAlreadyThereOrAwayThenOrDeletedIsListed() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id source = weekOneWithSwim(ids);
      // The rest of the setup shares the start's queries (the camp and Week 1 had theirs).
      Test.startTest();
      String soccer = 'A:' + ids.get('Soccer');
      String gym = 'A:' + ids.get('Gym games');
      // Group B: Soccer at Lunch; Group C: Gym games in Period 2.
      putAll(
        source,
        new List<SlotEdits.Edit>{
          SlotRunsTestData.edit(
            SlotRunsTestData.at(
              WEEK_1_MONDAY,
              ids.get('Group B'),
              ids.get('Lunch')
            ),
            new List<String>{ '' },
            new List<String>{ soccer }
          ),
          SlotRunsTestData.edit(
            SlotRunsTestData.at(
              WEEK_1_MONDAY,
              ids.get('Group C'),
              ids.get('Period 2')
            ),
            new List<String>{ '' },
            new List<String>{ gym }
          )
        }
      );
      // Since then: Group B comes mornings only, Swim was deleted from setup, and a fixed
      // activity (every group) fills Period 2.
      Database.update(
        new Group__c(Id = ids.get('Group B'), Availability__c = 'MorningOnly'),
        AccessLevel.SYSTEM_MODE
      );
      Database.delete(ids.get('Swim'), AccessLevel.SYSTEM_MODE);
      FixedActivity__c assembly = SetTimeTestData.fixed(
        ids,
        'Assembly',
        'Period 2'
      );
      // Saved around the clash check (it clashes with nothing; the check's queries are the
      // setup's, not the start's).
      SetTimeGuard.defer();
      try {
        Database.insert(assembly, AccessLevel.SYSTEM_MODE);
      } finally {
        SetTimeGuard.resume();
      }
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        source
      );
      Test.stopTest();
      Set<String> lines = new Set<String>(view.leftOut);
      Assert.isTrue(
        lines.contains('Swim · Group A · Monday: deleted from setup'),
        String.join(view.leftOut, '; ')
      );
      Assert.isTrue(
        lines.contains('Soccer · Group B · Monday: not at camp then'),
        String.join(view.leftOut, '; ')
      );
      Assert.isTrue(
        lines.contains('Gym games · Group C · Monday: Assembly is there'),
        String.join(view.leftOut, '; ')
      );
    }
  }

  @IsTest
  static void aDayThatCantBeReadIsListed() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id source = weekOneWithSwim(ids);
      Database.update(
        new ScheduleDay__c(
          Id = [
            SELECT Id
            FROM ScheduleDay__c
            WHERE Schedule__c = :source AND Date__c = :WEEK_1_MONDAY + 1
            WITH SYSTEM_MODE
          ]
          .Id,
          GridFormatVersion__c = 999
        ),
        AccessLevel.SYSTEM_MODE
      );
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        source
      );
      Test.stopTest();
      Assert.areEqual(1, view.leftOut.size(), String.join(view.leftOut, '; '));
      Assert.isTrue(
        view.leftOut[0].startsWith('Tuesday: could not be read ('),
        view.leftOut[0]
      );
      // The days that could be read are copied.
      Assert.areEqual('Swim', mondayPeriod2(view, 'Group A'));
    }
  }

  @IsTest
  static void aSecondMondayIsMatchedByPlaceOrListed() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      // Week 1 runs two weeks (a camp whose session is two weeks): it has two Mondays.
      Database.update(
        new Week__c(Id = ids.get('Week 1'), EndDate__c = WEEK_1_MONDAY + 10),
        AccessLevel.SYSTEM_MODE
      );
      Id source = weekOneWithSwim(ids);
      // The rest of the setup shares the start's queries (the camp and Week 1 had theirs).
      Test.startTest();
      put(
        source,
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            WEEK_1_MONDAY + 7,
            ids.get('Group A'),
            ids.get('Period 2')
          ),
          new List<String>{ '' },
          new List<String>{ 'A:' + ids.get('Soccer') }
        )
      );
      ManualBuildViews.DraftView view = ManualBuildController.startFromWeek(
        ids.get('Main'),
        ids.get('Week 2'),
        source
      );
      Test.stopTest();
      // Week 2's one Monday is the first Monday's; the second Monday is listed, not dropped.
      Assert.areEqual('Swim', mondayPeriod2(view, 'Group A'));
      Assert.areEqual(1, view.leftOut.size(), String.join(view.leftOut, '; '));
      Assert.isTrue(
        view.leftOut[0].startsWith('Monday ') &&
        view.leftOut[0].endsWith(': not in this week'),
        view.leftOut[0]
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
