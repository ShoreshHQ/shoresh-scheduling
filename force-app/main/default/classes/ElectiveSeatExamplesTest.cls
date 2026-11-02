/**
 * The shared seat examples (staticresources/ShoreshSeatExamples.json), which the engine must also
 * pass (shoreshElectiveEngine seatExamples.test.js): Assign's save check leaves as many seats free
 * beside the locks as the examples say the engine places.
 */
@IsTest
private class ElectiveSeatExamplesTest {
  // ELECT-4.4
  @IsTest
  static void theSaveCheckPassesTheSharedSeatExamples() {
    StaticResource examples = [
      SELECT Body
      FROM StaticResource
      WHERE Name = 'ShoreshSeatExamples'
      LIMIT 1
    ];
    Map<String, Object> read = (Map<String, Object>) JSON.deserializeUntyped(
      examples.Body.toString()
    );
    List<Object> cases = (List<Object>) read.get('cases');
    Assert.isFalse(cases.isEmpty());
    for (Object each : cases) {
      Map<String, Object> example = (Map<String, Object>) each;
      Offering__c offering = new Offering__c(
        Seats__c = (Decimal) example.get('seats'),
        NoSeatLimit__c = (Boolean) example.get('noLimit')
      );
      Integer wanting = (Integer) example.get('wanting');
      Integer free = ElectiveSeatTally.freeSeats(
        offering,
        (Integer) example.get('locked')
      );
      Assert.areEqual(
        (Integer) example.get('placed'),
        free == null ? wanting : Math.min(wanting, free),
        (String) example.get('name')
      );
    }
  }
}
