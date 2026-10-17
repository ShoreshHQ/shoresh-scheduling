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
}
