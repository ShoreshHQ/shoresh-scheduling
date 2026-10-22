/**
 * One special day's or event's schedule imported from a file (ADR 0014 choice 17): an event's
 * columns become its stations, a special day's are matched to the camp's groups, names become the
 * season's activities or new ones at 0 times a week, and a schedule with entries is refused. As a
 * scheduler, with records made inside the same System.runAs.
 */
@IsTest
private class SpecialScheduleImportTest {
  @IsTest
  static void anEventIsImportedFromAFile() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id eventId = SpecialScheduleTestData.addEvent(
        ids.get('Season'),
        'Sports Day'
      );
      SpecialScheduleImport.Imported imported = SpecialScheduleTestData.sportsDay(
        new List<SpecialScheduleImport.ImportedColumn>{
          SpecialScheduleTestData.column(
            '1st Grade',
            new List<String>{ 'Opening ceremony', 'swim' }
          ),
          SpecialScheduleTestData.column(
            '3rd-4th',
            new List<String>{ 'Opening ceremony', '^' }
          ),
          SpecialScheduleTestData.column(
            '5th-6th',
            new List<String>{ '^', 'Relay races' }
          )
        }
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialScheduleImport.Outcome outcome = SpecialScheduleController.importPlan(
        eventId,
        null,
        imported
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 25, 'Queries to import: ' + used);
      Assert.areEqual(
        new List<String>{ 'Opening ceremony', 'Relay races' },
        outcome.added,
        'Swim is the season\'s, matched spaces and capitals aside'
      );
      Assert.areEqual(4, outcome.placed);
      ScheduleViews.DayView day = outcome.plan.schedule.days[0];
      Assert.areEqual(
        new List<String>{ 'b1 9:00 AM – 9:45 AM', 'b2 Stations' },
        SpecialScheduleTestData.blockNames(day)
      );
      Assert.areEqual(
        new List<String>{
          '1st Grade: Opening ceremony,Swim',
          '3rd-4th: Opening ceremony,^',
          '5th-6th: ,Relay races'
        },
        SpecialScheduleTestData.cells(day)
      );
      // Added for special days and events only: never placed in a regular week.
      Activity__c added = [
        SELECT TimesPerWeekMin__c, TimesPerWeekMax__c, NoWeeklyMax__c
        FROM Activity__c
        WHERE Name = 'Relay races'
        WITH USER_MODE
      ];
      Assert.areEqual(0, added.TimesPerWeekMin__c);
      Assert.areEqual(0, added.TimesPerWeekMax__c);

      // It has entries now: a second import is refused, nothing changed.
      try {
        SpecialScheduleController.importPlan(eventId, 1, imported);
        Assert.fail('Only an empty schedule is filled');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'Sports Day already has entries. Clear it first if you want to replace it with an import, or add to it by hand.',
          e.getMessage()
        );
      }
      Assert.areEqual(1, SpecialPlans.read(eventId).revision);
    }
  }

  @IsTest
  static void aSpecialDaysImportFillsTheGroupsItNames() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id dayId = SpecialScheduleTestData.addDay(ids.get('Season'), 'Field Day');
      // Nothing brought in (no fixed activities), so it is empty and can be imported.
      SpecialScheduleImport.Outcome outcome = SpecialScheduleController.importPlan(
        dayId,
        1,
        SpecialScheduleTestData.sportsDay(
          new List<SpecialScheduleImport.ImportedColumn>{
            SpecialScheduleTestData.column(
              'group b',
              new List<String>{ 'Soccer', '' }
            ),
            SpecialScheduleTestData.column(
              'Staff',
              new List<String>{ 'Meeting', '' }
            )
          }
        )
      );
      Assert.areEqual(new List<String>{ 'Staff' }, outcome.notGroups);
      Assert.areEqual(new List<String>(), outcome.added);
      Assert.areEqual(
        new List<String>{ 'Group A: ,', 'Group B: Soccer,', 'Group C: ,' },
        SpecialScheduleTestData.cells(outcome.plan.schedule.days[0])
      );
    }
  }

  // What a special day started with is not an entry (the desktop's seed never stops an import,
  // its ADR 2026-08-22-event-schedule-import §6): the file replaces it and the outcome names it.
  // Once the director types a cell, an import is refused.
  @IsTest
  static void aSeededSpecialDayIsImportedIntoAndSaysWhatWasReplaced() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id dayId = ids.get('Field Day');
      SpecialScheduleImport.Imported imported = SpecialScheduleTestData.sportsDay(
        new List<SpecialScheduleImport.ImportedColumn>{
          SpecialScheduleTestData.column(
            'Group A',
            new List<String>{ 'Soccer', '' }
          )
        }
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialScheduleImport.Outcome outcome = SpecialScheduleController.importPlan(
        dayId,
        1,
        imported
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 25, 'Queries to import: ' + used);
      Assert.areEqual(new List<String>{ 'Lunch break' }, outcome.replaced);
      // The time blocks it started with are replaced without asking, each change named.
      Assert.isFalse(outcome.asks);
      Assert.areEqual(
        new List<String>{ 'Period 1 > 9:00 AM – 9:45 AM' },
        renames(outcome.frame)
      );
      Assert.areEqual(
        new List<String>{ 'Period 2', 'Lunch' },
        outcome.frame.removed
      );
      Assert.areEqual(new List<String>{ 'Stations' }, outcome.frame.added);
      Assert.areEqual(
        new List<String>{ 'Group A: Soccer,', 'Group B: ,', 'Group C: ,' },
        SpecialScheduleTestData.cells(outcome.plan.schedule.days[0])
      );
      Assert.isTrue(outcome.plan.hasEntries);

      try {
        SpecialScheduleController.importPlan(dayId, 2, imported);
        Assert.fail('A typed cell is never written over');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'Field Day already has entries. Clear it first if you want to replace it with an import, or add to it by hand.',
          e.getMessage()
        );
      }
      Assert.areEqual(2, SpecialPlans.read(dayId).revision);
    }
  }

  // A time block the director renamed is not replaced quietly: the import asks first (nothing
  // saved), names each change, and replaces them only once the director says yes.
  @IsTest
  static void anImportAsksBeforeReplacingTimeBlocksTheDirectorChanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SpecialScheduleTestData.campWithFieldDay();
      Id dayId = ids.get('Field Day');
      SpecialScheduleFrame.Change rename = SpecialScheduleTestData.block(
        'Opening',
        '09:00',
        '09:45'
      );
      rename.action = 'changeBlock';
      rename.targetId = 'b1';
      SpecialScheduleController.changeFrame(dayId, 1, rename);
      SpecialScheduleImport.Imported imported = SpecialScheduleTestData.sportsDay(
        new List<SpecialScheduleImport.ImportedColumn>{
          SpecialScheduleTestData.column(
            'Group A',
            new List<String>{ 'Soccer', '' }
          )
        }
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      SpecialScheduleImport.Outcome asked = SpecialScheduleController.importPlan(
        dayId,
        2,
        imported
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 25, 'Queries to ask: ' + used);
      Assert.isTrue(asked.asks);
      Assert.isNull(asked.plan);
      Assert.areEqual(
        new List<String>{ 'Opening > 9:00 AM – 9:45 AM' },
        renames(asked.frame)
      );
      Assert.areEqual(
        new List<String>{ 'Period 2', 'Lunch' },
        asked.frame.removed
      );
      Assert.areEqual(2, SpecialPlans.read(dayId).revision, 'Nothing saved');

      imported.replaceEdited = true;
      SpecialScheduleImport.Outcome done = SpecialScheduleController.importPlan(
        dayId,
        2,
        imported
      );
      Assert.isFalse(done.asks);
      Assert.areEqual(
        new List<String>{ 'b1 9:00 AM – 9:45 AM', 'b2 Stations' },
        SpecialScheduleTestData.blockNames(done.plan.schedule.days[0])
      );
      Assert.areEqual(new List<String>{ 'Stations' }, done.frame.added);
    }
  }

  // An event's time blocks and stations are all the director's: an import that changes them asks.
  @IsTest
  static void anEventsImportAsksBeforeReplacingItsStations() {
    System.runAs(ShoreshTestData.scheduler()) {
      Id eventId = SpecialScheduleTestData.colorWar(SetTimeTestData.camp());
      SpecialScheduleImport.Outcome asked = SpecialScheduleController.importPlan(
        eventId,
        4,
        SpecialScheduleTestData.sportsDay(
          new List<SpecialScheduleImport.ImportedColumn>{
            SpecialScheduleTestData.column(
              'Blue',
              new List<String>{ 'Tug of war', '' }
            ),
            SpecialScheduleTestData.column('Green', new List<String>{ '', '' })
          }
        )
      );
      Assert.isTrue(asked.asks);
      Assert.areEqual(new List<String>{ 'Gold' }, asked.frame.stationsRemoved);
      Assert.areEqual(new List<String>{ 'Green' }, asked.frame.stationsAdded);
      Assert.areEqual(
        new List<String>{ 'Relays > Stations' },
        renames(asked.frame)
      );
      Assert.areEqual(new List<String>(), asked.frame.removed);
      Assert.areEqual(4, SpecialPlans.read(eventId).revision, 'Nothing saved');
    }
  }

  private static List<String> renames(SpecialImportFrame.FrameChanges frame) {
    List<String> result = new List<String>();
    for (SpecialImportFrame.BlockRename rename : frame.renamed) {
      result.add(rename.was + ' > ' + rename.now);
    }
    return result;
  }
}
