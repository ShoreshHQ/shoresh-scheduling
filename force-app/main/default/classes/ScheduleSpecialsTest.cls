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

  /**
   * Field Day (on Tuesday of Week 1, starting from the regular day), Color War (one time block,
   * Blue and Gold), and Week 1's Manual Build draft with Color War over Group A's Monday Period 1
   * and 2, made by the scheduler; kept for each test. The draft is written as Manual Build saves
   * one (its days, Monday to Thursday), without the screen's start, which costs more queries than
   * one test may spend with the rest.
   */
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids;
    System.runAs(scheduler) {
      ids = SpecialScheduleTestData.campWithFieldDay();
      Id colorWar = SpecialScheduleTestData.addEvent(
        ids.get('Season'),
        'Color War'
      );
      ScheduleGrid plan = new ScheduleGrid();
      plan.blocks.add(
        new ScheduleGrid.Block('b1', 'Relays').at('09:00', '10:00')
      );
      plan.groups.add(new ScheduleGrid.GroupRef('s1', 'Blue'));
      plan.groups.add(new ScheduleGrid.GroupRef('s2', 'Gold'));
      plan.rows.add(new List<String>{ '' });
      plan.rows.add(new List<String>{ '' });
      SpecialPlans.write(colorWar, plan, null);
      ids.put('Color War', colorWar);
      SpecialDates.place(ids.get('Field Day'), ids.get('Week 1'), 'Tuesday');
      ids.put('Draft', draftWithColorWar(ids));
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  private static Id draftWithColorWar(Map<String, Id> ids) {
    Schedule__c draft = new Schedule__c(
      Program__c = ids.get('Main'),
      Week__c = ids.get('Week 1'),
      Name = ManualDrafts.NAME,
      Status__c = ManualDrafts.DRAFT,
      Origin__c = ManualDrafts.MANUAL
    );
    Database.insert(draft, AccessLevel.USER_MODE);
    List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
    List<ScheduleGrid.Block> blocks = new List<ScheduleGrid.Block>();
    for (TimeBlock__c block : [
      SELECT Id, Name, StartTime__c, EndTime__c
      FROM TimeBlock__c
      WHERE Program__c = :ids.get('Main')
      WITH USER_MODE
      ORDER BY StartTime__c
    ]) {
      blocks.add(
        new ScheduleGrid.Block(block.Id, block.Name)
          .at(
            String.valueOf(block.StartTime__c).left(5),
            String.valueOf(block.EndTime__c).left(5)
          )
      );
    }
    for (Integer d = 0; d < 4; d++) {
      ScheduleGrid grid = new ScheduleGrid();
      grid.blocks.addAll(blocks);
      for (String name : new List<String>{ 'Group A', 'Group B', 'Group C' }) {
        grid.groups.add(new ScheduleGrid.GroupRef(ids.get(name), name));
        grid.rows.add(new List<String>{ '', '', '' });
      }
      if (d == 0) {
        grid.items.add(
          new ScheduleGrid.Item('S', ids.get('Color War'), 'Color War')
        );
        grid.rows[0] = new List<String>{ '1', ScheduleGrid.CARRIES_ON, '' };
      }
      saves.add(new ScheduleDaySaves.DaySave(MONDAY.addDays(d), grid, null));
    }
    ScheduleDaySaves.write(draft.Id, saves);
    return draft.Id;
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
    // Read outside System.runAs: the kept record is the test runner's (KeptCamp).
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(kept)) {
      Map<String, Id> ids = kept;
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
    // Read outside System.runAs: the kept record is the test runner's (KeptCamp).
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(kept)) {
      Map<String, Id> ids = kept;

      Test.startTest();
      Id publishedId = publishNow(ids.get('Draft')).published.id;
      // Changed after publishing: Field Day's schedule.
      swimInFieldDay(ids);
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
      Assert.areEqual(1, event.plan.blocks.size());
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
    // Read outside System.runAs: the kept record is the test runner's (KeptCamp).
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(kept)) {
      Map<String, Id> ids = kept;

      Test.startTest();
      Id firstId = publishNow(ids.get('Draft')).published.id;
      swimInFieldDay(ids);
      SpecialScheduleController.changeFrame(
        ids.get('Color War'),
        SpecialPlans.read(ids.get('Color War')).revision,
        SpecialScheduleTestData.change('addStation', null, 'Green')
      );
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
    // Read outside System.runAs: the kept record is the test runner's (KeptCamp).
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(kept)) {
      Map<String, Id> ids = kept;
      // Published with nothing on Tuesday.
      for (SpecialDate__c placed : [
        SELECT Id
        FROM SpecialDate__c
        WHERE SpecialDay__c = :ids.get('Field Day')
        WITH USER_MODE
      ]) {
        SpecialDates.takeOff(placed.Id);
      }

      Test.startTest();
      publishNow(ids.get('Draft'));
      SpecialDates.place(ids.get('Field Day'), ids.get('Week 1'), 'Tuesday');
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
    }
  }

  /** Takes Color War's own schedule away (as before its stations were built). */
  private static void clearColorWarsSchedule(Map<String, Id> ids) {
    Database.delete(
      [
        SELECT Id
        FROM PlanPart__c
        WHERE SpecialEvent__c = :ids.get('Color War')
        WITH USER_MODE
      ],
      true,
      AccessLevel.USER_MODE
    );
  }

  /** Color War's one time block and Blue and Gold, as the setup builds it. */
  private static void buildColorWarsSchedule(Map<String, Id> ids) {
    ScheduleGrid plan = new ScheduleGrid();
    plan.blocks.add(
      new ScheduleGrid.Block('b1', 'Relays').at('09:00', '10:00')
    );
    plan.groups.add(new ScheduleGrid.GroupRef('s1', 'Blue'));
    plan.groups.add(new ScheduleGrid.GroupRef('s2', 'Gold'));
    plan.rows.add(new List<String>{ '' });
    plan.rows.add(new List<String>{ '' });
    SpecialPlans.write(ids.get('Color War'), plan, null);
  }

  @IsTest
  static void anEventsScheduleBuiltAfterPublishingIsSomethingToPublish() {
    // Read outside System.runAs: the kept record is the test runner's (KeptCamp).
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(kept)) {
      Map<String, Id> ids = kept;
      // Color War placed on Monday before its stations are built.
      clearColorWarsSchedule(ids);

      Test.startTest();
      Id firstId = publishNow(ids.get('Draft')).published.id;
      Assert.areEqual(1, carried(firstId).size(), 'Field Day only');
      buildColorWarsSchedule(ids);
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        ids.get('Draft')
      );
      SchedulePublish.Result result = ManualBuildController.publish(
        ids.get('Draft'),
        preview.revisions,
        preview.published.id
      );
      Test.stopTest();

      Assert.isTrue(preview.published.changedSince);
      Assert.areEqual(1, preview.eventCount, String.valueOf(preview.changes));
      Assert.areEqual(1, preview.changeCount, String.valueOf(preview.changes));
      Assert.areEqual('Color War: schedule added', preview.changes[0]);
      Assert.isFalse(result.unchanged, 'Published again');
      Assert.areNotEqual(firstId, result.published.id);
      Assert.areEqual(2, carried(result.published.id).size());
    }
  }

  @IsTest
  static void anEventsScheduleRemovedAfterPublishingIsSomethingToPublish() {
    // Read outside System.runAs: the kept record is the test runner's (KeptCamp).
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(kept)) {
      Map<String, Id> ids = kept;

      Test.startTest();
      publishNow(ids.get('Draft'));
      clearColorWarsSchedule(ids);
      SchedulePublish.Preview preview = ManualBuildController.previewPublish(
        ids.get('Draft')
      );
      Test.stopTest();

      Assert.isTrue(preview.published.changedSince);
      Assert.areEqual(1, preview.eventCount, String.valueOf(preview.changes));
      Assert.areEqual(1, preview.changeCount, String.valueOf(preview.changes));
      Assert.areEqual('Color War: schedule removed', preview.changes[0]);
    }
  }

  @IsTest
  static void onlyPublishWritesWhatAPublishedCopyCarries() {
    // Read outside System.runAs: the kept record is the test runner's (KeptCamp).
    Map<String, Id> kept = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(kept)) {
      Map<String, Id> ids = kept;
      Test.startTest();
      Id publishedId = publishNow(ids.get('Draft')).published.id;
      // Publishing the week as it is again changes nothing.
      Assert.isTrue(publishNow(ids.get('Draft')).unchanged);
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
      Test.stopTest();
      Assert.isFalse(removed.isSuccess());
      Assert.areEqual(rows.size(), carried(publishedId).size());
    }
  }
}
