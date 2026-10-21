/**
 * Special days and events and where they are put (ADR 0014), as a scheduler with the Shoresh
 * Scheduler permission set: records are made inside the same System.runAs.
 */
@IsTest
private class SpecialDatesTest {
  private class Camp {
    Season__c season;
    Map<String, Id> ids;

    Camp() {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      season = ShoreshTestData.fullSeason(camp.Id);
      ids = ShoreshTestData.lastSeasonIds;
    }

    Id specialDay(String name) {
      SpecialDay__c day = new SpecialDay__c(Season__c = season.Id, Name = name);
      Database.insert(day, AccessLevel.USER_MODE);
      return day.Id;
    }

    Id specialEvent(String name, Id locationId) {
      SpecialEvent__c event = new SpecialEvent__c(
        Season__c = season.Id,
        Name = name,
        Location__c = locationId
      );
      Database.insert(event, AccessLevel.USER_MODE);
      return event.Id;
    }

    Id location(String name) {
      Location__c location = new Location__c(
        Season__c = season.Id,
        Name = name,
        GroupsThatFit__c = 3
      );
      Database.insert(location, AccessLevel.USER_MODE);
      return location.Id;
    }
  }

  private static String refusalOf(Id itemId, String week, String day, Camp c) {
    try {
      SpecialDates.place(itemId, c.ids.get(week), day);
      Assert.fail('Refused: ' + week + ' ' + day);
    } catch (DmlException e) {
      return e.getDmlMessage(0);
    }
    return null;
  }

  @IsTest
  static void aSpecialDayIsPutOnAWeekDayAndReadBackWithItsDate() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Id fieldDay = c.specialDay('Field Day');

      SpecialDates.place(fieldDay, c.ids.get('Week 2'), 'Tuesday');

      List<SpecialDates.Placement> placed = SpecialDates.forSeason(c.season.Id);
      Assert.areEqual(1, placed.size());
      Assert.areEqual('D', placed[0].kind);
      Assert.areEqual(fieldDay, placed[0].itemId);
      Assert.areEqual('Field Day', placed[0].itemName);
      Assert.areEqual('Week 2', placed[0].weekName);
      Assert.areEqual('Tuesday', placed[0].day);
      Assert.areEqual(Date.newInstance(2026, 7, 7), placed[0].onDate);
    }
  }

  @IsTest
  static void aWeekDayHoldsOneSpecialDayForTheWholeCamp() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      SpecialDates.place(
        c.specialDay('Field Day'),
        c.ids.get('Week 2'),
        'Tuesday'
      );
      Id colorWar = c.specialDay('Color War');

      Assert.areEqual(
        'Tuesday of "Week 2" already has the special day "Field Day". Take it off first, or choose another day.',
        refusalOf(colorWar, 'Week 2', 'Tuesday', c)
      );
      // Another day of the same week is free.
      SpecialDates.place(colorWar, c.ids.get('Week 2'), 'Wednesday');
      Assert.areEqual(2, SpecialDates.forSeason(c.season.Id).size());
    }
  }

  @IsTest
  static void somethingOnSeveralDaysIsPutOnEachDayInOrder() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Id carnival = c.specialEvent('Carnival', null);
      Id fieldDay = c.specialDay('Field Day');
      // Put on out of order: read back by week, then Monday to Friday, special day first.
      SpecialDates.place(carnival, c.ids.get('Week 3'), 'Monday');
      SpecialDates.place(carnival, c.ids.get('Week 1'), 'Thursday');
      SpecialDates.place(carnival, c.ids.get('Week 1'), 'Tuesday');
      SpecialDates.place(fieldDay, c.ids.get('Week 1'), 'Thursday');

      List<String> seen = new List<String>();
      for (
        SpecialDates.Placement placed : SpecialDates.forSeason(c.season.Id)
      ) {
        seen.add(placed.weekName + ' ' + placed.day + ' ' + placed.itemName);
      }
      Assert.areEqual(
        new List<String>{
          'Week 1 Tuesday Carnival',
          'Week 1 Thursday Field Day',
          'Week 1 Thursday Carnival',
          'Week 3 Monday Carnival'
        },
        seen
      );
    }
  }

  @IsTest
  static void theSameSpecialEventIsOnADayOnlyOnce() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Id carnival = c.specialEvent('Carnival', null);
      SpecialDates.place(carnival, c.ids.get('Week 1'), 'Monday');
      SpecialDates.place(
        c.specialEvent('Talent show', null),
        c.ids.get('Week 1'),
        'Monday'
      );

      Assert.areEqual(
        'This special event is already on Monday of "Week 1".',
        refusalOf(carnival, 'Week 1', 'Monday', c)
      );
    }
  }

  @IsTest
  static void aDayTheWeekDoesNotHaveIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Week__c shortWeek = new Week__c(
        Season__c = c.season.Id,
        Name = 'Short week',
        StartDate__c = Date.newInstance(2026, 8, 12),
        EndDate__c = Date.newInstance(2026, 8, 14)
      );
      Database.insert(shortWeek, AccessLevel.USER_MODE);
      c.ids.put('Short week', shortWeek.Id);

      Assert.areEqual(
        '"Short week" has no Monday.',
        refusalOf(c.specialDay('Field Day'), 'Short week', 'Monday', c)
      );
    }
  }

  @IsTest
  static void aWeekFromAnotherSeasonIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Season__c other = ShoreshTestData.season(c.season.Camp__c, 'Other');
      c.ids.put('Other week', ShoreshTestData.weeks(other.Id, 1)[0].Id);

      Assert.areEqual(
        'This week belongs to a different season than the special day.',
        refusalOf(c.specialDay('Field Day'), 'Other week', 'Monday', c)
      );
    }
  }

  @IsTest
  static void twoWithTheSameNameInASeasonAreRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      c.specialDay('Field Day');
      c.specialEvent('Carnival', null);
      try {
        c.specialDay(' field day ');
        Assert.fail('Same name, other spelling');
      } catch (DmlException e) {
        Assert.areEqual(
          'There is already a special day called "field day" in this season.',
          e.getDmlMessage(0)
        );
      }
      try {
        c.specialEvent('CARNIVAL', null);
        Assert.fail('Same event name');
      } catch (DmlException e) {
        Assert.areEqual(
          'There is already a special event called "CARNIVAL" in this season.',
          e.getDmlMessage(0)
        );
      }
      // A special day and an event may share a name.
      c.specialEvent('Field Day', null);
    }
  }

  @IsTest
  static void aSpecialEventsLocationMustBeInItsSeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Season__c other = ShoreshTestData.season(c.season.Camp__c, 'Other');
      Location__c elsewhere = new Location__c(
        Season__c = other.Id,
        Name = 'Lake',
        GroupsThatFit__c = 2
      );
      Database.insert(elsewhere, AccessLevel.USER_MODE);
      try {
        c.specialEvent('Regatta', elsewhere.Id);
        Assert.fail('Location from another season');
      } catch (DmlException e) {
        Assert.areEqual(
          'This location belongs to a different season than the special event.',
          e.getDmlMessage(0)
        );
      }
    }
  }

  @IsTest
  static void deletingSomethingStillOnADayIsRefusedNamingTheDaysInTheCampsWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Database.insert(
        new CampLabel__c(
          Camp__c = c.season.Camp__c,
          ModelTerm__c = 'SpecialDay',
          Singular__c = 'Theme Day',
          Plural__c = 'Theme Days'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Id fieldDay = c.specialDay('Field Day');
      SpecialDates.place(fieldDay, c.ids.get('Week 5'), 'Thursday');
      SpecialDates.place(fieldDay, c.ids.get('Week 2'), 'Tuesday');
      Id carnival = c.specialEvent('Carnival', null);
      SpecialDates.place(carnival, c.ids.get('Week 1'), 'Monday');

      Database.DeleteResult refused = Database.delete(
        fieldDay,
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(refused.isSuccess());
      Assert.areEqual(
        'This Theme Day can\'t be deleted yet: it is on Tuesday of "Week 2" and Thursday of "Week 5". First take it off those days, then delete it.',
        refused.getErrors()[0].getMessage()
      );
      Assert.areEqual(
        'This special event can\'t be deleted yet: it is on Monday of "Week 1". First take it off that day, then delete it.',
        Database.delete(carnival, false, AccessLevel.USER_MODE).getErrors()[0]
          .getMessage()
      );
    }
  }

  @IsTest
  static void takenOffEveryDayItCanBeDeletedWithItsPlan() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Id fieldDay = c.specialDay('Field Day');
      Id placedId = SpecialDates.place(
        fieldDay,
        c.ids.get('Week 2'),
        'Tuesday'
      );
      SpecialPlans.write(fieldDay, SpecialPlansTest.plan(c.ids, 2), null);

      SpecialDates.takeOff(placedId);
      Assert.areEqual(0, SpecialDates.forSeason(c.season.Id).size());
      Assert.isNotNull(
        SpecialPlans.read(fieldDay).grid,
        'Taking off keeps the plan'
      );

      Database.delete(fieldDay, true, AccessLevel.USER_MODE);
      Assert.areEqual(0, [SELECT COUNT() FROM PlanPart__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void deletingAWeekTakesItsSpecialDaysOffButKeepsThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Id fieldDay = c.specialDay('Field Day');
      SpecialDates.place(fieldDay, c.ids.get('Week 6'), 'Monday');
      SpecialDates.place(fieldDay, c.ids.get('Week 2'), 'Monday');

      Database.delete(c.ids.get('Week 6'), true, AccessLevel.USER_MODE);

      List<SpecialDates.Placement> placed = SpecialDates.forSeason(c.season.Id);
      Assert.areEqual(1, placed.size());
      Assert.areEqual('Week 2', placed[0].weekName);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM SpecialDay__c WHERE Id = :fieldDay WITH USER_MODE]
      );
    }
  }

  @IsTest
  static void aSeasonWithSpecialDaysAndEventsCanBeDeleted() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Id carnival = c.specialEvent('Carnival', c.location('Field'));
      Id fieldDay = c.specialDay('Field Day');
      SpecialDates.place(carnival, c.ids.get('Week 1'), 'Monday');
      SpecialDates.place(fieldDay, c.ids.get('Week 1'), 'Monday');
      SpecialPlans.write(fieldDay, SpecialPlansTest.plan(c.ids, 2), null);
      SpecialPlans.write(carnival, SpecialPlansTest.plan(c.ids, 1), null);

      Database.delete(c.season.Id, true, AccessLevel.SYSTEM_MODE);

      Assert.areEqual(
        0,
        [SELECT COUNT() FROM SpecialEvent__c WITH SYSTEM_MODE]
      );
      Assert.areEqual(0, [SELECT COUNT() FROM SpecialDay__c WITH SYSTEM_MODE]);
      Assert.areEqual(0, [SELECT COUNT() FROM SpecialDate__c WITH SYSTEM_MODE]);
      Assert.areEqual(0, [SELECT COUNT() FROM PlanPart__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void aLocationASpecialEventUsesSaysSoWhenDeleted() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Id field = c.location('Field');
      c.specialEvent('Carnival', field);

      Assert.areEqual(
        'This can\'t be deleted yet: "Carnival" happens here. First choose another location for that special event, then delete it.',
        InUse.reason(field)
      );
      Assert.isFalse(
        Database.delete(field, false, AccessLevel.USER_MODE).isSuccess(),
        'Restrict-delete is the backstop'
      );
    }
  }

  @IsTest
  static void copyingASeasonLeavesSpecialDaysAndEventsBehind() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      Id fieldDay = c.specialDay('Field Day');
      c.specialEvent('Carnival', null);
      SpecialDates.place(fieldDay, c.ids.get('Week 1'), 'Monday');

      Id copyId = new SeasonCopier(c.season.Id, Date.newInstance(2027, 6, 28))
        .copy('Summer 2027');

      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM SpecialDay__c
          WHERE Season__c = :copyId
          WITH USER_MODE
        ]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM SpecialEvent__c
          WHERE Season__c = :copyId
          WITH USER_MODE
        ]
      );
      Assert.areEqual(0, SpecialDates.forSeason(copyId).size());
    }
  }

  @IsTest
  static void withoutTheSchedulerPermissionSetNothingIsPut() {
    Id fieldDay;
    Id weekId;
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      fieldDay = c.specialDay('Field Day');
      weekId = c.ids.get('Week 1');
    }
    System.runAs(ShoreshTestData.outsider()) {
      try {
        SpecialDates.place(fieldDay, weekId, 'Monday');
        Assert.fail('An outsider cannot put a special day on a day');
      } catch (ShoreshException e) {
        Assert.isTrue(e.getMessage().startsWith('That was not found'));
      }
    }
  }

  @IsTest
  static void readingASeasonsSpecialDatesIsOneQuery() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = new Camp();
      List<SpecialDay__c> days = new List<SpecialDay__c>();
      for (Integer i = 1; i <= 6; i++) {
        days.add(new SpecialDay__c(Season__c = c.season.Id, Name = 'Day ' + i));
      }
      Database.insert(days, AccessLevel.USER_MODE);
      List<SpecialDate__c> rows = new List<SpecialDate__c>();
      for (Integer i = 0; i < 6; i++) {
        rows.add(
          new SpecialDate__c(
            Season__c = c.season.Id,
            SpecialDay__c = days[i].Id,
            Week__c = c.ids.get('Week ' + (i + 1)),
            Day__c = 'Wednesday'
          )
        );
      }
      Database.insert(rows, AccessLevel.USER_MODE);

      Test.startTest();
      Integer before = Limits.getQueries();
      List<SpecialDates.Placement> placed = SpecialDates.forSeason(c.season.Id);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.areEqual(6, placed.size());
      Assert.areEqual(1, used, 'One query for a season, however many days');
    }
  }
}
