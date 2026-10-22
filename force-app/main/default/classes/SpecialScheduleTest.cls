/**
 * The schedule inside a special day or special event (ADR 0014 choices 14 and 15): opened with the
 * plan as one day, filled cell by cell as Manual Build is (a conflict when someone changed a cell
 * since, fixed activities kept), and an activity added from a cell at 0 times a week. As a
 * scheduler, with records made inside the same System.runAs; each request's queries are bounded.
 */
@IsTest
private class SpecialScheduleTest {
  @IsTest
  static void aSpecialDayOpensWithItsOwnTimeBlocksAndTheCampsGroups() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialSchedule.PlanView view = SpecialScheduleController.openPlan(
        ids.get('Field Day')
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 20, 'Queries to open a special day: ' + used);
      Assert.areEqual('SpecialDay', view.kind);
      Assert.areEqual('Field Day', view.name);
      Assert.areEqual(1, view.revision);
      Assert.isTrue(view.hasEntries);
      ScheduleViews.DayView day = view.schedule.days[0];
      Assert.areEqual(SpecialSchedule.PLAN_DAY, day.dateValue);
      Assert.areEqual(
        new List<String>{ 'b1 Period 1', 'b2 Period 2', 'b3 Lunch' },
        SpecialScheduleTestData.blockNames(day)
      );
      Assert.isFalse(day.blocks[0].gone, 'Its own time blocks are never gone');
      Assert.areEqual(
        new List<String>{
          'Group A: ,,Lunch break',
          'Group B: ,,Lunch break',
          'Group C: ,,Lunch break'
        },
        SpecialScheduleTestData.cells(day)
      );
      Assert.areEqual('F', day.items[0].kind);
      Assert.isFalse(day.groups[0].gone);
      Set<String> names = new Set<String>();
      for (ManualBuildViews.ActivityOption option : view.activities) {
        names.add(option.name);
        if (option.name == 'Swim') {
          // Swim is set up for Group A only: offered, marked for the others.
          Assert.isTrue(option.notFor.contains(ids.get('Group B')));
        }
      }
      Assert.isTrue(names.containsAll(new List<String>{ 'Swim', 'Soccer' }));
    }
  }

  @IsTest
  static void cellsAreFilledAsManualBuildFillsThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id dayId = ids.get('Field Day');
      String swim = 'A:' + ids.get('Swim');
      Id groupA = ids.get('Group A');

      Test.startTest();
      Integer before = Limits.getQueries();
      SlotEdits.Result saved = SpecialScheduleController.saveCells(
        dayId,
        SpecialScheduleTestData.edits(
          SpecialScheduleTestData.run(
            groupA,
            new List<String>{ 'b1', 'b2' },
            new List<String>{ swim, '^' + swim }
          )
        )
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 25, 'Queries to save a cell: ' + used);
      Assert.areEqual(0, saved.conflicts.size());
      Assert.areEqual('2', saved.revision);
      Assert.areEqual(
        'Group A: Swim,^,Lunch break',
        SpecialScheduleTestData.cells(saved.schedule.days[0])[0]
      );

      // The same edit again: its cells no longer hold what it says they held.
      SlotEdits.Result again = SpecialScheduleController.saveCells(
        dayId,
        SpecialScheduleTestData.edits(
          SpecialScheduleTestData.run(
            groupA,
            new List<String>{ 'b1' },
            new List<String>{ 'A:' + ids.get('Soccer') }
          )
        )
      );
      Assert.areEqual(new List<Integer>{ 0 }, again.conflicts);
      Assert.areEqual(2, SpecialPlans.read(dayId).revision);
    }
  }

  // ADR 0014 choice 15: what a special day started with is an ordinary cell of it, as on the
  // desktop (SpecialDayGridEditor.jsx): typed over in one group, and put back by Undo even once
  // no group holds it any more.
  @IsTest
  static void aBroughtInCellIsTypedOverAndPutBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id dayId = ids.get('Field Day');
      String swim = 'A:' + ids.get('Swim');
      String lunch =
        'F:' + SpecialSchedule.open(dayId).schedule.days[0].items[0].id;

      SlotEdits.Result saved = SpecialScheduleController.saveCells(
        dayId,
        SpecialScheduleTestData.edits(over(ids.get('Group B'), lunch, swim))
      );
      Assert.areEqual(0, saved.conflicts.size());
      Assert.areEqual(
        new List<String>{
          'Group A: ,,Lunch break',
          'Group B: ,,Swim',
          'Group C: ,,Lunch break'
        },
        SpecialScheduleTestData.cells(saved.schedule.days[0])
      );

      // Cleared in the other two groups, Lunch break leaves the plan's list...
      SpecialScheduleController.saveCells(
        dayId,
        SpecialScheduleTestData.edits(over(ids.get('Group A'), lunch, ''))
      );
      SpecialScheduleController.saveCells(
        dayId,
        SpecialScheduleTestData.edits(over(ids.get('Group C'), lunch, ''))
      );

      // ...and Undo puts it back, read again by its Id.
      Test.startTest();
      Integer before = Limits.getQueries();
      SlotEdits.Result undone = SpecialScheduleController.saveCells(
        dayId,
        SpecialScheduleTestData.edits(over(ids.get('Group B'), swim, lunch))
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 25, 'Queries to put one back: ' + used);
      Assert.areEqual(0, undone.conflicts.size());
      Assert.areEqual(
        new List<String>{
          'Group A: ,,',
          'Group B: ,,Lunch break',
          'Group C: ,,'
        },
        SpecialScheduleTestData.cells(undone.schedule.days[0])
      );
      Assert.areEqual(
        'F',
        SpecialSchedule.open(dayId).schedule.days[0].items[0].kind
      );
    }
  }

  /** One group's third time block, from what it held to what it should hold. */
  private static SlotEdits.Run over(Id groupId, String was, String now) {
    SlotEdits.Run run = SpecialScheduleTestData.run(
      groupId,
      new List<String>{ 'b3' },
      new List<String>{ now }
    );
    run.before = new List<String>{ was };
    return run;
  }

  @IsTest
  static void anActivityOfAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Season__c other = ShoreshTestData.season(ids.get('Camp'), 'Other');
      Activity__c elsewhere = ShoreshTestData.activity(
        other.Id,
        'Archery',
        null
      );
      Database.insert(elsewhere, AccessLevel.USER_MODE);
      try {
        SpecialScheduleController.saveCells(
          ids.get('Field Day'),
          SpecialScheduleTestData.edits(
            SpecialScheduleTestData.run(
              ids.get('Group A'),
              new List<String>{ 'b1' },
              new List<String>{ 'A:' + elsewhere.Id }
            )
          )
        );
        Assert.fail('Only the season\'s activities');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'That activity was not found. It may have been deleted.',
          e.getMessage()
        );
      }
    }
  }

  @IsTest
  static void anActivityAddedFromACellIsKeptForSpecialDays() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      ManualBuildViews.ActivityOption option = SpecialScheduleController.addActivity(
        ids.get('Field Day'),
        '  Opening   ceremony '
      );
      Assert.areEqual('Opening ceremony', option.name);
      Assert.areEqual(0, option.maxPerWeek);
      Assert.areEqual(1, option.length);
      ManualBuildViews.ActivityOption same = SpecialScheduleController.addActivity(
        ids.get('Field Day'),
        'swim'
      );
      Assert.areEqual(ids.get('Swim'), same.id, 'The season\'s, not a new one');
    }
  }

  @IsTest
  static void someoneWithoutAccessIsRefused() {
    Id dayId;
    System.runAs(ShoreshTestData.scheduler()) {
      dayId = SpecialScheduleTestData.campWithFieldDay().get('Field Day');
    }
    System.runAs(ShoreshTestData.outsider()) {
      try {
        SpecialScheduleController.openPlan(dayId);
        Assert.fail('Not theirs to open');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'That was not found, or you don\'t have access to it. Reload the page.',
          e.getMessage()
        );
      }
    }
  }
}
