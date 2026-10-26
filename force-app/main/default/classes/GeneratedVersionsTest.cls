/**
 * Versions on Generated Schedule (ADR 0010 "Choices (Versions)"), as a scheduler with the Shoresh
 * Scheduler permission set, records made inside System.runAs: Manual Build's server path
 * (ManualVersions) with Generated's draft. Save version keeps the week's cells, locks and option;
 * Restore brings them back after keeping the week as "Before Restore", and is refused when the
 * week was saved since; the restored locks hold through a Rebuild; a Manual Build version can be
 * restored here, its placed cells locked (Greg, 2026-10-19); a week not generated yet can start
 * from a version; a version that was ever published is never deleted. Camp and helpers:
 * GeneratedTestData (Group A, Group B, Group C; Period 1 with Flagpole, Period 2 with Gym games
 * once generated, Lunch with Rest for Group C on Mondays).
 */
@IsTest
private class GeneratedVersionsTest {
  private static final String LOCKED_HERE = 'Group A · Monday · Period 2 is locked.';

  /** What the draft's days are saved at now, as a screen that just read them has it. */
  private static String revisionNow(Id draftId) {
    return GeneratedDrafts.revisionOf(ScheduleDays.read(draftId));
  }

  /** Lock or Unlock Group A's Monday Period 2, from a screen that has the week now. */
  private static void lockPeriod2(Id draftId, String action) {
    GeneratedWeek.LockChange change = new GeneratedWeek.LockChange();
    change.action = action;
    change.dateValue = GeneratedTestData.MONDAY;
    change.groupId = GeneratedTestData.ids.get('Group A');
    change.blockId = GeneratedTestData.ids.get('Period 2');
    GeneratedWeek.Locked locked = GeneratedScheduleController.setLocks(
      draftId,
      new List<GeneratedWeek.LockChange>{ change },
      revisionNow(draftId)
    );
    Assert.isFalse(locked.conflict);
  }

  private static Boolean period2Locked(Id scheduleId) {
    return ScheduleGridLocks.isLocked(
      ScheduleDays.read(scheduleId)[0].grid,
      GeneratedTestData.GROUP_A,
      GeneratedTestData.PERIOD_2
    );
  }

  /** Try another with that option: the activity in every group's Period 2. */
  private static void tryAnother(Integer option, String activity) {
    GeneratedWeek.Result result = GeneratedTestData.save(
      GeneratedTestData.filled(
        GeneratedTestData.request(
          GeneratedTestData.inputs(),
          GeneratedSaves.TRY_ANOTHER,
          option
        ),
        activity
      )
    );
    Assert.isFalse(result.conflict);
  }

  private static Schedule__c version(Id versionId) {
    return [
      SELECT
        Name,
        Status__c,
        Origin__c,
        VersionReason__c,
        SourceSchedule__c,
        EngineOption__c
      FROM Schedule__c
      WHERE Id = :versionId
      WITH SYSTEM_MODE
    ];
  }

  private static List<Schedule__c> beforeRestore() {
    return [
      SELECT Id, VersionReason__c, Origin__c, EngineOption__c
      FROM Schedule__c
      WHERE Status__c = 'Version' AND Name = :ManualVersions.BEFORE_RESTORE
      WITH SYSTEM_MODE
    ];
  }

  /** The sentence a call is refused with (each call 0 save, 1 restore, 2 delete), or null. */
  private static List<String> refusals(Id scheduleId, Id versionId) {
    List<String> messages = new List<String>();
    for (Integer call = 0; call < 3; call++) {
      try {
        if (call == 0) {
          GeneratedScheduleController.saveVersion(scheduleId, 'Mine');
        } else if (call == 1) {
          GeneratedScheduleController.restoreVersion(
            scheduleId,
            versionId,
            revisionNow(scheduleId)
          );
        } else {
          GeneratedScheduleController.deleteVersion(scheduleId, versionId);
        }
        messages.add(null);
      } catch (AuraHandledException e) {
        messages.add(e.getMessage());
      }
    }
    return messages;
  }

  @IsTest
  static void saveVersionKeepsTheWeekItsLocksAndItsOption() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      tryAnother(2, 'Soccer');
      lockPeriod2(draftId, GeneratedWeek.LOCK);
      Integer before = Limits.getQueries();
      Id versionId = GeneratedScheduleController.saveVersion(
        draftId,
        '  Before the trip  '
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(used <= 10, 'Save version used ' + used);
      Schedule__c saved = version(versionId);
      Assert.areEqual('Before the trip', saved.Name);
      Assert.areEqual('Version', saved.Status__c);
      Assert.areEqual('Generated', saved.Origin__c);
      Assert.areEqual(ManualVersions.SAVED_BY_HAND, saved.VersionReason__c);
      Assert.areEqual(draftId, saved.SourceSchedule__c);
      // The option the week was built with, so Restore can bring it back (ADR 0010 §17).
      Assert.areEqual(2, saved.EngineOption__c);
      Assert.areEqual(
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0)),
        GeneratedTestData.slots(versionId, GeneratedTestData.at(0, 0))
      );
      Assert.isTrue(period2Locked(versionId));
      // The week itself is unchanged by it.
      Assert.areEqual(2, GeneratedTestData.inputs().option);
    }
  }

  @IsTest
  static void restoreBringsBackTheVersionAsItWasAfterKeepingTheWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      // Saved with Gym games, option 1 and no lock; then the week moves on: option 3 puts Soccer
      // in every Period 2, and Group A's is locked.
      Id mine = GeneratedScheduleController.saveVersion(draftId, 'Mine');
      List<String> kept = GeneratedTestData.slots(
        draftId,
        GeneratedTestData.at(0, 0)
      );
      tryAnother(3, 'Soccer');
      lockPeriod2(draftId, GeneratedWeek.LOCK);
      List<String> soccer = GeneratedTestData.slots(
        draftId,
        GeneratedTestData.at(0, 0)
      );
      String seen = revisionNow(draftId);
      Integer before = Limits.getQueries();
      Boolean restored = GeneratedScheduleController.restoreVersion(
        draftId,
        mine,
        seen
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(restored);
      Assert.isTrue(used <= 20, 'Restore used ' + used);
      GeneratedInputs.Inputs after = GeneratedTestData.inputs();
      Assert.areNotEqual(kept, soccer);
      Assert.areEqual(
        kept,
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))
      );
      // The week is the version as it was: its option, and its locks (it had none; ADR 0010 §32).
      Assert.isFalse(period2Locked(draftId));
      Assert.areEqual(1, after.option);
      Assert.areNotEqual(seen, after.revision);
      // The week as it was is kept first, the way back: its cells, its lock and option 3.
      List<Schedule__c> keptFirst = beforeRestore();
      Assert.areEqual(1, keptFirst.size());
      Assert.areEqual(ManualVersions.AUTO_SAVED, keptFirst[0].VersionReason__c);
      Assert.areEqual('Generated', keptFirst[0].Origin__c);
      Assert.areEqual(3, keptFirst[0].EngineOption__c);
      Assert.areEqual(
        soccer,
        GeneratedTestData.slots(keptFirst[0].Id, GeneratedTestData.at(0, 0))
      );
      Assert.isTrue(period2Locked(keptFirst[0].Id));
      // Still the week's one Generated draft.
      Assert.areEqual(1, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void restoreIsRefusedWhenTheWeekWasSavedSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      Id mine = GeneratedScheduleController.saveVersion(draftId, 'Mine');
      String seen = revisionNow(draftId);
      // Someone else's Try another lands after this screen read the week.
      tryAnother(2, 'Soccer');
      String now = revisionNow(draftId);
      Integer versions = GeneratedTestData.versions();
      Boolean restored = GeneratedScheduleController.restoreVersion(
        draftId,
        mine,
        seen
      );
      Test.stopTest();
      Assert.isFalse(restored);
      // Nothing changed: their week stays, and no Before Restore was kept.
      Assert.areEqual(now, revisionNow(draftId));
      Assert.areEqual(2, GeneratedTestData.inputs().option);
      Assert.areEqual(versions, GeneratedTestData.versions());
      Assert.isTrue(beforeRestore().isEmpty());
    }
  }

  @IsTest
  static void aRestoredLockComesBackAndHoldsThroughARebuild() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      lockPeriod2(draftId, GeneratedWeek.LOCK);
      Id mine = GeneratedScheduleController.saveVersion(draftId, 'Mine');
      Test.startTest();
      lockPeriod2(draftId, GeneratedWeek.UNLOCK);
      Boolean restored = GeneratedScheduleController.restoreVersion(
        draftId,
        mine,
        revisionNow(draftId)
      );
      Boolean lockBack = period2Locked(draftId);
      String restoredAt = revisionNow(draftId);
      // A Rebuild on the restored week that changes the restored lock's cell: refused.
      String refusal = GeneratedTestData.refusal(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.REBUILD,
            1
          ),
          'Soccer'
        )
      );
      Test.stopTest();
      Assert.isTrue(restored);
      Assert.isTrue(lockBack);
      Assert.areEqual(LOCKED_HERE, refusal);
      Assert.areEqual(restoredAt, revisionNow(draftId));
    }
  }

  @IsTest
  static void aBuildFromTheWeekAsItWasBeforeARestoreIsAConflict() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      Id mine = GeneratedScheduleController.saveVersion(draftId, 'Mine');
      GeneratedInputs.Inputs beforeIt = GeneratedTestData.inputs();
      Assert.isTrue(
        GeneratedScheduleController.restoreVersion(
          draftId,
          mine,
          beforeIt.revision
        )
      );
      String restoredAt = revisionNow(draftId);
      // A Rebuild from a screen that read the week before the Restore writes nothing.
      GeneratedWeek.Result stale = GeneratedTestData.save(
        GeneratedTestData.request(beforeIt, GeneratedSaves.REBUILD, 1)
      );
      Test.stopTest();
      Assert.isTrue(stale.conflict);
      Assert.areEqual(restoredAt, revisionNow(draftId));
    }
  }

  private static Boolean lockedAt(Id scheduleId, Integer g, Integer b) {
    return ScheduleGridLocks.isLocked(
      ScheduleDays.read(scheduleId)[0].grid,
      g,
      b
    );
  }

  @IsTest
  static void aManualBuildVersionComesInWithItsPlacedCellsLocked() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      lockPeriod2(draftId, GeneratedWeek.LOCK);
      // Swim placed by hand in Group A's Monday Period 2; Group B's Period 2 left Open.
      Id manualVersion = manualVersionWithSwim(ids);
      Id manualId = version(manualVersion).SourceSchedule__c;
      String manualBefore = revisionNow(manualId);
      Boolean restored = GeneratedScheduleController.restoreVersion(
        draftId,
        manualVersion,
        revisionNow(draftId)
      );
      Test.stopTest();
      Assert.isTrue(restored);
      GeneratedInputs.Inputs after = GeneratedTestData.inputs();
      // Manual Build's week as it was saved.
      Assert.areEqual(
        GeneratedTestData.slots(manualVersion, GeneratedTestData.at(0, 0)),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))
      );
      Assert.areEqual(
        GeneratedTestData.a('Swim'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
      // A hand choice is a lock (Greg, 2026-10-19): the placed cell comes in locked, so a
      // Rebuild fills around it; an Open cell and a fixed or recurring activity do not.
      Assert.isTrue(period2Locked(draftId));
      Assert.isFalse(
        lockedAt(draftId, GeneratedTestData.GROUP_B, GeneratedTestData.PERIOD_2)
      );
      Assert.isFalse(
        lockedAt(draftId, GeneratedTestData.GROUP_A, GeneratedTestData.PERIOD_1)
      );
      Assert.isFalse(
        lockedAt(draftId, GeneratedTestData.GROUP_C, GeneratedTestData.LUNCH)
      );
      // The version itself is unchanged: Manual Build never locks.
      Assert.isFalse(period2Locked(manualVersion));
      // A version with no option leaves the week's own.
      Assert.areEqual(1, after.option);
      // Manual Build's draft is untouched; Before Restore is a Generated version, with the lock.
      Assert.areEqual(manualBefore, revisionNow(manualId));
      Schedule__c keptFirst = beforeRestore()[0];
      Assert.areEqual('Generated', keptFirst.Origin__c);
      Assert.isTrue(period2Locked(keptFirst.Id));
    }
  }

  /** Manual Build's Week 1 with Swim placed by hand in Group A's Monday Period 2, as a version. */
  private static Id manualVersionWithSwim(Map<String, Id> ids) {
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    Id manualId = ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      )
      .schedule.schedule.id;
    ManualBuildController.saveSlots(
      manualId,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            GeneratedTestData.MONDAY,
            ids.get('Group A'),
            ids.get('Period 2')
          ),
          new List<String>{ '' },
          new List<String>{ GeneratedTestData.a('Swim') }
        )
      }
    );
    return ManualBuildController.saveVersion(manualId, 'By hand');
  }

  @IsTest
  static void anImportedVersionComesInWithItsPlacedCellsLocked() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      // An imported week (Origin Imported): made by hand somewhere else, so not generated here.
      Id imported = manualVersionWithSwim(ids);
      update new Schedule__c(Id = imported, Origin__c = 'Imported');
      Boolean restored = GeneratedScheduleController.restoreVersion(
        draftId,
        imported,
        revisionNow(draftId)
      );
      Test.stopTest();
      Assert.isTrue(restored);
      // Its placed cell is a hand choice, so it comes in locked; its Open cell does not.
      Assert.isTrue(period2Locked(draftId));
      Assert.isFalse(
        lockedAt(draftId, GeneratedTestData.GROUP_B, GeneratedTestData.PERIOD_2)
      );
    }
  }

  @IsTest
  static void theWeekAsItWasImportedComesWithTheInputs() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      // An imported week (Origin Imported) with Swim in Group A's Monday Period 2, before the
      // week is generated (its blank week has the same days; setup plus a generated draft would
      // leave this test too few queries).
      Id imported = manualVersionWithSwim(ids);
      update new Schedule__c(
        Id = imported,
        Name = 'Week 1 as imported',
        Origin__c = 'Imported'
      );
      Test.startTest();
      Integer before = Limits.getQueries();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Integer withImport = Limits.getQueries() - before;
      // The same week with no import: the version saved by hand again (as its import's Undo may).
      ImportedWeekGuard.allow();
      update new Schedule__c(Id = imported, Origin__c = 'Manual');
      ImportedWeekGuard.done();
      before = Limits.getQueries();
      GeneratedInputs.Inputs none = GeneratedTestData.inputs();
      Integer withoutImport = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isNull(read.scheduleId);
      Assert.areEqual('Week 1 as imported', read.engine.imported.name);
      Assert.areEqual(read.days.size(), read.engine.imported.days.size());
      ScheduleViews.DayView monday = read.engine.imported.days[0];
      Assert.areEqual(GeneratedTestData.MONDAY, monday.dateValue);
      String cell = monday.rows[GeneratedTestData.GROUP_A]
        .split(',', -1)[GeneratedTestData.PERIOD_2];
      Integer swim = Integer.valueOf(cell);
      Assert.areEqual(ids.get('Swim'), monday.items[swim - 1].id);
      Assert.isNull(none.engine.imported);
      // The import costs at most one query more than the same week without it.
      Assert.isTrue(
        withImport - withoutImport <= 1,
        'With the import ' +
          withImport +
          ' queries, without it ' +
          withoutImport
      );
    }
  }

  @IsTest
  static void aWeekWithNoImportComesWithNone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      // A version saved by hand is not the imported week.
      manualVersionWithSwim(ids);
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Test.stopTest();
      Assert.isNull(read.engine.imported);
      Assert.isNull(read.scheduleId);
    }
  }

  @IsTest
  static void anOpenCellLockedToKeepItEmptyStaysLocked() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      // A Generated week with Group B's Period 2 locked empty, restored on Manual Build and
      // saved there again: a Manual Build version that carries that lock (ADR 0010 §32).
      Id manualVersion = manualVersionWithSwim(ids);
      ScheduleDays.DayGrid monday = ScheduleDays.read(manualVersion)[0];
      ScheduleGridLocks.lock(
        monday.grid,
        new List<Integer>{
          GeneratedTestData.GROUP_B,
          GeneratedTestData.PERIOD_2
        }
      );
      ScheduleDaySaves.write(
        manualVersion,
        new List<ScheduleDaySaves.DaySave>{
          new ScheduleDaySaves.DaySave(monday.day, monday.grid, monday.revision)
        }
      );
      Boolean restored = GeneratedScheduleController.restoreVersion(
        draftId,
        manualVersion,
        revisionNow(draftId)
      );
      Test.stopTest();
      Assert.isTrue(restored);
      // The placed cell comes in locked; the Open cell keeps its lock, so a Rebuild leaves it empty.
      Assert.isTrue(period2Locked(draftId));
      Assert.isTrue(
        lockedAt(draftId, GeneratedTestData.GROUP_B, GeneratedTestData.PERIOD_2)
      );
    }
  }

  @IsTest
  static void aWeekNotGeneratedYetCanStartFromAVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id manualVersion = manualVersionWithSwim(ids);
      Test.startTest();
      Integer before = Limits.getQueries();
      Boolean started = GeneratedScheduleController.restoreVersionAsNew(
        ids.get('Main'),
        ids.get('Week 1'),
        manualVersion
      );
      Integer used = Limits.getQueries() - before;
      // Once the week has its Generated Schedule, a second start is refused, nothing changed.
      String startedAt = GeneratedTestData.inputs().revision;
      Boolean again = GeneratedScheduleController.restoreVersionAsNew(
        ids.get('Main'),
        ids.get('Week 1'),
        manualVersion
      );
      Assert.isTrue(started);
      Assert.isFalse(again);
      Assert.isTrue(used <= 18, 'Restore on a new week used ' + used);
      GeneratedInputs.Inputs after = GeneratedTestData.inputs();
      Id draftId = after.scheduleId;
      Assert.isNotNull(draftId);
      Assert.areEqual(1, GeneratedTestData.generatedDrafts());
      Assert.areEqual(startedAt, after.revision);
      Assert.areEqual(
        GeneratedTestData.slots(manualVersion, GeneratedTestData.at(0, 0)),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))
      );
      // The hand-placed Swim is locked; the Open cell next to it is not. Nothing was kept first.
      Assert.isTrue(period2Locked(draftId));
      Assert.isFalse(
        lockedAt(draftId, GeneratedTestData.GROUP_B, GeneratedTestData.PERIOD_2)
      );
      Assert.areEqual(1, after.option);
      Assert.isTrue(beforeRestore().isEmpty());
      // Read inside the test's own limits: the camp and Manual Build's version used most before.
      Test.stopTest();
    }
  }

  @IsTest
  static void aVersionOfAnotherWeekStartsNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id manualVersion = manualVersionWithSwim(ids);
      Test.startTest();
      String refused;
      try {
        GeneratedScheduleController.restoreVersionAsNew(
          ids.get('Main'),
          ids.get('Week 2'),
          manualVersion
        );
      } catch (AuraHandledException e) {
        refused = e.getMessage();
      }
      Test.stopTest();
      Assert.isNotNull(refused);
      Assert.isTrue(
        refused.endsWith('was not found. It may have been deleted.'),
        refused
      );
      // The draft made for it is taken back.
      Assert.isNull(GeneratedDrafts.find(ids.get('Main'), ids.get('Week 2')));
    }
  }

  @IsTest
  static void aVersionGoesButOneEverPublishedIsKeptAsHistory() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      SchedulePublish.Preview first = GeneratedScheduleController.previewPublish(
        draftId
      );
      SchedulePublish.Result published = GeneratedScheduleController.publish(
        draftId,
        first.revisions,
        null
      );
      Test.startTest();
      // Unpublish keeps the copy as history, named by when it was published (as a replaced one).
      GeneratedScheduleController.unpublish(draftId, published.published.id);
      Id plain = GeneratedScheduleController.saveVersion(draftId, 'Plain');
      List<ScheduleViews.VersionRow> rows = SchedulesController.getVersions(
        GeneratedTestData.ids.get('Main'),
        GeneratedTestData.ids.get('Week 1')
      );
      ScheduleViews.VersionRow history;
      for (ScheduleViews.VersionRow row : rows) {
        history = row.publishedAt != null ? row : history;
      }
      String refused;
      try {
        GeneratedScheduleController.deleteVersion(draftId, history.id);
      } catch (AuraHandledException e) {
        refused = e.getMessage();
      }
      GeneratedScheduleController.deleteVersion(draftId, plain);
      // Rename works on it (only rename in Shoresh can change it).
      SchedulesController.renameSchedule(history.id, 'First publish');
      Test.stopTest();
      Assert.isTrue(history.name.startsWith('Published '), history.name);
      Assert.isTrue(history.namedByPublish);
      Assert.areEqual(
        '"' +
          history.name +
          '" was the published schedule, which is kept as history, so it can\'t be deleted.',
        refused
      );
      Assert.areEqual('First publish', version(history.id).Name);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Schedule__c WHERE Id = :plain WITH SYSTEM_MODE]
      );
    }
  }

  @IsTest
  static void aPublishedCopyRestoresWithTheOptionItWasBuiltWith() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      // Option 1, Gym games in Period 2, published.
      Id draftId = GeneratedTestData.generated();
      SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
        draftId
      );
      SchedulePublish.Result published = GeneratedScheduleController.publish(
        draftId,
        preview.revisions,
        null
      );
      Test.startTest();
      // Try another moves the week on to option 3; Unpublish keeps option 1's copy as history.
      tryAnother(3, 'Soccer');
      GeneratedScheduleController.unpublish(draftId, published.published.id);
      Id copyId = published.published.id;
      Boolean restored = GeneratedScheduleController.restoreVersion(
        draftId,
        copyId,
        revisionNow(draftId)
      );
      // Read before stopTest: publishing above (with the week's special days, ADR 0014 slice 5)
      // leaves the setup's own limits too little room.
      Decimal option = version(copyId).EngineOption__c;
      GeneratedInputs.Inputs after = GeneratedTestData.inputs();
      String period2 = GeneratedTestData.slots(
        draftId,
        GeneratedTestData.at(0, 0)
      )[
        GeneratedTestData.PERIOD_2
      ];
      Test.stopTest();
      Assert.isTrue(restored);
      Assert.areEqual(1, option);
      // The week takes the copy's option back with its cells (ADR 0010 §49, §50).
      Assert.areEqual(1, after.option);
      Assert.areEqual(GeneratedTestData.a('Gym games'), period2);
    }
  }

  @IsTest
  static void restoringTheCopyThatIsPublishedIsNotChangedSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
        draftId
      );
      GeneratedScheduleController.publish(draftId, preview.revisions, null);
      Test.startTest();
      Id asPublished = GeneratedScheduleController.saveVersion(
        draftId,
        'As published'
      );
      tryAnother(2, 'Soccer');
      GeneratedScheduleController.restoreVersion(
        draftId,
        asPublished,
        revisionNow(draftId)
      );
      GeneratedInputs.Inputs after = GeneratedTestData.inputs();
      // Publish after a Restore works from the restored week's revisions.
      SchedulePublish.Preview afterRestore = GeneratedScheduleController.previewPublish(
        draftId
      );
      Test.stopTest();
      Assert.isFalse(after.published.changedSince);
      Assert.areEqual(after.revision, afterRestore.revisions);
    }
  }

  @IsTest
  static void onlyThisWeeksGeneratedDraftCanUseIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Id mine = GeneratedScheduleController.saveVersion(draftId, 'Mine');
      Test.startTest();
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      List<String> fromManual = refusals(manualId, mine);
      List<String> fromVersion = refusals(mine, mine);
      Test.stopTest();
      String onlyHere = 'Only this week\'s Generated Schedule can be saved here. Reload the page.';
      String versionNot = 'A saved version can\'t be changed.';
      Assert.areEqual(
        new List<String>{ onlyHere, onlyHere, onlyHere },
        fromManual
      );
      Assert.areEqual(
        new List<String>{ versionNot, versionNot, versionNot },
        fromVersion
      );
      // Nothing was kept, restored or deleted.
      Assert.isTrue(beforeRestore().isEmpty());
      Assert.areEqual('Mine', version(mine).Name);
    }
  }
}
