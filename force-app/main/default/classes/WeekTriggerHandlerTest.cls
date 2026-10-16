@IsTest
private class WeekTriggerHandlerTest {
  @IsTest
  static void keyIsSeasonAndStartDate() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Week__c week = ShoreshTestData.weeks(season.Id, 1)[0];
    Assert.areEqual(
      season.Id + '|2026-06-29',
      [SELECT Key__c FROM Week__c WHERE Id = :week.Id WITH SYSTEM_MODE].Key__c
    );

    week.StartDate__c = Date.newInstance(2026, 6, 30);
    Database.update(week, AccessLevel.SYSTEM_MODE);
    Assert.areEqual(
      season.Id + '|2026-06-30',
      [SELECT Key__c FROM Week__c WHERE Id = :week.Id WITH SYSTEM_MODE].Key__c
    );
  }

  @IsTest
  static void twoWeeksStartingTheSameDayAreRefusedInTheCampsWords() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Database.insert(
      new CampLabel__c(
        Camp__c = camp.Id,
        ModelTerm__c = 'Week',
        Singular__c = 'Session',
        Plural__c = 'Sessions'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    ShoreshTestData.weeks(season.Id, 1);

    Database.SaveResult result = Database.insert(
      new Week__c(
        Season__c = season.Id,
        Name = 'Extra',
        StartDate__c = Date.newInstance(2026, 6, 29),
        EndDate__c = Date.newInstance(2026, 7, 3)
      ),
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isFalse(result.isSuccess());
    String message = result.getErrors()[0].getMessage();
    Assert.isTrue(message.contains('"Week 1" already starts on'), message);
    Assert.isTrue(message.contains('Each Session in a season'), message);
  }

  @IsTest
  static void duplicatesInsideOneSaveAreRefused() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Date monday = Date.newInstance(2026, 6, 29);
    List<Database.SaveResult> results = Database.insert(
      new List<Week__c>{
        new Week__c(
          Season__c = season.Id,
          Name = 'A',
          StartDate__c = monday,
          EndDate__c = monday.addDays(4)
        ),
        new Week__c(
          Season__c = season.Id,
          Name = 'B',
          StartDate__c = monday,
          EndDate__c = monday.addDays(4)
        )
      },
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isTrue(results[0].isSuccess());
    Assert.isFalse(results[1].isSuccess());
  }

  @IsTest
  static void swappingTwoWeeksDatesInOneSaveIsAllowed() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    List<Week__c> weeks = ShoreshTestData.weeks(season.Id, 2);
    Date first = weeks[0].StartDate__c;
    Date second = weeks[1].StartDate__c;
    weeks[0].StartDate__c = second;
    weeks[0].EndDate__c = second.addDays(4);
    weeks[1].StartDate__c = first;
    weeks[1].EndDate__c = first.addDays(4);
    Database.update(weeks, AccessLevel.SYSTEM_MODE);
    Assert.areEqual(
      second,
      [SELECT StartDate__c FROM Week__c WHERE Id = :weeks[0].Id].StartDate__c
    );
  }

  @IsTest
  static void sameStartDateInDifferentSeasonsIsFine() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    ShoreshTestData.weeks(ShoreshTestData.season(camp.Id, 'A').Id, 1);
    ShoreshTestData.weeks(ShoreshTestData.season(camp.Id, 'B').Id, 1);
    Assert.areEqual(2, [SELECT COUNT() FROM Week__c WITH SYSTEM_MODE]);
  }

  @IsTest
  static void endBeforeStartIsRefused() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    Database.SaveResult result = Database.insert(
      new Week__c(
        Season__c = season.Id,
        Name = 'Backwards',
        StartDate__c = Date.newInstance(2026, 7, 3),
        EndDate__c = Date.newInstance(2026, 6, 29)
      ),
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isFalse(result.isSuccess());
  }
}
