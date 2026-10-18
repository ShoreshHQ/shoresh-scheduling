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
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();

      Assert.isNull(read.scheduleId);
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
      // The season's records, with the fields the engine reads.
      Assert.areEqual(3, read.activities.size());
      Activity__c swim = read.activities[0];
      Assert.areEqual('Swim', swim.Name);
      Assert.areEqual(1, swim.Length__c);
      Assert.areEqual(1, swim.GroupsAtOnce__c);
      Assert.areEqual(2, swim.TimesPerWeekMax__c);
      Assert.areEqual(ids.get('Pool'), swim.Location__c);
      Assert.isFalse(read.eligibilities.isEmpty());
      Assert.areEqual(3, read.locations.size());
      Assert.areEqual(3, read.groups.size());
      Assert.areEqual('AllDay', read.groups[0].Availability__c);
      Assert.areEqual(3, read.timeBlocks.size());
      Assert.areEqual(
        'Afternoon',
        read.timeBlocks[GeneratedTestData.LUNCH].PartOfDay__c
      );
      Assert.areEqual(ids.get('Flagpole'), read.fixedActivities[0].Id);
      Assert.areEqual(ids.get('Rest'), read.recurringActivities[0].Id);
      // Only this week's exceptions.
      Assert.areEqual(1, read.weekExceptions.size());
      Assert.areEqual(ids.get('Soccer'), read.weekExceptions[0].Activity__c);
      // Reading saves nothing.
      Assert.areEqual(0, [SELECT COUNT() FROM Schedule__c WITH SYSTEM_MODE]);
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
      Test.stopTest();

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
      Test.stopTest();

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
      Test.stopTest();

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
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }

  @IsTest
  static void rebuildAndStartOverKeepTheWeekAsAVersionFirst() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.save(
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
      Test.startTest();
      GeneratedWeek.Result rebuilt = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.REBUILD,
            4
          ),
          'Soccer'
        )
      );
      GeneratedWeek.Result tried = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.TRY_ANOTHER,
            5
          ),
          'Gym games'
        )
      );
      GeneratedWeek.Result filledOpen = GeneratedTestData.save(
        GeneratedTestData.request(
          GeneratedTestData.inputs(),
          GeneratedSaves.FILL_OPEN,
          5
        )
      );
      GeneratedWeek.Result startedOver = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.START_OVER,
            6
          ),
          'Swim'
        )
      );
      Test.stopTest();

      // Try another and Fill the open cells keep no version.
      Assert.isNull(tried.versionId);
      Assert.isNull(filledOpen.versionId);
      Assert.isNotNull(rebuilt.versionId);
      Assert.isNotNull(startedOver.versionId);
      Schedule__c beforeRebuild = [
        SELECT
          Name,
          Status__c,
          Origin__c,
          VersionReason__c,
          SourceSchedule__c,
          EngineOption__c,
          Week__c
        FROM Schedule__c
        WHERE Id = :rebuilt.versionId
        WITH SYSTEM_MODE
      ];
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
      Schedule__c beforeStartOver = [
        SELECT Name, EngineOption__c
        FROM Schedule__c
        WHERE Id = :startedOver.versionId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Before Start over', beforeStartOver.Name);
      Assert.areEqual(5, beforeStartOver.EngineOption__c);
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        GeneratedTestData.slots(
          startedOver.versionId,
          GeneratedTestData.at(0, 0)
        )[
          GeneratedTestData.PERIOD_2
        ]
      );
      // The draft holds the newest week; both versions are listed.
      Assert.areEqual(draftId, startedOver.scheduleId);
      Assert.areEqual(
        GeneratedTestData.a('Swim'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
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
  static void namesComeFromSetupNotFromTheScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      GeneratedWeek.Save request = GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE,
        1
      );
      GeneratedTestData.put(
        request.days[0],
        GeneratedTestData.at(0, GeneratedTestData.PERIOD_2),
        GeneratedTestData.item('A', ids.get('Swim'), 'Something else')
      );
      request.days[0].items[0].name = 'Not Flagpole';
      Test.startTest();
      Id draftId = GeneratedTestData.save(request).scheduleId;
      Test.stopTest();
      ScheduleGrid monday = ScheduleDays.read(draftId)[0].grid;
      Assert.areEqual('Flagpole', monday.items[0].name);
      Assert.areEqual('Swim', monday.items[2].name);
    }
  }
}
