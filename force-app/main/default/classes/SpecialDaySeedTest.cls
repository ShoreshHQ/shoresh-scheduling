/**
 * A special day added on the Special events screen starts from the camp's regular day (ADR 0014
 * choice 12): its own copy of the first program's time blocks, every group as a row, and the
 * fixed and recurring activities that fall the same way every day and every week, the rest named
 * as left out. As a scheduler, with records made inside the same System.runAs.
 */
@IsTest
private class SpecialDaySeedTest {
  /** Adds a special day the way the screen's blank row does. */
  private static RowSaves.Result add(Id seasonId, String name) {
    return SetupTablesController.saveRow(
      new SpecialDay__c(Season__c = seasonId, Name = name, SortOrder__c = 1),
      null,
      null
    );
  }

  /** "Lunch break" in every group: a cell per group per time block, item names for numbers. */
  private static List<String> cells(ScheduleGrid grid) {
    List<String> result = new List<String>();
    for (Integer g = 0; g < grid.groups.size(); g++) {
      List<String> names = new List<String>();
      for (String cell : grid.rows[g]) {
        names.add(
          String.isBlank(cell) || cell == ScheduleGrid.CARRIES_ON
            ? cell
            : grid.items[Integer.valueOf(cell) - 1].name
        );
      }
      result.add(grid.groups[g].name + ': ' + String.join(names, ','));
    }
    return result;
  }

  @IsTest
  static void aNewSpecialDayStartsFromTheRegularDay() {
    System.runAs(ShoreshTestData.scheduler()) {
      // Main: Period 1 (9:00), Period 2 (10:00), Lunch (12:00); Juniors (Group A, Group B) and
      // Seniors (Group C); runs Monday to Thursday; six weeks.
      Map<String, Id> ids = SetTimeTestData.camp();
      Id seasonId = ids.get('Season');
      // Every day, every week: brought in for everyone.
      FixedActivity__c lunch = SetTimeTestData.fixed(
        ids,
        'Lunch break',
        'Lunch'
      );
      // Every day, but off in Week 2: left out.
      FixedActivity__c flag = SetTimeTestData.fixed(ids, 'Flag', 'Period 1');
      // Every day the program runs, for the Seniors only: brought in for Group C.
      RecurringActivity__c rest = SetTimeTestData.recurring(
        ids,
        'Rest',
        'Period 2'
      );
      rest.Tuesday__c = true;
      rest.Wednesday__c = true;
      rest.Thursday__c = true;
      // Mondays only, for the Juniors: left out.
      RecurringActivity__c swim = SetTimeTestData.recurring(
        ids,
        'Swim',
        'Period 2'
      );
      SetTimeTestData.save(
        new List<SObject>{ lunch, flag, rest, swim },
        SetTimeTestData.extras(
          new List<RunsIn.WeekOff>{
            SetTimeTestData.weekOff(1, null, ids.get('Week 2'))
          },
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(2, null, new List<Id>{ ids.get('Seniors') }),
            SetTimeTestData.who(3, null, new List<Id>{ ids.get('Juniors') })
          }
        )
      );
      // Another program's campfire, in a time block Main doesn't have: left out.
      Program__c teens = ShoreshTestData.program(seasonId, 'Teens');
      TimeBlock__c late = ShoreshTestData.timeBlock(teens.Id, 'Late', 14);
      SetTimeTestData.save(
        new List<SObject>{
          new FixedActivity__c(
            Program__c = teens.Id,
            Name = 'Campfire',
            TimeBlock__c = late.Id,
            Length__c = 1
          )
        }
      );

      Test.startTest();
      Integer before = Limits.getQueries();
      RowSaves.Result result = add(seasonId, 'Field Day');
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(used <= 40, 'Queries to add a special day: ' + used);
      SpecialDaySeed.Seed seed = result.seeded;
      Assert.areEqual('Main', seed.program);
      Assert.areEqual(3, seed.timeBlocks);
      Assert.areEqual(
        new List<String>{ 'Lunch break', 'Rest' },
        seed.broughtIn
      );
      Assert.areEqual(new List<String>{ 'Swim' }, seed.notEveryDay);
      Assert.areEqual(new List<String>{ 'Flag' }, seed.notEveryWeek);
      Assert.areEqual(new List<String>{ 'Campfire' }, seed.otherTimes);
      Assert.areEqual(new List<String>(), seed.slotTaken);

      SpecialPlans.Plan plan = SpecialPlans.read(result.id);
      Assert.isNull(plan.problem);
      Assert.areEqual(1, plan.revision);
      // Its own time blocks: ids of its own, Main's names and times.
      Assert.areEqual('b1', plan.grid.blocks[0].id);
      Assert.areEqual('Period 1', plan.grid.blocks[0].name);
      Assert.areEqual('09:00', plan.grid.blocks[0].startTime);
      Assert.areEqual('Lunch', plan.grid.blocks[2].name);
      Assert.areEqual(
        new List<String>{
          'Group A: ,,Lunch break',
          'Group B: ,,Lunch break',
          'Group C: ,Rest,Lunch break'
        },
        cells(plan.grid)
      );
    }
  }

  @IsTest
  static void theSameSetupAlwaysGivesTheSamePlan() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Lunch break', 'Lunch') }
      );
      Id first = add(ids.get('Season'), 'Field Day').id;
      Id second = add(ids.get('Season'), 'Color War').id;
      Assert.areEqual(
        SpecialPlans.read(first).grid.toText(),
        SpecialPlans.read(second).grid.toText()
      );
    }
  }

  @IsTest
  static void withNoTimeBlocksItStartsEmpty() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      RowSaves.Result result = add(season.Id, 'Field Day');
      Assert.isNull(result.seeded.program);
      Assert.areEqual(0, result.seeded.timeBlocks);
      Assert.isNull(SpecialPlans.read(result.id).grid, 'Nothing saved yet');
    }
  }

  @IsTest
  static void aMorningOnlyGroupKeepsItsAfternoonOpen() {
    System.runAs(ShoreshTestData.scheduler()) {
      // fullSeason's Group A and Group B come in the morning only.
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds;
      SetTimeTestData.save(
        new List<SObject>{
          new FixedActivity__c(
            Program__c = ids.get('Main'),
            Name = 'Opening',
            TimeBlock__c = ids.get('Period 1'),
            Length__c = 1
          ),
          new FixedActivity__c(
            Program__c = ids.get('Main'),
            Name = 'Lunch break',
            TimeBlock__c = ids.get('Lunch'),
            Length__c = 1
          )
        }
      );
      RowSaves.Result result = add(season.Id, 'Field Day');
      Assert.areEqual(new List<String>{ 'Opening' }, result.seeded.broughtIn);
      Assert.areEqual(
        new List<String>{ 'Group A: Opening,', 'Group B: Opening,' },
        cells(SpecialPlans.read(result.id).grid)
      );
    }
  }

  @IsTest
  static void anEventIsAddedWithoutAPlan() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      RowSaves.Result result = SetupTablesController.saveRow(
        new SpecialEvent__c(
          Season__c = ids.get('Season'),
          Name = 'Carnival',
          Location__c = ids.get('Field A'),
          Notes__c = 'Seniors run the booths',
          SortOrder__c = 1
        ),
        null,
        null
      );
      Assert.isNull(result.seeded);
      Assert.isNull(SpecialPlans.read(result.id).grid);
      SpecialEvent__c saved = [
        SELECT Name, Location__c, Notes__c
        FROM SpecialEvent__c
        WHERE Id = :result.id
        WITH USER_MODE
      ];
      Assert.areEqual(ids.get('Field A'), saved.Location__c);
      Assert.areEqual('Seniors run the booths', saved.Notes__c);
    }
  }

  @IsTest
  static void aSecondSpecialDayWithTheSameNameIsRefusedAndNothingIsSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      add(ids.get('Season'), 'Field Day');
      try {
        add(ids.get('Season'), 'field day');
        Assert.fail('Expected the second Field Day to be refused');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage().contains('There is already a special day called'),
          e.getMessage()
        );
      }
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM PlanPart__c WITH USER_MODE],
        'Only the first one\'s plan'
      );
    }
  }
}
