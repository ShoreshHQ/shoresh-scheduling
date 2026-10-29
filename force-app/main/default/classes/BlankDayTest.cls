/**
 * Start a blank week's day builder (BlankDay): a fixed or recurring activity whose slot is
 * already taken is named, not skipped quietly. Setup refuses such clashes, so the plan is built
 * by hand here. Synthetic camp (SetTimeTestData).
 */
@IsTest
private class BlankDayTest {
  @IsTest
  static void aSetTimeWhoseSlotIsTakenIsNamedNotSkippedQuietly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      SetTimePlan.ProgramPlan plan = new SetTimePlan.ProgramPlan(
        new Program__c(Id = ids.get('Main'), Name = 'Main', Monday__c = true)
      );
      TimeBlock__c period1 = new TimeBlock__c(
        Id = ids.get('Period 1'),
        Name = 'Period 1',
        PartOfDay__c = 'Morning'
      );
      plan.addBlock(period1);
      Group__c groupA = new Group__c(
        Id = ids.get('Group A'),
        Name = 'Group A',
        Availability__c = 'AllDay'
      );
      plan.groups.add(groupA);
      BlankDay day = new BlankDay(
        new List<TimeBlock__c>{ period1 },
        new List<Group__c>{ groupA }
      );

      day.place(item(plan, new FixedActivity__c(Name = 'Flagpole')));
      day.place(item(plan, new RecurringActivity__c(Name = 'Rest')));

      Assert.areEqual('1', day.grid.rows[0][0]);
      Assert.areEqual('Flagpole', day.grid.items[0].name);
      Assert.areEqual(new List<String>{ 'Rest · Group A' }, day.notPlaced);
    }
  }

  @IsTest
  static void aGroupNotAtCampForPartOfASetTimeGetsOnlyThePartItIsThereFor() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      SetTimePlan.ProgramPlan plan = new SetTimePlan.ProgramPlan(
        new Program__c(Id = ids.get('Main'), Name = 'Main', Monday__c = true)
      );
      TimeBlock__c morning = new TimeBlock__c(
        Id = ids.get('Period 2'),
        Name = 'Period 2',
        PartOfDay__c = 'Morning'
      );
      TimeBlock__c afternoon = new TimeBlock__c(
        Id = ids.get('Lunch'),
        Name = 'Lunch',
        PartOfDay__c = 'Afternoon'
      );
      plan.addBlock(morning);
      plan.addBlock(afternoon);
      Group__c mornings = new Group__c(
        Id = ids.get('Group A'),
        Name = 'Group A',
        Availability__c = 'MorningOnly'
      );
      plan.groups.add(mornings);
      BlankDay day = new BlankDay(
        new List<TimeBlock__c>{ morning, afternoon },
        new List<Group__c>{ mornings }
      );
      SetTimePlan.Item cookout = item(
        plan,
        new FixedActivity__c(Name = 'Cookout')
      );
      cookout.length = 2;

      day.place(cookout);

      // Two blocks long, but Group A goes home before Lunch: Period 2 only.
      Assert.areEqual(new List<String>{ '1', '' }, day.grid.rows[0]);
      Assert.isTrue(day.notPlaced.isEmpty());
    }
  }

  @IsTest
  static void anAfternoonOnlyGroupGetsThePartOfASetTimeItIsThereFor() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      SetTimePlan.ProgramPlan plan = new SetTimePlan.ProgramPlan(
        new Program__c(Id = ids.get('Main'), Name = 'Main', Monday__c = true)
      );
      TimeBlock__c morning = new TimeBlock__c(
        Id = ids.get('Period 2'),
        Name = 'Period 2',
        PartOfDay__c = 'Morning'
      );
      TimeBlock__c afternoon = new TimeBlock__c(
        Id = ids.get('Lunch'),
        Name = 'Lunch',
        PartOfDay__c = 'Afternoon'
      );
      plan.addBlock(morning);
      plan.addBlock(afternoon);
      Group__c afternoons = new Group__c(
        Id = ids.get('Group B'),
        Name = 'Group B',
        Availability__c = 'AfternoonOnly'
      );
      plan.groups.add(afternoons);
      BlankDay day = new BlankDay(
        new List<TimeBlock__c>{ morning, afternoon },
        new List<Group__c>{ afternoons }
      );
      SetTimePlan.Item cookout = item(
        plan,
        new FixedActivity__c(Name = 'Cookout')
      );
      cookout.length = 2;

      day.place(cookout);

      // Period 2 to Lunch, but Group B comes for the afternoon: Lunch only.
      Assert.areEqual(new List<String>{ '', '1' }, day.grid.rows[0]);
    }
  }

  /**
   * CORE-3.7: on its early day a fixed activity starts that many time blocks earlier and still
   * ends where it always does; other days it is where it always is.
   */
  @IsTest
  static void aFixedActivityStartsEarlierOnItsEarlyDayOnly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      SetTimePlan.ProgramPlan plan = new SetTimePlan.ProgramPlan(
        new Program__c(
          Id = ids.get('Main'),
          Name = 'Main',
          Monday__c = true,
          Friday__c = true
        )
      );
      TimeBlock__c period2 = new TimeBlock__c(
        Id = ids.get('Period 2'),
        Name = 'Period 2',
        PartOfDay__c = 'Morning'
      );
      TimeBlock__c lunch = new TimeBlock__c(
        Id = ids.get('Lunch'),
        Name = 'Lunch',
        PartOfDay__c = 'Afternoon'
      );
      plan.addBlock(period2);
      plan.addBlock(lunch);
      plan.groups.add(
        new Group__c(
          Id = ids.get('Group A'),
          Name = 'Group A',
          Availability__c = 'AllDay'
        )
      );
      SetTimePlan.Item dismissal = item(
        plan,
        new FixedActivity__c(Name = 'Dismissal')
      );
      dismissal.start = 1;
      dismissal.earlyDay = 'Friday';
      dismissal.early = 1;
      List<TimeBlock__c> blocks = new List<TimeBlock__c>{ period2, lunch };

      BlankDay friday = new BlankDay(blocks, plan.groups);
      friday.place(dismissal, 'Friday');
      BlankDay monday = new BlankDay(blocks, plan.groups);
      monday.place(dismissal, 'Monday');

      Assert.areEqual(
        new List<String>{ '1', ScheduleGrid.CARRIES_ON },
        friday.grid.rows[0]
      );
      Assert.areEqual(new List<String>{ '', '1' }, monday.grid.rows[0]);
      Assert.areEqual(new List<Integer>{ 0, 1 }, dismissal.widest());
    }
  }

  /** A one-block item in the plan's first block, for its first group. */
  private static SetTimePlan.Item item(
    SetTimePlan.ProgramPlan plan,
    SObject record
  ) {
    SetTimePlan.Item item = new SetTimePlan.Item();
    item.record = record;
    item.term = record instanceof FixedActivity__c
      ? 'FixedActivity'
      : 'RecurringActivity';
    item.name = (String) record.get('Name');
    item.program = plan;
    item.start = 0;
    item.length = 1;
    item.groupIds.add(plan.groups[0].Id);
    return item;
  }
}
