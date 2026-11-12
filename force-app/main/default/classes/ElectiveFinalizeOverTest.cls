/**
 * Finalize and seats over their limit (ELECT-5.7): its own class beside ElectiveSeatsTest, which
 * sits at Code Analyzer's limit.
 */
@IsTest
private class ElectiveFinalizeOverTest {
  // ELECT-5.7
  @IsTest
  static void finalizeIsRefusedWhileAnOfferingIsOverItsSeats() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(2);
      ElectiveSeats.RunView view = camp.assign(camp.everyoneInDrama(1));
      // Drama given a limit of 1 after both campers were seated in it.
      Database.update(
        new Offering__c(
          Id = camp.ids.get('o:Drama'),
          NoSeatLimit__c = false,
          Seats__c = 1
        ),
        AccessLevel.USER_MODE
      );

      String refusal;
      try {
        ElectiveSeatsController.finalizeRun(camp.runId, view.revision);
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Assert.areEqual(
        'Drama is over its seats on Monday, Period 1: 2 of 1. Move a camper, then finalize.',
        refusal
      );
      Assert.areEqual(
        'Committed',
        [SELECT Status__c FROM ElectiveRun__c WHERE Id = :camp.runId].Status__c
      );
    }
  }
}
