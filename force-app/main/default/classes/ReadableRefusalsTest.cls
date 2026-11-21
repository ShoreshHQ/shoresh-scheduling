/**
 * A save-time check reads in system mode (ADR 0001 point 6), so its refusal says only what the
 * person may read: a value from a field their admin hid is left out of the sentence. Each test
 * builds the camp as a scheduler, then refuses someone holding a copy of Shoresh Scheduler
 * without one field (FieldAccessTestData.schedulerWithout). Camp Willow (synthetic).
 */
@IsTest
private class ReadableRefusalsTest {
  /** That user, shown the season as a camp's sharing would. */
  private static User shownTheSeason(User user, Id seasonId) {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Database.insert(
        new Season__Share(
          ParentId = seasonId,
          UserOrGroupId = user.Id,
          AccessLevel = 'Edit'
        ),
        AccessLevel.SYSTEM_MODE
      );
    }
    return user;
  }

  // The Pool fits 1 group (SetTimeTestData): someone who can't read that hears the clash
  // without the number.
  @IsTest
  static void aCrowdedLocationLeavesOutHowManyFitWhenThatIsHidden() {
    Map<String, Id> ids;
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
    }
    User hidden = shownTheSeason(
      FieldAccessTestData.schedulerWithout(Location__c.GroupsThatFit__c),
      ids.get('Season')
    );
    System.runAs(hidden) {
      FixedActivity__c flagpole = SetTimeTestData.fixed(
        ids,
        'Flagpole',
        'Period 1'
      );
      flagpole.Location__c = ids.get('Pool');
      Assert.areEqual(
        '"Pool" can\'t fit the 3 groups "Flagpole" would have there in Period 1 on Monday in ' +
        'Week 1. Choose another location, or raise how many groups fit at "Pool".',
        SetTimeTestData.refusal(new List<SObject>{ flagpole })
      );
    }
  }

  // Rest takes 2 time blocks: someone who can't read its length hears it would run past the
  // end, without the number.
  @IsTest
  static void runningPastTheEndLeavesOutTheLengthWhenThatIsHidden() {
    Map<String, Id> ids;
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
      FixedActivity__c rest = SetTimeTestData.fixed(ids, 'Rest', 'Period 2');
      rest.Length__c = 2;
      SetTimeTestData.save(new List<SObject>{ rest });
    }
    User hidden = shownTheSeason(
      FieldAccessTestData.schedulerWithout(FixedActivity__c.Length__c),
      ids.get('Season')
    );
    System.runAs(hidden) {
      Assert.areEqual(
        '"Rest" would run past the last time block of Main. Change "Rest" first, then try again.',
        SetTimeTestData.deleteRefusal(ids.get('Lunch'))
      );
    }
  }

  // A special day on Tuesday of Week 2 and Thursday of Week 5: someone who can't read the day
  // hears only the weeks.
  @IsTest
  static void aSpecialDaysDeleteLeavesOutTheDaysWhenThoseAreHidden() {
    Id seasonId;
    Id fieldDay;
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      seasonId = season.Id;
      Map<String, Id> ids = ShoreshTestData.lastSeasonIds;
      SpecialDay__c day = new SpecialDay__c(
        Season__c = season.Id,
        Name = 'Field Day'
      );
      Database.insert(day, AccessLevel.USER_MODE);
      fieldDay = day.Id;
      SpecialDates.place(fieldDay, ids.get('Week 5'), 'Thursday');
      SpecialDates.place(fieldDay, ids.get('Week 2'), 'Tuesday');
    }
    User hidden = shownTheSeason(
      FieldAccessTestData.schedulerWithout(SpecialDate__c.Day__c),
      seasonId
    );
    System.runAs(hidden) {
      Assert.areEqual(
        'This special day can\'t be deleted yet: it is on Week 2 and Week 5. First take it off those days, then delete it.',
        Database.delete(fieldDay, false, AccessLevel.USER_MODE).getErrors()[0]
          .getMessage()
      );
    }
  }
}
