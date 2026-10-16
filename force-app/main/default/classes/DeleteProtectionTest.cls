/**
 * Deleting: a whole season can be deleted even with rows inside it that point at its own groups
 * (platform check (a)); records with published history cannot; restrict-delete lookups still
 * protect what is in use.
 */
@IsTest
private class DeleteProtectionTest {
  private class EverythingPublished implements PublishedHistory.Finder {
    public Set<Id> withPublishedHistory(Set<Id> recordIds) {
      return recordIds;
    }
  }

  @IsTest
  static void aSeasonWithWeekExceptionsCanBeDeleted() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.fullSeason(camp.Id);
    Assert.areEqual(1, [SELECT COUNT() FROM WeekException__c WITH SYSTEM_MODE]);

    Database.delete(season, AccessLevel.SYSTEM_MODE);

    Assert.areEqual(0, [SELECT COUNT() FROM Season__c WITH SYSTEM_MODE]);
    Assert.areEqual(0, [SELECT COUNT() FROM Week__c WITH SYSTEM_MODE]);
    Assert.areEqual(0, [SELECT COUNT() FROM Program__c WITH SYSTEM_MODE]);
    Assert.areEqual(0, [SELECT COUNT() FROM Group__c WITH SYSTEM_MODE]);
    Assert.areEqual(0, [SELECT COUNT() FROM TimeBlock__c WITH SYSTEM_MODE]);
    Assert.areEqual(0, [SELECT COUNT() FROM WeekException__c WITH SYSTEM_MODE]);
  }

  @IsTest
  static void deletingOneSeasonLeavesTheOtherAlone() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c doomed = ShoreshTestData.fullSeason(camp.Id);
    Season__c kept = ShoreshTestData.fullSeason(camp.Id);
    Database.delete(doomed, AccessLevel.SYSTEM_MODE);
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM WeekException__c
        WHERE Week__r.Season__c = :kept.Id
        WITH SYSTEM_MODE
      ]
    );
    Assert.areEqual(
      6,
      [SELECT COUNT() FROM Week__c WHERE Season__c = :kept.Id WITH SYSTEM_MODE]
    );
  }

  @IsTest
  static void aGroupNamedInAWeekExceptionCannotBeDeleted() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    ShoreshTestData.fullSeason(camp.Id);
    WeekException__c row = [
      SELECT Group__c, Group__r.Division__c, Group__r.Division__r.Program__c
      FROM WeekException__c
      WITH SYSTEM_MODE
    ];

    Assert.isFalse(
      Database.delete(row.Group__c, false, AccessLevel.SYSTEM_MODE).isSuccess(),
      'group'
    );
    Assert.isFalse(
      Database.delete(row.Group__r.Division__c, false, AccessLevel.SYSTEM_MODE)
        .isSuccess(),
      'division above it'
    );
    Assert.isFalse(
      Database.delete(
          row.Group__r.Division__r.Program__c,
          false,
          AccessLevel.SYSTEM_MODE
        )
        .isSuccess(),
      'program above it'
    );
  }

  @IsTest
  static void aCampWithSeasonsCannotBeDeleted() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    ShoreshTestData.season(camp.Id, 'Summer 2026');
    Assert.isFalse(
      Database.delete(camp.Id, false, AccessLevel.SYSTEM_MODE).isSuccess()
    );
  }

  @IsTest
  static void aSeasonWithPublishedHistoryCannotBeDeleted() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Database.insert(
      new CampLabel__c(
        Camp__c = camp.Id,
        ModelTerm__c = 'PublishedSchedule',
        Singular__c = 'Final schedule',
        Plural__c = 'Final schedules'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Season__c season = ShoreshTestData.fullSeason(camp.Id);
    PublishedHistory.finder = new EverythingPublished();

    Database.DeleteResult result = Database.delete(
      season.Id,
      false,
      AccessLevel.SYSTEM_MODE
    );

    Assert.isFalse(result.isSuccess());
    Assert.areEqual(
      '"Summer 2026" has Final schedules, which are kept as history, so this season can\'t be deleted. Mark it Finished instead.',
      result.getErrors()[0].getMessage()
    );
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM WeekException__c WITH SYSTEM_MODE],
      'Nothing inside the season was cleared'
    );
  }

  @IsTest
  static void aProgramWithPublishedHistoryCannotBeDeleted() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Program__c program = ShoreshTestData.program(season.Id, 'Main');
    PublishedHistory.finder = new EverythingPublished();

    Database.DeleteResult result = Database.delete(
      program.Id,
      false,
      AccessLevel.SYSTEM_MODE
    );

    Assert.isFalse(result.isSuccess());
    Assert.areEqual(
      '"Main" has published schedules, which are kept as history, so this program can\'t be deleted.',
      result.getErrors()[0].getMessage()
    );
  }

  @IsTest
  static void aRefusedProgramDeleteKeepsItsGroupsUntickedWeeks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Program__c program = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :season.Id
        WITH SYSTEM_MODE
      ];
      PublishedHistory.finder = new EverythingPublished();
      try {
        SeasonSetupController.deleteRecord(program.Id);
        Assert.fail('A program with published history is kept');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('published schedules'));
      }
      // The groups' week ticks were cleared first; the refusal puts them back.
      Assert.areEqual(1, [SELECT COUNT() FROM Program__c WITH SYSTEM_MODE]);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM WeekException__c WITH SYSTEM_MODE]
      );
    }
  }

  @IsTest
  static void aWeekWithPublishedHistoryCannotBeDeleted() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Week__c week = ShoreshTestData.weeks(season.Id, 1)[0];
    PublishedHistory.finder = new EverythingPublished();

    Database.DeleteResult result = Database.delete(
      week.Id,
      false,
      AccessLevel.SYSTEM_MODE
    );

    Assert.isFalse(result.isSuccess());
    Assert.isTrue(
      result.getErrors()[0]
        .getMessage()
        .contains('so this week can\'t be deleted')
    );
  }

  @IsTest
  static void withoutPublishedHistoryProgramsAndWeeksDelete() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Program__c program = ShoreshTestData.program(season.Id, 'Main');
    Week__c week = ShoreshTestData.weeks(season.Id, 1)[0];
    Database.delete(program, AccessLevel.SYSTEM_MODE);
    Database.delete(week, AccessLevel.SYSTEM_MODE);
    Assert.areEqual(0, [SELECT COUNT() FROM Program__c WITH SYSTEM_MODE]);
    Assert.areEqual(0, [SELECT COUNT() FROM Week__c WITH SYSTEM_MODE]);
  }

  @IsTest
  static void aWeekExceptionMustNameAGroupFromTheSameSeason() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c first = ShoreshTestData.fullSeason(camp.Id);
    Season__c second = ShoreshTestData.season(camp.Id, 'Summer 2027');
    Week__c otherWeek = ShoreshTestData.weeks(second.Id, 1)[0];
    Group__c firstGroup = [
      SELECT Id
      FROM Group__c
      WHERE Division__r.Program__r.Season__c = :first.Id
      WITH SYSTEM_MODE
      LIMIT 1
    ];

    Database.SaveResult result = Database.insert(
      new WeekException__c(Week__c = otherWeek.Id, Group__c = firstGroup.Id),
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isFalse(result.isSuccess());
    Assert.areEqual(
      'This group belongs to a different season than the week.',
      result.getErrors()[0].getMessage()
    );

    Assert.isFalse(
      Database.insert(
          new WeekException__c(Week__c = otherWeek.Id),
          false,
          AccessLevel.SYSTEM_MODE
        )
        .isSuccess(),
      'needs a target'
    );
  }
}
