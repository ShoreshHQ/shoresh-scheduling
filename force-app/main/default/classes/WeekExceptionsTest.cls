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
            ModelTerm__c = 'Week',
            Singular__c = 'session',
            Plural__c = 'sessions'
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
      String expected = 'This can\'t be deleted yet: some of its groups have sessions unticked under Runs in ("Group A" in "Week 3"). Tick that session again on the Groups screen first, then delete it.';
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

  @IsTest
  static void aGroupMarkedInSeveralWeeksIsNamedInTheCampsWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Database.insert(
        new CampLabel__c(
          Camp__c = camp.Id,
          ModelTerm__c = 'Group',
          Singular__c = 'Bunk',
          Plural__c = 'Bunks'
        ),
        AccessLevel.SYSTEM_MODE
      );
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Id groupA = groupIds(season.Id).get('Group A');
      ShoreshTestData.saveWeekExceptions(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = weekId(season.Id, 1),
            Group__c = groupA
          )
        },
        null
      );
      Assert.areEqual(
        'This can\'t be deleted yet: it has weeks unticked under Runs in ("Group A" in "Week 1", "Group A" in "Week 3"). Tick those weeks again on the Bunks screen first, then delete it.',
        WeekExceptions.blockingDelete(groupA)
      );
      Group__c grp = [
        SELECT Division__c
        FROM Group__c
        WHERE Id = :groupA
        WITH SYSTEM_MODE
      ];
      Assert.isTrue(
        WeekExceptions.blockingDelete(grp.Division__c)
          .contains('some of its Bunks have weeks unticked')
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
