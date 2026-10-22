/**
 * Special days and events on Publish and the Schedules page (ADR 0014 slice 5): Publish carries the
 * day a special day replaces and each placed event's own schedule; the published copy shows them
 * as published, whatever changes later, while any other schedule shows the week's as they are now;
 * what changes in them is part of a preview and of "already published as it is"; only Publish
 * writes what a published copy carries. As a scheduler, records made inside the same
 * System.runAs; each request's queries are bounded.
 */
@IsTest
private class ScheduleSpecialsTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final Date TUESDAY = Date.newInstance(2026, 6, 30);

  /** Field Day (on Tuesday) and Color War (on Group A's Monday Period 1 and 2), a week started. */
  private static Map<String, Id> campWithSpecials() {
    Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
    ids.put('Color War', SpecialScheduleTestData.colorWar(ids));
    SpecialDates.place(ids.get('Field Day'), ids.get('Week 1'), 'Tuesday');
    ManualBuildViews.DraftView view = ManualBuildController.startBlankWeek(
      ids.get('Main'),
      ids.get('Week 1')
    );
    ids.put('Draft', view.schedule.schedule.id);
    String event = 'S:' + ids.get('Color War');
    SlotEdits.Run run = new SlotEdits.Run();
    run.day = MONDAY;
    run.groupId = ids.get('Group A');
    run.firstBlockId = ids.get('Period 1');
    run.blockIds = new List<String>{ ids.get('Period 1'), ids.get('Period 2') };
    run.before = new List<String>{ '', '' };
    run.after = new List<String>{ event, '^' + event };
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = new List<SlotEdits.Run>{ run };
    SlotEdits.Result placed = ManualBuildController.saveSlots(
      ids.get('Draft'),
      new List<SlotEdits.Edit>{ edit }
    );
    Assert.isTrue(placed.conflicts.isEmpty(), 'Color War placed');
    return ids;
  }

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

  /** Swim typed into Field Day's Group A, first time block. */
  private static void swimInFieldDay(Map<String, Id> ids) {
    SlotEdits.Result saved = SpecialScheduleController.saveCells(
      ids.get('Field Day'),
      SpecialScheduleTestData.edits(
        SpecialScheduleTestData.run(
          ids.get('Group A'),
          new List<String>{ 'b1' },
          new List<String>{ 'A:' + ids.get('Swim') }
        )
      )
    );
    Assert.isTrue(saved.conflicts.isEmpty(), 'Swim typed into Field Day');
  }

  private static List<PublishedPlan__c> carried(Id scheduleId) {
    return [
      SELECT Id, Name, Kind__c, Item__c, Date__c, Notes__c, Part__c, Plan__c
      FROM PublishedPlan__c
      WHERE Schedule__c = :scheduleId
      WITH USER_MODE
      ORDER BY Kind__c, Date__c
    ];
  }

  @IsTest
  static void publishCarriesTheSpecialDayAndTheEventsOwnSchedules() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithSpecials();
      Database.update(
        new SpecialDay__c(Id = ids.get('Field Day'), Notes__c = 'Wear blue'),
        AccessLevel.USER_MODE
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        ids.get('Draft')
      );
      Integer previewQueries = Limits.getQueries() - before;
      before = Limits.getQueries();
      SchedulePublish.Result result = ManualBuildController.publish(
        ids.get('Draft'),
        preview.revisions,
        null
      );
      Integer publishQueries = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(previewQueries <= 10, 'Preview used ' + previewQueries);
      Assert.isTrue(publishQueries <= 25, 'Publish used ' + publishQueries);
      List<PublishedPlan__c> rows = carried(result.published.id);
      Assert.areEqual(2, rows.size(), 'Field Day and Color War: ' + rows);
      Assert.areEqual('D', rows[0].Kind__c);
      Assert.areEqual(String.valueOf(ids.get('Field Day')), rows[0].Item__c);
      Assert.areEqual('Field Day', rows[0].Name);
      Assert.areEqual(TUESDAY, rows[0].Date__c);
      Assert.areEqual('Wear blue', rows[0].Notes__c);
      Assert.isNotNull(rows[0].Plan__c);
      Assert.areEqual('S', rows[1].Kind__c);
      Assert.areEqual(String.valueOf(ids.get('Color War')), rows[1].Item__c);
      Assert.areEqual('Color War', rows[1].Name);
      Assert.isNull(rows[1].Date__c);
    }
  }

  @IsTest
  static void thePublishedCopyShowsThemAsPublishedWhileTheDraftShowsThemNow() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithSpecials();
      Id publishedId = publishNow(ids.get('Draft')).published.id;
      // Changed after publishing: Field Day's schedule, and the week's Tuesday taken back.
      swimInFieldDay(ids);

      Test.startTest();
      Integer before = Limits.getQueries();
      ScheduleViews.ScheduleView published = SchedulesController.openSchedule(
        publishedId
      );
      Integer used = Limits.getQueries() - before;
      ScheduleViews.ScheduleView draft = SchedulesController.openSchedule(
        ids.get('Draft')
      );
      Test.stopTest();

      Assert.isTrue(used <= 20, 'Opening a published schedule used ' + used);
      Assert.isTrue(published.specials.asPublished);
      Assert.areEqual(1, published.specials.days.size());
      WeekSpecials.ReplacedDay day = published.specials.days[0];
      Assert.areEqual(TUESDAY, day.dateValue);
      Assert.areEqual('Tuesday', day.day);
      Assert.areEqual('Field Day', day.name);
      Assert.areEqual(ids.get('Field Day'), day.specialDayId);
      // As published: Group A's first time block was still Open.
      Assert.areEqual(
        'Group A: ,,Lunch break',
        SpecialScheduleTestData.cells(day.plan)[0]
      );
      // Its own time blocks, never "removed"; its groups the program's.
      Assert.areEqual('b1', day.plan.blocks[0].id);
      Assert.isFalse(day.plan.blocks[0].gone);
      Assert.areEqual(3, day.plan.groups.size());
      Assert.areEqual(1, published.specials.events.size());
      ScheduleSpecials.EventPlan event = published.specials.events[0];
      Assert.areEqual(String.valueOf(ids.get('Color War')), event.eventId);
      Assert.areEqual('Color War', event.name);
      Assert.areEqual(2, event.plan.blocks.size());
      Assert.areEqual(2, event.plan.groups.size());
      Assert.isFalse(event.plan.groups[0].gone, 'A station is never gone');

      // The draft (any schedule never published) shows the week's as they are now.
      Assert.isFalse(draft.specials.asPublished);
      Assert.areEqual(
        'Group A: Swim,,Lunch break',
        SpecialScheduleTestData.cells(draft.specials.days[0].plan)[0]
      );
      Assert.areEqual(1, draft.specials.events.size());
    }
  }

  @IsTest
  static void whatChangesInThemIsShownBeforePublishingAgain() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithSpecials();
      Id firstId = publishNow(ids.get('Draft')).published.id;
      swimInFieldDay(ids);
      SpecialScheduleController.changeFrame(
        ids.get('Color War'),
        SpecialPlans.read(ids.get('Color War')).revision,
        SpecialScheduleTestData.change('addStation', null, 'Green')
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        ids.get('Draft')
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 12, 'Preview used ' + used);
      Assert.areEqual(firstId, preview.published.id);
      Assert.isTrue(preview.published.changedSince);
      Assert.areEqual(1, preview.eventCount, String.valueOf(preview.changes));
      Assert.areEqual(0, preview.specialDayCount);
      Assert.isTrue(
        preview.changes.contains('Color War: stations changed'),
        String.valueOf(preview.changes)
      );
      Assert.isTrue(
        preview.changes.contains(
          'Group A · Tuesday · Field Day · Period 1: Open → Swim'
        ),
        String.valueOf(preview.changes)
      );
    }
  }

  @IsTest
  static void aDayReplacedOrNoLongerReplacedIsAChangeToPublish() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithSpecials();
      // Published with nothing on Tuesday.
      for (SpecialDate__c placed : [
        SELECT Id
        FROM SpecialDate__c
        WHERE SpecialDay__c = :ids.get('Field Day')
        WITH USER_MODE
      ]) {
        SpecialDates.takeOff(placed.Id);
      }
      publishNow(ids.get('Draft'));
      // Publishing the week as it is again changes nothing.
      Assert.isTrue(publishNow(ids.get('Draft')).unchanged);
      SpecialDates.place(ids.get('Field Day'), ids.get('Week 1'), 'Tuesday');

      Test.startTest();
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        ids.get('Draft')
      );
      ManualBuildViews.DraftView view = ManualBuildController.getDraft(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Test.stopTest();

      Assert.areEqual(1, preview.specialDayCount);
      Assert.areEqual(1, preview.changeCount, String.valueOf(preview.changes));
      Assert.areEqual(
        'Tuesday: the regular day → Field Day',
        preview.changes[0]
      );
      Assert.isTrue(view.published.changedSince, 'Manual Build says so');
      SchedulePublish.Result again = publishNow(ids.get('Draft'));
      Assert.isFalse(again.unchanged);
      Assert.areEqual(2, carried(again.published.id).size());
    }
  }

  @IsTest
  static void onlyPublishWritesWhatAPublishedCopyCarries() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithSpecials();
      Id publishedId = publishNow(ids.get('Draft')).published.id;
      List<PublishedPlan__c> rows = carried(publishedId);

      Database.SaveResult added = Database.insert(
        new PublishedPlan__c(
          Schedule__c = publishedId,
          Name = 'Extra',
          Kind__c = 'S'
        ),
        false,
        AccessLevel.SYSTEM_MODE
      );
      Database.DeleteResult removed = Database.delete(
        new PublishedPlan__c(Id = rows[0].Id),
        false,
        AccessLevel.SYSTEM_MODE
      );

      Assert.isFalse(added.isSuccess());
      Assert.isTrue(
        added.getErrors()[0].getMessage().contains('kept as history'),
        added.getErrors()[0].getMessage()
      );
      Assert.isFalse(removed.isSuccess());
      Assert.areEqual(rows.size(), carried(publishedId).size());
    }
  }
}
