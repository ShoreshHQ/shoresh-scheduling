/**
 * Versions on Manual Build, as a scheduler with the Shoresh Scheduler permission set: Save
 * version, Restore (the draft kept first as "Before Restore") and Delete. Synthetic camp
 * (SetTimeTestData): Group A and Group B (Juniors), Group C (Seniors); Period 1, Period 2, Lunch;
 * Main runs Monday to Thursday.
 */
@IsTest
private class ManualVersionsTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  // The test's camp (camp() sets it), for the helpers below.
  private static Map<String, Id> campIds;

  private static Map<String, Id> camp() {
    Map<String, Id> ids = SetTimeTestData.camp();
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    campIds = ids;
    return ids;
  }

  private static Id startWeek(Map<String, Id> ids, String week) {
    return ManualBuildController.startBlankWeek(ids.get('Main'), ids.get(week))
      .schedule.schedule.id;
  }

  /** Puts an activity in Group A's Monday Period 2 (Open before). */
  private static void place(Id draftId, String activity) {
    placeOver(draftId, '', activity);
  }

  private static void placeOver(Id draftId, String was, String activity) {
    SlotEdits.Result result = ManualBuildController.saveSlots(
      draftId,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            MONDAY,
            campIds.get('Group A'),
            campIds.get('Period 2')
          ),
          new List<String>{ was },
          new List<String>{ 'A:' + campIds.get(activity) }
        )
      }
    );
    Assert.isTrue(result.conflicts.isEmpty());
  }

  /** The draft's revisions as a screen opened now would send them back with Restore. */
  private static String seen(Id draftId) {
    return ScheduleViews.open(draftId).revisions;
  }

  /** Restore as the screen does it, having just read the week. */
  private static ManualBuildViews.DraftView restore(Id draftId, Id versionId) {
    return ManualBuildController.restoreVersion(
      draftId,
      versionId,
      seen(draftId)
    );
  }

  private static Integer beforeRestoreCount() {
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE Name = 'Before Restore'
      WITH SYSTEM_MODE
    ];
  }

  /** What Group A's Monday Period 2 holds in a schedule ('' Open, else the item's name). */
  private static String mondayPeriod2(Id scheduleId) {
    ScheduleViews.DayView day = ScheduleViews.open(scheduleId).days[0];
    Integer g = 0;
    for (Integer i = 0; i < day.groups.size(); i++) {
      if (day.groups[i].name == 'Group A') {
        g = i;
      }
    }
    String token = day.rows[g].split(',', -1)[1];
    return String.isBlank(token)
      ? ''
      : day.items[Integer.valueOf(token) - 1].name;
  }

  @IsTest
  static void saveVersionKeepsTheDraftAsItIsUnderAName() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      place(draftId, 'Swim');
      Integer queriesBefore = Limits.getQueries();
      Id versionId = ManualBuildController.saveVersion(
        draftId,
        '  Monday plan '
      );
      Integer queries = Limits.getQueries() - queriesBefore;
      Test.stopTest();
      Assert.isTrue(queries <= 25, 'Save version used ' + queries + ' queries');
      Schedule__c version = [
        SELECT
          Name,
          Status__c,
          Origin__c,
          VersionReason__c,
          SourceSchedule__c,
          Week__c
        FROM Schedule__c
        WHERE Id = :versionId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Monday plan', version.Name);
      Assert.areEqual('Version', version.Status__c);
      Assert.areEqual('Manual', version.Origin__c);
      Assert.areEqual('SavedByHand', version.VersionReason__c);
      Assert.areEqual(draftId, version.SourceSchedule__c);
      Assert.areEqual(ids.get('Week 1'), version.Week__c);
      Assert.areEqual('Swim', mondayPeriod2(versionId));
      // It is in the week's Versions list.
      Assert.areEqual(
        versionId,
        SchedulesController.getVersions(ids.get('Main'), ids.get('Week 1'))[0]
          .id
      );
    }
  }

  @IsTest
  static void aVersionNeedsAName() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      String message;
      try {
        ManualBuildController.saveVersion(draftId, '   ');
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      Test.stopTest();
      Assert.isTrue(message.startsWith('Give the '), message);
    }
  }

  @IsTest
  static void restoreCopiesTheVersionInAfterKeepingTheDraftAsBeforeRestore() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      place(draftId, 'Swim');
      Id versionId = ManualBuildController.saveVersion(draftId, 'With Swim');
      placeOver(draftId, 'A:' + ids.get('Swim'), 'Gym games');
      String seenRevisions = seen(draftId);
      Integer queriesBefore = Limits.getQueries();
      ManualBuildViews.DraftView view = ManualBuildController.restoreVersion(
        draftId,
        versionId,
        seenRevisions
      );
      // A fixed number of queries, whatever the size of the week: well under 100.
      Integer queries = Limits.getQueries() - queriesBefore;
      Test.stopTest();
      Assert.isTrue(queries <= 50, 'Restore used ' + queries + ' queries');
      Assert.areEqual(draftId, view.schedule.schedule.id);
      Assert.isFalse(view.changedSince);
      Assert.areEqual('Swim', mondayPeriod2(draftId));
      Schedule__c kept = [
        SELECT Id, Name, VersionReason__c, Origin__c
        FROM Schedule__c
        WHERE Name = 'Before Restore'
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('AutoSaved', kept.VersionReason__c);
      Assert.areEqual('Manual', kept.Origin__c);
      Assert.areEqual('Gym games', mondayPeriod2(kept.Id));
      // The version itself is unchanged, and the draft is still the draft.
      Assert.areEqual('Swim', mondayPeriod2(versionId));
      Assert.areEqual(
        'Draft',
        [SELECT Status__c FROM Schedule__c WHERE Id = :draftId WITH SYSTEM_MODE]
        .Status__c
      );
    }
  }

  @IsTest
  static void restoreTakesOnlyAVersionOfTheSameWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      Id otherDraft = startWeek(ids, 'Week 2');
      Id otherVersion = ManualBuildController.saveVersion(
        otherDraft,
        'Week 2 plan'
      );
      String otherWeek;
      String notAVersion;
      try {
        restore(draftId, otherVersion);
      } catch (AuraHandledException e) {
        otherWeek = e.getMessage();
      }
      try {
        restore(draftId, otherDraft);
      } catch (AuraHandledException e) {
        notAVersion = e.getMessage();
      }
      Test.stopTest();
      Assert.isTrue(
        otherWeek.endsWith('was not found. It may have been deleted.'),
        otherWeek
      );
      Assert.isTrue(
        notAVersion.endsWith('was not found. It may have been deleted.'),
        notAVersion
      );
      // Nothing was kept or changed.
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Name = 'Before Restore'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void deleteTakesAVersionAwayButNeverTheDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      Id versionId = ManualBuildController.saveVersion(draftId, 'To delete');
      ManualBuildController.deleteVersion(draftId, versionId);
      String refused;
      try {
        ManualBuildController.deleteVersion(draftId, draftId);
      } catch (AuraHandledException e) {
        refused = e.getMessage();
      }
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Schedule__c WHERE Id = :versionId WITH SYSTEM_MODE]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM ScheduleDay__c
          WHERE Schedule__c = :versionId
          WITH SYSTEM_MODE
        ]
      );
      Assert.isNotNull(refused);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Schedule__c WHERE Id = :draftId WITH SYSTEM_MODE]
      );
    }
  }

  @IsTest
  static void restoreRefusesAWeekSomeoneChangedSinceItWasRead() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      Id versionId = ManualBuildController.saveVersion(draftId, 'Empty');
      // The director's screen reads the week; then someone else places Swim.
      String seenRevisions = seen(draftId);
      place(draftId, 'Swim');
      ManualBuildViews.DraftView view = ManualBuildController.restoreVersion(
        draftId,
        versionId,
        seenRevisions
      );
      Test.stopTest();
      Assert.isTrue(view.changedSince);
      Assert.isNull(view.schedule);
      // Their Swim stands; nothing was kept or restored.
      Assert.areEqual('Swim', mondayPeriod2(draftId));
      Assert.areEqual(0, beforeRestoreCount());
    }
  }

  @IsTest
  static void aDayTheVersionLacksGoesFromTheDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      Id versionId = ManualBuildController.saveVersion(draftId, 'Short');
      Database.delete(
        [
          SELECT Id
          FROM ScheduleDay__c
          WHERE Schedule__c = :versionId AND Date__c = :MONDAY + 3
          WITH SYSTEM_MODE
        ],
        AccessLevel.SYSTEM_MODE
      );
      restore(draftId, versionId);
      Test.stopTest();
      List<ScheduleDays.DayGrid> days = ScheduleDays.read(draftId);
      Assert.areEqual(3, days.size());
      Assert.areEqual(MONDAY + 2, days[2].day);
      // The draft as it was (four days) is kept.
      Id kept = [
        SELECT Id
        FROM Schedule__c
        WHERE Name = 'Before Restore'
        WITH SYSTEM_MODE
      ]
      .Id;
      Assert.areEqual(4, ScheduleDays.read(kept).size());
    }
  }

  @IsTest
  static void restoreTakesOnlyThisProgramsVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Program__c other = ShoreshTestData.program(ids.get('Season'), 'Other');
      Schedule__c otherVersion = ShoreshTestData.version(
        other.Id,
        ids.get('Week 1'),
        'Other plan'
      );
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      String message;
      try {
        restore(draftId, otherVersion.Id);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      Test.stopTest();
      Assert.isTrue(
        message.endsWith('was not found. It may have been deleted.'),
        message
      );
      Assert.areEqual(0, beforeRestoreCount());
    }
  }

  @IsTest
  static void aVersionWithADayThatCantBeReadIsRefusedAndNothingChanges() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      Id versionId = ManualBuildController.saveVersion(draftId, 'Broken');
      place(draftId, 'Swim');
      Database.update(
        new ScheduleDay__c(
          Id = [
            SELECT Id
            FROM ScheduleDay__c
            WHERE Schedule__c = :versionId AND Date__c = :MONDAY
            WITH SYSTEM_MODE
          ]
          .Id,
          GridFormatVersion__c = 999
        ),
        AccessLevel.SYSTEM_MODE
      );
      String message;
      try {
        restore(draftId, versionId);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      Test.stopTest();
      Assert.isTrue(message.startsWith('A day could not be read ('), message);
      Assert.areEqual('Swim', mondayPeriod2(draftId));
      Assert.areEqual(0, beforeRestoreCount());
    }
  }

  @IsTest
  static void aDraftWithNoDaysIsRestoredWithoutKeepingAnything() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      Id draftId = startWeek(ids, 'Week 1');
      Id versionId = ManualBuildController.saveVersion(draftId, 'Full');
      Database.delete(
        [
          SELECT Id
          FROM ScheduleDay__c
          WHERE Schedule__c = :draftId
          WITH SYSTEM_MODE
        ],
        AccessLevel.SYSTEM_MODE
      );
      restore(draftId, versionId);
      Test.stopTest();
      Assert.areEqual(4, ScheduleDays.read(draftId).size());
      Assert.areEqual(0, beforeRestoreCount());
    }
  }
}
