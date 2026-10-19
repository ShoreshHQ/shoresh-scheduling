/**
 * Publish on Manual Build, as a scheduler with the Shoresh Scheduler permission set (Greg,
 * Manual Build round 1 #1 and round 2 #4): the draft is copied as the week's published schedule;
 * publishing again replaces it after a preview of what changes, and the one replaced stays as
 * history; later edits don't touch the copy. Unpublish (Greg, 2026-10-18) leaves the week with
 * none, the copy kept as history the same way. Synthetic camp (SetTimeTestData): Group A and
 * Group B (Juniors), Group C (Seniors); Period 1, Period 2, Lunch; Main runs Monday to Thursday.
 */
@IsTest
private class SchedulePublishTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static Map<String, Id> campIds;

  private static Map<String, Id> camp() {
    // The clash check runs once, at the end, as a screen save does (SetTimeGuard).
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
    campIds = ids;
    return ids;
  }

  private static Id startWeek(Map<String, Id> ids) {
    return ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      )
      .schedule.schedule.id;
  }

  /** Group A's Monday Period 2 changes from was ('' Open) to the activity. */
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

  /** Previews and publishes, as the screen does. */
  private static SchedulePublish.Result publishNow(Id draftId) {
    SchedulePublish.Preview preview = ManualBuildController.previewPublish(
      draftId
    );
    return ManualBuildController.publish(
      draftId,
      preview.revisions,
      preview.published == null ? null : preview.published.id
    );
  }

  /** What Group A's Monday Period 2 holds in a schedule ('' Open, else the camp record's name). */
  private static String mondayPeriod2(Id scheduleId) {
    ScheduleGrid grid = ScheduleDays.read(scheduleId)[0].grid;
    String slot = SlotIds.ofRow(
      grid,
      SlotIds.indexOf(grid.groupIds(), campIds.get('Group A'))
    )[1];
    for (String name : campIds.keySet()) {
      if (slot == 'A:' + campIds.get(name)) {
        return name;
      }
    }
    return slot;
  }

  private static List<Schedule__c> publishedSchedules() {
    return [
      SELECT
        Id,
        Name,
        Status__c,
        Origin__c,
        SourceSchedule__c,
        PublishedAt__c,
        PublishedBy__c,
        PublishKey__c,
        Week__c
      FROM Schedule__c
      WHERE PublishedAt__c != NULL
      WITH SYSTEM_MODE
      ORDER BY CreatedDate, Id
    ];
  }

  @IsTest
  static void theFirstPublishCopiesTheDraftAsTheWeeksPublishedSchedule() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Test.startTest();
      Integer queriesBefore = Limits.getQueries();
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        draftId
      );
      Integer previewQueries = Limits.getQueries() - queriesBefore;
      queriesBefore = Limits.getQueries();
      SchedulePublish.Result result = ManualBuildController.publish(
        draftId,
        preview.revisions,
        null
      );
      Integer publishQueries = Limits.getQueries() - queriesBefore;
      Test.stopTest();
      Assert.isTrue(previewQueries <= 15, 'Preview used ' + previewQueries);
      Assert.isTrue(publishQueries <= 25, 'Publish used ' + publishQueries);
      // The week's first publish: nothing to replace, so no changes to show.
      Assert.isNull(preview.published);
      Assert.areEqual(0, preview.changeCount);
      Assert.isFalse(result.draftChanged);
      Assert.isFalse(result.publishedChanged);
      Assert.isFalse(result.unchanged);
      List<Schedule__c> published = publishedSchedules();
      Assert.areEqual(1, published.size());
      Schedule__c copy = published[0];
      Assert.areEqual(copy.Id, result.published.id);
      Assert.areEqual('Published', copy.Status__c);
      Assert.areEqual('Manual', copy.Origin__c);
      Assert.areEqual('Published schedule', copy.Name);
      Assert.areEqual(draftId, copy.SourceSchedule__c);
      Assert.areEqual(scheduler.Id, copy.PublishedBy__c);
      Assert.areEqual(
        SchedulePublish.keyOf(ids.get('Main'), ids.get('Week 1')),
        copy.PublishKey__c
      );
      Assert.areEqual(ids.get('Week 1'), copy.Week__c);
      Assert.areEqual('Swim', mondayPeriod2(copy.Id));
      Assert.areEqual(
        ScheduleDays.read(draftId).size(),
        ScheduleDays.read(copy.Id).size()
      );
      // Manual Build shows it as published, matching the week.
      ManualBuildViews.DraftView view = ManualBuildController.getDraft(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Assert.areEqual(copy.Id, view.published.id);
      Assert.isFalse(view.published.changedSince);
      Assert.isNotNull(view.published.publishedAt);
      Assert.isNotNull(view.published.publishedBy);
    }
  }

  @IsTest
  static void laterEditsDontTouchThePublishedCopy() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id publishedId = publishNow(draftId).published.id;
      Test.startTest();
      placeOver(draftId, 'A:' + ids.get('Swim'), 'Gym games');
      ManualBuildViews.DraftView view = ManualBuildController.getDraft(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Test.stopTest();
      Assert.areEqual('Swim', mondayPeriod2(publishedId));
      Assert.areEqual('Gym games', mondayPeriod2(draftId));
      Assert.isTrue(view.published.changedSince);
    }
  }

  @IsTest
  static void publishingAgainShowsWhatChangesThenKeepsTheOldOneAsHistory() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id firstId = publishNow(draftId).published.id;
      placeOver(draftId, 'A:' + ids.get('Swim'), 'Gym games');
      Test.startTest();
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        draftId
      );
      SchedulePublish.Result result = ManualBuildController.publish(
        draftId,
        preview.revisions,
        preview.published.id
      );
      Test.stopTest();
      Assert.areEqual(firstId, preview.published.id);
      Assert.isTrue(preview.published.changedSince);
      Assert.areEqual(1, preview.changeCount);
      Assert.areEqual(
        new List<String>{ 'Group A · Monday · Period 2: Swim → Gym games' },
        preview.changes
      );
      List<Schedule__c> published = publishedSchedules();
      Assert.areEqual(2, published.size());
      // The first is a version now: still dated, no longer holding the week's key.
      Assert.areEqual(firstId, published[0].Id);
      Assert.areEqual('Version', published[0].Status__c);
      Assert.isNotNull(published[0].PublishedAt__c);
      Assert.isNull(published[0].PublishKey__c);
      Assert.areEqual('Swim', mondayPeriod2(firstId));
      Assert.areEqual(result.published.id, published[1].Id);
      Assert.areEqual('Published', published[1].Status__c);
      Assert.areEqual('Gym games', mondayPeriod2(published[1].Id));
      // It is in the week's Versions, marked as once published.
      ScheduleViews.VersionRow row = SchedulesController.getVersions(
        ids.get('Main'),
        ids.get('Week 1')
      )[0];
      Assert.areEqual(firstId, row.id);
      Assert.isNotNull(row.publishedAt);
    }
  }

  @IsTest
  static void aReplacedPublishedScheduleIsKeptAsHistory() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id firstId = publishNow(draftId).published.id;
      // What follows gets its own limits: an edit, a second publish and the checks.
      Test.startTest();
      placeOver(draftId, 'A:' + ids.get('Swim'), 'Gym games');
      Id secondId = publishNow(draftId).published.id;
      String message;
      try {
        ManualBuildController.deleteVersion(draftId, firstId);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      // Even with the current one unpublished, the week still has published history.
      ManualBuildController.unpublish(draftId, secondId);
      Set<Id> protectedIds = PublishedHistory.finder.withPublishedHistory(
        new Set<Id>{ ids.get('Week 1') }
      );
      Test.stopTest();
      Assert.areEqual(
        '"Published schedule" was the published schedule, which is kept as history, so it can\'t be deleted.',
        message
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Schedule__c WHERE Id = :firstId WITH SYSTEM_MODE]
      );
      Assert.isTrue(protectedIds.contains(ids.get('Week 1')));
    }
  }

  @IsTest
  static void aWeekWhoseOnlyHistoryIsAReplacedCopyIsNotDeleted() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id firstId = publishNow(draftId).published.id;
      // What follows gets its own limits: an edit, a second publish and the delete.
      Test.startTest();
      placeOver(draftId, 'A:' + ids.get('Swim'), 'Gym games');
      Id secondId = publishNow(draftId).published.id;
      // The current published copy is unpublished, leaving only copies kept as history.
      ManualBuildController.unpublish(draftId, secondId);
      String message;
      try {
        // The setup screens' week delete: drafts and versions go with the week, history doesn't.
        WeekExceptions.deleteWithWeeks(ids.get('Week 1'));
      } catch (Exception e) {
        message = e.getMessage();
      }
      Test.stopTest();
      Assert.isNotNull(message, 'The week was deleted with its history');
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Schedule__c WHERE Id = :firstId WITH SYSTEM_MODE]
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Week__c
          WHERE Id = :ids.get('Week 1')
          WITH SYSTEM_MODE
        ]
      );
      // All or none: the draft is still there too.
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Schedule__c WHERE Id = :draftId WITH SYSTEM_MODE]
      );
    }
  }

  @IsTest
  static void publishingTheWeekAsItIsAgainChangesNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id publishedId = publishNow(draftId).published.id;
      Test.startTest();
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        draftId
      );
      SchedulePublish.Result result = ManualBuildController.publish(
        draftId,
        preview.revisions,
        preview.published.id
      );
      Test.stopTest();
      Assert.areEqual(0, preview.changeCount);
      Assert.isFalse(preview.published.changedSince);
      Assert.isTrue(result.unchanged);
      Assert.areEqual(publishedId, result.published.id);
      Assert.areEqual(1, publishedSchedules().size());
    }
  }

  @IsTest
  static void aWeekChangedSinceThePreviewIsNotPublished() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      Test.startTest();
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        draftId
      );
      // Someone saves the week before Publish is pressed.
      placeOver(draftId, '', 'Swim');
      SchedulePublish.Result result = ManualBuildController.publish(
        draftId,
        preview.revisions,
        null
      );
      Test.stopTest();
      Assert.isTrue(result.draftChanged);
      Assert.isNull(result.published);
      Assert.areEqual(0, publishedSchedules().size());
    }
  }

  @IsTest
  static void aWeekSomeoneElsePublishedSinceThePreviewIsNotReplaced() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        draftId
      );
      Test.startTest();
      // Someone else publishes the week first.
      Id theirs = ManualBuildController.publish(
          draftId,
          preview.revisions,
          null
        )
        .published.id;
      // This preview said there was nothing to replace, so it is refused.
      SchedulePublish.Result result = ManualBuildController.publish(
        draftId,
        preview.revisions,
        null
      );
      Test.stopTest();
      Assert.isTrue(result.publishedChanged);
      List<Schedule__c> published = publishedSchedules();
      Assert.areEqual(1, published.size());
      Assert.areEqual(theirs, published[0].Id);
    }
  }

  @IsTest
  static void onlyADraftCanBePublished() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      Id versionId = ManualBuildController.saveVersion(draftId, 'Kept');
      Test.startTest();
      String message;
      try {
        ManualBuildController.previewPublish(versionId);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      Test.stopTest();
      Assert.areEqual('A saved version can\'t be changed.', message);
      Assert.areEqual(0, publishedSchedules().size());
    }
  }

  @IsTest
  static void aWeekWithNothingInItIsNotPublished() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      Database.delete(
        [
          SELECT Id
          FROM ScheduleDay__c
          WHERE Schedule__c = :draftId
          WITH USER_MODE
        ],
        true,
        AccessLevel.USER_MODE
      );
      Test.startTest();
      String message;
      try {
        ManualBuildController.previewPublish(draftId);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      Test.stopTest();
      Assert.areEqual(
        'There is nothing to publish yet, so nothing was published.',
        message
      );
    }
  }

  @IsTest
  static void unpublishKeepsThePublishedScheduleAsHistoryAndLeavesTheWeekWithNone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id publishedId = publishNow(draftId).published.id;
      Test.startTest();
      Integer queriesBefore = Limits.getQueries();
      SchedulePublish.Result result = ManualBuildController.unpublish(
        draftId,
        publishedId
      );
      Integer unpublishQueries = Limits.getQueries() - queriesBefore;
      ManualBuildViews.DraftView view = ManualBuildController.getDraft(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Test.stopTest();
      Assert.isTrue(
        unpublishQueries <= 10,
        'Unpublish used ' + unpublishQueries
      );
      Assert.isFalse(result.publishedChanged);
      Assert.isNull(result.published);
      // The week has no published schedule: nothing for other systems to read.
      Assert.isNull(view.published);
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Week__c = :ids.get('Week 1') AND Status__c = 'Published'
          WITH SYSTEM_MODE
        ]
      );
      // The copy is a version that keeps when it was published, and gives up the week's key.
      List<Schedule__c> history = publishedSchedules();
      Assert.areEqual(1, history.size());
      Assert.areEqual(publishedId, history[0].Id);
      Assert.areEqual('Version', history[0].Status__c);
      Assert.isNotNull(history[0].PublishedAt__c);
      Assert.isNotNull(history[0].PublishedBy__c);
      Assert.isNull(history[0].PublishKey__c);
      Assert.areEqual('Swim', mondayPeriod2(publishedId));
      // The draft is as it was.
      Assert.areEqual('Swim', mondayPeriod2(draftId));
      // In Versions, marked as once published.
      ScheduleViews.VersionRow row = SchedulesController.getVersions(
        ids.get('Main'),
        ids.get('Week 1')
      )[0];
      Assert.areEqual(publishedId, row.id);
      Assert.isNotNull(row.publishedAt);
    }
  }

  @IsTest
  static void anUnpublishedCopyCanBeRenamedAndRestoredButNotDeleted() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id publishedId = publishNow(draftId).published.id;
      ManualBuildController.unpublish(draftId, publishedId);
      placeOver(draftId, 'A:' + ids.get('Swim'), 'Gym games');
      Test.startTest();
      SchedulesController.renameSchedule(publishedId, 'Opening week');
      String message;
      try {
        ManualBuildController.deleteVersion(draftId, publishedId);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
      ManualBuildController.restoreVersion(
        draftId,
        publishedId,
        ScheduleDays.stamp(ScheduleDays.read(draftId))
      );
      Test.stopTest();
      Assert.areEqual(
        '"Opening week" was the published schedule, which is kept as history, so it can\'t be deleted.',
        message
      );
      Schedule__c kept = [
        SELECT Name, PublishedAt__c
        FROM Schedule__c
        WHERE Id = :publishedId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Opening week', kept.Name);
      Assert.isNotNull(kept.PublishedAt__c);
      Assert.areEqual('Swim', mondayPeriod2(draftId));
    }
  }

  @IsTest
  static void publishingAgainAfterUnpublishIsAFirstPublish() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id firstId = publishNow(draftId).published.id;
      ManualBuildController.unpublish(draftId, firstId);
      Test.startTest();
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        draftId
      );
      SchedulePublish.Result result = ManualBuildController.publish(
        draftId,
        preview.revisions,
        null
      );
      Test.stopTest();
      // Nothing published to replace: no changes to show, published at once by the screen.
      Assert.isNull(preview.published);
      Assert.areEqual(0, preview.changeCount);
      Assert.isFalse(result.publishedChanged);
      Assert.isFalse(result.unchanged);
      List<Schedule__c> published = publishedSchedules();
      Assert.areEqual(2, published.size());
      Assert.areEqual(firstId, published[0].Id);
      Assert.areEqual('Version', published[0].Status__c);
      Assert.areEqual(result.published.id, published[1].Id);
      Assert.areEqual('Published', published[1].Status__c);
      Assert.areEqual(
        SchedulePublish.keyOf(ids.get('Main'), ids.get('Week 1')),
        published[1].PublishKey__c
      );
    }
  }

  @IsTest
  static void unpublishIsRefusedWhenTheWeekWasPublishedOrUnpublishedSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id firstId = publishNow(draftId).published.id;
      placeOver(draftId, 'A:' + ids.get('Swim'), 'Gym games');
      Test.startTest();
      // Someone else published again after this screen showed the first.
      Id secondId = publishNow(draftId).published.id;
      SchedulePublish.Result stale = ManualBuildController.unpublish(
        draftId,
        firstId
      );
      // Someone else unpublished it after this screen showed it.
      ManualBuildController.unpublish(draftId, secondId);
      SchedulePublish.Result gone = ManualBuildController.unpublish(
        draftId,
        secondId
      );
      Test.stopTest();
      Assert.isTrue(stale.publishedChanged);
      Assert.isTrue(gone.publishedChanged);
      // The stale one changed nothing: the second stayed published until it was unpublished.
      List<Schedule__c> history = publishedSchedules();
      Assert.areEqual(2, history.size());
      Assert.areEqual('Version', history[0].Status__c);
      Assert.areEqual('Version', history[1].Status__c);
      Assert.isNotNull(history[1].PublishedAt__c);
    }
  }

  @IsTest
  static void aStaleUnpublishLeavesThePublishedScheduleAlone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = startWeek(ids);
      placeOver(draftId, '', 'Swim');
      Id firstId = publishNow(draftId).published.id;
      placeOver(draftId, 'A:' + ids.get('Swim'), 'Gym games');
      Test.startTest();
      Id secondId = publishNow(draftId).published.id;
      SchedulePublish.Result result = ManualBuildController.unpublish(
        draftId,
        firstId
      );
      Test.stopTest();
      Assert.isTrue(result.publishedChanged);
      Schedule__c current = [
        SELECT Status__c, PublishKey__c
        FROM Schedule__c
        WHERE Id = :secondId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Published', current.Status__c);
      Assert.isNotNull(current.PublishKey__c);
    }
  }
}
