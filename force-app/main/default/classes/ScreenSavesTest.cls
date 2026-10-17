@IsTest
private class ScreenSavesTest {
  @IsTest
  static void screensChangeOnlyTheFieldsTheyShow() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c willow = ShoreshTestData.camp('Camp Willow');
      Camp__c cedar = ShoreshTestData.camp('Camp Cedar');
      Season__c season = ShoreshTestData.season(willow.Id, 'Summer 2026');
      Program__c main = ShoreshTestData.program(season.Id, 'Main');
      Program__c other = ShoreshTestData.program(season.Id, 'Other');
      List<SObject> refused = new List<SObject>{
        new Season__c(Id = season.Id, Camp__c = cedar.Id),
        new Program__c(Id = main.Id, CopiedFrom__c = other.Id),
        new Program__c(Season__c = season.Id, Name = 'New', CopiedFrom__c = main.Id)
      };
      for (SObject record : refused) {
        try {
          SeasonSetupController.saveRecords(new List<SObject>{ record });
          Assert.fail('Refused: ' + record);
        } catch (AuraHandledException e) {
          Assert.areEqual('These screens can\'t change that.', e.getMessage());
        }
      }
      Assert.areEqual(
        willow.Id,
        [SELECT Camp__c FROM Season__c WHERE Id = :season.Id WITH SYSTEM_MODE]
        .Camp__c
      );
      Assert.isNull(
        [
          SELECT CopiedFrom__c
          FROM Program__c
          WHERE Id = :main.Id
          WITH SYSTEM_MODE
        ]
        .CopiedFrom__c
      );
      // A new row names its parent; an existing one keeps it.
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new Program__c(Season__c = season.Id, Name = 'Added', SortOrder__c = 3),
          new Program__c(Id = main.Id, Name = 'Main camp', Monday__c = true)
        }
      );
      Assert.areEqual(3, [SELECT COUNT() FROM Program__c WITH SYSTEM_MODE]);
    }
  }

  @IsTest
  static void aGroupMovesToAnotherDivisionOfItsOwnProgramOnly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Camp__c camp = ShoreshTestData.camp('Camp Willow');
      Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
      Program__c main = ShoreshTestData.program(season.Id, 'Main');
      Program__c other = ShoreshTestData.program(season.Id, 'Other');
      Division__c juniors = ShoreshTestData.division(main.Id, 'Juniors');
      Division__c seniors = ShoreshTestData.division(main.Id, 'Seniors');
      Division__c elsewhere = ShoreshTestData.division(other.Id, 'Elsewhere');
      Group__c bunk = ShoreshTestData.groupIn(juniors.Id, 'Bunk 3');

      SeasonSetupController.saveRecords(
        new List<SObject>{ new Group__c(Id = bunk.Id, Division__c = seniors.Id) }
      );
      Assert.areEqual(
        seniors.Id,
        [SELECT Division__c FROM Group__c WHERE Id = :bunk.Id WITH SYSTEM_MODE]
        .Division__c
      );

      try {
        SeasonSetupController.saveRecords(
          new List<SObject>{
            new Group__c(Id = bunk.Id, Division__c = elsewhere.Id)
          }
        );
        Assert.fail('Another program\'s division is refused');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          '"Bunk 3": Groups can move only to another division of their own program.',
          e.getMessage()
        );
      }
      Assert.areEqual(
        seniors.Id,
        [SELECT Division__c FROM Group__c WHERE Id = :bunk.Id WITH SYSTEM_MODE]
        .Division__c
      );

      try {
        Database.insert(
          new CampLabel__c(
            Camp__c = camp.Id,
            ModelTerm__c = 'Division',
            Singular__c = 'unit',
            Plural__c = 'units'
          ),
          AccessLevel.SYSTEM_MODE
        );
        SeasonSetupController.saveRecords(
          new List<SObject>{ new Group__c(Id = bunk.Id, Division__c = null) }
        );
        Assert.fail('A bunk without a division is refused');
      } catch (AuraHandledException e) {
        Assert.areEqual('"Bunk 3": Pick its unit.', e.getMessage());
      }
    }
  }
}
