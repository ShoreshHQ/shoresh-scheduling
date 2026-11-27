/**
 * Who leads an activity (ADR 0031 piece B): the Staff list's people, the details panel's Who leads
 * it saved whole (ActivitiesController.saveWhoLeadsIt) only while it is as the director saw it; a
 * leader who isn't the season's staff refused; every screen reading it with the activity; a staff
 * member from the camp's own system in a season once; and Copy season carrying staff and leaders.
 * Synthetic data only.
 */
@IsTest
private class ActivityLeadersTest {
  @TestSetup
  static void setup() {
    User scheduler = ShoreshTestData.scheduler();
    Map<String, Id> ids = new Map<String, Id>();
    System.runAs(scheduler) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.fullSeason(camp.Id);
      ids.putAll(ShoreshTestData.placesAndActivities(season.Id));
      ids.put('Season', season.Id);
      List<StaffMember__c> staff = new List<StaffMember__c>{
        new StaffMember__c(
          Season__c = season.Id,
          Name = 'Dana',
          SortOrder__c = 1
        ),
        new StaffMember__c(
          Season__c = season.Id,
          Name = 'Eli',
          SortOrder__c = 2
        )
      };
      Database.insert(staff, AccessLevel.USER_MODE);
      ids.put('Dana', staff[0].Id);
      ids.put('Eli', staff[1].Id);
    }
    ids.put('Scheduler', scheduler.Id);
    KeptCamp.keepIds(ids);
  }

  private static RowSaves.Result save(
    Id activityId,
    List<Id> leaders,
    List<Id> seen
  ) {
    return ActivitiesController.saveWhoLeadsIt(activityId, leaders, seen);
  }

  private static String refusal(Id activityId, List<Id> leaders) {
    try {
      save(activityId, leaders, ActivityLeaders.now(activityId));
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  // CORE-1.40
  @IsTest
  static void whoLeadsItIsSavedWholeOnlyWhileItIsAsSeen() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Id swim = ids.get('Swim');
      Id dana = ids.get('Dana');
      Id eli = ids.get('Eli');
      Test.startTest();
      RowSaves.Result first = save(
        swim,
        new List<Id>{ eli, dana },
        new List<Id>()
      );
      Assert.isTrue(first.saved());
      // In the Staff list's order, and on the setup every screen reads.
      Assert.areEqual(new List<Id>{ dana, eli }, ActivityLeaders.now(swim));
      for (
        Activity__c activity : SeasonSetupReader.activitiesOf(ids.get('Season'))
      ) {
        if (activity.Id == swim) {
          Assert.areEqual(2, activity.Leaders__r.size());
          Assert.areEqual('Dana', activity.Leaders__r[0].StaffMember__r.Name);
          Assert.areEqual(
            new Set<Id>{ dana, eli },
            ActivityLeaders.of(activity)
          );
        }
      }
      // Someone saw none and chose Eli alone: answered with what is there, nothing saved.
      Integer before = Limits.getQueries();
      RowSaves.Result stale = save(swim, new List<Id>{ eli }, new List<Id>());
      Assert.isTrue(
        Limits.getQueries() - before <= 5,
        'Who leads it read too much'
      );
      Assert.isFalse(stale.saved());
      Assert.areEqual(new List<Id>{ dana, eli }, stale.theirLeaders);
      Assert.areEqual(new List<Id>{ dana, eli }, ActivityLeaders.now(swim));
      // Choosing what is already there is no question; nobody clears it.
      Assert.isTrue(
        save(swim, new List<Id>{ eli, dana }, new List<Id>()).saved()
      );
      Assert.isTrue(
        save(swim, new List<Id>(), new List<Id>{ dana, eli }).saved()
      );
      Test.stopTest();
      Assert.areEqual(new List<Id>(), ActivityLeaders.now(swim));
    }
  }

  // CORE-1.40
  @IsTest
  static void aLeaderWhoIsntTheSeasonsStaffIsRefused() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Season__c other = ShoreshTestData.season(
        [
          SELECT Camp__c
          FROM Season__c
          WHERE Id = :ids.get('Season')
          WITH USER_MODE
        ]
        .Camp__c,
        'Summer 2027'
      );
      StaffMember__c stranger = new StaffMember__c(
        Season__c = other.Id,
        Name = 'Noa'
      );
      Database.insert(stranger, AccessLevel.USER_MODE);
      Test.startTest();
      Assert.areEqual(
        'Who leads it can only name this season\'s staff members.',
        refusal(ids.get('Swim'), new List<Id>{ ids.get('Gym') })
      );
      String otherSeason = refusal(
        ids.get('Swim'),
        new List<Id>{ stranger.Id }
      );
      Test.stopTest();
      Assert.isTrue(
        otherSeason.contains('belongs to a different season'),
        otherSeason
      );
      Assert.areEqual(new List<Id>(), ActivityLeaders.now(ids.get('Swim')));
    }
  }

  // CORE-1.40: a save that can't be compared or has nothing to save to is refused, saving nothing.
  @IsTest
  static void whoLeadsItIsNeverSavedBlind() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Id swim = ids.get('Swim');
      List<Id> dana = new List<Id>{ ids.get('Dana') };
      Test.startTest();
      // A new row not yet in the table has no activity to lead.
      Assert.areEqual(
        'Save the new row in the table first.',
        refusalOf(null, dana, new List<Id>())
      );
      // Not saying what the person saw can't be compared, so it isn't saved.
      Assert.areEqual(
        'Who leads it wasn\'t saved: reload the page and change it again.',
        refusalOf(swim, dana, null)
      );
      Assert.areEqual(new List<Id>(), ActivityLeaders.now(swim));
      // An activity deleted meanwhile is not found, and nothing is made for it.
      Database.delete(swim, AccessLevel.USER_MODE);
      Assert.areEqual(
        'That was not found, or you do not have access to it.',
        refusalOf(swim, dana, new List<Id>())
      );
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ActivityLeader__c WITH USER_MODE]
      );
    }
  }

  private static String refusalOf(
    Id activityId,
    List<Id> leaders,
    List<Id> seen
  ) {
    try {
      save(activityId, leaders, seen);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  // CORE-1.38
  @IsTest
  static void aStaffMemberFromTheCampsSystemIsInASeasonOnce() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      StaffMember__c first = new StaffMember__c(
        Season__c = ids.get('Season'),
        Name = 'Maya',
        SourceSystem__c = 'CampMinder',
        OutsideId__c = 'S-17'
      );
      Database.insert(first, AccessLevel.USER_MODE);
      StaffMember__c again = new StaffMember__c(
        Season__c = ids.get('Season'),
        Name = 'Maya R.',
        SourceSystem__c = ' campminder ',
        OutsideId__c = 'S-17'
      );
      Test.startTest();
      Database.SaveResult result = Database.insert(
        again,
        false,
        AccessLevel.USER_MODE
      );
      Test.stopTest();
      Assert.isFalse(result.isSuccess());
      Assert.areEqual(
        'Another staff member in this season has this outside ID from this system.',
        result.getErrors()[0].getMessage()
      );
      Assert.areEqual(
        ids.get('Season') + '|campminder|S-17',
        [
          SELECT OutsideMatch__c
          FROM StaffMember__c
          WHERE Id = :first.Id
          WITH USER_MODE
        ]
        .OutsideMatch__c
      );
    }
  }

  // CORE-1.39: a staff member deleted leads nothing; the activity keeps its other leaders.
  @IsTest
  static void aDeletedStaffMemberLeadsNothing() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      save(
        ids.get('Swim'),
        new List<Id>{ ids.get('Dana'), ids.get('Eli') },
        new List<Id>()
      );
      Test.startTest();
      Database.delete(ids.get('Dana'), AccessLevel.USER_MODE);
      Test.stopTest();
      Assert.areEqual(
        new List<Id>{ ids.get('Eli') },
        ActivityLeaders.now(ids.get('Swim'))
      );
    }
  }

  // ADR 0031 B7
  @IsTest
  static void copySeasonCarriesStaffAndWhoLeadsEachActivity() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Database.update(
        new StaffMember__c(
          Id = ids.get('Eli'),
          SourceSystem__c = 'CampMinder',
          OutsideId__c = 'S-2'
        ),
        AccessLevel.USER_MODE
      );
      save(ids.get('Swim'), new List<Id>{ ids.get('Eli') }, new List<Id>());
      Test.startTest();
      Id copyId = new SeasonCopier(
          ids.get('Season'),
          Date.newInstance(2027, 6, 28)
        )
        .copy('Summer 2027');
      Test.stopTest();
      List<StaffMember__c> staff = [
        SELECT Name, CopiedFrom__c, OutsideId__c
        FROM StaffMember__c
        WHERE Season__c = :copyId
        WITH SYSTEM_MODE
        ORDER BY SortOrder__c
      ];
      Assert.areEqual(2, staff.size());
      Assert.areEqual(ids.get('Dana'), staff[0].CopiedFrom__c);
      Assert.areEqual('S-2', staff[1].OutsideId__c);
      List<ActivityLeader__c> leaders = [
        SELECT Activity__r.CopiedFrom__c, StaffMember__r.CopiedFrom__c
        FROM ActivityLeader__c
        WHERE Activity__r.Season__c = :copyId
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(1, leaders.size());
      Assert.areEqual(ids.get('Swim'), leaders[0].Activity__r.CopiedFrom__c);
      Assert.areEqual(ids.get('Eli'), leaders[0].StaffMember__r.CopiedFrom__c);
    }
  }

  // API-1.158: the Staff list imported adds a person and changes another's notes, and Undo takes
  // both back.
  @IsTest
  static void theStaffListImportsAndUndoesLikeLocations() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Test.startTest();
      ImportSetupSaves.Result result = ImportController.saveList(
        JSON.serialize(
          ImportTestPlans.listPlan(
            ids.get('Season'),
            new List<Object>{
              new Map<String, Object>{
                'kind' => 'StaffMember',
                'id' => ids.get('Dana'),
                'fields' => new Map<String, Object>{
                  'Notes__c' => 'Archery certified'
                },
                'refs' => new Map<String, Object>()
              },
              new Map<String, Object>{
                'kind' => 'StaffMember',
                'key' => 'StaffMember:Noa',
                'fields' => new Map<String, Object>{ 'Name' => 'Noa' }
              }
            }
          )
        )
      );
      Assert.areEqual(
        'Archery certified',
        [
          SELECT Notes__c
          FROM StaffMember__c
          WHERE Id = :ids.get('Dana')
          WITH USER_MODE
        ]
        .Notes__c
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM StaffMember__c WHERE Name = 'Noa' WITH USER_MODE]
      );
      ImportController.undoImport(result.importId);
      Test.stopTest();
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM StaffMember__c WHERE Name = 'Noa' WITH USER_MODE]
      );
      Assert.isNull(
        [
          SELECT Notes__c
          FROM StaffMember__c
          WHERE Id = :ids.get('Dana')
          WITH USER_MODE
        ]
        .Notes__c
      );
    }
  }

  // ADR 0031 B7: Undo of a Copy season keeps a season someone added staff to since.
  @IsTest
  static void undoingACopyKeepsTheSeasonWhenStaffWereAddedSince() {
    Map<String, Id> ids = KeptCamp.keptIds();
    System.runAs(KeptCamp.scheduler(ids)) {
      Id copyId = new SeasonCopier(
          ids.get('Season'),
          Date.newInstance(2027, 6, 28)
        )
        .copy('Summer 2027');
      Database.insert(
        new StaffMember__c(Season__c = copyId, Name = 'Noa'),
        AccessLevel.USER_MODE
      );
      Id importId = [
        SELECT Id
        FROM Import__c
        WHERE Season__c = :copyId
        WITH USER_MODE
        ORDER BY CreatedDate DESC
        LIMIT 1
      ]
      .Id;
      Test.startTest();
      ImportController.undoImport(importId);
      Test.stopTest();
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM StaffMember__c WHERE Name = 'Noa' WITH SYSTEM_MODE]
      );
    }
  }
}
