/** Who sees which seasons (docs/protocol/api.md API-4.10). Synthetic data only. */
@IsTest
private class SeasonAccessTest {
  /** A season someone else made, with a week, a program and a division under it, shared with no one. */
  private static Season__c unshared() {
    Camp__c camp = ShoreshTestData.camp('Camp Maple');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    ShoreshTestData.weeks(season.Id, 1);
    ShoreshTestData.division(
      ShoreshTestData.program(season.Id, 'Main').Id,
      'Juniors'
    );
    return season;
  }

  // API-4.10: everyone holding Shoresh Scheduler sees and changes every season of their
  // organization, and what is in it, with nothing shared by hand.
  @IsTest
  static void aSchedulerSeesAndChangesEverySeasonWithoutSharing() {
    Season__c season = unshared();
    System.runAs(ShoreshTestData.scheduler()) {
      List<Season__c> seen = [
        SELECT Id, Name
        FROM Season__c
        WHERE Id = :season.Id
        WITH USER_MODE
      ];
      Assert.areEqual(1, seen.size(), 'The season is seen');
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Week__c
          WHERE Season__c = :season.Id
          WITH USER_MODE
        ],
        'Its week is seen'
      );
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Division__c
          WHERE Program__r.Season__c = :season.Id
          WITH USER_MODE
        ],
        'Its division is seen'
      );
      seen[0].Name = 'Summer 2026 renamed';
      Database.SaveResult saved = Database.update(
        seen[0],
        false,
        AccessLevel.USER_MODE
      );
      Assert.isTrue(saved.isSuccess(), 'The season can be changed');
      Week__c week = [
        SELECT Id, Name
        FROM Week__c
        WHERE Season__c = :season.Id
        WITH USER_MODE
      ];
      week.Name = 'First week';
      saved = Database.update(week, false, AccessLevel.USER_MODE);
      Assert.isTrue(saved.isSuccess(), 'What is in it can be changed');
    }
  }

  // API-4.10: an outside system's connection sees only the seasons the camp shares with it.
  @IsTest
  static void aConnectionSeesOnlySeasonsSharedWithIt() {
    Season__c season = unshared();
    System.runAs(ShoreshTestData.userWith('Read_Group_Schedules')) {
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Season__c WHERE Id = :season.Id WITH USER_MODE],
        'An unshared season is not seen'
      );
    }
  }
}
