@IsTest
private class RunsInTest {
  private static Map<String, Id> weekIds(Id seasonId) {
    Map<String, Id> result = new Map<String, Id>();
    for (Week__c week : [
      SELECT Id, Name
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH SYSTEM_MODE
    ]) {
      result.put(week.Name, week.Id);
    }
    return result;
  }

  private static RunsIn.WeekOff weekOff(Id target, Integer row, Id week) {
    RunsIn.WeekOff off = new RunsIn.WeekOff();
    off.target = target;
    off.row = row;
    off.week = week;
    return off;
  }

  private static Set<Id> weeksOffFor(Id target) {
    Set<Id> result = new Set<Id>();
    for (WeekException__c mark : [
      SELECT Week__c
      FROM WeekException__c
      WHERE Group__c = :target OR Activity__c = :target OR Location__c = :target
      WITH SYSTEM_MODE
    ]) {
      result.add(mark.Week__c);
    }
    return result;
  }

  @IsTest
  static void aNewRowIsSavedWithTheWeeksItDoesNotRunIn() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> weeks = weekIds(season.Id);
      Division__c division = [
        SELECT Id
        FROM Division__c
        WHERE Name = 'Juniors'
        WITH SYSTEM_MODE
      ];
      List<Id> ids = SeasonSetupController.saveRowsAndWeeks(
        new List<SObject>{
          new Group__c(
            Division__c = division.Id,
            Name = 'Group C',
            Availability__c = 'AllDay'
          ),
          new Location__c(
            Season__c = season.Id,
            Name = 'Pool',
            GroupsThatFit__c = 1
          )
        },
        new List<RunsIn.WeekOff>{
          weekOff(null, 0, weeks.get('Week 2')),
          weekOff(null, 1, weeks.get('Week 5')),
          weekOff(null, 1, weeks.get('Week 6'))
        },
        null
      );
      Assert.areEqual(2, ids.size());
      Assert.areEqual(new Set<Id>{ weeks.get('Week 2') }, weeksOffFor(ids[0]));
      Assert.areEqual(
        new Set<Id>{ weeks.get('Week 5'), weeks.get('Week 6') },
        weeksOffFor(ids[1])
      );
    }
  }

  @IsTest
  static void ticksOnSavedRowsAddAndRemoveWeekExceptions() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> weeks = weekIds(season.Id);
      Map<String, Id> places = ShoreshTestData.placesAndActivities(season.Id);
      WeekException__c groupAWeek3 = [
        SELECT Id, Group__c
        FROM WeekException__c
        WITH SYSTEM_MODE
        LIMIT 1
      ];
      SeasonSetupController.saveRowsAndWeeks(
        new List<SObject>(),
        new List<RunsIn.WeekOff>{
          weekOff(places.get('Swim'), null, weeks.get('Week 1'))
        },
        new List<Id>{ groupAWeek3.Id }
      );
      Assert.areEqual(
        new Set<Id>{ weeks.get('Week 1') },
        weeksOffFor(places.get('Swim'))
      );
      Assert.isTrue(
        weeksOffFor(groupAWeek3.Group__c).isEmpty(),
        'Week 3 ticked again'
      );
    }
  }

  @IsTest
  static void aRefusedRowSavesNoneOfTheWeeks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> weeks = weekIds(season.Id);
      Map<String, Id> places = ShoreshTestData.placesAndActivities(season.Id);
      try {
        SeasonSetupController.saveRowsAndWeeks(
          new List<SObject>{
            new Location__c(Id = places.get('Pool'), GroupsThatFit__c = 0)
          },
          new List<RunsIn.WeekOff>{
            weekOff(places.get('Gym'), null, weeks.get('Week 1'))
          },
          null
        );
        Assert.fail('Groups that fit of 0 is refused');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().startsWith('"Pool": '), e.getMessage());
      }
      Assert.isTrue(weeksOffFor(places.get('Gym')).isEmpty());
    }
  }

  @IsTest
  static void aWeekForSomethingWithoutWeeksIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      Map<String, Id> weeks = weekIds(season.Id);
      List<RunsIn.WeekOff> badWeeks = new List<RunsIn.WeekOff>{
        weekOff(season.Id, null, weeks.get('Week 1')),
        weekOff(null, 3, weeks.get('Week 1'))
      };
      for (RunsIn.WeekOff bad : badWeeks) {
        try {
          SeasonSetupController.saveRowsAndWeeks(
            new List<SObject>(),
            new List<RunsIn.WeekOff>{ bad },
            null
          );
          Assert.fail('Refused');
        } catch (AuraHandledException e) {
          Assert.areEqual(
            'These screens cannot save that week for that kind of record.',
            e.getMessage()
          );
        }
      }
    }
  }
}
