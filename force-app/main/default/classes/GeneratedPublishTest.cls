/**
 * Publish and Unpublish on Generated Schedule (ADR 0010 "Publish"), as a scheduler with the
 * Shoresh Scheduler permission set: the same server path as Manual Build (SchedulePublish, ADR
 * 0008 part 5) with Generated's draft. The published copy keeps the draft's locks; a lock alone
 * is not a change to publish; the screen learns the published schedule when it opens the week and
 * after each build; one published schedule per week, whichever schedule published it. Camp and
 * helpers: GeneratedTestData (Group A, Group B, Group C; Period 1 with Flagpole, Period 2 with
 * Gym games once generated, Lunch with Rest for Group C on Mondays).
 */
@IsTest
private class GeneratedPublishTest {
  private static SchedulePublish.Result publishNow(Id draftId) {
    SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
      draftId
    );
    return GeneratedScheduleController.publish(
      draftId,
      preview.revisions,
      preview.published == null ? null : preview.published.id
    );
  }

  /** A Lock on Group A's Monday Period 2 (Gym games), from a screen that has the week now. */
  private static void lockGroupAPeriod2(Map<String, Id> ids, Id draftId) {
    GeneratedWeek.LockChange change = new GeneratedWeek.LockChange();
    change.action = GeneratedWeek.LOCK;
    change.dateValue = GeneratedTestData.MONDAY;
    change.groupId = ids.get('Group A');
    change.blockId = ids.get('Period 2');
    GeneratedWeek.Locked locked = GeneratedScheduleController.setLocks(
      draftId,
      new List<GeneratedWeek.LockChange>{ change },
      GeneratedDrafts.revisionOf(ScheduleDays.read(draftId))
    );
    Assert.isFalse(locked.conflict);
  }

  /** Swim by hand in Group A's Monday Lunch (Open before). */
  private static void swimAtLunch(Map<String, Id> ids, Id draftId) {
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    SlotEdits.Result result = GeneratedTestData.handEdits(
      draftId,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            GeneratedTestData.MONDAY,
            ids.get('Group A'),
            ids.get('Lunch')
          ),
          new List<String>{ '' },
          new List<String>{ GeneratedTestData.a('Swim') }
        )
      },
      GeneratedDrafts.revisionOf(ScheduleDays.read(draftId))
    );
    Assert.isTrue(result.conflicts.isEmpty());
  }

  private static List<Schedule__c> publishedHistory() {
    return [
      SELECT
        Id,
        Name,
        Status__c,
        Origin__c,
        SourceSchedule__c,
        PublishedAt__c,
        PublishKey__c
      FROM Schedule__c
      WHERE PublishedAt__c != NULL
      WITH SYSTEM_MODE
      ORDER BY CreatedDate, Id
    ];
  }

  /** What previewPublish, publish and unpublish each say for this schedule (null: not refused). */
  private static List<String> refusals(Id scheduleId) {
    List<String> messages = new List<String>();
    for (Integer call = 0; call < 3; call++) {
      try {
        if (call == 0) {
          GeneratedScheduleController.previewPublish(scheduleId);
        } else if (call == 1) {
          GeneratedScheduleController.publish(scheduleId, 'seen', null);
        } else {
          GeneratedScheduleController.unpublish(scheduleId, null);
        }
        messages.add(null);
      } catch (AuraHandledException e) {
        messages.add(e.getMessage());
      }
    }
    return messages;
  }

  // PUB-4.1
  @IsTest
  static void publishingCopiesTheGeneratedWeekLocksAndAll() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      lockGroupAPeriod2(ids, draftId);
      Test.startTest();
      String seen = GeneratedTestData.inputs().revision;
      Integer before = Limits.getQueries();
      SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
        draftId
      );
      Integer previewQueries = Limits.getQueries() - before;
      before = Limits.getQueries();
      SchedulePublish.Result result = GeneratedScheduleController.publish(
        draftId,
        preview.revisions,
        null
      );
      Integer publishQueries = Limits.getQueries() - before;
      Test.stopTest();
      // 6, and since ADR 0014 slice 5 the week's special days (one more).
      Assert.isTrue(previewQueries <= 7, 'Preview used ' + previewQueries);
      Assert.isTrue(publishQueries <= 15, 'Publish used ' + publishQueries);
      // The preview's revisions are what the screen read the week at.
      Assert.areEqual(seen, preview.revisions);
      Assert.isNull(preview.published);
      Assert.isFalse(result.draftChanged);
      Assert.isFalse(result.publishedChanged);
      List<Schedule__c> published = publishedHistory();
      Assert.areEqual(1, published.size());
      Assert.areEqual(result.published.id, published[0].Id);
      Assert.areEqual('Published', published[0].Status__c);
      Assert.areEqual('Generated', published[0].Origin__c);
      Assert.areEqual(draftId, published[0].SourceSchedule__c);
      // The same cells, and the lock kept with them (ADR 0010 §32: a copy keeps a day as it is).
      Assert.areEqual(
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0)),
        GeneratedTestData.slots(published[0].Id, GeneratedTestData.at(0, 0))
      );
      ScheduleGrid monday = ScheduleDays.read(published[0].Id)[0].grid;
      Assert.isTrue(
        ScheduleGridLocks.isLocked(
          monday,
          GeneratedTestData.GROUP_A,
          GeneratedTestData.PERIOD_2
        )
      );
    }
  }

  @IsTest
  static void openingTheWeekShowsThePublishedScheduleAndWhetherItChangedSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Assert.isNull(GeneratedTestData.inputs().published);
      Id publishedId = publishNow(draftId).published.id;
      Test.startTest();
      GeneratedInputs.Inputs justPublished = GeneratedTestData.inputs();
      // A Lock alone is not a change: other systems read the cells, not how they were built.
      lockGroupAPeriod2(ids, draftId);
      GeneratedInputs.Inputs locked = GeneratedTestData.inputs();
      swimAtLunch(ids, draftId);
      GeneratedInputs.Inputs edited = GeneratedTestData.inputs();
      // Read before stopTest: publishing above (with the week's special days, ADR 0014 slice 5)
      // leaves the setup's own limits too little room.
      String lunch = GeneratedTestData.slots(
        publishedId,
        GeneratedTestData.at(0, 0)
      )[2];
      Test.stopTest();
      Assert.areEqual(publishedId, justPublished.published.id);
      Assert.isFalse(justPublished.published.changedSince);
      Assert.isNotNull(justPublished.published.publishedAt);
      Assert.isNotNull(justPublished.published.publishedBy);
      // The Published line names the screen it was published from (Greg, 2026-10-19).
      Assert.areEqual('Generated', justPublished.published.origin);
      Assert.isFalse(locked.published.changedSince);
      Assert.isTrue(edited.published.changedSince);
      // Later edits don't touch the published copy.
      Assert.areEqual('', lunch);
    }
  }

  @IsTest
  static void aBuildAnswersWithThePublishedScheduleBesideTheWeekAsSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      publishNow(draftId);
      Test.startTest();
      // A Rebuild that builds the same week: not changed since.
      GeneratedWeek.Result same = GeneratedTestData.save(
        GeneratedTestData.request(
          GeneratedTestData.inputs(),
          GeneratedSaves.REBUILD,
          1
        )
      );
      // Fill the open cells puts Swim in Group A's Monday Lunch: changed since.
      GeneratedWeek.Save fill = GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.FILL_OPEN,
        1
      );
      GeneratedTestData.put(
        fill.days[0],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_A,
          GeneratedTestData.LUNCH
        ),
        'Swim'
      );
      GeneratedWeek.Result changed = GeneratedTestData.save(fill);
      Test.stopTest();
      Assert.isFalse(same.conflict);
      Assert.isNotNull(same.published);
      Assert.isFalse(same.published.changedSince);
      Assert.isFalse(changed.conflict);
      Assert.isTrue(changed.published.changedSince);
    }
  }

  @IsTest
  static void aWeekWithNothingPublishedAnswersABuildWithNone() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Test.startTest();
      GeneratedWeek.Result first = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.GENERATE,
            1
          ),
          'Gym games'
        )
      );
      Test.stopTest();
      Assert.isFalse(first.conflict);
      Assert.isNull(first.published);
    }
  }

  @IsTest
  static void publishingAgainAndUnpublishingKeepTheOldCopiesAsHistory() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Id firstId = publishNow(draftId).published.id;
      Test.startTest();
      swimAtLunch(ids, draftId);
      SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
        draftId
      );
      SchedulePublish.Result again = GeneratedScheduleController.publish(
        draftId,
        preview.revisions,
        preview.published.id
      );
      Integer before = Limits.getQueries();
      SchedulePublish.Result gone = GeneratedScheduleController.unpublish(
        draftId,
        again.published.id
      );
      Integer unpublishQueries = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(
        unpublishQueries <= 8,
        'Unpublish used ' + unpublishQueries
      );
      Assert.areEqual(firstId, preview.published.id);
      Assert.areEqual(1, preview.changeCount);
      Assert.areEqual(
        new List<String>{ 'Group A · Monday · Lunch: Open → Swim' },
        preview.changes
      );
      Assert.isFalse(gone.publishedChanged);
      List<Schedule__c> history = publishedHistory();
      Assert.areEqual(2, history.size());
      for (Schedule__c kept : history) {
        Assert.areEqual('Version', kept.Status__c);
        Assert.isNull(kept.PublishKey__c);
        Assert.isTrue(kept.Name.startsWith('Published '), kept.Name);
      }
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Status__c = 'Published'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  // PUB-1.1
  @IsTest
  static void oneWeekHasOnePublishedScheduleWhicheverScheduleIsPublished() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      Id manualPublished = ManualBuildController.publish(
          manualId,
          ManualBuildController.previewPublish(manualId).revisions,
          null
        )
        .published.id;
      Test.startTest();
      Id draftId = GeneratedTestData.generated();
      SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
        draftId
      );
      SchedulePublish.Result result = GeneratedScheduleController.publish(
        draftId,
        preview.revisions,
        preview.published.id
      );
      Test.stopTest();
      // Generated's publish shows and replaces the week's published schedule, Manual Build's.
      Assert.areEqual(manualPublished, preview.published.id);
      Assert.isTrue(preview.changeCount > 0);
      List<Schedule__c> history = publishedHistory();
      Assert.areEqual(2, history.size());
      Assert.areEqual('Version', history[0].Status__c);
      Assert.areEqual('Manual', history[0].Origin__c);
      Assert.areEqual(result.published.id, history[1].Id);
      Assert.areEqual('Generated', history[1].Origin__c);
    }
  }

  @IsTest
  static void aWeekSavedSinceThePreviewIsNotPublished() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      SchedulePublish.Preview preview = GeneratedScheduleController.previewPublish(
        draftId
      );
      swimAtLunch(ids, draftId);
      Test.startTest();
      SchedulePublish.Result result = GeneratedScheduleController.publish(
        draftId,
        preview.revisions,
        null
      );
      Test.stopTest();
      Assert.isTrue(result.draftChanged);
      Assert.areEqual(0, publishedHistory().size());
    }
  }

  @IsTest
  static void onlyTheWeeksGeneratedDraftIsPublishedHere() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      GeneratedTestData.generated();
      Test.startTest();
      Id versionId = GeneratedTestData.save(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.REBUILD,
            1
          )
        )
        .versionId;
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      List<String> fromVersion = refusals(versionId);
      List<String> fromManual = refusals(manualId);
      Test.stopTest();
      // Preview, Publish and Unpublish each refuse them.
      String versionRefused = 'A saved version can\'t be changed.';
      Assert.areEqual(
        new List<String>{ versionRefused, versionRefused, versionRefused },
        fromVersion
      );
      String manualRefused = 'Only this week\'s Generated Schedule can be saved here. Reload the page.';
      Assert.areEqual(
        new List<String>{ manualRefused, manualRefused, manualRefused },
        fromManual
      );
      Assert.areEqual(0, publishedHistory().size());
    }
  }

  @IsTest
  static void aGeneratedWeekPublishesTheNamesItWasSavedWith() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      // Renamed in setup since: Generated Schedule shows the week by its saved names, so
      // Publish puts those out (only Manual Build shows setup's names now).
      Database.update(
        new List<SObject>{
          new Activity__c(Id = ids.get('Gym games'), Name = 'Gym'),
          new Group__c(Id = ids.get('Group A'), Name = 'Bunk Aleph')
        },
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      SchedulePublish.Result result = publishNow(draftId);
      SchedulePublish.Preview again = GeneratedScheduleController.previewPublish(
        draftId
      );
      Test.stopTest();
      ScheduleGrid copy = ScheduleDays.read(result.published.id)[0].grid;
      Assert.areEqual('Group A', copy.groups[0].name);
      Set<String> placed = new Set<String>();
      for (ScheduleGrid.Item item : copy.items) {
        placed.add(item.name);
      }
      Assert.isTrue(placed.contains('Gym games'), String.valueOf(placed));
      Assert.isFalse(placed.contains('Gym'), String.valueOf(placed));
      Assert.areEqual(0, again.changeCount, JSON.serialize(again.changes));
    }
  }
}
