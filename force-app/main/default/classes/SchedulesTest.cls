/**
 * Schedules and their days, as a scheduler with the Shoresh Scheduler permission set: saving
 * days (revisions, parts, dates), the schedule page's versions list, opening a version, renaming
 * it, and keeping a schedule's week in its program's season.
 */
@IsTest
private class SchedulesTest {
  private class Camp {
    Id seasonId;
    Program__c program;
    List<Week__c> weeks;
    List<TimeBlock__c> blocks;
    List<Group__c> groups;
    Map<String, Id> ids;
  }

  private static Camp camp() {
    Camp result = new Camp();
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    result.seasonId = ShoreshTestData.fullSeason(camp.Id).Id;
    result.ids = ShoreshTestData.placesAndActivities(result.seasonId);
    result.program = [
      SELECT Id
      FROM Program__c
      WHERE Season__c = :result.seasonId
      WITH SYSTEM_MODE
    ];
    result.weeks = [
      SELECT Id, Name, StartDate__c
      FROM Week__c
      WHERE Season__c = :result.seasonId
      WITH SYSTEM_MODE
      ORDER BY StartDate__c
    ];
    result.blocks = [
      SELECT Id, Name
      FROM TimeBlock__c
      WHERE Program__c = :result.program.Id
      WITH SYSTEM_MODE
      ORDER BY StartTime__c
    ];
    result.groups = [
      SELECT Id, Name
      FROM Group__c
      WHERE Division__r.Program__c = :result.program.Id
      WITH SYSTEM_MODE
      ORDER BY Name
    ];
    FixedActivity__c flagpole = new FixedActivity__c(
      Program__c = result.program.Id,
      Name = 'Flagpole',
      TimeBlock__c = result.blocks[0].Id,
      Length__c = 1
    );
    Database.insert(flagpole, AccessLevel.SYSTEM_MODE);
    result.ids.put('Flagpole', flagpole.Id);
    return result;
  }

  private static ScheduleGrid grid(Camp c) {
    return ShoreshTestData.grid(c.blocks, c.groups, c.ids);
  }

  private static ScheduleDaySaves.DaySave save(
    Camp c,
    Integer dayOfWeek,
    Integer expectedRevision
  ) {
    return new ScheduleDaySaves.DaySave(
      c.weeks[0].StartDate__c.addDays(dayOfWeek),
      grid(c),
      expectedRevision
    );
  }

  @IsTest
  static void daysAreSavedAndReadBackInDateOrder() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Schedule__c version = ShoreshTestData.version(
        c.program.Id,
        c.weeks[0].Id,
        'Imported from summer.xlsx'
      );
      Test.startTest();
      ScheduleDaySaves.write(
        version.Id,
        new List<ScheduleDaySaves.DaySave>{ save(c, 2, null), save(c, 0, null) }
      );
      List<ScheduleDays.DayGrid> days = ScheduleDays.read(version.Id);
      Test.stopTest();
      Assert.areEqual(2, days.size());
      Assert.areEqual(c.weeks[0].StartDate__c, days[0].day, 'Monday first');
      Assert.areEqual(1, days[0].revision);
      Assert.isNull(days[0].problem);
      Assert.areEqual(grid(c).toText(), days[0].grid.toText());
    }
  }

  @IsTest
  static void aSaveFromAnOlderCopyIsRefusedAndNothingIsSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Schedule__c version = ShoreshTestData.version(
        c.program.Id,
        c.weeks[0].Id,
        'V'
      );
      ScheduleDaySaves.write(
        version.Id,
        new List<ScheduleDaySaves.DaySave>{ save(c, 0, null) }
      );
      Test.startTest();
      // Someone else saves Monday (revision 1 becomes 2).
      ScheduleDaySaves.write(
        version.Id,
        new List<ScheduleDaySaves.DaySave>{ save(c, 0, 1) }
      );
      // A save still working from revision 1, together with a new Tuesday.
      try {
        ScheduleDaySaves.write(
          version.Id,
          new List<ScheduleDaySaves.DaySave>{ save(c, 1, null), save(c, 0, 1) }
        );
        Assert.fail('refused');
      } catch (ShoreshException e) {
        Assert.isTrue(e.getMessage().contains('Open it again'), e.getMessage());
      }
      // A "new" day that someone else already saved is refused too.
      try {
        ScheduleDaySaves.write(
          version.Id,
          new List<ScheduleDaySaves.DaySave>{ save(c, 0, null) }
        );
        Assert.fail('refused');
      } catch (ShoreshException e) {
        Assert.isNotNull(e.getMessage());
      }
      Test.stopTest();
      List<ScheduleDays.DayGrid> days = ScheduleDays.read(version.Id);
      Assert.areEqual(1, days.size(), 'Tuesday was not saved either');
      Assert.areEqual(2, days[0].revision);
    }
  }

  @IsTest
  static void aDayOutsideTheWeekIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Schedule__c version = ShoreshTestData.version(
        c.program.Id,
        c.weeks[0].Id,
        'V'
      );
      try {
        ScheduleDaySaves.write(
          version.Id,
          new List<ScheduleDaySaves.DaySave>{ save(c, 7, null) }
        );
        Assert.fail('refused');
      } catch (ShoreshException e) {
        Assert.isTrue(e.getMessage().contains('Week 1'), e.getMessage());
      }
    }
  }

  @IsTest
  static void aBigDayIsStoredInPartsAndShrinksBack() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Schedule__c version = ShoreshTestData.version(
        c.program.Id,
        c.weeks[0].Id,
        'V'
      );
      Test.startTest();
      // Room for the time blocks and items and one group per part.
      ScheduleGrid frame = grid(c);
      frame.groups.clear();
      frame.rows.clear();
      ScheduleGridParts.partLimit = frame.toText().length() + 50;
      ScheduleDaySaves.write(
        version.Id,
        new List<ScheduleDaySaves.DaySave>{ save(c, 0, null) }
      );
      Integer parts = [
        SELECT COUNT()
        FROM ScheduleDay__c
        WHERE Schedule__c = :version.Id
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(2, parts, 'one part per group');
      List<ScheduleDays.DayGrid> days = ScheduleDays.read(version.Id);
      Assert.areEqual(grid(c).toText(), days[0].grid.toText(), 'joined');

      ScheduleGridParts.partLimit = 100000;
      ScheduleDaySaves.write(
        version.Id,
        new List<ScheduleDaySaves.DaySave>{ save(c, 0, 1) }
      );
      Test.stopTest();
      List<ScheduleDay__c> left = [
        SELECT Part__c, Revision__c
        FROM ScheduleDay__c
        WHERE Schedule__c = :version.Id
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(1, left.size(), 'extra parts removed');
      Assert.areEqual(1, left[0].Part__c);
      Assert.areEqual(2, left[0].Revision__c);
    }
  }

  @IsTest
  static void aDayThatCannotBeReadSaysWhyInsteadOfShowingHalf() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Schedule__c version = ShoreshTestData.version(
        c.program.Id,
        c.weeks[0].Id,
        'V'
      );
      Date monday = c.weeks[0].StartDate__c;
      Database.insert(
        new List<ScheduleDay__c>{
          new ScheduleDay__c(
            Schedule__c = version.Id,
            Date__c = monday,
            Grid__c = 'not a grid',
            GridFormatVersion__c = 1,
            Revision__c = 1,
            Part__c = 1
          ),
          new ScheduleDay__c(
            Schedule__c = version.Id,
            Date__c = monday.addDays(1),
            Grid__c = grid(c).toText(),
            GridFormatVersion__c = 2,
            Revision__c = 1,
            Part__c = 1
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      ScheduleViews.ScheduleView view = SchedulesController.openSchedule(
        version.Id
      );
      Assert.areEqual(2, view.days.size());
      Assert.isTrue(view.days[0].problem.contains('grid format'));
      Assert.isTrue(view.days[1].problem.contains('newer version'));
      Assert.areEqual(0, view.days[1].rows.size());
    }
  }

  @IsTest
  static void theVersionsListShowsAProgramsVersionsForTheWeekNewestFirst() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Schedule__c older = ShoreshTestData.version(
        c.program.Id,
        c.weeks[0].Id,
        'Imported from 2025.xlsx'
      );
      Schedule__c newer = ShoreshTestData.version(
        c.program.Id,
        c.weeks[0].Id,
        'Before my changes'
      );
      Test.setCreatedDate(older.Id, Datetime.now().addDays(-2));
      ShoreshTestData.version(c.program.Id, c.weeks[1].Id, 'Another week');
      Database.insert(
        new Schedule__c(
          Program__c = c.program.Id,
          Week__c = c.weeks[0].Id,
          Name = 'Working copy',
          Status__c = 'Draft',
          Origin__c = 'Manual'
        ),
        AccessLevel.SYSTEM_MODE
      );
      List<ScheduleViews.VersionRow> rows = SchedulesController.getVersions(
        c.program.Id,
        c.weeks[0].Id
      );
      Assert.areEqual(2, rows.size(), 'only this week, only versions');
      Assert.areEqual(newer.Id, rows[0].id);
      Assert.areEqual('Imported from 2025.xlsx', rows[1].name);
      Assert.areEqual('Imported', rows[1].origin);
      Assert.areEqual('Imported', rows[1].reason);
    }
  }

  @IsTest
  static void anOpenedVersionShowsWhatWasSavedAndWhatIsGoneSince() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Schedule__c version = ShoreshTestData.version(
        c.program.Id,
        c.weeks[0].Id,
        'V'
      );
      ScheduleDaySaves.write(
        version.Id,
        new List<ScheduleDaySaves.DaySave>{ save(c, 0, null) }
      );
      Test.startTest();
      // Swim is deleted after the version was saved (with what points at it).
      Database.delete(
        [
          SELECT Id
          FROM ActivityEligibility__c
          WHERE Activity__c = :c.ids.get('Swim')
          WITH SYSTEM_MODE
        ],
        AccessLevel.SYSTEM_MODE
      );
      Database.delete(c.ids.get('Swim'), AccessLevel.SYSTEM_MODE);
      ScheduleViews.ScheduleView view = SchedulesController.openSchedule(
        version.Id
      );
      Test.stopTest();
      Assert.areEqual('Version', view.status);
      Assert.areEqual('V', view.schedule.name);
      ScheduleViews.DayView monday = view.days[0];
      Assert.areEqual(c.weeks[0].StartDate__c, monday.dateValue);
      Assert.areEqual(c.blocks.size(), monday.blocks.size());
      Assert.areEqual('Group A', monday.groups[0].name);
      Assert.isFalse(monday.groups[0].gone);
      Assert.areEqual('Swim', monday.items[0].name, 'the saved name');
      Assert.isTrue(monday.items[0].gone, 'Swim was deleted');
      Assert.isFalse(monday.items[1].gone, 'Flagpole is still there');
      Assert.areEqual('E', monday.items[2].kind);
      Assert.isFalse(monday.items[2].gone, 'not set up yet is never gone');
      Assert.areEqual('1,^', monday.rows[0]);
    }
  }

  @IsTest
  static void aVersionCanBeRenamed() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Schedule__c version = ShoreshTestData.version(
        c.program.Id,
        c.weeks[0].Id,
        'Imported from summer.xlsx'
      );
      SchedulesController.renameSchedule(version.Id, '  Last summer  ');
      Assert.areEqual(
        'Last summer',
        [SELECT Name FROM Schedule__c WHERE Id = :version.Id WITH SYSTEM_MODE]
        .Name
      );
      try {
        SchedulesController.renameSchedule(version.Id, ' ');
        Assert.fail('refused');
      } catch (AuraHandledException e) {
        Assert.areEqual('Give the version a name.', e.getMessage());
      }
      try {
        SchedulesController.renameSchedule(version.Id, 'x'.repeat(81));
        Assert.fail('refused');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('80'), e.getMessage());
      }
    }
  }

  @IsTest
  static void someoneWithoutShoreshAccessCannotSeeOrRenameVersions() {
    Camp c;
    Schedule__c version;
    System.runAs(ShoreshTestData.scheduler()) {
      c = camp();
      version = ShoreshTestData.version(c.program.Id, c.weeks[0].Id, 'V');
    }
    System.runAs(ShoreshTestData.outsider()) {
      for (Integer attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt == 0) {
            SchedulesController.openSchedule(version.Id);
          } else if (attempt == 1) {
            SchedulesController.renameSchedule(version.Id, 'Mine');
          } else {
            SchedulesController.getVersions(c.program.Id, c.weeks[0].Id);
          }
          Assert.fail('refused: ' + attempt);
        } catch (Exception e) {
          Assert.isNotNull(e.getMessage());
        }
      }
    }
  }

  @IsTest
  static void aScheduleWeekMustBeInItsProgramsSeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp c = camp();
      Camp__c other = ShoreshTestData.camp('Camp Birch');
      Season__c otherSeason = ShoreshTestData.season(other.Id, 'Elsewhere');
      List<Week__c> otherWeeks = ShoreshTestData.weeks(otherSeason.Id, 1);
      Database.SaveResult result = Database.insert(
        new Schedule__c(
          Program__c = c.program.Id,
          Week__c = otherWeeks[0].Id,
          Name = 'V',
          Status__c = 'Version',
          Origin__c = 'Imported'
        ),
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(result.isSuccess());
      Assert.isTrue(
        result.getErrors()[0].getMessage().contains('in another season'),
        result.getErrors()[0].getMessage()
      );
    }
  }
}
