/**
 * Special days and events on a week's schedules (ADR 0014 slice 4): Manual Build and Generated
 * Schedule are sent the week's days a special day replaces (with its own schedule); an event placed on the grid is on that day
 * (its special date follows the drafts that hold it, also when a draft or its program is deleted)
 * and can't be deleted while it is; Start from
 * another week names an event it leaves out. As a scheduler, with records made inside the same
 * System.runAs; each request's queries are bounded.
 */
@IsTest
private class WeekSpecialsTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final Date TUESDAY = Date.newInstance(2026, 6, 30);

  /** A run over cells of a week day: its blocks, then what they held and should hold. */
  private static SlotEdits.Run runOn(
    Date day,
    Id groupId,
    List<String> blockIds
  ) {
    SlotEdits.Run run = new SlotEdits.Run();
    run.day = day;
    run.groupId = groupId;
    run.firstBlockId = blockIds[0];
    run.blockIds = blockIds;
    return run;
  }

  /** One edit of one run: from what its cells held to what they should hold. */
  private static List<SlotEdits.Edit> edits(
    SlotEdits.Run run,
    List<String> before,
    List<String> after
  ) {
    run.before = before;
    run.after = after;
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = new List<SlotEdits.Run>{ run };
    return new List<SlotEdits.Edit>{ edit };
  }

  private static ManualBuildViews.DraftView blankWeek(Map<String, Id> ids) {
    return ManualBuildController.startBlankWeek(
      ids.get('Main'),
      ids.get('Week 1')
    );
  }

  private static List<SpecialDate__c> eventDays(Id eventId) {
    return [
      SELECT Week__c, Day__c
      FROM SpecialDate__c
      WHERE SpecialEvent__c = :eventId
      WITH USER_MODE
      ORDER BY Day__c
    ];
  }

  @IsTest
  static void aWeekIsSentTheDaysASpecialDayReplaces() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id carnival = SpecialScheduleTestData.addEvent(
        ids.get('Season'),
        'Carnival'
      );
      Database.update(
        new SpecialEvent__c(Id = carnival, Location__c = ids.get('Field A')),
        AccessLevel.USER_MODE
      );
      Database.update(
        new SpecialDay__c(Id = ids.get('Field Day'), Notes__c = 'Wear blue'),
        AccessLevel.USER_MODE
      );
      SpecialDates.place(ids.get('Field Day'), ids.get('Week 1'), 'Tuesday');
      ManualBuildViews.DraftView started = blankWeek(ids);

      Test.startTest();
      Integer before = Limits.getQueries();
      ManualBuildViews.DraftView view = ManualBuildController.getDraft(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 40, 'Queries to open a week: ' + used);
      Assert.areEqual(1, view.specials.days.size());
      WeekSpecials.ReplacedDay replaced = view.specials.days[0];
      Assert.areEqual(TUESDAY, replaced.dateValue);
      Assert.areEqual('Tuesday', replaced.day);
      Assert.areEqual('Field Day', replaced.name);
      Assert.areEqual('Wear blue', replaced.notes);
      Assert.areEqual(TUESDAY, replaced.plan.dateValue);
      // Its own time blocks, and the program's groups (all three are in Main).
      Assert.areEqual(3, replaced.plan.blocks.size());
      Assert.areEqual('b1', replaced.plan.blocks[0].id);
      Assert.areEqual(3, replaced.plan.groups.size());
      Assert.isFalse(replaced.plan.groups[0].gone);
      // The week's own Tuesday is kept as it is, out of sight.
      Assert.areEqual(
        started.schedule.days.size(),
        view.schedule.days.size(),
        'The week keeps its days'
      );
    }
  }

  @IsTest
  static void generatedScheduleIsSentThemToo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      SpecialDates.place(ids.get('Field Day'), ids.get('Week 1'), 'Wednesday');

      Test.startTest();
      GeneratedInputs.Inputs inputs = GeneratedScheduleController.getInputs(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Test.stopTest();

      Assert.areEqual(1, inputs.specials.days.size());
      Assert.areEqual(
        Date.newInstance(2026, 7, 1),
        inputs.specials.days[0].dateValue
      );
    }
  }

  @IsTest
  static void anEventPlacedOnTheGridIsOnThatDayUntilItIsTakenOff() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id carnival = SpecialScheduleTestData.addEvent(
        ids.get('Season'),
        'Carnival'
      );
      ManualBuildViews.DraftView view = blankWeek(ids);
      Id draftId = view.schedule.schedule.id;
      List<String> blocks = new List<String>{
        view.schedule.days[0].blocks[0].id,
        view.schedule.days[0].blocks[1].id
      };
      String event = 'S:' + carnival;

      Test.startTest();
      Integer before = Limits.getQueries();
      SlotEdits.Result saved = ManualBuildController.saveSlots(
        draftId,
        edits(
          runOn(MONDAY, ids.get('Group A'), blocks),
          new List<String>{ '', '' },
          new List<String>{ event, '^' + event }
        )
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 40, 'Queries to place an event: ' + used);
      Assert.isTrue(saved.conflicts.isEmpty());
      ScheduleViews.DayView firstDay = saved.schedule.days[0];
      Boolean found = false;
      for (ScheduleViews.Ref item : firstDay.items) {
        if (item.kind == 'S') {
          found = true;
          Assert.areEqual(String.valueOf(carnival), item.id);
          Assert.areEqual('Carnival', item.name);
          Assert.isFalse(item.gone);
        }
      }
      Assert.isTrue(found, 'The event is in Monday\'s list');
      List<SpecialDate__c> days = eventDays(carnival);
      Assert.areEqual(1, days.size(), 'On Monday of Week 1');
      Assert.areEqual('Monday', days[0].Day__c);
      Assert.areEqual(ids.get('Week 1'), days[0].Week__c);

      // On a day, it can't be deleted (ADR 0014 choice 8).
      Database.DeleteResult refused = Database.delete(
        new SpecialEvent__c(Id = carnival),
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(refused.isSuccess());
      Assert.isTrue(
        refused.getErrors()[0].getMessage().contains('Monday of "Week 1"'),
        refused.getErrors()[0].getMessage()
      );

      // Cleared from the grid, it is on no day.
      ManualBuildController.saveSlots(
        draftId,
        edits(
          runOn(MONDAY, ids.get('Group A'), blocks),
          new List<String>{ event, '^' + event },
          new List<String>{ '', '' }
        )
      );
      Assert.areEqual(0, eventDays(carnival).size());
    }
  }

  /** Carnival placed on Monday of Week 1 in the Main program's draft; its draft's id. */
  private static Id draftWithCarnival(Map<String, Id> ids, Id carnival) {
    ManualBuildViews.DraftView view = blankWeek(ids);
    Id draftId = view.schedule.schedule.id;
    ManualBuildController.saveSlots(
      draftId,
      edits(
        runOn(
          MONDAY,
          ids.get('Group A'),
          new List<String>{ view.schedule.days[0].blocks[0].id }
        ),
        new List<String>{ '' },
        new List<String>{ 'S:' + carnival }
      )
    );
    Assert.areEqual(1, eventDays(carnival).size(), 'On Monday of Week 1');
    return draftId;
  }

  @IsTest
  static void deletingAProgramTakesItsDraftsEventsOffTheirDays() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id carnival = SpecialScheduleTestData.addEvent(
        ids.get('Season'),
        'Carnival'
      );
      draftWithCarnival(ids, carnival);
      // 'Who can do it' is cleared first: Camp Setup refuses the delete while it names the program.
      Database.delete(
        [
          SELECT Id
          FROM ActivityEligibility__c
          WHERE
            Division__r.Program__c = :ids.get('Main')
            OR Group__r.Division__r.Program__c = :ids.get('Main')
          WITH USER_MODE
        ],
        true,
        AccessLevel.USER_MODE
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      // From Camp Setup: the draft and its days go with the program, with no trigger of their own.
      SeasonSetupController.deleteRecord(ids.get('Main'));
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 40, 'Queries to delete the program: ' + used);
      Assert.areEqual(0, eventDays(carnival).size(), 'On no day');
      // So it can be deleted (ADR 0014 choice 8).
      Assert.isTrue(
        Database.delete(
            new SpecialEvent__c(Id = carnival),
            false,
            AccessLevel.USER_MODE
          )
          .isSuccess()
      );
    }
  }

  @IsTest
  static void aDeletedDraftTakesItsEventsOffAndARestoredOnePutsThemBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id carnival = SpecialScheduleTestData.addEvent(
        ids.get('Season'),
        'Carnival'
      );
      Id draftId = draftWithCarnival(ids, carnival);

      Test.startTest();
      Database.delete(draftId, true, AccessLevel.USER_MODE);
      Assert.areEqual(0, eventDays(carnival).size(), 'On no day');
      Database.undelete(draftId, true, AccessLevel.USER_MODE);
      Test.stopTest();

      List<SpecialDate__c> days = eventDays(carnival);
      Assert.areEqual(1, days.size(), 'Back on Monday of Week 1');
      Assert.areEqual('Monday', days[0].Day__c);
    }
  }

  @IsTest
  static void aVersionHoldingADeletedEventCanBeRestored() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id carnival = SpecialScheduleTestData.addEvent(
        ids.get('Season'),
        'Carnival'
      );
      ManualBuildViews.DraftView view = blankWeek(ids);
      Id draftId = view.schedule.schedule.id;
      SlotEdits.Run run = runOn(
        MONDAY,
        ids.get('Group A'),
        new List<String>{ view.schedule.days[0].blocks[0].id }
      );
      String event = 'S:' + carnival;
      ManualBuildController.saveSlots(
        draftId,
        edits(run, new List<String>{ '' }, new List<String>{ event })
      );
      Id versionId = ManualBuildController.saveVersion(draftId, 'Carnival');
      ManualBuildController.saveSlots(
        draftId,
        edits(run, new List<String>{ event }, new List<String>{ '' })
      );
      // On no day now, so it can be deleted (ADR 0014 choice 8).
      Database.delete(
        new SpecialEvent__c(Id = carnival),
        true,
        AccessLevel.USER_MODE
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      ManualBuildViews.DraftView restored = ManualBuildController.restoreVersion(
        draftId,
        versionId,
        ScheduleDays.stamp(ScheduleDays.read(draftId))
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 40, 'Queries to restore: ' + used);
      Assert.isFalse(restored.changedSince);
      Boolean found = false;
      for (ScheduleViews.Ref item : restored.schedule.days[0].items) {
        if (item.kind == 'S') {
          found = true;
          Assert.isTrue(item.gone, 'Shown as removed');
        }
      }
      Assert.isTrue(found, 'The version\'s cell comes back');
      Assert.areEqual(0, eventDays(carnival).size(), 'On no day');
    }
  }

  @IsTest
  static void anEventOfAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      ManualBuildViews.DraftView view = blankWeek(ids);
      Season__c other = ShoreshTestData.season(ids.get('Camp'), 'Summer 2027');
      Id elsewhere = SpecialScheduleTestData.addEvent(other.Id, 'Carnival');

      Test.startTest();
      String refusal;
      try {
        ManualBuildController.saveSlots(
          view.schedule.schedule.id,
          edits(
            runOn(
              MONDAY,
              ids.get('Group A'),
              new List<String>{ view.schedule.days[0].blocks[0].id }
            ),
            new List<String>{ '' },
            new List<String>{ 'S:' + elsewhere }
          )
        );
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Test.stopTest();

      Assert.isNotNull(refusal, 'Refused');
      Assert.isTrue(refusal.contains('was not found'), refusal);
    }
  }

  @IsTest
  static void specialDatesFollowOnlyDrafts() {
    Assert.isTrue(
      SpecialEventDays.holdsEvent(
        '{"i":[["S","a0E000000000001AAA","Carnival"]]}'
      )
    );
    Assert.isFalse(
      SpecialEventDays.holdsEvent(
        '{"i":[["S","","Carnival"],["A","x","Swim"]]}'
      )
    );
    Assert.isFalse(SpecialEventDays.holdsEvent(null));
  }
}
