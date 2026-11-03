/**
 * The one synthetic camp tests build on: Camp Willow with ShoreshTestData.fullSeason, then, as
 * a test needs them, its places and activities and a third group in a Seniors division. Every
 * record goes into ids by name, so a test never reads back what was made. The clash check runs
 * once, at build(), as a screen save does (SetTimeGuard). No real campers, families, or staff.
 */
@IsTest
public class TestCamp {
  public Map<String, Id> ids = new Map<String, Id>();
  private Boolean withPlaces = false;
  private Boolean withSeniors = false;

  /** Pool, Field A and Gym with Swim, Soccer and Gym games (ShoreshTestData.placesAndActivities). */
  public TestCamp places() {
    withPlaces = true;
    return this;
  }

  /**
   * Period 2 (10:00), a Seniors division with Group C, and every group here all day: the camp
   * the set-time, generated-week and special-schedule tests share.
   */
  public TestCamp seniors() {
    withSeniors = true;
    return this;
  }

  public Map<String, Id> build() {
    SetTimeGuard.defer();
    try {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      ids.put('Camp', camp.Id);
      ids.putAll(ShoreshTestData.lastSeasonIds);
      if (withPlaces) {
        ids.putAll(ShoreshTestData.placesAndActivities(season.Id));
      }
      if (withSeniors) {
        addSeniors();
      }
      SetTimeGuard.checkPending();
      return ids;
    } finally {
      SetTimeGuard.resume();
    }
  }

  private void addSeniors() {
    Id main = ids.get('Main');
    ids.put('Period 2', ShoreshTestData.timeBlock(main, 'Period 2', 10).Id);
    Division__c seniors = ShoreshTestData.division(main, 'Seniors');
    Database.update(
      new Division__c(Id = seniors.Id, SortOrder__c = 2),
      AccessLevel.SYSTEM_MODE
    );
    ids.put('Seniors', seniors.Id);
    ids.put('Group C', ShoreshTestData.groupIn(seniors.Id, 'Group C').Id);
    List<Group__c> groups = new List<Group__c>();
    for (String name : new List<String>{ 'Group A', 'Group B', 'Group C' }) {
      groups.add(new Group__c(Id = ids.get(name), Availability__c = 'AllDay'));
    }
    Database.update(groups, AccessLevel.SYSTEM_MODE);
  }
}
