/**
 * The camp's clock (CORE-6.11) where it differs from the person's: Camp Willow is in Los Angeles,
 * its scheduler in New York. Synthetic data only.
 */
@IsTest
private class CampClockTest {
  private static final Datetime AT = Datetime.newInstanceGmt(
    2026,
    10,
    18,
    18,
    40,
    0
  );

  // CORE-6.11: a time is said on the camp's clock, read once for the season and its programs; a
  // version name written on either clock is still read as Publish's.
  @IsTest
  static void aTimeIsSaidOnTheCampsClockNotThePersons() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      camp.TimeZone__c = 'America/Los_Angeles';
      Database.update(camp, AccessLevel.SYSTEM_MODE);
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Program__c main = ShoreshTestData.program(season.Id, 'Main');
      Program__c teens = ShoreshTestData.program(season.Id, 'Teens');
      Test.startTest();
      Integer before = Limits.getQueries();
      Assert.areEqual('America/Los_Angeles', CampClock.zoneOfProgram(main.Id));
      Assert.areEqual('America/Los_Angeles', CampClock.zoneOfProgram(teens.Id));
      Assert.areEqual('America/Los_Angeles', CampClock.zoneOfSeason(season.Id));
      Assert.areEqual(
        1,
        Limits.getQueries() - before,
        'one read for the season'
      );
      Assert.areEqual(
        '18 Oct 2026 11:40 AM',
        CampClock.say(
          AT,
          'd MMM yyyy h:mm a',
          CampClock.zoneOfSeason(season.Id)
        )
      );
      // The scheduler is in New York: their own clock says 2:40 PM.
      Assert.areEqual(
        '18 Oct 2026 2:40 PM',
        CampClock.say(AT, 'd MMM yyyy h:mm a', null)
      );
      String campsName = PublishedRows.historyName(AT, 'America/Los_Angeles');
      Assert.areEqual('Published Oct 18, 11:40 AM', campsName);
      Assert.isTrue(
        PublishedRows.namedByPublish(
          new Schedule__c(Name = campsName, PublishedAt__c = AT),
          main.Id
        ),
        'written on the camp\'s clock'
      );
      Assert.isTrue(
        PublishedRows.namedByPublish(
          new Schedule__c(
            Name = 'Published Oct 18, 2:40 PM',
            PublishedAt__c = AT
          ),
          main.Id
        ),
        'written on the person\'s clock before, kept as written'
      );
      Assert.isFalse(
        PublishedRows.namedByPublish(
          new Schedule__c(Name = 'Opening week', PublishedAt__c = AT),
          main.Id
        ),
        'renamed'
      );
      Test.stopTest();
    }
  }
}
