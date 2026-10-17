/**
 * Locations, location types, activities, and who can do them: saving through the screens as a
 * scheduler, the rules that keep entries sensible, what blocks a delete, deleting and copying a
 * season with all of it. Synthetic data only.
 */
@IsTest
private class ActivitiesAndLocationsTest {
  private static Season__c seasonWithEverything(Map<String, Id> ids) {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Season__c season = ShoreshTestData.fullSeason(camp.Id);
    ids.putAll(ShoreshTestData.placesAndActivities(season.Id));
    return season;
  }

  private static Id groupNamed(Id seasonId, String name) {
    return [
      SELECT Id
      FROM Group__c
      WHERE Name = :name AND Division__r.Program__r.Season__c = :seasonId
      WITH SYSTEM_MODE
    ]
    .Id;
  }

  private static String saveError(SObject record) {
    try {
      SeasonSetupController.saveRecords(new List<SObject>{ record });
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  private static String detailsError(Activity__c rules) {
    try {
      ActivitiesController.saveActivityDetails(rules, new List<Id>());
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  @IsTest
  static void aSchedulerSetsUpPlacesAndActivities() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      List<Id> typeIds = SeasonSetupController.saveRecords(
        new List<SObject>{
          new LocationType__c(Season__c = season.Id, Name = 'Court')
        }
      );
      List<Id> locationIds = SeasonSetupController.saveRecords(
        new List<SObject>{
          new Location__c(
            Season__c = season.Id,
            Name = 'Tennis court',
            GroupsThatFit__c = 2,
            LocationType__c = typeIds[0]
          )
        }
      );
      Activity__c tennis = ShoreshTestData.activity(
        season.Id,
        'Tennis',
        locationIds[0]
      );
      tennis.Outdoor__c = true;
      List<Id> activityIds = SeasonSetupController.saveRecords(
        new List<SObject>{ tennis }
      );
      ActivitiesController.saveActivityDetails(
        new Activity__c(
          Id = activityIds[0],
          SameDivisionOnly__c = true,
          EarlyWeekCount__c = 1,
          EarlyWeekByDay__c = 'Tuesday',
          Notes__c = 'Bring rackets'
        ),
        new List<Id>{ groupNamed(season.Id, 'Group B') }
      );

      SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
        season.Id
      );
      Assert.areEqual(1, setup.locationTypes.size());
      Assert.areEqual(typeIds[0], setup.locations[0].LocationType__c);
      Activity__c saved = setup.activities[0];
      Assert.areEqual('Tennis', saved.Name);
      Assert.isTrue(saved.SameDivisionOnly__c);
      Assert.areEqual('Tuesday', saved.EarlyWeekByDay__c);
      Assert.areEqual('Bring rackets', saved.Notes__c);
      Assert.areEqual(1, saved.Eligibilities__r.size());
      Assert.areEqual(
        groupNamed(season.Id, 'Group B'),
        saved.Eligibilities__r[0].Group__c
      );
    }
  }

  @IsTest
  static void aNewActivityStartsWithTheAgreedDefaults() {
    Activity__c fresh = (Activity__c) Activity__c.SObjectType.newSObject(
      null,
      true
    );
    Assert.areEqual(1, fresh.Length__c);
    Assert.areEqual(1, fresh.TimesPerWeekMin__c);
    Assert.areEqual(1, fresh.TimesPerWeekMax__c);
    Assert.areEqual('Low', fresh.Priority__c);
    Assert.isFalse(fresh.Outdoor__c);
    Assert.areEqual(1, fresh.GroupsAtOnce__c);
    Location__c place = (Location__c) Location__c.SObjectType.newSObject(
      null,
      true
    );
    Assert.areEqual(1, place.GroupsThatFit__c);
  }

  @IsTest
  static void whoCanDoItIsReplacedAndEmptyMeansEveryone() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Id division = [
      SELECT Id
      FROM Division__c
      WHERE Program__r.Season__c = :season.Id
      WITH SYSTEM_MODE
    ]
    .Id;
    ActivitiesController.saveActivityDetails(
      new Activity__c(Id = ids.get('Swim')),
      new List<Id>{ division, division }
    );
    List<ActivityEligibility__c> rows = [
      SELECT Division__c, Group__c
      FROM ActivityEligibility__c
      WHERE Activity__c = :ids.get('Swim')
      WITH SYSTEM_MODE
    ];
    Assert.areEqual(
      1,
      rows.size(),
      'The old list is replaced, duplicates once'
    );
    Assert.areEqual(division, rows[0].Division__c);

    ActivitiesController.saveActivityDetails(
      new Activity__c(Id = ids.get('Swim')),
      new List<Id>()
    );
    Assert.areEqual(
      0,
      [
        SELECT COUNT()
        FROM ActivityEligibility__c
        WHERE Activity__c = :ids.get('Swim')
        WITH SYSTEM_MODE
      ],
      'Nobody chosen: every group can do it'
    );
  }

  @IsTest
  static void detailsChangeOnlyTheirOwnFieldsAndClearWhatIsEmptied() {
    Map<String, Id> ids = new Map<String, Id>();
    seasonWithEverything(ids);
    Database.update(
      new Activity__c(
        Id = ids.get('Swim'),
        EarlyWeekCount__c = 1,
        EarlyWeekByDay__c = 'Tuesday'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Activity__c sent = (Activity__c) JSON.deserialize(
      '{"Id":"' +
        ids.get('Swim') +
        '","Name":"Renamed","EarlyWeekCount__c":null,"EarlyWeekByDay__c":null}',
      Activity__c.class
    );
    ActivitiesController.saveActivityDetails(sent, new List<Id>());
    Activity__c after = [
      SELECT Name, EarlyWeekCount__c, EarlyWeekByDay__c
      FROM Activity__c
      WHERE Id = :ids.get('Swim')
      WITH SYSTEM_MODE
    ];
    Assert.areEqual('Swim', after.Name, 'The details panel never renames');
    Assert.isNull(after.EarlyWeekCount__c);
    Assert.isNull(after.EarlyWeekByDay__c);
  }

  @IsTest
  static void detailsOfAnUnsavedActivityAreRefused() {
    try {
      ActivitiesController.saveActivityDetails(
        new Activity__c(),
        new List<Id>()
      );
      Assert.fail('Refused');
    } catch (AuraHandledException e) {
      Assert.areEqual('Save the new row in the table first.', e.getMessage());
    }
  }

  @IsTest
  static void entriesThatMakeNoSenseAreRefused() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Activity__c base = ShoreshTestData.activity(season.Id, 'Art', null);

    Activity__c maxBelowMin = base.clone();
    maxBelowMin.TimesPerWeekMin__c = 3;
    maxBelowMin.TimesPerWeekMax__c = 1;
    Assert.isTrue(saveError(maxBelowMin).contains('at least the minimum'));

    Activity__c noMax = maxBelowMin.clone();
    noMax.NoWeeklyMax__c = true;
    Assert.isNull(saveError(noMax), 'No weekly maximum makes it fine');

    Activity__c noGroups = base.clone();
    noGroups.GroupsAtOnce__c = 0;
    Assert.isTrue(saveError(noGroups).contains('1 or more'));

    Activity__c halfEarly = base.clone();
    halfEarly.EarlyWeekCount__c = 1;
    Assert.areEqual(
      'These screens can\'t change that.',
      saveError(halfEarly),
      'The early-week rule is saved from the details panel, not the table'
    );
    Assert.isTrue(
      detailsError(new Activity__c(Id = ids.get('Swim'), EarlyWeekCount__c = 1))
        .contains('both')
    );

    Assert.isTrue(
      saveError(
          new Activity__c(Id = ids.get('Swim'), RainPlan__c = ids.get('Swim'))
        )
        .contains('cannot be its own'),
      'An activity cannot be its own rain plan'
    );
    Assert.isTrue(
      saveError(new Location__c(Id = ids.get('Pool'), GroupsThatFit__c = 0))
        .contains('1 or more')
    );
  }

  @IsTest
  static void everythingStaysInsideItsOwnSeason() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Map<String, Id> otherIds = new Map<String, Id>();
    Season__c other = ShoreshTestData.fullSeason(season.Camp__c);
    otherIds.putAll(ShoreshTestData.placesAndActivities(other.Id));

    Assert.isTrue(
      saveError(
          new Activity__c(
            Id = ids.get('Swim'),
            Location__c = otherIds.get('Gym')
          )
        )
        .contains('belongs to a different season')
    );
    Assert.isTrue(
      saveError(
          new Activity__c(
            Id = ids.get('Soccer'),
            RainPlan__c = otherIds.get('Gym games')
          )
        )
        .contains('belongs to a different season')
    );
    Assert.isTrue(
      saveError(
          new Location__c(
            Id = ids.get('Pool'),
            LocationType__c = otherIds.get('Field')
          )
        )
        .contains('belongs to a different season')
    );
    try {
      ActivitiesController.saveActivityDetails(
        new Activity__c(Id = ids.get('Swim')),
        new List<Id>{ groupNamed(other.Id, 'Group B') }
      );
      Assert.fail('A group from another season is refused');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('belongs to a different season'));
    }
    Week__c otherWeek = [
      SELECT Id
      FROM Week__c
      WHERE Season__c = :other.Id
      LIMIT 1
    ];
    try {
      ShoreshTestData.saveWeekExceptions(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = otherWeek.Id,
            Activity__c = ids.get('Swim')
          )
        },
        new List<Id>()
      );
      Assert.fail('An activity from another season is refused');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('belongs to a different season'));
    }
  }

  @IsTest
  static void locationTypeNamesAreUniqueInASeasonButMaySwap() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    String error = saveError(
      new LocationType__c(Season__c = season.Id, Name = '  field ')
    );
    Assert.isTrue(error.contains('already a location type called'), error);

    List<Id> courtIds = SeasonSetupController.saveRecords(
      new List<SObject>{
        new LocationType__c(Season__c = season.Id, Name = 'Court')
      }
    );
    SeasonSetupController.saveRecords(
      new List<SObject>{
        new LocationType__c(Id = ids.get('Field'), Name = 'Court'),
        new LocationType__c(Id = courtIds[0], Name = 'Field')
      }
    );
    Assert.areEqual(
      'Court',
      [SELECT Name FROM LocationType__c WHERE Id = :ids.get('Field')].Name
    );
  }

  @IsTest
  static void deletingALocationTypeLeavesItsLocationsUntyped() {
    Map<String, Id> ids = new Map<String, Id>();
    seasonWithEverything(ids);
    SeasonSetupController.deleteRecord(ids.get('Field'));
    Assert.isNull(
      [SELECT LocationType__c FROM Location__c WHERE Id = :ids.get('Field A')]
      .LocationType__c
    );
  }

  @IsTest
  static void deletingSomethingStillInUseSaysWhatUsesIt() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Id groupA = groupNamed(season.Id, 'Group A');

    Assert.areEqual(
      'This can\'t be deleted yet: "Swim" happens here. First choose another location for ' +
      'that activity, then delete it.',
      InUse.reason(ids.get('Pool'))
    );
    Assert.areEqual(
      'This can\'t be deleted yet: it is the rain plan for "Soccer". First choose another ' +
      'rain plan there, then delete it.',
      InUse.reason(ids.get('Gym games'))
    );
    Assert.areEqual(
      'This can\'t be deleted yet: it is in "Who can do it" for "Swim". Change who can ' +
      'do that activity first, then delete it.',
      InUse.reason(groupA)
    );
    Id division = [SELECT Division__c FROM Group__c WHERE Id = :groupA]
    .Division__c;
    Assert.isTrue(InUse.reason(division).contains('one of its groups'));
    Assert.isNull(InUse.reason(ids.get('Soccer')), 'Nothing uses Soccer');

    Week__c week = [
      SELECT Id
      FROM Week__c
      WHERE Season__c = :season.Id
      LIMIT 1
    ];
    ShoreshTestData.saveWeekExceptions(
      new List<WeekException__c>{
        new WeekException__c(Week__c = week.Id, Location__c = ids.get('Gym')),
        new WeekException__c(
          Week__c = week.Id,
          Location__c = ids.get('Field A')
        ),
        new WeekException__c(Week__c = week.Id, Activity__c = ids.get('Soccer'))
      },
      new List<Id>()
    );
    // A record's own unticked weeks are not in the way: they go with it.
    Assert.isFalse(InUse.reason(ids.get('Gym')).contains('Week 1'));
    Assert.isNull(InUse.reason(ids.get('Soccer')));
    SeasonSetupController.deleteRecord(ids.get('Soccer'));
    SeasonSetupController.deleteRecord(ids.get('Field A'));
    Assert.areEqual(
      new Set<Id>{ ids.get('Gym') },
      new Map<Id, Location__c>(
          [
            SELECT Id
            FROM Location__c
            WHERE Id IN (SELECT Location__c FROM WeekException__c)
          ]
        )
        .keySet(),
      'Only the Gym still has a week unticked'
    );
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM WeekException__c WHERE Activity__c != NULL]
    );
    try {
      SeasonSetupController.deleteRecord(ids.get('Pool'));
      Assert.fail('Refused');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('"Swim" happens here'));
    }
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Location__c WHERE Id = :ids.get('Pool')]
    );
  }

  @IsTest
  static void inUseMessagesUseTheCampsWords() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Database.insert(
      new List<CampLabel__c>{
        new CampLabel__c(
          Camp__c = season.Camp__c,
          ModelTerm__c = 'Activity',
          Singular__c = 'Program',
          Plural__c = 'Programs'
        ),
        new CampLabel__c(
          Camp__c = season.Camp__c,
          ModelTerm__c = 'Location',
          Singular__c = 'Spot',
          Plural__c = 'Spots'
        )
      },
      AccessLevel.SYSTEM_MODE
    );
    Assert.isTrue(
      InUse.reason(ids.get('Pool'))
        .contains('choose another Spot for that Program')
    );
  }

  @IsTest
  static void marksOnActivitiesAndLocationsAreSavedOncePerWeek() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Week__c week = [
      SELECT Id
      FROM Week__c
      WHERE Season__c = :season.Id
      LIMIT 1
    ];
    List<WeekException__c> marks = new List<WeekException__c>{
      new WeekException__c(Week__c = week.Id, Location__c = ids.get('Pool')),
      new WeekException__c(Week__c = week.Id, Location__c = ids.get('Pool')),
      new WeekException__c(Week__c = week.Id, Activity__c = ids.get('Swim'))
    };
    ShoreshTestData.saveWeekExceptions(marks, new List<Id>());
    ShoreshTestData.saveWeekExceptions(marks, new List<Id>());
    Assert.areEqual(
      2,
      [
        SELECT COUNT()
        FROM WeekException__c
        WHERE
          Week__c = :week.Id
          AND (Location__c != NULL
          OR Activity__c != NULL)
      ]
    );
    try {
      ShoreshTestData.saveWeekExceptions(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = week.Id,
            Location__c = ids.get('Gym'),
            Activity__c = ids.get('Soccer')
          )
        },
        new List<Id>()
      );
      Assert.fail('Two targets on one mark are refused');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('Choose what does not run'));
    }
  }

  @IsTest
  static void aWholeSeasonWithActivitiesCanBeDeleted() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Week__c week = [
      SELECT Id
      FROM Week__c
      WHERE Season__c = :season.Id
      LIMIT 1
    ];
    Database.insert(
      new List<WeekException__c>{
        new WeekException__c(Week__c = week.Id, Location__c = ids.get('Pool')),
        new WeekException__c(Week__c = week.Id, Activity__c = ids.get('Soccer'))
      },
      AccessLevel.SYSTEM_MODE
    );
    Database.delete(season, AccessLevel.SYSTEM_MODE);
    Assert.areEqual(0, [SELECT COUNT() FROM Activity__c]);
    Assert.areEqual(0, [SELECT COUNT() FROM ActivityEligibility__c]);
    Assert.areEqual(0, [SELECT COUNT() FROM Location__c]);
    Assert.areEqual(0, [SELECT COUNT() FROM LocationType__c]);
    Assert.areEqual(0, [SELECT COUNT() FROM WeekException__c]);
  }

  @IsTest
  static void copyingASeasonBringsPlacesActivitiesAndWhoCanDoThem() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Week__c week = [
      SELECT Id
      FROM Week__c
      WHERE Season__c = :season.Id
      ORDER BY StartDate__c
      LIMIT 1
    ];
    Database.insert(
      new List<WeekException__c>{
        new WeekException__c(Week__c = week.Id, Location__c = ids.get('Pool')),
        new WeekException__c(Week__c = week.Id, Activity__c = ids.get('Soccer'))
      },
      AccessLevel.SYSTEM_MODE
    );
    // The copy runs in a transaction of its own on screen; give it its own limits here too.
    Test.startTest();
    Id copyId = SeasonSetupController.copySeason(
      season.Id,
      'Summer 2027',
      Date.newInstance(2027, 6, 28)
    );
    Test.stopTest();

    Map<String, Activity__c> copies = new Map<String, Activity__c>();
    for (Activity__c activity : [
      SELECT
        Name,
        CopiedFrom__c,
        Outdoor__c,
        Location__r.Name,
        Location__r.Season__c,
        RainPlan__r.Name,
        RainPlan__r.Season__c,
        (
          SELECT Group__r.Name, Group__r.Division__r.Program__r.Season__c
          FROM Eligibilities__r
        )
      FROM Activity__c
      WHERE Season__c = :copyId
    ]) {
      copies.put(activity.Name, activity);
    }
    Assert.areEqual(3, copies.size());
    Activity__c soccer = copies.get('Soccer');
    Assert.areEqual(ids.get('Soccer'), soccer.CopiedFrom__c);
    Assert.isTrue(soccer.Outdoor__c);
    Assert.areEqual('Field A', soccer.Location__r.Name);
    Assert.areEqual(copyId, soccer.Location__r.Season__c);
    Assert.areEqual('Gym games', soccer.RainPlan__r.Name);
    Assert.areEqual(
      copyId,
      soccer.RainPlan__r.Season__c,
      'Rain plan is the copy'
    );
    Activity__c swim = copies.get('Swim');
    Assert.areEqual(1, swim.Eligibilities__r.size());
    Assert.areEqual('Group A', swim.Eligibilities__r[0].Group__r.Name);
    Assert.areEqual(
      copyId,
      swim.Eligibilities__r[0].Group__r.Division__r.Program__r.Season__c
    );
    Location__c fieldA = [
      SELECT LocationType__r.Name, LocationType__r.Season__c
      FROM Location__c
      WHERE Season__c = :copyId AND Name = 'Field A'
    ];
    Assert.areEqual('Field', fieldA.LocationType__r.Name);
    Assert.areEqual(copyId, fieldA.LocationType__r.Season__c);
    List<WeekException__c> marks = [
      SELECT Location__r.Season__c, Activity__r.Season__c
      FROM WeekException__c
      WHERE
        Week__r.Season__c = :copyId
        AND (Location__c != NULL
        OR Activity__c != NULL)
    ];
    Assert.areEqual(2, marks.size());
    for (WeekException__c mark : marks) {
      Assert.areEqual(
        copyId,
        mark.Location__c != null
          ? mark.Location__r.Season__c
          : mark.Activity__r.Season__c
      );
    }
    // The original is untouched.
    Assert.areEqual(
      ids.get('Gym games'),
      [SELECT RainPlan__c FROM Activity__c WHERE Id = :ids.get('Soccer')]
      .RainPlan__c
    );
    Assert.areEqual(
      3,
      [SELECT COUNT() FROM Activity__c WHERE Season__c = :season.Id]
    );
  }

  @IsTest
  static void aSchedulerCanCopyASeasonWithActivities() {
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Map<String, Id> ids = new Map<String, Id>();
      Season__c season = seasonWithEverything(ids);
      Id copyId = SeasonSetupController.copySeason(
        season.Id,
        'Summer 2027',
        Date.newInstance(2027, 6, 28)
      );
      Assert.areEqual(
        3,
        [
          SELECT COUNT()
          FROM Activity__c
          WHERE Season__c = :copyId
          WITH USER_MODE
        ]
      );
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM ActivityEligibility__c
          WHERE Activity__r.Season__c = :copyId
          WITH USER_MODE
        ]
      );
    }
  }

  @IsTest
  static void copyingMapsADivisionInWhoCanDoItToTheCopiedDivision() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Id copyId = SeasonSetupController.copySeason(
      season.Id,
      'Summer 2027',
      Date.newInstance(2027, 6, 28)
    );
    ActivityEligibility__c row = [
      SELECT
        Division__r.Name,
        Division__r.Program__r.Season__c,
        Division__r.CopiedFrom__c
      FROM ActivityEligibility__c
      WHERE Activity__r.Season__c = :copyId AND Activity__r.Name = 'Gym games'
      WITH SYSTEM_MODE
    ];
    Assert.areEqual('Juniors', row.Division__r.Name);
    Assert.areEqual(copyId, row.Division__r.Program__r.Season__c);
    Assert.isNotNull(row.Division__r.CopiedFrom__c);
  }

  @IsTest
  static void aSchedulerDeletesASeasonWithActivitiesFromTheScreen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = new Map<String, Id>();
      Season__c season = seasonWithEverything(ids);
      SeasonSetupController.deleteRecord(season.Id);
      Assert.areEqual(0, [SELECT COUNT() FROM Activity__c WITH SYSTEM_MODE]);
      Assert.areEqual(0, [SELECT COUNT() FROM Location__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void ownRainPlanRefusalUsesTheCampsWords() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Database.insert(
      new CampLabel__c(
        Camp__c = season.Camp__c,
        ModelTerm__c = 'RainPlan',
        Singular__c = 'Wet-weather plan',
        Plural__c = 'Wet-weather plans'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Assert.areEqual(
      'Choose a different Wet-weather plan: an activity cannot be its own.',
      saveError(
        new Activity__c(Id = ids.get('Swim'), RainPlan__c = ids.get('Swim'))
      )
    );
  }

  @IsTest
  static void aRefusedRowIsNamedInTheMessage() {
    Map<String, Id> ids = new Map<String, Id>();
    Season__c season = seasonWithEverything(ids);
    Activity__c art = ShoreshTestData.activity(season.Id, 'Art', null);
    art.GroupsAtOnce__c = 0;
    Assert.areEqual(
      '"Art": Must be 1 or more, or tick No limit.',
      saveError(art)
    );
    Assert.areEqual(
      '"Pool": Must be 1 or more.',
      saveError(new Location__c(Id = ids.get('Pool'), GroupsThatFit__c = 0)),
      'A change that left the name alone still names the row'
    );
  }
}
