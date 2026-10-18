/**
 * Versions on Manual Build, as a scheduler with the Shoresh Scheduler permission set: Save
 * version, Restore (the draft kept first as "Before Restore") and Delete. Synthetic camp
 * (SetTimeTestData): Group A and Group B (Juniors), Group C (Seniors); Period 1, Period 2, Lunch;
 * Main runs Monday to Thursday.
 */
@IsTest
private class ManualVersionsTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  private static Map<String, Id> camp() {
    Map<String, Id> ids = SetTimeTestData.camp();
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    return ids;
  }

  private static Id startWeek(Map<String, Id> ids, String week) {
    return ManualBuildController.startBlankWeek(ids.get('Main'), ids.get(week))
      .schedule.schedule.id;
  }

  /** Puts an activity in Group A's Monday Period 2 (Open before). */
  private static void place(Map<String, Id> ids, Id draftId, String activity) {
    placeOver(ids, draftId, '', activity);
  }

  private static void placeOver(
    Map<String, Id> ids,
    Id draftId,
    String was,
    String activity
  ) {
    SlotEdits.Result result = ManualBuildController.saveSlots(
      draftId,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(MONDAY, ids.get('Group A'), ids.get('Period 2')),
          new List<String>{ was },
          new List<String>{ 'A:' + ids.get(activity) }
        )
      }
    );
    Assert.isTrue(result.conflicts.isEmpty());
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
      place(ids, draftId, 'Swim');
      Id versionId = ManualBuildController.saveVersion(
        draftId,
        '  Monday plan '
      );
      Test.stopTest();
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
      place(ids, draftId, 'Swim');
      Id versionId = ManualBuildController.saveVersion(draftId, 'With Swim');
      placeOver(ids, draftId, 'A:' + ids.get('Swim'), 'Gym games');
      ManualBuildViews.DraftView view = ManualBuildController.restoreVersion(
        draftId,
        versionId
      );
      Test.stopTest();
      Assert.areEqual(draftId, view.schedule.schedule.id);
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
        ManualBuildController.restoreVersion(draftId, otherVersion);
      } catch (AuraHandledException e) {
        otherWeek = e.getMessage();
      }
      try {
        ManualBuildController.restoreVersion(draftId, otherDraft);
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
}
