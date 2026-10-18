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

      ShoreshTestData.saveWeekExceptions(
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
        ShoreshTestData.saveWeekExceptions(
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
        ShoreshTestData.saveWeekExceptions(null, new List<Id>{ season.Id });
        Assert.fail('A season is not a week exception');
      } catch (AuraHandledException e) {
        Assert.areEqual('These screens can\'t delete that.', e.getMessage());
      }
      Assert.areEqual(1, [SELECT COUNT() FROM Season__c WITH SYSTEM_MODE]);
    }
  }

  private static Integer marksLeft() {
    return [SELECT COUNT() FROM WeekException__c WITH SYSTEM_MODE];
  }

  @IsTest
  static void deletingAGroupClearsItsOwnUntickedWeeks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> groups = groupIds(season.Id);
      ShoreshTestData.saveWeekExceptions(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = weekId(season.Id, 1),
            Group__c = groups.get('Group A')
          ),
          new WeekException__c(
            Week__c = weekId(season.Id, 2),
            Group__c = groups.get('Group B')
          )
        },
        null
      );
      SeasonSetupController.deleteRecord(groups.get('Group A'));
      Assert.isFalse(groupIds(season.Id).containsKey('Group A'));
      Assert.areEqual(1, marksLeft(), 'Only Group B\'s week is left');
    }
  }

  @IsTest
  static void deletingADivisionOrProgramClearsItsGroupsUntickedWeeks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c first = ShoreshTestData.fullSeason(
        ShoreshTestData.camp('Camp Willow').Id
      );
      Season__c second = ShoreshTestData.fullSeason(
        ShoreshTestData.camp('Camp Birch').Id
      );
      Assert.areEqual(2, marksLeft());
      Division__c division = [
        SELECT Id
        FROM Division__c
        WHERE Program__r.Season__c = :first.Id
        WITH SYSTEM_MODE
      ];
      SeasonSetupController.deleteRecord(division.Id);
      Assert.areEqual(1, marksLeft());
      Program__c program = [
        SELECT Id
        FROM Program__c
        WHERE Season__c = :second.Id
        WITH SYSTEM_MODE
      ];
      SeasonSetupController.deleteRecord(program.Id);
      Assert.areEqual(0, marksLeft());
      Assert.areEqual(0, [SELECT COUNT() FROM Group__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void aRefusedDeleteKeepsTheUntickedWeeks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      // Swim is open only to Group A, which has Week 3 unticked.
      ShoreshTestData.placesAndActivities(season.Id);
      try {
        SeasonSetupController.deleteRecord(groupIds(season.Id).get('Group A'));
        Assert.fail('A group in who can do it is kept');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('"Who can do it" for "Swim"'));
      }
      Assert.isTrue(groupIds(season.Id).containsKey('Group A'));
      Assert.areEqual(1, marksLeft());
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

  @IsTest
  static void markingTheSameGroupAndWeekTwiceKeepsOneMark() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Id groupA = groupIds(season.Id).get('Group A');
      Id week3 = weekId(season.Id, 3);
      // Group A is already marked for Week 3; mark it again, twice in one save.
      ShoreshTestData.saveWeekExceptions(
        new List<WeekException__c>{
          new WeekException__c(Week__c = week3, Group__c = groupA),
          new WeekException__c(Week__c = week3, Group__c = groupA)
        },
        null
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM WeekException__c WITH SYSTEM_MODE]
      );
    }
  }

  @IsTest
  static void clearingAMarkAlreadyClearedElsewhereIsFine() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      ShoreshTestData.fullSeason(camp.Id);
      WeekException__c existing = [
        SELECT Id
        FROM WeekException__c
        WITH SYSTEM_MODE
        LIMIT 1
      ];
      Database.delete(existing, AccessLevel.SYSTEM_MODE);
      ShoreshTestData.saveWeekExceptions(
        null,
        new List<Id>{ existing.Id, null }
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM WeekException__c WITH SYSTEM_MODE]
      );
    }
  }

  @IsTest
  static void someoneWithoutShoreshAccessCannotMarkWeeks() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.fullSeason(camp.Id);
    Id groupB = groupIds(season.Id).get('Group B');
    Id week1 = weekId(season.Id, 1);
    System.runAs(ShoreshTestData.outsider()) {
      try {
        ShoreshTestData.saveWeekExceptions(
          new List<WeekException__c>{
            new WeekException__c(Week__c = week1, Group__c = groupB)
          },
          null
        );
        Assert.fail('No access, no marks');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e.getMessage());
      }
    }
    Assert.areEqual(1, [SELECT COUNT() FROM WeekException__c WITH SYSTEM_MODE]);
  }
}
