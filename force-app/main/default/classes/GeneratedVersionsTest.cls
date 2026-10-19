/**
 * Versions on Generated Schedule (ADR 0010 "Choices (Versions)"), as a scheduler with the Shoresh
 * Scheduler permission set, records made inside System.runAs: Manual Build's server path
 * (ManualVersions) with Generated's draft. Save version keeps the week's cells, locks and option;
 * Restore brings them back after keeping the week as "Before Restore", and is refused when the
 * week was saved since; the restored locks hold through a Rebuild; a Manual Build version can be
 * restored here; a version that was ever published is never deleted. Camp and helpers:
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
      Assert.isTrue(used <= 15, 'Save version used ' + used);
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

  @IsTest
  static void aManualBuildVersionCanBeRestoredHere() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      lockPeriod2(draftId, GeneratedWeek.LOCK);
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      Id manualVersion = ManualBuildController.saveVersion(manualId, 'By hand');
      String manualBefore = revisionNow(manualId);
      Boolean restored = GeneratedScheduleController.restoreVersion(
        draftId,
        manualVersion,
        revisionNow(draftId)
      );
      Test.stopTest();
      Assert.isTrue(restored);
      GeneratedInputs.Inputs after = GeneratedTestData.inputs();
      // Manual Build's week as it was saved (Flagpole only), with no lock: it has none.
      Assert.areEqual(
        GeneratedTestData.slots(manualVersion, GeneratedTestData.at(0, 0)),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))
      );
      Assert.isFalse(period2Locked(draftId));
      // A version with no option leaves the week's own.
      Assert.areEqual(1, after.option);
      // Manual Build's draft is untouched; Before Restore is a Generated version, with the lock.
      Assert.areEqual(manualBefore, revisionNow(manualId));
      Schedule__c keptFirst = beforeRestore()[0];
      Assert.areEqual('Generated', keptFirst.Origin__c);
      Assert.isTrue(period2Locked(keptFirst.Id));
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
