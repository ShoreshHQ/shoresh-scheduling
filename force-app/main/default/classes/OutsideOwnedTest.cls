/**
 * What belongs to the camp's other system (OutsideOwned; docs/protocol/api.md). Every test acts
 * as a Standard User with one permission set and makes its records inside the same runAs.
 * Synthetic data only.
 */
@IsTest
private class OutsideOwnedTest {
  private class Camp {
    Season__c season;
    Map<String, Id> ids;
    Camper__c maya;
    Preference__c choices;

    Camp() {
      season = ShoreshTestData.fullSeason(
        ShoreshTestData.camp('Camp Willow').Id
      );
      ids = ShoreshTestData.lastSeasonIds.clone();
      maya = new Camper__c(
        Season__c = season.Id,
        Name = 'Maya Cohen',
        OutsideId__c = 'SYN-77',
        SourceSystem__c = 'Sign-up Form'
      );
      Database.insert(maya, AccessLevel.USER_MODE);
    }

    Camp withChoices() {
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = season.Id,
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      ElectiveRun__c run = new ElectiveRun__c(
        Season__c = season.Id,
        Name = 'Chugim · Week 1',
        ElectiveSet__c = chugim.Id,
        Week__c = ids.get('Week 1'),
        Schedule__c = ShoreshTestData.version(
            ids.get('Main'),
            ids.get('Week 1'),
            'Imported'
          )
          .Id
      );
      Database.insert(run, AccessLevel.USER_MODE);
      choices = new Preference__c(
        ElectiveRun__c = run.Id,
        Camper__c = maya.Id,
        Group__c = ids.get('Group A'),
        Choices__c = '[]'
      );
      Database.insert(choices, AccessLevel.USER_MODE);
      return this;
    }
  }

  /** An API user with only the named piece, shown the season as a camp's sharing rule would. */
  private static User apiUser(String piece, Id seasonId) {
    User user = ShoreshTestData.userWith(piece);
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Database.insert(
        new Season__Share(
          ParentId = seasonId,
          UserOrGroupId = user.Id,
          AccessLevel = 'Edit'
        ),
        AccessLevel.SYSTEM_MODE
      );
    }
    return user;
  }

  private static String refusal(SObject record) {
    Database.SaveResult result = Database.update(
      record,
      false,
      AccessLevel.USER_MODE
    );
    return result.isSuccess() ? null : result.getErrors()[0].getMessage();
  }

  // ---------------------------------------------------------------- API-2.1

  // API-2.1 (the identity fields): a camper carries its system's name and that system's ID,
  // and is in a season once by them, whatever the spacing or capitals of the system's name; the
  // ID is kept exactly, so IDs differing only in capitals are two campers.
  @IsTest
  static void aCamperFromAnotherSystemIsInASeasonOnceBySystemAndId() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      Camper__c saved = [
        SELECT OutsideKey__c
        FROM Camper__c
        WHERE Id = :camp.maya.Id
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(
        camp.season.Id + '|sign-up form|SYN-77',
        saved.OutsideKey__c
      );

      Database.SaveResult again = Database.insert(
        new Camper__c(
          Season__c = camp.season.Id,
          Name = 'Maya C.',
          CamperNumber__c = 'SYN-0002',
          OutsideId__c = 'SYN-77',
          SourceSystem__c = 'sign-up  FORM'
        ),
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(again.isSuccess());
      Assert.areEqual(OutsideOwned.ID_TAKEN, again.getErrors()[0].getMessage());

      Database.insert(
        new List<Camper__c>{
          new Camper__c(
            Season__c = camp.season.Id,
            Name = 'Eli Cohen',
            OutsideId__c = 'SYN-77',
            SourceSystem__c = 'CampMinder'
          ),
          new Camper__c(
            Season__c = camp.season.Id,
            Name = 'Noa Levi',
            OutsideId__c = 'syn-77',
            SourceSystem__c = 'Sign-up Form'
          )
        },
        AccessLevel.USER_MODE
      );
    }
  }

  // API-2.1: an outside ID always names its system.
  @IsTest
  static void anOutsideIdWithNoSystemIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      Database.SaveResult result = Database.insert(
        new Camper__c(
          Season__c = camp.season.Id,
          Name = 'Eli Cohen',
          OutsideId__c = 'SYN-78'
        ),
        false,
        AccessLevel.USER_MODE
      );
      Assert.areEqual(
        OutsideOwned.NO_SYSTEM,
        result.getErrors()[0].getMessage()
      );
    }
  }

  // An outside system saves by its key (upsert) and updates the same camper.
  @IsTest
  static void savingByTheOutsideKeyUpdatesTheSameCamper() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      Camper__c fixed = new Camper__c(
        Season__c = camp.season.Id,
        Name = 'Maya Cohen',
        CamperNumber__c = 'SYN-0001',
        OutsideId__c = 'SYN-77',
        SourceSystem__c = 'Sign-up Form'
      );
      fixed.OutsideKey__c = OutsideOwned.outsideKey(fixed);
      Database.UpsertResult result = Database.upsert(
        fixed,
        Camper__c.OutsideKey__c,
        true,
        AccessLevel.SYSTEM_MODE
      );
      Assert.isFalse(result.isCreated());
      Assert.areEqual(camp.maya.Id, result.getId(), 'Shoresh\'s ID stays');
    }
  }

  // ---------------------------------------------------------------- API-4.2

  // API-4.2: a camper's name is not edited in Shoresh, by any screen or record page.
  @IsTest
  static void aCampersNameIsNotEditedInShoresh() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      Assert.areEqual(
        OutsideOwned.NAME_REFUSAL,
        refusal(new Camper__c(Id = camp.maya.Id, Name = 'Maya Kohen'))
      );
      Assert.areEqual(
        OutsideOwned.NAME_REFUSAL,
        refusal(new Camper__c(Id = camp.maya.Id, Name = 'maya cohen')),
        'Capitals too'
      );
      Assert.isNull(
        refusal(new Camper__c(Id = camp.maya.Id, CamperNumber__c = 'SYN-1')),
        'Other fields still save'
      );
    }
  }

  // API-4.2: a camper's bunk is not edited in Shoresh; bringing it in still sets it.
  @IsTest
  static void aCampersBunkIsNotEditedInShoresh() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp().withChoices();
      Assert.areEqual(
        OutsideOwned.BUNK_REFUSAL,
        refusal(
          new Preference__c(
            Id = camp.choices.Id,
            Group__c = camp.ids.get('Group B')
          )
        )
      );
      Assert.isNull(
        refusal(new Preference__c(Id = camp.choices.Id, Choices__c = '[]')),
        'Choices still save'
      );

      OutsideOwned.bringingIn = true;
      Assert.isNull(
        refusal(
          new Preference__c(
            Id = camp.choices.Id,
            Group__c = camp.ids.get('Group B')
          )
        ),
        'Bringing in moves the bunk'
      );
      Assert.isNull(
        refusal(new Camper__c(Id = camp.maya.Id, Name = 'Maya Kohen')),
        'Bringing in fixes the name'
      );
    }
  }

  // ---------------------------------------------------------------- API-4.4

  // API-4.4: a piece reaches only its own capability: "Send campers" adds a camper but cannot
  // delete one; "Read elective seats" adds nothing.
  @IsTest
  static void eachAccessPieceReachesOnlyItsCapability() {
    Id seasonId;
    System.runAs(ShoreshTestData.scheduler()) {
      Camp camp = new Camp();
      seasonId = camp.season.Id;
    }
    Camper__c eli = new Camper__c(
      Season__c = seasonId,
      Name = 'Eli Cohen',
      OutsideId__c = 'SYN-78',
      SourceSystem__c = 'Sign-up Form'
    );
    System.runAs(apiUser('Read_Elective_Seats', seasonId)) {
      Assert.isFalse(
        Database.insert(eli.clone(), false, AccessLevel.USER_MODE).isSuccess(),
        'A read piece adds nothing'
      );
    }
    System.runAs(apiUser('Send_Campers', seasonId)) {
      Assert.isTrue(
        Database.insert(eli, false, AccessLevel.USER_MODE).isSuccess(),
        'Send campers adds a camper'
      );
      Assert.isFalse(
        Database.delete(eli.Id, false, AccessLevel.USER_MODE).isSuccess(),
        'Nothing is deleted from outside'
      );
    }
    System.runAs(apiUser('Send_Elective_Choices', seasonId)) {
      Assert.isFalse(
        Database.insert(
            new Camper__c(Season__c = seasonId, Name = 'Noa Levi'),
            false,
            AccessLevel.USER_MODE
          )
          .isSuccess(),
        'Send elective choices adds no camper'
      );
    }
  }
}
