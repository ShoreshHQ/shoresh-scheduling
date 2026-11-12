/**
 * One name per season in a camp (WEEK-1.8), for a whole save at once: seasons named in the same
 * save are checked against each other too, and the names are checked in one query however many.
 */
@IsTest
private class SeasonNamesTest {
  // WEEK-1.8
  @IsTest
  static void twoNewSeasonsWithOneNameInOneSaveAreRefusedInOneQuery() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      List<Id> saved = SeasonSetupController.saveRecords(
        new List<SObject>{
          newSeason(camp.Id, 'Summer 2026'),
          newSeason(camp.Id, 'Winter 2026')
        }
      );
      Test.startTest();
      // Two seasons trading names, renamed without their camp, and three new ones: one query.
      Integer before = Limits.getQueries();
      SeasonNames.refuseTaken(
        new List<SObject>{
          new Season__c(Id = saved[0], Name = 'Winter 2026'),
          new Season__c(Id = saved[1], Name = 'Summer 2026'),
          newSeason(camp.Id, 'Spring 2027'),
          newSeason(camp.Id, 'Fall 2027'),
          newSeason(camp.Id, 'Day camp 2027')
        }
      );
      Integer used = Limits.getQueries() - before;
      String refusal;
      try {
        SeasonSetupController.saveRecords(
          new List<SObject>{
            newSeason(camp.Id, 'Spring 2027'),
            newSeason(camp.Id, 'spring 2027 ')
          }
        );
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Test.stopTest();
      Assert.areEqual(1, used, 'Checking the names used ' + used + ' queries');
      Assert.areEqual(
        'There is already a season called "spring 2027".',
        refusal
      );
      Assert.areEqual(
        2,
        [SELECT COUNT() FROM Season__c WHERE Camp__c = :camp.Id]
      );
    }
  }

  // WEEK-1.8
  @IsTest
  static void aSeasonNameTakenInTheCampIsRefused() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    Camp__c other = ShoreshTestData.camp('Camp Cedar');
    User scheduler = ShoreshTestData.scheduler();
    System.runAs(scheduler) {
      Id first = SeasonSetupController.saveRecords(
        new List<SObject>{ newSeason(camp.Id, 'Summer 2026') }
      )[0];
      Test.startTest();
      String refusal;
      try {
        SeasonSetupController.saveRecords(
          new List<SObject>{ newSeason(camp.Id, ' summer 2026 ') }
        );
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      // Another camp may use the name; a season may keep its own.
      SeasonSetupController.saveRecords(
        new List<SObject>{ newSeason(other.Id, 'Summer 2026') }
      );
      SeasonSetupController.saveRecords(
        new List<SObject>{ new Season__c(Id = first, Name = 'SUMMER 2026') }
      );
      Test.stopTest();
      Assert.areEqual(
        'There is already a season called "summer 2026".',
        refusal
      );
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Season__c WHERE Camp__c = :camp.Id]
      );
    }
  }

  private static Season__c newSeason(Id campId, String name) {
    return new Season__c(
      Name = name,
      Camp__c = campId,
      StartDate__c = Date.newInstance(2026, 6, 29),
      EndDate__c = Date.newInstance(2026, 7, 11)
    );
  }
}
