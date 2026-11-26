/**
 * A program's week laid out on its own fixed and recurring activities as a screen read them
 * (GeneratedSetup.blankWeekOfItsOwn: Update to match setup's preview) is the week laid
 * out on the whole season's (SetTimePlanReader.read: Start a blank week, Generate's first week):
 * another program's activity at the same time, an activity off the week and a recurring
 * activity's groups make no difference. Synthetic camp (GeneratedTestData: Flagpole in Period 1,
 * Rest at Lunch for the Seniors).
 */
@IsTest
private class SetTimePlanOfTest {
  @IsTest
  static void oneProgramsPlanLaysOutTheSameWeekAsTheSeasons() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      SetTimeGuard.defer();
      try {
        Program__c teens = ShoreshTestData.program(ids.get('Season'), 'Teens');
        TimeBlock__c swim = new TimeBlock__c(
          Program__c = teens.Id,
          Name = 'Swim hour',
          StartTime__c = Time.newInstance(9, 0, 0, 0),
          EndTime__c = Time.newInstance(10, 0, 0, 0),
          PartOfDay__c = 'Morning',
          SortOrder__c = 1
        );
        Database.insert(swim, AccessLevel.SYSTEM_MODE);
        Database.insert(
          new List<SObject>{
            new FixedActivity__c(
              Program__c = teens.Id,
              Name = 'Morning dip',
              TimeBlock__c = swim.Id,
              Length__c = 1
            ),
            SetTimeTestData.fixed(ids, 'Lineup', 'Period 2'),
            new WeekException__c(
              Week__c = ids.get('Week 1'),
              FixedActivity__c = ids.get('Flagpole')
            )
          },
          AccessLevel.SYSTEM_MODE
        );
        SetTimeGuard.checkPending();
      } finally {
        SetTimeGuard.resume();
      }
      Test.startTest();
      GeneratedSetup setup = new GeneratedSetup(
        ids.get('Main'),
        ids.get('Week 1')
      );
      String season = JSON.serialize(setup.blankWeek());
      String program = JSON.serialize(setup.blankWeekOfItsOwn());
      Test.stopTest();
      Assert.areEqual(season, program);
      // The cases above are in the week: Lineup and Rest placed, Flagpole off, no Morning dip.
      Assert.isTrue(program.contains('Lineup'), program);
      Assert.isTrue(program.contains('Rest'), program);
      Assert.isFalse(program.contains('Flagpole'), program);
      Assert.isFalse(program.contains('Morning dip'), program);
    }
  }
}
