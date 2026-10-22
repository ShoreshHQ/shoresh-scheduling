/**
 * The electives data (repo ADR 0018): what is refused on save, what delete protection says,
 * deleting a set and a season, and what Copy last season carries. Every test acts as a scheduler
 * with only the Shoresh Scheduler permission set and makes its records inside the same runAs.
 * Synthetic data only.
 */
@IsTest
private class ElectivesDataTest {
  /** A season with "Chugim": Archery (12 seats) and Drama, a linked choice, a camper, a run. */
  private class ElectiveCamp {
    Season__c season;
    Map<String, Id> ids;
    ElectiveSet__c chugim;
    Offering__c archery;
    Offering__c drama;
    LinkedChoice__c doubleArchery;
    Camper__c maya;
    ElectiveRun__c run;

    /** Everything but the camper and run. */
    ElectiveCamp() {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      season = ShoreshTestData.fullSeason(camp.Id);
      ids = ShoreshTestData.lastSeasonIds.clone();
      List<Activity__c> activities = new List<Activity__c>{
        ShoreshTestData.activity(season.Id, 'Archery', null),
        ShoreshTestData.activity(season.Id, 'Drama', null)
      };
      Database.insert(activities, AccessLevel.USER_MODE);
      ids.put('Archery', activities[0].Id);
      ids.put('Drama', activities[1].Id);
      chugim = new ElectiveSet__c(Season__c = season.Id, Name = 'Chugim');
      Database.insert(chugim, AccessLevel.USER_MODE);
      archery = new Offering__c(
        ElectiveSet__c = chugim.Id,
        Activity__c = ids.get('Archery'),
        Seats__c = 12,
        MinimumToRun__c = 4
      );
      drama = new Offering__c(
        ElectiveSet__c = chugim.Id,
        Activity__c = ids.get('Drama'),
        NoSeatLimit__c = true
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
            Weekday__c = 'Monday',
            TimeBlock__c = ids.get('Period 1')
          ),
          new LinkedChoiceTime__c(
            LinkedChoice__c = doubleArchery.Id,
            Weekday__c = 'Wednesday',
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

    /** Maya in a Week 1 run against an imported version, with her choices and one seat. */
    ElectiveCamp withRun() {
      maya = new Camper__c(
        Season__c = season.Id,
        Name = 'Maya Cohen',
        CamperNumber__c = 'SYN-0001',
        ParentComments__c = 'Synthetic comment.'
      );
      Database.insert(maya, AccessLevel.USER_MODE);
      Schedule__c schedule = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Imported'
      );
      run = new ElectiveRun__c(
        Season__c = season.Id,
        Name = 'Chugim · Week 1',
        ElectiveSet__c = chugim.Id,
        Week__c = ids.get('Week 1'),
        Schedule__c = schedule.Id
      );
      Database.insert(run, AccessLevel.USER_MODE);
      Database.insert(
        new List<SObject>{
          new Preference__c(
            ElectiveRun__c = run.Id,
            Camper__c = maya.Id,
            Group__c = ids.get('Group A'),
            Choices__c = '[]'
          ),
          seat(ids.get('Period 1'))
        },
        AccessLevel.USER_MODE
      );
      return this;
    }

    Assignment__c seat(Id blockId) {
      return new Assignment__c(
        ElectiveRun__c = run.Id,
        Camper__c = maya.Id,
        Group__c = ids.get('Group A'),
        TimeBlock__c = blockId,
        Offering__c = archery.Id,
        Date__c = Date.newInstance(2026, 6, 30)
      );
    }
  }

  private static String refusal(SObject record) {
    Database.SaveResult result = Database.insert(
      record,
      false,
      AccessLevel.USER_MODE
    );
    Assert.isFalse(result.isSuccess(), 'Refused: ' + record);
    return result.getErrors()[0].getMessage();
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

  // ---------------------------------------------------------------- saving

  @IsTest
  static void aSetNameIsUsedOnceInASeasonIgnoringSpacesAndCapitals() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp();
      String message = refusal(
        new ElectiveSet__c(Season__c = camp.season.Id, Name = ' chu gim ')
      );
      Assert.areEqual(
        'Another elective set in this season is called "chu gim".',
        message
      );
      Season__c other = ShoreshTestData.season(
        camp.season.Camp__c,
        'Summer 2027'
      );
      Database.insert(
        new ElectiveSet__c(Season__c = other.Id, Name = 'Chugim'),
        AccessLevel.USER_MODE
      );
    }
  }

  @IsTest
  static void anActivityIsOfferedOnceInASetAndOnlyFromItsSeason() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp();
      Assert.areEqual(
        'This activity is already offered in this elective set.',
        refusal(
          new Offering__c(
            ElectiveSet__c = camp.chugim.Id,
            Activity__c = camp.ids.get('Drama')
          )
        )
      );
      Season__c other = ShoreshTestData.season(
        camp.season.Camp__c,
        'Summer 2027'
      );
      Activity__c elsewhere = ShoreshTestData.activity(
        other.Id,
        'Pottery',
        null
      );
      Database.insert(elsewhere, AccessLevel.USER_MODE);
      Assert.areEqual(
        'This activity belongs to a different season than the elective set.',
        refusal(
          new Offering__c(
            ElectiveSet__c = camp.chugim.Id,
            Activity__c = elsewhere.Id
          )
        )
      );
    }
  }

  @IsTest
  static void seatsAreZeroOrMoreAndAMinimumIsOneOrMore() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp();
      camp.archery.Seats__c = -1;
      Assert.areEqual(
        'Must be 0 or more, or tick No limit.',
        Database.update(camp.archery, false, AccessLevel.USER_MODE)
            .getErrors()[0]
          .getMessage()
      );
      camp.archery.Seats__c = 0; // closed this summer
      camp.archery.MinimumToRun__c = 0;
      Assert.areEqual(
        'Must be 1 or more, or blank for no minimum.',
        Database.update(camp.archery, false, AccessLevel.USER_MODE)
            .getErrors()[0]
          .getMessage()
      );
      camp.archery.MinimumToRun__c = null;
      camp.archery.Seats__c = null; // not filled in yet
      Assert.isTrue(
        Database.update(camp.archery, false, AccessLevel.USER_MODE).isSuccess()
      );
    }
  }

  @IsTest
  static void aLinkedChoiceLinksAnOfferingOfItsOwnSetForWholeDivisions() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp();
      ElectiveSet__c other = new ElectiveSet__c(
        Season__c = camp.season.Id,
        Name = 'Bechirot'
      );
      Database.insert(other, AccessLevel.USER_MODE);
      Assert.areEqual(
        'This offering is in a different elective set than the linked choice.',
        refusal(
          new LinkedChoice__c(
            ElectiveSet__c = other.Id,
            Name = 'Borrowed',
            Offering__c = camp.archery.Id,
            AppliesTo__c = 'All'
          )
        )
      );
      Assert.areEqual(
        'Choose a division: a linked choice is for whole divisions.',
        refusal(
          new Coverage__c(
            Season__c = camp.season.Id,
            LinkedChoice__c = camp.doubleArchery.Id,
            Group__c = camp.ids.get('Group A')
          )
        )
      );
      Assert.areEqual(
        'Choose what this row is for.',
        refusal(
          new Coverage__c(
            Season__c = camp.season.Id,
            Division__c = camp.ids.get('Juniors')
          )
        )
      );
    }
  }

  @IsTest
  static void campersAreToldApartByNumberElseByName() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp().withRun();
      Assert.areEqual(
        'Another camper in this season has this number.',
        refusal(
          new Camper__c(
            Season__c = camp.season.Id,
            Name = 'Someone Else',
            CamperNumber__c = ' syn-0001 '
          )
        )
      );
      Database.insert(
        new Camper__c(Season__c = camp.season.Id, Name = 'Noa  Levi'),
        AccessLevel.USER_MODE
      );
      Assert.areEqual(
        'Another camper in this season has this name and no number. Give each a number to tell them apart.',
        refusal(new Camper__c(Season__c = camp.season.Id, Name = 'noa levi'))
      );
      // The same name with a number is someone else.
      Database.insert(
        new Camper__c(
          Season__c = camp.season.Id,
          Name = 'Noa Levi',
          CamperNumber__c = 'SYN-0002'
        ),
        AccessLevel.USER_MODE
      );
      for (Camper__c camper : [
        SELECT Key__c
        FROM Camper__c
        WHERE CamperNumber__c = NULL
        WITH SYSTEM_MODE
      ]) {
        Assert.isFalse(
          camper.Key__c.containsIgnoreCase('noa'),
          'The key holds no copy of the name'
        );
      }
    }
  }

  @IsTest
  static void aCamperHasOneSetOfChoicesAndOneSeatAtATimeInARun() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp().withRun();
      Assert.isFalse(
        Database.insert(
            new Preference__c(
              ElectiveRun__c = camp.run.Id,
              Camper__c = camp.maya.Id
            ),
            false,
            AccessLevel.USER_MODE
          )
          .isSuccess(),
        'Second set of choices'
      );
      Assert.isFalse(
        Database.insert(
            camp.seat(camp.ids.get('Period 1')),
            false,
            AccessLevel.USER_MODE
          )
          .isSuccess(),
        'Second seat at the same time'
      );
      Assert.isTrue(
        Database.insert(
            camp.seat(camp.ids.get('Lunch')),
            false,
            AccessLevel.USER_MODE
          )
          .isSuccess(),
        'A seat at another time'
      );
      Camper__c saved = [
        SELECT ParentComments__c
        FROM Camper__c
        WHERE Id = :camp.maya.Id
        WITH USER_MODE
      ];
      Assert.areEqual('Synthetic comment.', saved.ParentComments__c);
    }
  }

  @IsTest
  static void aRunsScheduleIsOfItsWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp().withRun();
      camp.run.Week__c = camp.ids.get('Week 2');
      Assert.areEqual(
        'This schedule is not for the run\'s week.',
        Database.update(camp.run, false, AccessLevel.USER_MODE).getErrors()[0]
          .getMessage()
      );
    }
  }

  // ---------------------------------------------------------------- delete protection

  @IsTest
  static void whatElectivesUseCannotBeDeletedAndTheRefusalSaysWhy() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp().withRun();
      Test.startTest();
      Integer before = Limits.getQueries();
      String activity = deleteRefusal(camp.ids.get('Drama'));
      Integer used = Limits.getQueries() - before;
      String week = deleteRefusal(camp.ids.get('Week 1'));
      String bunk = deleteRefusal(camp.ids.get('Group A'));
      String block = deleteRefusal(camp.ids.get('Period 1'));
      String division = deleteRefusal(camp.ids.get('Juniors'));
      Test.stopTest();

      Assert.areEqual(
        'This can\'t be deleted yet: it is offered in "Chugim". First take it off that elective set, then delete it.',
        activity
      );
      Assert.areEqual(
        'This can\'t be deleted yet: it has elective runs: "Chugim · Week 1". First delete that run, then delete it.',
        week
      );
      Assert.isTrue(bunk.contains('"Chugim · Week 1"'), bunk);
      Assert.isTrue(block.contains('a period of "Archery double"'), block);
      Assert.isTrue(block.contains('"Chugim · Week 1"'), block);
      Assert.isTrue(division.contains('named by "Archery double"'), division);
      Assert.isTrue(used <= 12, 'Queries for one refusal: ' + used);
      Assert.areEqual(
        2,
        [SELECT COUNT() FROM Activity__c WITH USER_MODE],
        'Nothing was deleted'
      );
    }
  }

  @IsTest
  static void aSetWithRunsIsRefusedNamingThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp().withRun();
      Database.DeleteResult result = Database.delete(
        camp.chugim.Id,
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(result.isSuccess());
      Assert.areEqual(
        'This elective set can\'t be deleted yet: it has elective runs: "Chugim · Week 1". First delete that run, then delete it.',
        result.getErrors()[0].getMessage()
      );
      Assert.areEqual(1, [SELECT COUNT() FROM LinkedChoice__c WITH USER_MODE]);
    }
  }

  @IsTest
  static void aSetWithoutRunsGoesWithItsOfferingsAndLinkedChoices() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp();
      Database.delete(camp.chugim, AccessLevel.USER_MODE);
      Assert.areEqual(0, [SELECT COUNT() FROM Offering__c WITH SYSTEM_MODE]);
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
        2,
        [SELECT COUNT() FROM Activity__c WITH SYSTEM_MODE],
        'Activities stay'
      );
    }
  }

  @IsTest
  static void aSeasonWithElectivesCanBeDeleted() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp().withRun();
      Test.startTest();
      Integer before = Limits.getQueries();
      Database.delete(camp.season, AccessLevel.USER_MODE);
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.areEqual(0, [SELECT COUNT() FROM ElectiveSet__c WITH SYSTEM_MODE]);
      Assert.areEqual(0, [SELECT COUNT() FROM ElectiveRun__c WITH SYSTEM_MODE]);
      Assert.areEqual(0, [SELECT COUNT() FROM Camper__c WITH SYSTEM_MODE]);
      Assert.areEqual(0, [SELECT COUNT() FROM Assignment__c WITH SYSTEM_MODE]);
      Assert.areEqual(0, [SELECT COUNT() FROM Season__c WITH SYSTEM_MODE]);
      Assert.isTrue(used <= 40, 'Queries to delete a season: ' + used);
    }
  }

  // ---------------------------------------------------------------- copy last season

  @IsTest
  static void copySeasonCarriesTheMenuButNotCampersOrRuns() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveCamp camp = new ElectiveCamp().withRun();
      Test.startTest();
      Integer before = Limits.getQueries();
      Id copyId = new SeasonCopier(
          camp.season.Id,
          Date.newInstance(2027, 6, 28)
        )
        .copy('Summer 2027');
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      ElectiveSet__c menu = [
        SELECT Id, Name, CopiedFrom__c
        FROM ElectiveSet__c
        WHERE Season__c = :copyId
        WITH USER_MODE
      ];
      Assert.areEqual('Chugim', menu.Name);
      Assert.areEqual(camp.chugim.Id, menu.CopiedFrom__c);
      Map<Id, Offering__c> offerings = new Map<Id, Offering__c>();
      for (Offering__c offering : [
        SELECT
          CopiedFrom__c,
          Activity__r.Season__c,
          Activity__r.CopiedFrom__c,
          Seats__c,
          NoSeatLimit__c,
          MinimumToRun__c
        FROM Offering__c
        WHERE ElectiveSet__c = :menu.Id
        WITH USER_MODE
      ]) {
        offerings.put(offering.CopiedFrom__c, offering);
        Assert.areEqual(copyId, offering.Activity__r.Season__c);
      }
      Offering__c archery = offerings.get(camp.archery.Id);
      Assert.areEqual(
        camp.ids.get('Archery'),
        archery.Activity__r.CopiedFrom__c
      );
      Assert.areEqual(12, archery.Seats__c.intValue());
      Assert.areEqual(4, archery.MinimumToRun__c.intValue());
      Assert.isTrue(offerings.get(camp.drama.Id).NoSeatLimit__c);

      LinkedChoice__c choice = [
        SELECT
          Name,
          AppliesTo__c,
          CopiedFrom__c,
          Offering__c,
          (SELECT Weekday__c, TimeBlock__r.Program__r.Season__c FROM Times__r),
          (SELECT Division__r.Program__r.Season__c, Season__c FROM Coverages__r)
        FROM LinkedChoice__c
        WHERE ElectiveSet__c = :menu.Id
        WITH USER_MODE
      ];
      Assert.areEqual('Archery double', choice.Name);
      Assert.areEqual('OnlyThese', choice.AppliesTo__c);
      Assert.areEqual(camp.doubleArchery.Id, choice.CopiedFrom__c);
      Assert.areEqual(archery.Id, choice.Offering__c);
      Assert.areEqual(2, choice.Times__r.size());
      for (LinkedChoiceTime__c row : choice.Times__r) {
        Assert.areEqual(copyId, row.TimeBlock__r.Program__r.Season__c);
      }
      Assert.areEqual(1, choice.Coverages__r.size());
      Assert.areEqual(copyId, choice.Coverages__r[0].Season__c);
      Assert.areEqual(
        copyId,
        choice.Coverages__r[0].Division__r.Program__r.Season__c
      );

      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Camper__c WHERE Season__c = :copyId WITH USER_MODE]
      );
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM ElectiveRun__c
          WHERE Season__c = :copyId
          WITH USER_MODE
        ]
      );
      Assert.isTrue(used <= 60, 'Queries to copy a season: ' + used);
    }
  }
}
