/**
 * Generated Schedule's server side (ADR 0010, G2), as a scheduler with the Shoresh Scheduler
 * permission set: reading what the engine needs, the first save making the week's Generated
 * draft (beside Manual Build's, one per program and week, also when two people generate at
 * once), whole-week saves with the schedule-level revision check, and Rebuild and Start over
 * keeping a version first. What the server refuses: GeneratedRefusalsTest. Camp and helpers:
 * GeneratedTestData.
 */
@IsTest
private class GeneratedScheduleTest {
  @IsTest
  static void aWeekNotGeneratedYetReadsAsABlankWeekWithTheSeasonsRecords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();

      Assert.isNull(read.scheduleId);
      // The server's own Ids: the engine compares them exactly and seeds with them.
      Assert.areEqual(ids.get('Main'), read.programId);
      Assert.areEqual(ids.get('Week 1'), read.weekId);
      Assert.areEqual('', read.revision);
      Assert.isNull(read.option);
      // Main runs Monday to Thursday; Flagpole for everyone in Period 1, Rest for the Seniors
      // at Monday's Lunch, the rest Open.
      Assert.areEqual(4, read.days.size());
      ScheduleViews.DayView monday = read.days[0];
      Assert.areEqual(GeneratedTestData.MONDAY, monday.dateValue);
      Assert.areEqual(3, monday.groups.size());
      Assert.areEqual('F', monday.items[0].kind);
      Assert.areEqual(ids.get('Flagpole'), monday.items[0].id);
      Assert.areEqual('1,,', monday.rows[GeneratedTestData.GROUP_A]);
      Assert.areEqual('1,,2', monday.rows[GeneratedTestData.GROUP_C]);
      Assert.isTrue(read.notPlaced.isEmpty());
      // Reading saves nothing.
      Assert.areEqual(0, [SELECT COUNT() FROM Schedule__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void aGroupAwayThatWeekIsNotSentToTheEngine() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Test.startTest();
      // Group A is away in Week 3: the engine keeps a row of a group it isn't sent as it is.
      GeneratedInputs.Inputs read = GeneratedScheduleController.getInputs(
        ids.get('Main'),
        ids.get('Week 3')
      );
      Assert.areEqual(2, read.groups.size());
      Assert.areEqual(ids.get('Group B'), read.groups[0].Id);
      Assert.areEqual(2, read.days[0].groups.size());
    }
  }

  @IsTest
  static void aFixedActivityWhoseSlotIsTakenIsListedAsNotPlaced() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      // Saved around the clash check (as only a save that skips it could): two fixed
      // activities in Period 1.
      SetTimeGuard.defer();
      try {
        Database.insert(
          SetTimeTestData.fixed(ids, 'Assembly', 'Period 1'),
          AccessLevel.SYSTEM_MODE
        );
      } finally {
        SetTimeGuard.resume();
      }
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      // One of the two for each group on each of the four days.
      Assert.areEqual(12, read.notPlaced.size());
      Assert.isTrue(
        read.notPlaced[0].endsWith(' · Group A · Monday'),
        read.notPlaced[0]
      );
    }
  }

  @IsTest
  static void theInputsHoldTheSeasonsRecordsWithTheFieldsTheEngineReads() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Database.insert(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = ids.get('Week 1'),
            Activity__c = ids.get('Soccer')
          ),
          new WeekException__c(
            Week__c = ids.get('Week 2'),
            Activity__c = ids.get('Swim')
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      // A place no activity uses yet: the engine treats a place it isn't sent as having no limit.
      Location__c lodge = new Location__c(
        Season__c = ids.get('Season'),
        Name = 'Lodge',
        GroupsThatFit__c = 4
      );
      Database.insert(lodge, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();

      // The season's records, with the fields the engine reads.
      Assert.areEqual(3, read.activities.size());
      Activity__c swim = new Map<Id, Activity__c>(read.activities)
        .get(ids.get('Swim'));
      Assert.areEqual('Swim', swim.Name);
      Assert.areEqual(1, swim.Length__c);
      Assert.areEqual(1, swim.GroupsAtOnce__c);
      Assert.areEqual(2, swim.TimesPerWeekMax__c);
      Assert.areEqual(ids.get('Pool'), swim.Location__c);
      // Who each is set up for: Swim for Group A, Gym games for the Juniors.
      Set<String> who = new Set<String>();
      for (ActivityEligibility__c row : read.eligibilities) {
        who.add(row.Activity__c + '|' + row.Group__c + '|' + row.Division__c);
      }
      Assert.isTrue(
        who.contains(ids.get('Swim') + '|' + ids.get('Group A') + '|null'),
        String.valueOf(who)
      );
      Assert.isTrue(
        who.contains(ids.get('Gym games') + '|null|' + ids.get('Juniors')),
        String.valueOf(who)
      );
      // Every place of the season, with how many groups fit.
      Map<Id, Location__c> places = new Map<Id, Location__c>(read.locations);
      Assert.areEqual(4, places.size());
      Assert.areEqual(4, places.get(lodge.Id).GroupsThatFit__c);
      Assert.areEqual(1, places.get(ids.get('Pool')).GroupsThatFit__c);
      Assert.areEqual(3, read.groups.size());
      Assert.areEqual('AllDay', read.groups[0].Availability__c);
      Assert.areEqual(ids.get('Juniors'), read.groups[0].Division__c);
      Assert.isNotNull(read.groups[0].SortOrder__c);
      Assert.isNotNull(read.timeBlocks[0].SortOrder__c);
      Assert.areEqual(3, read.timeBlocks.size());
      Assert.areEqual(
        'Afternoon',
        read.timeBlocks[GeneratedTestData.LUNCH].PartOfDay__c
      );
      Assert.areEqual(ids.get('Flagpole'), read.fixedActivities[0].Id);
      Assert.areEqual(ids.get('Rest'), read.recurringActivities[0].Id);
      Assert.isNull(read.recurringActivities[0].Location__c);
      // Only this week's exceptions.
      Assert.areEqual(1, read.weekExceptions.size());
      Assert.areEqual(ids.get('Soccer'), read.weekExceptions[0].Activity__c);
    }
  }

  @IsTest
  static void everyRuleFieldTheEngineReadsIsSent() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      // An activity with every rule the engine reads set away from the hand-add values.
      Activity__c hike = ShoreshTestData.activity(
        ids.get('Season'),
        'Hike',
        ids.get('Field A')
      );
      hike.Priority__c = 'High';
      hike.NoWeeklyMax__c = true;
      hike.TimesPerWeekMax__c = null;
      hike.NoGroupLimit__c = true;
      hike.GroupsAtOnce__c = null;
      hike.SameDivisionOnly__c = true;
      hike.EarlyWeekCount__c = 1;
      hike.EarlyWeekByDay__c = 'Wednesday';
      hike.Length__c = 2;
      hike.TimesPerWeekMin__c = 3;
      hike.SortOrder__c = 7;
      Database.insert(hike, AccessLevel.SYSTEM_MODE);
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Activity__c readHike = new Map<Id, Activity__c>(read.activities)
        .get(hike.Id);
      Assert.areEqual('High', readHike.Priority__c);
      Assert.isTrue(readHike.NoWeeklyMax__c);
      Assert.isTrue(readHike.NoGroupLimit__c);
      Assert.isTrue(readHike.SameDivisionOnly__c);
      Assert.areEqual(1, readHike.EarlyWeekCount__c);
      Assert.areEqual('Wednesday', readHike.EarlyWeekByDay__c);
      Assert.areEqual(2, readHike.Length__c);
      Assert.areEqual(3, readHike.TimesPerWeekMin__c);
      Assert.areEqual(7, readHike.SortOrder__c);
    }
  }

  @IsTest
  static void theFirstGenerateMakesTheGeneratedDraftBesideManualBuild() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Test.startTest();
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      GeneratedWeek.Result result = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.GENERATE,
            3
          ),
          'Gym games'
        )
      );

      Assert.isFalse(result.conflict);
      Assert.isNull(result.versionId);
      Schedule__c draft = [
        SELECT Name, Status__c, Origin__c, EngineOption__c, VersionReason__c
        FROM Schedule__c
        WHERE Id = :result.scheduleId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Generated Schedule', draft.Name);
      Assert.areEqual('Draft', draft.Status__c);
      Assert.areEqual('Generated', draft.Origin__c);
      Assert.areEqual(3, draft.EngineOption__c);
      Assert.isNull(draft.VersionReason__c);
      // Two separate schedules (Greg, 2026-10-17); Manual Build's is untouched.
      Assert.areNotEqual(manualId, result.scheduleId);
      Assert.areEqual(
        manualId,
        ManualDrafts.find(ids.get('Main'), ids.get('Week 1')).Id
      );
      Assert.areEqual(
        new List<String>{ 'F:' + ids.get('Flagpole'), '', '' },
        GeneratedTestData.slots(manualId, GeneratedTestData.at(0, 0))
      );
      // A draft is not a version.
      Assert.areEqual(
        0,
        SchedulesController.getVersions(ids.get('Main'), ids.get('Week 1'))
          .size()
      );
      // Read again: the draft, what it was saved at, and its option.
      GeneratedInputs.Inputs again = GeneratedTestData.inputs();
      Assert.areEqual(result.scheduleId, again.scheduleId);
      Assert.areEqual(result.revision, again.revision);
      Assert.areEqual(
        '2026-06-29:1|2026-06-30:1|2026-07-01:1|2026-07-02:1',
        again.revision
      );
      Assert.areEqual(3, again.option);
      Assert.areEqual(
        new List<String>{
          'F:' + ids.get('Flagpole'),
          GeneratedTestData.a('Gym games'),
          'R:' + ids.get('Rest')
        },
        GeneratedTestData.slots(
          result.scheduleId,
          GeneratedTestData.at(0, GeneratedTestData.GROUP_C)
        )
      );
    }
  }

  @IsTest
  static void twoFirstGeneratesMakeOneDraftAndTheSecondHearsOfIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      // Two people open the week before either has generated it.
      GeneratedInputs.Inputs mine = GeneratedTestData.inputs();
      GeneratedInputs.Inputs theirs = GeneratedTestData.inputs();
      GeneratedWeek.Result first = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(theirs, GeneratedSaves.GENERATE, 1),
          'Gym games'
        )
      );
      // The second waits for the program's lock, then finds the first one's draft.
      GeneratedWeek.Result second = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(mine, GeneratedSaves.GENERATE, 1),
          'Soccer'
        )
      );

      Assert.isFalse(first.conflict);
      Assert.isTrue(second.conflict);
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, second.message);
      Assert.isNull(second.scheduleId);
      Assert.areEqual(1, GeneratedTestData.generatedDrafts());
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        GeneratedTestData.slots(first.scheduleId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
    }
  }

  @IsTest
  static void aSaveOverSomeoneElsesNewerSaveIsAConflictAndWritesNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.GENERATE,
            1
          ),
          'Gym games'
        )
      );
      Test.startTest();
      GeneratedInputs.Inputs mine = GeneratedTestData.inputs();
      GeneratedInputs.Inputs theirs = GeneratedTestData.inputs();
      GeneratedWeek.Result tried = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(theirs, GeneratedSaves.TRY_ANOTHER, 2),
          'Soccer'
        )
      );
      GeneratedWeek.Result late = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(mine, GeneratedSaves.REBUILD, 1),
          'Swim'
        )
      );

      Assert.isFalse(tried.conflict);
      Assert.isTrue(late.conflict);
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, late.message);
      // Theirs stands: their option, their cells, their revision; no version was kept.
      Schedule__c draft = [
        SELECT EngineOption__c
        FROM Schedule__c
        WHERE Id = :tried.scheduleId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(2, draft.EngineOption__c);
      Assert.areEqual(
        GeneratedTestData.a('Soccer'),
        GeneratedTestData.slots(tried.scheduleId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
      Assert.areEqual(tried.revision, GeneratedTestData.inputs().revision);
      // Only theirs kept a version (Before Try another); the refused one kept none.
      Assert.areEqual(1, GeneratedTestData.versions());
    }
  }

  /** The week generated with option 4, Gym games in every Period 2. */
  private static Id generatedWithOption4() {
    return GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.GENERATE,
            4
          ),
          'Gym games'
        )
      )
      .scheduleId;
  }

  /** A save of the week as it is now, with the activity in every Period 2. */
  private static GeneratedWeek.Result saveNow(
    String action,
    Integer option,
    String activity
  ) {
    GeneratedWeek.Save request = GeneratedTestData.request(
      GeneratedTestData.inputs(),
      action,
      option
    );
    return GeneratedTestData.save(
      activity == null ? request : GeneratedTestData.filled(request, activity)
    );
  }

  private static Schedule__c version(Id versionId) {
    return [
      SELECT
        Name,
        Status__c,
        Origin__c,
        VersionReason__c,
        SourceSchedule__c,
        EngineOption__c,
        Week__c
      FROM Schedule__c
      WHERE Id = :versionId
      WITH SYSTEM_MODE
    ];
  }

  @IsTest
  static void rebuildAndTryAnotherKeepTheWeekAsAVersionFirst() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = generatedWithOption4();
      Test.startTest();
      GeneratedWeek.Result rebuilt = saveNow(
        GeneratedSaves.REBUILD,
        4,
        'Soccer'
      );
      // Try another as on the desktop, which keeps one before every build that replaces a week.
      GeneratedWeek.Result tried = saveNow(
        GeneratedSaves.TRY_ANOTHER,
        5,
        'Gym games'
      );
      Schedule__c beforeRebuild = version(rebuilt.versionId);
      Assert.areEqual('Before Rebuild', beforeRebuild.Name);
      Assert.areEqual('Version', beforeRebuild.Status__c);
      Assert.areEqual('Generated', beforeRebuild.Origin__c);
      Assert.areEqual('AutoSaved', beforeRebuild.VersionReason__c);
      Assert.areEqual(draftId, beforeRebuild.SourceSchedule__c);
      Assert.areEqual(4, beforeRebuild.EngineOption__c);
      Assert.areEqual(ids.get('Week 1'), beforeRebuild.Week__c);
      // The version holds the week as it was before the rebuild, every day of it.
      Assert.areEqual(4, ScheduleDays.read(rebuilt.versionId).size());
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        GeneratedTestData.slots(
          rebuilt.versionId,
          GeneratedTestData.at(3, GeneratedTestData.GROUP_B)
        )[
          GeneratedTestData.PERIOD_2
        ]
      );
      Schedule__c beforeTry = version(tried.versionId);
      Assert.areEqual('Before Try another', beforeTry.Name);
      Assert.areEqual(4, beforeTry.EngineOption__c);
      Assert.areEqual(
        GeneratedTestData.a('Soccer'),
        GeneratedTestData.slots(tried.versionId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
      Assert.areEqual(
        2,
        SchedulesController.getVersions(ids.get('Main'), ids.get('Week 1'))
          .size()
      );
    }
  }

  @IsTest
  static void startOverKeepsAVersionAndFillTheOpenCellsDoesNot() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = generatedWithOption4();
      Test.startTest();
      // Fill the open cells only adds: nothing is replaced, so nothing is kept.
      GeneratedWeek.Result filledOpen = saveNow(
        GeneratedSaves.FILL_OPEN,
        4,
        null
      );
      GeneratedWeek.Result startedOver = saveNow(
        GeneratedSaves.START_OVER,
        6,
        'Swim'
      );
      Assert.isNull(filledOpen.versionId);
      Schedule__c beforeStartOver = version(startedOver.versionId);
      Assert.areEqual('Before Start over', beforeStartOver.Name);
      Assert.areEqual(4, beforeStartOver.EngineOption__c);
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        GeneratedTestData.slots(
          startedOver.versionId,
          GeneratedTestData.at(0, 0)
        )[
          GeneratedTestData.PERIOD_2
        ]
      );
      // The draft holds the newest week; the one version is listed.
      Assert.areEqual(draftId, startedOver.scheduleId);
      Assert.areEqual(
        GeneratedTestData.a('Swim'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
      Assert.areEqual(
        1,
        SchedulesController.getVersions(ids.get('Main'), ids.get('Week 1'))
          .size()
      );
    }
  }

  @IsTest
  static void namesComeFromSetupNotFromTheScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      GeneratedWeek.Save request = GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE,
        1
      );
      // A 15-character Id, another name, and an item number written "03".
      String shortId = String.valueOf(ids.get('Swim')).left(15);
      GeneratedTestData.put(
        request.days[0],
        GeneratedTestData.at(0, GeneratedTestData.PERIOD_2),
        GeneratedTestData.item('A', shortId, 'Something else')
      );
      GeneratedTestData.setCell(
        request.days[0],
        GeneratedTestData.at(0, GeneratedTestData.PERIOD_2),
        '03'
      );
      request.days[0].items[0].name = 'Not Flagpole';
      Test.startTest();
      Id draftId = GeneratedTestData.save(request).scheduleId;
      // Stored the one way: names from setup, the full Id, the plain number.
      ScheduleGrid monday = ScheduleDays.read(draftId)[0].grid;
      Assert.areEqual('Flagpole', monday.items[0].name);
      Assert.areEqual('Swim', monday.items[2].name);
      Assert.areEqual(String.valueOf(ids.get('Swim')), monday.items[2].id);
      Assert.areEqual('3', monday.rows[0][GeneratedTestData.PERIOD_2]);
    }
  }
}
