/**
 * Elective seats for bunks in No division (Greg 2026-11-11; ELECT-4.10): bunks holding one set at
 * one time share one session and its seats, so their campers mix. As a scheduler with the Shoresh
 * Scheduler permission set; synthetic camp (ElectiveSeatsCamp).
 */
@IsTest
private class ElectiveSeatsNoDivisionTest {
  // ELECT-4.10
  @IsTest
  static void bunksInNoDivisionAtOneTimeShareOneSessionAndItsSeats() {
    System.runAs(ShoreshTestData.scheduler()) {
      ElectiveSeatsCamp camp = new ElectiveSeatsCamp(4);
      // Each bunk in No division: held alone in a record of its own (DIV-1.1).
      update as user new Division__c(
        Id = camp.ids.get('Juniors'),
        NoDivision__c = true
      );
      Division__c holding = new Division__c(
        Program__c = camp.ids.get('Main'),
        Name = 'Group B',
        NoDivision__c = true
      );
      insert as user holding;
      update as user new Group__c(
        Id = camp.ids.get('Group B'),
        Division__c = holding.Id
      );

      Test.startTest();
      ElectiveSeats.RunView view = ElectiveSeatsController.openRun(camp.runId);
      Test.stopTest();

      // Greg 2026-11-11: the two bunks mix, one session a day, not one per bunk.
      Assert.areEqual(2, view.times.size(), JSON.serialize(view.times));
      Assert.areEqual(2, view.times[0].groupIds.size());
      Assert.isNull(view.times[0].divisionId);
    }
  }
}
