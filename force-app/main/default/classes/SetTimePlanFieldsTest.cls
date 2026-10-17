/**
 * Namespace safety for the set-time and activity-rule code (namespace retrofit, part 3): a fixed
 * or recurring activity's shared fields, the day fields, and saving an activity's "more rules"
 * with only some sent. Made-up camp only.
 */
@IsTest
private class SetTimePlanFieldsTest {
  @IsTest
  static void fixedAndRecurringActivitiesHaveTheirOwnFields() {
    SetTimePlan.ItemFields fixed = SetTimePlan.fieldsOf(
      FixedActivity__c.SObjectType
    );
    SetTimePlan.ItemFields recurring = SetTimePlan.fieldsOf(
      RecurringActivity__c.SObjectType
    );
    Assert.areEqual(FixedActivity__c.Program__c, fixed.program, 'Fixed');
    Assert.areEqual(FixedActivity__c.TimeBlock__c, fixed.timeBlock, 'Fixed');
    Assert.areEqual(FixedActivity__c.Length__c, fixed.length, 'Fixed');
    Assert.areEqual(FixedActivity__c.Location__c, fixed.location, 'Fixed');
    Assert.areEqual(
      FixedActivity__c.LastTimeBlock__c,
      fixed.lastTimeBlock,
      'Fixed'
    );
    Assert.areEqual(FixedActivity__c.CopiedFrom__c, fixed.copiedFrom, 'Fixed');
    Assert.areEqual(
      RecurringActivity__c.Program__c,
      recurring.program,
      'Recurring'
    );
    Assert.areEqual(
      RecurringActivity__c.LastTimeBlock__c,
      recurring.lastTimeBlock,
      'Recurring'
    );
    Assert.isNull(
      SetTimePlan.fieldsOf(Activity__c.SObjectType),
      'Not a set-time item'
    );
  }

  @IsTest
  static void weeksOffListNamesComeFromThePlatform() {
    String prefix = ShoreshSchema.prefix();
    Assert.areEqual(
      prefix + 'WeekExceptions__r',
      SetTimePlan.fieldsOf(FixedActivity__c.SObjectType).weeksOff(),
      'Fixed'
    );
    Assert.areEqual(
      prefix + 'WeekExceptions__r',
      SetTimePlan.fieldsOf(RecurringActivity__c.SObjectType).weeksOff(),
      'Recurring'
    );
  }

  @IsTest
  static void dayFieldsBelongToTheirObject() {
    Assert.areEqual(
      Program__c.Monday__c,
      SetTimePlan.dayField(Program__c.SObjectType, 'Monday'),
      'Program'
    );
    Assert.areEqual(
      RecurringActivity__c.Friday__c,
      SetTimePlan.dayField(RecurringActivity__c.SObjectType, 'Friday'),
      'Recurring activity'
    );
    for (String day : SetTimePlan.WEEKDAYS) {
      Assert.isNotNull(
        SetTimePlan.dayField(Program__c.SObjectType, day),
        'Program ' + day
      );
      Assert.isNotNull(
        SetTimePlan.dayField(RecurringActivity__c.SObjectType, day),
        'Recurring ' + day
      );
    }
  }

  /** Sending only the notes changes only the notes, with or without the prefix simulated. */
  @IsTest
  static void savingOnlyTheNotesLeavesTheOtherRulesAlone() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Aspen Bend (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Activity__c tennis = ShoreshTestData.activity(season.Id, 'Tennis', null);
      tennis.SameDivisionOnly__c = true;
      tennis.EarlyWeekCount__c = 1;
      tennis.EarlyWeekByDay__c = 'Tuesday';
      tennis.Notes__c = 'Rackets';
      insert as user tennis;
      Assert.isNotNull(tennis.Id, 'Saved with its rules');

      ActivitiesController.saveActivityDetails(
        new Activity__c(Id = tennis.Id, Notes__c = 'Rackets and balls'),
        new List<Id>()
      );
      assertRules(tennis.Id, 'Rackets and balls');

      ShoreshSchema.simulatedPrefix = 'shoresh__';
      ActivitiesController.saveActivityDetails(
        new Activity__c(Id = tennis.Id, Notes__c = 'Balls'),
        new List<Id>()
      );
      assertRules(tennis.Id, 'Balls');
    }
  }

  private static void assertRules(Id activityId, String notes) {
    Activity__c saved = [
      SELECT SameDivisionOnly__c, EarlyWeekCount__c, EarlyWeekByDay__c, Notes__c
      FROM Activity__c
      WHERE Id = :activityId
    ];
    Assert.areEqual(notes, saved.Notes__c, 'Notes changed');
    Assert.isTrue(saved.SameDivisionOnly__c, 'Same division only kept');
    Assert.areEqual(1, saved.EarlyWeekCount__c, 'Early week count kept');
    Assert.areEqual('Tuesday', saved.EarlyWeekByDay__c, 'Early by day kept');
  }
}
