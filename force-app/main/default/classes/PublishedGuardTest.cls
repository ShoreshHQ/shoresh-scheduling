/**
 * Published history is kept at the data level, not only on Shoresh's screens: a scheduler (or an
 * admin, through the API) can't change or delete a published schedule, one kept as history, or
 * their days directly, nor make a schedule published other than by Publish. Drafts and other
 * versions stay as editable as before. Synthetic camp (SetTimeTestData), as a scheduler with the
 * Shoresh Scheduler permission set.
 */
@IsTest
private class PublishedGuardTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  private static Map<String, Id> camp() {
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

  private static Id startWeek(Map<String, Id> ids) {
    return ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      )
      .schedule.schedule.id;
  }

  private static Id publishNow(Id draftId) {
    SchedulePublish.Preview preview = ManualBuildController.previewPublish(
      draftId
    );
    return ManualBuildController.publish(
        draftId,
        preview.revisions,
        preview.published == null ? null : preview.published.id
      )
      .published.id;
  }

  private static String refusal(Database.SaveResult result) {
    Assert.isFalse(result.isSuccess(), 'It was saved');
    return result.getErrors()[0].getMessage();
  }

  private static String refusal(Database.DeleteResult result) {
    Assert.isFalse(result.isSuccess(), 'It was deleted');
    return result.getErrors()[0].getMessage();
  }

  private static Schedule__c reread(Id scheduleId) {
    return [
      SELECT Id, Name, Status__c, PublishedAt__c, PublishKey__c
      FROM Schedule__c
      WHERE Id = :scheduleId
      WITH SYSTEM_MODE
    ];
  }

  private static List<ScheduleDay__c> daysOf(Id scheduleId) {
    return [
      SELECT Id, Grid__c, Revision__c
      FROM ScheduleDay__c
      WHERE Schedule__c = :scheduleId
      WITH SYSTEM_MODE
      ORDER BY Date__c
    ];
  }

  @IsTest
  static void thePublishedScheduleCantBeChangedOrDeletedDirectly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id publishedId = publishNow(startWeek(ids));
      Datetime publishedAt = reread(publishedId).PublishedAt__c;
      Test.startTest();
      Database.SaveResult renamed = Database.update(
        new Schedule__c(Id = publishedId, Name = 'Edited'),
        false,
        AccessLevel.USER_MODE
      );
      Database.SaveResult redated = Database.update(
        new Schedule__c(
          Id = publishedId,
          PublishedAt__c = Datetime.now().addDays(-7)
        ),
        false,
        AccessLevel.USER_MODE
      );
      Database.DeleteResult deleted = Database.delete(
        publishedId,
        false,
        AccessLevel.USER_MODE
      );
      Test.stopTest();
      Assert.areEqual(
        '"Published schedule" is the published schedule, which is kept as history, so only Publish, Unpublish and rename in Shoresh can change it.',
        refusal(renamed)
      );
      refusal(redated);
      Assert.areEqual(
        '"Published schedule" is the published schedule, which is kept as history, so it can\'t be deleted.',
        refusal(deleted)
      );
      Schedule__c kept = reread(publishedId);
      Assert.areEqual('Published schedule', kept.Name);
      Assert.areEqual('Published', kept.Status__c);
      Assert.areEqual(publishedAt, kept.PublishedAt__c);
    }
  }

  @IsTest
  static void oneKeptAsHistoryCantBeChangedOrDeletedDirectlyEvenByAnAdmin() {
    Id historyId;
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      historyId = publishNow(draftId);
      ManualBuildController.unpublish(draftId, historyId);
    }
    Test.startTest();
    // System mode (an admin through the API, or Apex) is refused the same way.
    Database.SaveResult cleared = Database.update(
      new Schedule__c(Id = historyId, PublishedAt__c = null),
      false,
      AccessLevel.SYSTEM_MODE
    );
    Database.DeleteResult deleted = Database.delete(
      historyId,
      false,
      AccessLevel.SYSTEM_MODE
    );
    Test.stopTest();
    Assert.areEqual(
      '"Published schedule" was the published schedule, which is kept as history, so only Publish, Unpublish and rename in Shoresh can change it.',
      refusal(cleared)
    );
    Assert.areEqual(
      '"Published schedule" was the published schedule, which is kept as history, so it can\'t be deleted.',
      refusal(deleted)
    );
    Assert.isNotNull(reread(historyId).PublishedAt__c);
  }

  @IsTest
  static void itsDaysCantBeChangedAddedOrDeletedDirectly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id publishedId = publishNow(startWeek(ids));
      List<ScheduleDay__c> before = daysOf(publishedId);
      Test.startTest();
      Database.SaveResult changed = Database.update(
        new ScheduleDay__c(Id = before[0].Id, Revision__c = 99),
        false,
        AccessLevel.USER_MODE
      );
      Database.DeleteResult deleted = Database.delete(
        before[0].Id,
        false,
        AccessLevel.USER_MODE
      );
      Database.SaveResult added = Database.insert(
        new ScheduleDay__c(
          Schedule__c = publishedId,
          Date__c = MONDAY.addDays(4),
          Part__c = 1,
          Revision__c = 1,
          GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION,
          Grid__c = before[0].Grid__c
        ),
        false,
        AccessLevel.USER_MODE
      );
      Test.stopTest();
      String message = '"Published schedule" is the published schedule, which is kept as history, so its days can\'t be changed.';
      Assert.areEqual(message, refusal(changed));
      Assert.areEqual(message, refusal(deleted));
      Assert.areEqual(message, refusal(added));
      List<ScheduleDay__c> after = daysOf(publishedId);
      Assert.areEqual(before.size(), after.size());
      Assert.areEqual(before[0].Revision__c, after[0].Revision__c);
    }
  }

  @IsTest
  static void aScheduleIsMadePublishedOnlyByPublish() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      Id versionId = ManualBuildController.saveVersion(draftId, 'Kept');
      Test.startTest();
      Database.SaveResult made = Database.insert(
        new Schedule__c(
          Program__c = ids.get('Main'),
          Week__c = ids.get('Week 1'),
          Name = 'Mine',
          Status__c = 'Published',
          Origin__c = 'Manual'
        ),
        false,
        AccessLevel.USER_MODE
      );
      Database.SaveResult draftMade = Database.update(
        new Schedule__c(Id = draftId, Status__c = 'Published'),
        false,
        AccessLevel.USER_MODE
      );
      Database.SaveResult versionDated = Database.update(
        new Schedule__c(Id = versionId, PublishedAt__c = Datetime.now()),
        false,
        AccessLevel.USER_MODE
      );
      Test.stopTest();
      String message = 'Only Publish in Shoresh can make the published schedule.';
      Assert.areEqual(message, refusal(made));
      Assert.areEqual(message, refusal(draftMade));
      Assert.areEqual(message, refusal(versionDated));
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Status__c = 'Published' OR PublishedAt__c != NULL
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void draftsAndOtherVersionsStayEditableDirectly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      Id versionId = ManualBuildController.saveVersion(draftId, 'Kept');
      publishNow(draftId);
      List<ScheduleDay__c> draftDays = daysOf(draftId);
      Test.startTest();
      Database.SaveResult renamed = Database.update(
        new Schedule__c(Id = versionId, Name = 'Renamed'),
        false,
        AccessLevel.USER_MODE
      );
      Database.SaveResult dayChanged = Database.update(
        new ScheduleDay__c(Id = draftDays[0].Id, Revision__c = 5),
        false,
        AccessLevel.USER_MODE
      );
      Database.DeleteResult deleted = Database.delete(
        versionId,
        false,
        AccessLevel.USER_MODE
      );
      Test.stopTest();
      Assert.isTrue(renamed.isSuccess());
      Assert.isTrue(dayChanged.isSuccess());
      Assert.isTrue(deleted.isSuccess());
      Assert.areEqual(5, daysOf(draftId)[0].Revision__c);
    }
  }

  @IsTest
  static void shoreshsOwnRenameStillWorksAndTheMessageUsesTheCampsWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Database.insert(
        new CampLabel__c(
          Camp__c = ids.get('Camp'),
          ModelTerm__c = 'PublishedSchedule',
          Singular__c = 'Final schedule',
          Plural__c = 'Final schedules'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Id publishedId = publishNow(startWeek(ids));
      Test.startTest();
      SchedulesController.renameSchedule(publishedId, 'Opening week');
      Database.DeleteResult deleted = Database.delete(
        publishedId,
        false,
        AccessLevel.USER_MODE
      );
      Test.stopTest();
      Assert.areEqual('Opening week', reread(publishedId).Name);
      Assert.areEqual(
        '"Opening week" is the Final schedule, which is kept as history, so it can\'t be deleted.',
        refusal(deleted)
      );
    }
  }

  @IsTest
  static void aScheduleThatBecomesHistoryHasItsDaysCheckedAgain() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id versionId = ManualBuildController.saveVersion(startWeek(ids), 'Kept');
      Id dayId = daysOf(versionId)[0].Id;
      Test.startTest();
      // A version's day can be changed directly (and the version is then known not to be history).
      Database.SaveResult before = Database.update(
        new ScheduleDay__c(Id = dayId, Revision__c = 5),
        false,
        AccessLevel.USER_MODE
      );
      // It becomes history in the same transaction, as Publish would make it.
      PublishedGuard.allow();
      Database.update(
        new Schedule__c(Id = versionId, PublishedAt__c = Datetime.now()),
        AccessLevel.USER_MODE
      );
      PublishedGuard.done();
      Database.SaveResult after = Database.update(
        new ScheduleDay__c(Id = dayId, Revision__c = 6),
        false,
        AccessLevel.USER_MODE
      );
      Test.stopTest();
      Assert.isTrue(before.isSuccess());
      Assert.areEqual(
        '"Kept" was the published schedule, which is kept as history, so its days can\'t be changed.',
        refusal(after)
      );
      Assert.areEqual(5, daysOf(versionId)[0].Revision__c);
    }
  }
}
