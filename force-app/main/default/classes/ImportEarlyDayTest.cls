/**
 * INGEST-4.13, CORE-3.7: a day ending early comes in as the fixed Dismissal's early day, saved
 * with it. Acts as a scheduler. Synthetic data only.
 */
@IsTest
private class ImportEarlyDayTest {
  @IsTest
  static void aFixedActivitysEarlyDayIsSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Maple Grove (made up)');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2027');
      Map<String, Object> plan = new Map<String, Object>{
        'seasonId' => season.Id
      };
      for (
        String name : new List<String>{
          'programs',
          'timeBlocks',
          'divisions',
          'groups',
          'locations',
          'activities',
          'fixedActivities',
          'recurringActivities'
        }
      ) {
        plan.put(name, new List<Object>());
      }
      ImportTestPlans.add(
        plan,
        'programs',
        ImportTestPlans.entry(
          new List<Object>{
            'key',
            'P0',
            'name',
            'Main',
            'days',
            new List<String>{ 'Monday', 'Friday' },
            'sortOrder',
            1
          }
        )
      );
      List<List<String>> blocks = new List<List<String>>{
        new List<String>{ 'Period 1', '13:00', '13:45' },
        new List<String>{ 'Dismissal', '14:00', '14:20' }
      };
      for (Integer i = 0; i < blocks.size(); i++) {
        ImportTestPlans.add(
          plan,
          'timeBlocks',
          ImportTestPlans.entry(
            new List<Object>{
              'key',
              'B|P0|' + i,
              'programKey',
              'P0',
              'name',
              blocks[i][0],
              'start',
              blocks[i][1],
              'end',
              blocks[i][2],
              'partOfDay',
              'Afternoon',
              'sortOrder',
              i + 1
            }
          )
        );
      }
      ImportTestPlans.add(
        plan,
        'fixedActivities',
        ImportTestPlans.entry(
          new List<Object>{
            'programKey',
            'P0',
            'name',
            'Dismissal',
            'blockKey',
            'B|P0|1',
            'length',
            1,
            'earlyDay',
            'Friday',
            'earlyBlocks',
            1
          }
        )
      );
      Test.startTest();
      ImportController.saveSetup(JSON.serialize(plan));
      Test.stopTest();

      FixedActivity__c saved = SeasonSetupController.getSeasonSetup(season.Id)
        .programs[0]
        .fixedActivities[0];
      Assert.areEqual('Friday', saved.EarlyDay__c);
      Assert.areEqual(1, saved.EarlyBlocks__c);
    }
  }
}
