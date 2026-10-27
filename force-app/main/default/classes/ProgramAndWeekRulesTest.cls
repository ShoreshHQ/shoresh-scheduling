/**
 * Rules that live only in setup's validation rules (docs/protocol/prog.md, week.md): a program
 * runs on at least one day, any day of the week, weekends included (ADR 0022); a season and a week
 * end on or after the day they start. Synthetic camp only.
 */
@IsTest
private class ProgramAndWeekRulesTest {
  private static Program__c programOn(Id seasonId, Set<String> days) {
    return new Program__c(
      Season__c = seasonId,
      Name = 'Main',
      SortOrder__c = 1,
      Monday__c = days.contains('Monday'),
      Tuesday__c = days.contains('Tuesday'),
      Wednesday__c = days.contains('Wednesday'),
      Thursday__c = days.contains('Thursday'),
      Friday__c = days.contains('Friday'),
      Saturday__c = days.contains('Saturday'),
      Sunday__c = days.contains('Sunday')
    );
  }

  private static Season__c season() {
    return ShoreshTestData.season(
      ShoreshTestData.camp('Synthetic Camp').Id,
      'Summer 2026'
    );
  }

  // PROG-1.2
  @IsTest
  static void aProgramThatRunsOnNoDayIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = season();
      Database.SaveResult result = Database.insert(
        programOn(season.Id, new Set<String>()),
        false,
        AccessLevel.SYSTEM_MODE
      );
      Assert.isFalse(result.isSuccess());
      Assert.areEqual(
        'Choose at least one day it runs.',
        result.getErrors()[0].getMessage()
      );
    }
  }

  // WEEK-1.1
  @IsTest
  static void aProgramMayRunOnlyOnTheWeekend() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = season();
      Database.SaveResult result = Database.insert(
        programOn(season.Id, new Set<String>{ 'Saturday', 'Sunday' }),
        false,
        AccessLevel.SYSTEM_MODE
      );
      Assert.isTrue(result.isSuccess(), String.valueOf(result.getErrors()));
    }
  }

  // WEEK-1.3
  @IsTest
  static void aSeasonOrAWeekCannotEndBeforeItStarts() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = season();
      Date monday = Date.newInstance(2026, 6, 29);
      Database.SaveResult backwardsWeek = Database.insert(
        new Week__c(
          Season__c = season.Id,
          Name = 'Week 1',
          StartDate__c = monday,
          EndDate__c = monday.addDays(-1),
          SortOrder__c = 1
        ),
        false,
        AccessLevel.SYSTEM_MODE
      );
      Assert.isFalse(backwardsWeek.isSuccess());
      Assert.areEqual(
        'The end date must be on or after the start date.',
        backwardsWeek.getErrors()[0].getMessage()
      );
      // One day is a week: it ends the day it starts.
      Database.SaveResult oneDay = Database.insert(
        new Week__c(
          Season__c = season.Id,
          Name = 'Week 1',
          StartDate__c = monday,
          EndDate__c = monday,
          SortOrder__c = 1
        ),
        false,
        AccessLevel.SYSTEM_MODE
      );
      Assert.isTrue(oneDay.isSuccess(), String.valueOf(oneDay.getErrors()));

      season.EndDate__c = season.StartDate__c.addDays(-1);
      Database.SaveResult backwardsSeason = Database.update(
        season,
        false,
        AccessLevel.SYSTEM_MODE
      );
      Assert.isFalse(backwardsSeason.isSuccess());
      Assert.areEqual(
        'The end date must be on or after the start date.',
        backwardsSeason.getErrors()[0].getMessage()
      );
    }
  }
}
