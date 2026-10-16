@IsTest
private class WeekExceptionsTest {
  private static Map<String, Id> groupIds(Id seasonId) {
    Map<String, Id> result = new Map<String, Id>();
    for (Group__c grp : [
      SELECT Id, Name
      FROM Group__c
      WHERE Division__r.Program__r.Season__c = :seasonId
      WITH SYSTEM_MODE
    ]) {
      result.put(grp.Name, grp.Id);
    }
    return result;
  }

  private static Id weekId(Id seasonId, Integer position) {
    return [
      SELECT Id
      FROM Week__c
      WHERE Season__c = :seasonId AND SortOrder__c = :position
      WITH SYSTEM_MODE
    ]
    .Id;
  }

  @IsTest
  static void marksAreAddedAndClearedTogether() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> groups = groupIds(season.Id);
      WeekException__c existing = [
        SELECT Id
        FROM WeekException__c
        WITH SYSTEM_MODE
        LIMIT 1
      ];

      WeekExceptionsController.saveWeekExceptions(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = weekId(season.Id, 1),
            Group__c = groups.get('Group B')
          ),
          new WeekException__c(
            Week__c = weekId(season.Id, 2),
            Group__c = groups.get('Group B')
          )
        },
        new List<Id>{ existing.Id }
      );

      List<WeekException__c> now = [
        SELECT Group__r.Name, Week__r.SortOrder__c
        FROM WeekException__c
        WITH SYSTEM_MODE
        ORDER BY Week__r.SortOrder__c
      ];
      Assert.areEqual(2, now.size());
      Assert.areEqual('Group B', now[0].Group__r.Name);
      Assert.areEqual(1, now[0].Week__r.SortOrder__c);
      Assert.areEqual(2, now[1].Week__r.SortOrder__c);
    }
  }

  @IsTest
  static void aRefusedMarkLeavesEverythingAsItWas() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Season__c other = ShoreshTestData.season(camp.Id, 'Other');
      Week__c otherWeek = ShoreshTestData.weeks(other.Id, 1)[0];
      WeekException__c existing = [
        SELECT Id
        FROM WeekException__c
        WITH SYSTEM_MODE
        LIMIT 1
      ];
      try {
        WeekExceptionsController.saveWeekExceptions(
          new List<WeekException__c>{
            new WeekException__c(
              Week__c = otherWeek.Id,
              Group__c = groupIds(season.Id).get('Group A')
            )
          },
          new List<Id>{ existing.Id }
        );
        Assert.fail('A group from another season is refused');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'This group belongs to a different season than the week.',
          e.getMessage()
        );
      }
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM WeekException__c WITH SYSTEM_MODE],
        'The mark that was to be cleared is still there'
      );
    }
  }

  @IsTest
  static void onlyWeekExceptionsCanBeCleared() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      try {
        WeekExceptionsController.saveWeekExceptions(
          null,
          new List<Id>{ season.Id }
        );
        Assert.fail('A season is not a week exception');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          'These screens cannot delete that kind of record.',
          e.getMessage()
        );
      }
      Assert.areEqual(1, [SELECT COUNT() FROM Season__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void deletingADivisionOrProgramSaysWhichMarksAreInTheWay() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Database.insert(
        new List<CampLabel__c>{
          new CampLabel__c(
            Camp__c = camp.Id,
            ModelTerm__c = 'WeekException',
            Singular__c = 'Week off',
            Plural__c = 'Weeks off'
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Group__c grp = [
        SELECT Division__c, Division__r.Program__c
        FROM Group__c
        WHERE Name = 'Group A'
        WITH SYSTEM_MODE
      ];
      String expected = 'This can\'t be deleted yet: it is marked as not running ("Group A" in "Week 3"). Clear that under Weeks off first, then delete it.';
      Assert.areEqual(expected, WeekExceptions.blockingDelete(grp.Division__c));
      Assert.areEqual(
        expected,
        WeekExceptions.blockingDelete(grp.Division__r.Program__c)
      );
      Assert.isNull(
        WeekExceptions.blockingDelete(season.Id),
        'Seasons clear their own'
      );
      Assert.isNull(
        WeekExceptions.blockingDelete(groupIds(season.Id).get('Group B'))
      );
    }
  }

  @IsTest
  static void theScreenGetsTheSeasonsMarks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
        season.Id
      );
      Assert.areEqual(1, setup.weekExceptions.size());
      Assert.areEqual(
        groupIds(season.Id).get('Group A'),
        setup.weekExceptions[0].Group__c
      );
    }
  }
}
