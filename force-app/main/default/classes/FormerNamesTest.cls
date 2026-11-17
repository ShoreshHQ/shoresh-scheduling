@IsTest
private class FormerNamesTest {
  private static final Date NEW_START = Date.newInstance(2027, 6, 28);

  // INGEST-2.22: a rename keeps the old name, newest first; capitals alone are no new name, and a
  // name given back is no longer a former one.
  @IsTest
  static void aRenameKeepsTheOldName() {
    Id campId = ShoreshTestData.camp('Camp Willow').Id;
    Id seasonId = ShoreshTestData.season(campId, 'Summer 2026').Id;
    Division__c division = ShoreshTestData.division(
      ShoreshTestData.program(seasonId, 'Main').Id,
      'Juniors'
    );
    Group__c grp = ShoreshTestData.groupIn(division.Id, 'Bunk 1');
    Activity__c activity = ShoreshTestData.activity(
      seasonId,
      'Gym games',
      null
    );
    Database.insert(activity, AccessLevel.SYSTEM_MODE);

    rename(activity, 'Gaga');
    rename(activity, 'Gaga ball');
    Assert.areEqual('Gaga\nGym games', formerOf(activity));
    rename(activity, 'GAGA Ball');
    Assert.areEqual('Gaga\nGym games', formerOf(activity), 'capitals only');
    rename(activity, 'Gym games');
    Assert.areEqual('GAGA Ball\nGaga', formerOf(activity), 'given back');

    rename(division, 'Cubs');
    rename(grp, 'Otters');
    Assert.areEqual(
      'Juniors',
      [SELECT FormerNames__c FROM Division__c WHERE Id = :division.Id]
      .FormerNames__c
    );
    Assert.areEqual(
      'Bunk 1',
      [SELECT FormerNames__c FROM Group__c WHERE Id = :grp.Id].FormerNames__c
    );
    // The import reads them with the setup.
    Assert.areEqual(
      'GAGA Ball\nGaga',
      SeasonSetupReader.activitiesOf(seasonId)[0].FormerNames__c
    );
  }

  // INGEST-2.22: next season's copy still knows last season's old names, so last year's file asks.
  @IsTest
  static void aCopiedSeasonKeepsTheOldNames() {
    Id campId = ShoreshTestData.camp('Camp Willow').Id;
    Id originalId = ShoreshTestData.fullSeason(campId).Id;
    ShoreshTestData.placesAndActivities(originalId);
    Activity__c activity = [
      SELECT Id, Name
      FROM Activity__c
      WHERE Season__c = :originalId
      ORDER BY Name
      LIMIT 1
    ];
    Division__c division = [
      SELECT Id, Name
      FROM Division__c
      WHERE Program__r.Season__c = :originalId
      ORDER BY Name
      LIMIT 1
    ];
    Group__c grp = [
      SELECT Id, Name
      FROM Group__c
      WHERE Division__r.Program__r.Season__c = :originalId
      ORDER BY Name
      LIMIT 1
    ];
    String activityWas = activity.Name;
    String divisionWas = division.Name;
    String groupWas = grp.Name;
    rename(activity, 'Renamed activity');
    rename(division, 'Renamed division');
    rename(grp, 'Renamed group');
    Test.startTest();
    Id copyId = new SeasonCopier(originalId, NEW_START).copy('Summer 2027');
    Test.stopTest();
    Assert.areEqual(
      activityWas,
      [
        SELECT FormerNames__c
        FROM Activity__c
        WHERE Season__c = :copyId AND Name = 'Renamed activity'
      ]
      .FormerNames__c
    );
    Assert.areEqual(
      divisionWas,
      [
        SELECT FormerNames__c
        FROM Division__c
        WHERE Program__r.Season__c = :copyId AND Name = 'Renamed division'
      ]
      .FormerNames__c
    );
    Assert.areEqual(
      groupWas,
      [
        SELECT FormerNames__c
        FROM Group__c
        WHERE
          Division__r.Program__r.Season__c = :copyId
          AND Name = 'Renamed group'
      ]
      .FormerNames__c
    );
  }

  private static void rename(SObject record, String name) {
    SObject renamed = record.getSObjectType().newSObject(record.Id);
    renamed.put('Name', name);
    Database.update(renamed, AccessLevel.USER_MODE);
  }

  private static String formerOf(Activity__c activity) {
    return [SELECT FormerNames__c FROM Activity__c WHERE Id = :activity.Id]
    .FormerNames__c;
  }
}
