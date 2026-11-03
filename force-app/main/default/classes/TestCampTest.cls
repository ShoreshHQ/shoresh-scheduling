/** The shared test camp makes what tests ask for by name, and only that, cheaply. */
@IsTest
private class TestCampTest {
  @IsTest
  static void theBareCampIsTheFullSeason() {
    Map<String, Id> ids = new TestCamp().build();
    for (
      String name : new List<String>{
        'Camp',
        'Season',
        'Main',
        'Week 1',
        'Week 6',
        'Period 1',
        'Lunch',
        'Juniors',
        'Group A',
        'Group B'
      }
    ) {
      Assert.isNotNull(ids.get(name), name);
    }
    Assert.isFalse(ids.containsKey('Pool'), 'No places unless asked');
    Assert.isFalse(ids.containsKey('Seniors'), 'No Seniors unless asked');
  }

  @IsTest
  static void theSeniorsCampHasThreeAllDayGroups() {
    Test.startTest();
    Integer before = Limits.getQueries();
    Map<String, Id> ids = new TestCamp().places().seniors().build();
    Integer used = Limits.getQueries() - before;
    Test.stopTest();
    Assert.isTrue(used <= 25, 'Queries for the seniors camp: ' + used);
    for (String name : new List<String>{ 'Period 2', 'Pool', 'Gym games' }) {
      Assert.isNotNull(ids.get(name), name);
    }
    List<Group__c> groups = [
      SELECT Name, Availability__c, Division__r.Name
      FROM Group__c
      WHERE Division__r.Program__c = :ids.get('Main')
      WITH SYSTEM_MODE
      ORDER BY Name
    ];
    Assert.areEqual(3, groups.size());
    Assert.areEqual('Seniors', groups[2].Division__r.Name);
    Assert.areEqual(ids.get('Group C'), groups[2].Id);
    for (Group__c grp : groups) {
      Assert.areEqual('AllDay', grp.Availability__c, grp.Name);
    }
  }
}
