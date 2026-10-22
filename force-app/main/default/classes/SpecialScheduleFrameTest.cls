/**
 * A special day's or event's own time blocks and an event's stations (ADR 0014 choice 16): added
 * where they start, changed, moved, taken out, what is in a cell moving with them, Clear, a stale
 * revision refused, and a special day's columns kept as the camp's groups. As a scheduler, with
 * records made inside the same System.runAs.
 */
@IsTest
private class SpecialScheduleFrameTest {
  @IsTest
  static void anEventStartsWithNothingAndGetsItsOwnTimeBlocksAndStations() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id eventId = SpecialScheduleTestData.addEvent(
        ids.get('Season'),
        'Sports Day'
      );
      SpecialSchedule.PlanView view = SpecialScheduleController.openPlan(
        eventId
      );
      Assert.areEqual('SpecialEvent', view.kind);
      Assert.isNull(view.revision, 'An event starts with no plan');
      Assert.areEqual(0, view.schedule.days[0].groups.size());

      // A station before any time block: a row with no cells, read back as one.
      view = SpecialScheduleController.changeFrame(
        eventId,
        null,
        SpecialScheduleTestData.change('addStation', null, 'Blue')
      );
      Assert.areEqual(
        new List<String>{ 'Blue: ' },
        SpecialScheduleTestData.cells(view.schedule.days[0])
      );
      Test.startTest();
      Integer before = Limits.getQueries();
      view = SpecialScheduleController.changeFrame(
        eventId,
        1,
        SpecialScheduleTestData.block('Relays', '09:50', '11:20')
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(used <= 20, 'Queries to add a time block: ' + used);
      Assert.areEqual(2, view.revision);
      Assert.areEqual(
        new List<String>{ 'Blue: ' },
        SpecialScheduleTestData.cells(view.schedule.days[0])
      );
      Assert.areEqual('s1', view.schedule.days[0].groups[0].id);
    }
  }

  @IsTest
  static void aTimeBlockGoesWhereItStartsAndIsCalledByItsTimes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id eventId = SpecialScheduleTestData.colorWar(SetTimeTestData.camp());
      SpecialSchedule.PlanView view = SpecialSchedule.open(eventId);
      Assert.areEqual(4, view.revision);
      Assert.areEqual(
        new List<String>{ 'b2 9:00 AM – 9:45 AM', 'b1 Relays' },
        SpecialScheduleTestData.blockNames(view.schedule.days[0])
      );
      Assert.areEqual(
        new List<String>{ 'Blue: ,', 'Gold: ,' },
        SpecialScheduleTestData.cells(view.schedule.days[0])
      );
      // Opened at revision 2 and saved since: refused, nothing changed.
      try {
        SpecialScheduleController.changeFrame(
          eventId,
          2,
          SpecialScheduleTestData.change('addStation', null, 'Red')
        );
        Assert.fail('Saved since');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'Someone else changed this special event since you opened it. Open it again to see their changes, then make yours.',
          e.getMessage()
        );
      }
      SpecialScheduleFrame.Change times = SpecialScheduleTestData.change(
        'changeBlock',
        'b2',
        'Opening'
      );
      times.startTime = '08:30';
      times.endTime = '09:00';
      view = SpecialScheduleController.changeFrame(eventId, 4, times);
      Assert.areEqual(
        new List<String>{ 'b2 Opening', 'b1 Relays' },
        SpecialScheduleTestData.blockNames(view.schedule.days[0])
      );
      try {
        SpecialScheduleController.changeFrame(
          eventId,
          5,
          SpecialScheduleTestData.block('Late', '10:00', '09:00')
        );
        Assert.fail('Ends before it starts');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'The end time must be after the start time.',
          e.getMessage()
        );
      }
    }
  }

  @IsTest
  static void whatIsInACellMovesWithItsTimeBlockOrStation() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id eventId = SpecialScheduleTestData.colorWar(ids);
      String swim = 'A:' + ids.get('Swim');
      SlotEdits.Result saved = SpecialScheduleController.saveCells(
        eventId,
        SpecialScheduleTestData.edits(
          SpecialScheduleTestData.run(
            's9',
            new List<String>{ 'b2', 'b1' },
            new List<String>{ swim, '^' + swim }
          )
        )
      );
      Assert.areEqual(
        new List<Integer>{ 0 },
        saved.conflicts,
        'No such station'
      );
      saved = SpecialScheduleController.saveCells(
        eventId,
        SpecialScheduleTestData.edits(
          SpecialScheduleTestData.run(
            's1',
            new List<String>{ 'b2', 'b1' },
            new List<String>{ swim, '^' + swim }
          )
        )
      );
      Assert.areEqual(
        new List<String>{ 'Blue: Swim,^', 'Gold: ,' },
        SpecialScheduleTestData.cells(saved.schedule.days[0])
      );
      // Moving a time block cuts the placement in two.
      SpecialSchedule.PlanView view = SpecialScheduleController.changeFrame(
        eventId,
        5,
        SpecialScheduleTestData.move('moveBlock', 'b1', -1)
      );
      Assert.areEqual(
        new List<String>{ 'Blue: Swim,Swim', 'Gold: ,' },
        SpecialScheduleTestData.cells(view.schedule.days[0])
      );
      SpecialScheduleController.changeFrame(
        eventId,
        6,
        SpecialScheduleTestData.change('renameStation', 's1', 'Blue team')
      );
      view = SpecialScheduleController.changeFrame(
        eventId,
        7,
        SpecialScheduleTestData.move('moveStation', 's2', -1)
      );
      Assert.areEqual(
        new List<String>{ 'Gold: ,', 'Blue team: Swim,Swim' },
        SpecialScheduleTestData.cells(view.schedule.days[0])
      );
      view = SpecialScheduleController.changeFrame(
        eventId,
        8,
        SpecialScheduleTestData.change('removeStation', 's2', null)
      );
      Assert.areEqual(
        new List<String>{ 'Blue team: Swim,Swim' },
        SpecialScheduleTestData.cells(view.schedule.days[0])
      );
    }
  }

  @IsTest
  static void clearEmptiesEveryCellAndTheLastTimeBlockStays() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id eventId = SpecialScheduleTestData.colorWar(ids);
      String swim = 'A:' + ids.get('Swim');
      SpecialScheduleController.saveCells(
        eventId,
        SpecialScheduleTestData.edits(
          SpecialScheduleTestData.run(
            's2',
            new List<String>{ 'b1' },
            new List<String>{ swim }
          )
        )
      );
      SpecialSchedule.PlanView view = SpecialScheduleController.changeFrame(
        eventId,
        5,
        SpecialScheduleTestData.change('clear', null, null)
      );
      Assert.isFalse(view.hasEntries);
      Assert.areEqual(0, view.schedule.days[0].items.size());
      Assert.areEqual(2, view.schedule.days[0].blocks.size(), 'Blocks stay');
      SpecialScheduleController.changeFrame(
        eventId,
        6,
        SpecialScheduleTestData.change('removeBlock', 'b1', null)
      );
      try {
        SpecialScheduleController.changeFrame(
          eventId,
          7,
          SpecialScheduleTestData.change('removeBlock', 'b2', null)
        );
        Assert.fail('The last time block stays');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'This schedule needs at least one time block. Add another first.',
          e.getMessage()
        );
      }
      try {
        SpecialScheduleController.changeFrame(
          eventId,
          7,
          SpecialScheduleTestData.change('dropBlock', 'b2', null)
        );
        Assert.fail('Not a change the screen sends');
      } catch (AuraHandledException e) {
        Assert.areEqual('That change could not be read.', e.getMessage());
      }
    }
  }

  @IsTest
  static void aSpecialDaysColumnsAreTheCampsGroups() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      try {
        SpecialScheduleController.changeFrame(
          ids.get('Field Day'),
          1,
          SpecialScheduleTestData.change('addStation', null, 'Blue')
        );
        Assert.fail('A special day has no stations');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'A special day has a column for every group in camp.',
          e.getMessage()
        );
      }
      // A time block added to a special day gives every group an empty cell in it.
      SpecialSchedule.PlanView view = SpecialScheduleController.changeFrame(
        ids.get('Field Day'),
        1,
        SpecialScheduleTestData.block('Closing', '15:00', '15:30')
      );
      Assert.areEqual(
        'Group A: ,,Lunch break,',
        SpecialScheduleTestData.cells(view.schedule.days[0])[0]
      );
    }
  }
}
