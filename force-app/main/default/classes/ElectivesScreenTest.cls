/**
 * The Electives setup screen's server side (repo ADR 0018, slice E4): what the season read gives
 * it, how its rows are saved (sets and offerings, compare and set as every setup table), and its
 * deletes. Every test acts as a scheduler with only the Shoresh Scheduler permission set and makes
 * its records inside the same runAs. Synthetic data only.
 */
@IsTest
private class ElectivesScreenTest {
  /** A season with "Chugim": Archery (12 seats), Drama (proposed), and "Archery double". */
  private class Menu {
    Season__c season;
    Map<String, Id> ids;
    ElectiveSet__c chugim;
    Offering__c archery;
    Offering__c drama;
    LinkedChoice__c doubleArchery;

    Menu() {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      season = ShoreshTestData.fullSeason(camp.Id);
      ids = ShoreshTestData.lastSeasonIds.clone();
      List<Activity__c> activities = new List<Activity__c>{
        ShoreshTestData.activity(season.Id, 'Archery', null),
        ShoreshTestData.activity(season.Id, 'Drama', null),
        ShoreshTestData.activity(season.Id, 'Pottery', null)
      };
      Database.insert(activities, AccessLevel.USER_MODE);
      for (Activity__c activity : activities) {
        ids.put(activity.Name, activity.Id);
      }
      chugim = new ElectiveSet__c(Season__c = season.Id, Name = 'Chugim');
      Database.insert(chugim, AccessLevel.USER_MODE);
      archery = new Offering__c(
        ElectiveSet__c = chugim.Id,
        Activity__c = ids.get('Archery'),
        Seats__c = 12
      );
      drama = new Offering__c(
        ElectiveSet__c = chugim.Id,
        Activity__c = ids.get('Drama'),
        Seats__c = 15,
        Proposed__c = true
      );
      Database.insert(
        new List<Offering__c>{ archery, drama },
        AccessLevel.USER_MODE
      );
      doubleArchery = new LinkedChoice__c(
        ElectiveSet__c = chugim.Id,
        Name = 'Archery double',
        Offering__c = archery.Id,
        AppliesTo__c = 'OnlyThese',
        SortOrder__c = 1
      );
      Database.insert(doubleArchery, AccessLevel.USER_MODE);
      Database.insert(
        new List<SObject>{
          new LinkedChoiceTime__c(
            LinkedChoice__c = doubleArchery.Id,
            Weekday__c = 'Tuesday',
            TimeBlock__c = ids.get('Period 1')
          ),
          new LinkedChoiceTime__c(
            LinkedChoice__c = doubleArchery.Id,
            Weekday__c = 'Thursday',
            TimeBlock__c = ids.get('Period 1')
          ),
          new Coverage__c(
            Season__c = season.Id,
            LinkedChoice__c = doubleArchery.Id,
            Division__c = ids.get('Juniors')
          )
        },
        AccessLevel.USER_MODE
      );
    }

    /** A Week 1 run with one camper's seat in Archery. */
    ElectiveRun__c runWithASeat() {
      Camper__c camper = new Camper__c(
        Season__c = season.Id,
        Name = 'Synthetic Camper',
        CamperNumber__c = 'SYN-0001'
      );
      Database.insert(camper, AccessLevel.USER_MODE);
      Schedule__c schedule = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Imported'
      );
      ElectiveRun__c run = new ElectiveRun__c(
        Season__c = season.Id,
        Name = 'Chugim · Week 1',
        ElectiveSet__c = chugim.Id,
        Week__c = ids.get('Week 1'),
        Schedule__c = schedule.Id
      );
      Database.insert(run, AccessLevel.USER_MODE);
      Database.insert(
        new Assignment__c(
          ElectiveRun__c = run.Id,
          Camper__c = camper.Id,
          Group__c = ids.get('Group A'),
          TimeBlock__c = ids.get('Period 1'),
          Offering__c = archery.Id,
          Date__c = Date.newInstance(2026, 6, 30)
        ),
        AccessLevel.USER_MODE
      );
      return run;
    }
  }

  private static RowSaves.Result save(SObject record, SObject seen) {
    return SetupTablesController.saveRow(record, seen, null);
  }

  private static String refusalOf(SObject record) {
    try {
      save(record, null);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('The save is refused');
    return null;
  }

  private static String deleteRefusal(Id recordId) {
    try {
      SeasonSetupController.deleteRecord(recordId);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('The delete is refused');
    return null;
  }

  // ---------------------------------------------------------------- reading

  @IsTest
  static void theSeasonReadCarriesItsSetsOfferingsAndLinkedChoices() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Test.startTest();
      Integer before = Limits.getQueries();
      ElectiveMenus.Setup electives = ElectiveMenus.forSeason(menu.season.Id);
      Integer used = Limits.getQueries() - before;
      SeasonSetupReader.SeasonSetup setup = SeasonSetupController.getSeasonSetup(
        menu.season.Id
      );
      Test.stopTest();

      Assert.areEqual(3, used, 'Queries for the season\'s electives');
      Assert.areEqual(1, setup.electives.sets.size());
      Assert.areEqual('Chugim', setup.electives.sets[0].Name);
      // In the activity's alphabetical order.
      Assert.areEqual(2, electives.offerings.size());
      Assert.areEqual(menu.archery.Id, electives.offerings[0].Id);
      Assert.areEqual(12, electives.offerings[0].Seats__c.intValue());
      Assert.isTrue(electives.offerings[1].Proposed__c);
      LinkedChoice__c choice = electives.linkedChoices[0];
      Assert.areEqual('Archery double', choice.Name);
      Assert.areEqual(menu.archery.Id, choice.Offering__c);
      Assert.areEqual('OnlyThese', choice.AppliesTo__c);
      Assert.areEqual(2, choice.Times__r.size());
      Assert.areEqual(1, choice.Coverages__r.size());
      Assert.areEqual(
        menu.ids.get('Juniors'),
        choice.Coverages__r[0].Division__c
      );
    }
  }

  @IsTest
  static void aSeasonWithoutElectiveSetsReadsInOneQuery() {
    System.runAs(ShoreshTestData.scheduler()) {
      Season__c season = ShoreshTestData.season(
        ShoreshTestData.camp('Camp Birch').Id,
        'Summer 2026'
      );
      Test.startTest();
      Integer before = Limits.getQueries();
      ElectiveMenus.Setup electives = ElectiveMenus.forSeason(season.Id);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(1, used);
      Assert.isTrue(electives.sets.isEmpty());
      Assert.isTrue(electives.offerings.isEmpty());
    }
  }

  @IsTest
  static void someoneWhoCannotReadElectivesGetsNoneRatherThanARefusal() {
    Id seasonId;
    System.runAs(ShoreshTestData.scheduler()) {
      seasonId = new Menu().season.Id;
    }
    System.runAs(ShoreshTestData.outsider()) {
      ElectiveMenus.Setup electives = ElectiveMenus.forSeason(seasonId);
      Assert.isTrue(electives.sets.isEmpty());
      Assert.isTrue(electives.offerings.isEmpty());
      Assert.isTrue(electives.linkedChoices.isEmpty());
    }
  }

  // ---------------------------------------------------------------- saving rows

  @IsTest
  static void aSetAndItsOfferingsAreAddedAndChangedAsRowsAreSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Test.startTest();
      Id bechirot = save(
          new ElectiveSet__c(Season__c = menu.season.Id, Name = 'Bechirot'),
          null
        )
        .id;
      Id pottery = save(
          new Offering__c(
            ElectiveSet__c = bechirot,
            Activity__c = menu.ids.get('Pottery'),
            NoSeatLimit__c = true
          ),
          null
        )
        .id;
      // 0 seats (saved; the seat run uses no limit and says so); and a minimum.
      RowSaves.Result closed = save(
        new Offering__c(
          Id = menu.archery.Id,
          Seats__c = 0,
          MinimumToRun__c = 6
        ),
        new Offering__c(Seats__c = 12, MinimumToRun__c = null)
      );
      // Confirm, as the row's Confirm does.
      RowSaves.Result confirmed = save(
        new Offering__c(Id = menu.drama.Id, Proposed__c = false),
        new Offering__c(Proposed__c = true)
      );
      Test.stopTest();

      Assert.isNotNull(pottery);
      Assert.isTrue(closed.saved());
      Assert.isTrue(confirmed.saved());
      Map<Id, Offering__c> saved = new Map<Id, Offering__c>(
        [
          SELECT
            ElectiveSet__c,
            Seats__c,
            NoSeatLimit__c,
            MinimumToRun__c,
            Proposed__c
          FROM Offering__c
          WITH USER_MODE
        ]
      );
      Assert.areEqual(bechirot, saved.get(pottery).ElectiveSet__c);
      Assert.isTrue(saved.get(pottery).NoSeatLimit__c);
      Assert.areEqual(0, saved.get(menu.archery.Id).Seats__c.intValue());
      Assert.areEqual(6, saved.get(menu.archery.Id).MinimumToRun__c.intValue());
      Assert.isFalse(saved.get(menu.drama.Id).Proposed__c);
    }
  }

  @IsTest
  static void someoneElsesChangeToSeatsIsAskedAboutNotOverwritten() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Database.update(
        new Offering__c(Id = menu.archery.Id, Seats__c = 10),
        AccessLevel.USER_MODE
      );
      RowSaves.Result result = save(
        new Offering__c(Id = menu.archery.Id, Seats__c = 14),
        new Offering__c(Seats__c = 12)
      );
      Assert.isNull(result.id);
      Assert.areEqual(1, result.changed.size());
      Assert.areEqual(
        10,
        ((Decimal) result.theirs.get(result.changed[0])).intValue()
      );
    }
  }

  @IsTest
  static void onlyTheScreensFieldsAreSavedAndAnOfferingStaysInItsSet() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Assert.areEqual(
        'These screens can\'t change that.',
        refusalOf(new Offering__c(Id = menu.archery.Id, Key__c = 'x'))
      );
      ElectiveSet__c other = new ElectiveSet__c(
        Season__c = menu.season.Id,
        Name = 'Bechirot'
      );
      Database.insert(other, AccessLevel.USER_MODE);
      Assert.areEqual(
        'These screens can\'t change that.',
        refusalOf(
          new Offering__c(Id = menu.archery.Id, ElectiveSet__c = other.Id)
        )
      );
      // Linked choices are edited in slice E8, not here.
      Assert.areEqual(
        'These screens can\'t save that.',
        refusalOf(new LinkedChoice__c(Id = menu.doubleArchery.Id, Name = 'x'))
      );
    }
  }

  // ---------------------------------------------------------------- deleting

  @IsTest
  static void anOfferingGoesWithItsLinkedChoicesAndTheActivityStays() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      Test.startTest();
      Integer before = Limits.getQueries();
      SeasonSetupController.deleteRecord(menu.archery.Id);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(1, [SELECT COUNT() FROM Offering__c WITH SYSTEM_MODE]);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM LinkedChoice__c WITH SYSTEM_MODE]
      );
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM LinkedChoiceTime__c WITH SYSTEM_MODE]
      );
      Assert.areEqual(0, [SELECT COUNT() FROM Coverage__c WITH SYSTEM_MODE]);
      Assert.areEqual(
        3,
        [SELECT COUNT() FROM Activity__c WITH SYSTEM_MODE],
        'The activity is kept'
      );
      Assert.isTrue(used <= 20, 'Queries to delete an offering: ' + used);
    }
  }

  @IsTest
  static void anOfferingOrSetWithSeatsIsRefusedNamingTheRun() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      menu.runWithASeat();
      Test.startTest();
      String offering = deleteRefusal(menu.archery.Id);
      String electiveSet = deleteRefusal(menu.chugim.Id);
      Test.stopTest();
      String expected = 'This can\'t be deleted yet: it has elective runs: "Chugim · Week 1". First delete that run, then delete it.';
      Assert.areEqual(expected, offering);
      Assert.areEqual(expected, electiveSet);
      Assert.areEqual(2, [SELECT COUNT() FROM Offering__c WITH SYSTEM_MODE]);
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM LinkedChoice__c WITH SYSTEM_MODE],
        'Nothing was taken'
      );
    }
  }

  @IsTest
  static void aSetIsDeletedFromTheScreenWithItsOfferings() {
    System.runAs(ShoreshTestData.scheduler()) {
      Menu menu = new Menu();
      SeasonSetupController.deleteRecord(menu.chugim.Id);
      Assert.areEqual(0, [SELECT COUNT() FROM ElectiveSet__c WITH SYSTEM_MODE]);
      Assert.areEqual(0, [SELECT COUNT() FROM Offering__c WITH SYSTEM_MODE]);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM LinkedChoice__c WITH SYSTEM_MODE]
      );
    }
  }
}
