/**
 * What deleting a week, program, or season means for its schedules: drafts and versions go with
 * it (as in Shoresh desktop); a published schedule is kept as history, so the delete is refused.
 */
@IsTest
private class ScheduleDeleteTest {
  private static Map<String, Id> campWithVersion() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.fullSeason(camp.Id);
    Program__c program = [
      SELECT Id
      FROM Program__c
      WHERE Season__c = :season.Id
      WITH SYSTEM_MODE
    ];
    Week__c week = [
      SELECT Id, StartDate__c
      FROM Week__c
      WHERE Season__c = :season.Id
      WITH SYSTEM_MODE
      ORDER BY StartDate__c
      LIMIT 1
    ];
    Schedule__c version = ShoreshTestData.savedVersion(
      program.Id,
      week.Id,
      'V'
    );
    Database.insert(
      new ScheduleDay__c(
        Schedule__c = version.Id,
        Date__c = week.StartDate__c,
        Grid__c = '{"b":[],"g":[],"i":[],"r":[]}',
        GridFormatVersion__c = 1,
        Revision__c = 1,
        Part__c = 1
      ),
      AccessLevel.SYSTEM_MODE
    );
    return new Map<String, Id>{
      'Season' => season.Id,
      'Program' => program.Id,
      'Week' => week.Id,
      'Version' => version.Id
    };
  }

  private static Integer schedules() {
    return [SELECT COUNT() FROM Schedule__c WITH SYSTEM_MODE];
  }

  @IsTest
  static void deletingAWeekOnTheScreenTakesItsVersionsWithIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithVersion();
      SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
        ids.get('Season')
      );
      Assert.areEqual(
        1,
        setup.schedules.size(),
        'the delete message can say so'
      );
      Assert.areEqual(ids.get('Week'), setup.schedules[0].Week__c);

      SeasonSetupController.deleteRecord(ids.get('Week'));

      Assert.areEqual(0, schedules());
      Assert.areEqual(0, [SELECT COUNT() FROM ScheduleDay__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void salesforcesOwnDeleteOfAWeekWithVersionsIsRefused() {
    Map<String, Id> ids = campWithVersion();
    Assert.isFalse(
      Database.delete(ids.get('Week'), false, AccessLevel.SYSTEM_MODE)
        .isSuccess()
    );
    Assert.areEqual(1, schedules());
  }

  @IsTest
  static void aWeekWithAPublishedScheduleIsKept() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithVersion();
      // Written directly, as Publish would (PublishedGuard).
      PublishedGuard.allow();
      Database.insert(
        new Schedule__c(
          Program__c = ids.get('Program'),
          Week__c = ids.get('Week'),
          Name = 'Published',
          Status__c = 'Published',
          Origin__c = 'Manual'
        ),
        AccessLevel.SYSTEM_MODE
      );
      try {
        SeasonSetupController.deleteRecord(ids.get('Week'));
        Assert.fail('refused');
      } catch (AuraHandledException e) {
        Assert.isTrue(
          e.getMessage().contains('kept as history'),
          e.getMessage()
        );
      }
      Assert.areEqual(2, schedules(), 'the version was not deleted either');
    }
  }

  @IsTest
  static void aProgramOrSeasonWithAPublishedScheduleIsKept() {
    Map<String, Id> ids = campWithVersion();
    // Written directly, as Publish would (PublishedGuard).
    PublishedGuard.allow();
    Database.update(
      new Schedule__c(Id = ids.get('Version'), Status__c = 'Published'),
      AccessLevel.SYSTEM_MODE
    );
    Database.DeleteResult program = Database.delete(
      ids.get('Program'),
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isFalse(program.isSuccess());
    Assert.isTrue(
      program.getErrors()[0].getMessage().contains('kept as history')
    );
    Database.DeleteResult season = Database.delete(
      ids.get('Season'),
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isFalse(season.isSuccess());
    Assert.isTrue(season.getErrors()[0].getMessage().contains('Finished'));
  }

  @IsTest
  static void deletingAProgramTakesItsVersionsWithIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithVersion();
      SeasonSetupController.deleteRecord(ids.get('Program'));
      Assert.areEqual(0, schedules());
    }
  }

  @IsTest
  static void deletingASeasonTakesItsSchedulesWithIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = campWithVersion();
      SeasonSetupController.deleteRecord(ids.get('Season'));
      Assert.areEqual(0, schedules());
      Assert.areEqual(0, [SELECT COUNT() FROM Week__c WITH SYSTEM_MODE]);
    }
  }
}
