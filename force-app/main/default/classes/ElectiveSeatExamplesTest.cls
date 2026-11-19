/**
 * The shared seat examples (staticresources/ShoreshSeatExamples.json), which the engine and the
 * seats screen must also pass (shoreshElectiveEngine seatExamples.test.js, shoreshElectiveSeats
 * seats.test.js): Assign's save check leaves as many seats free beside the locks as the examples
 * say the engine places, and ElectiveSeatCounts counts each time as the screen does.
 */
@IsTest
private class ElectiveSeatExamplesTest {
  private static final String BUNK_PREFIX = Group__c.SObjectType.getDescribe()
    .getKeyPrefix();
  // ELECT-4.4
  @IsTest
  static void theSaveCheckPassesTheSharedSeatExamples() {
    List<Object> cases = (List<Object>) examples().get('cases');
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

  // ELECT-4.1, ELECT-4.11
  @IsTest
  static void theSeatCountsPassTheSharedCountExamples() {
    List<Object> cases = (List<Object>) examples().get('counts');
    Assert.isFalse(cases.isEmpty());
    Date day = Date.newInstance(2027, 7, 5);
    Id offeringId = Offering__c.SObjectType.getDescribe()
      .getKeyPrefix()
      .rightPad(15, '0');
    for (Object each : cases) {
      Map<String, Object> example = (Map<String, Object>) each;
      String name = (String) example.get('name');
      // Made-up bunk Ids, one per name, in the order first named.
      Map<String, Id> bunks = new Map<String, Id>();
      List<ElectivePeriod> times = new List<ElectivePeriod>();
      for (Object bunksThere : (List<Object>) example.get('times')) {
        ElectivePeriod period = new ElectivePeriod();
        period.key = String.valueOf(day) + '|b1|d' + times.size();
        period.day = day;
        period.blockId = 'b1';
        period.offeringIds.add(offeringId);
        for (Object bunk : (List<Object>) bunksThere) {
          period.groupIds.add(bunkId(bunks, (String) bunk));
        }
        times.add(period);
      }
      ElectiveSeatCounts counts = new ElectiveSeatCounts(times);
      for (Object bunk : (List<Object>) example.get('seated')) {
        counts.seat(bunkId(bunks, (String) bunk), day, 'b1', offeringId);
      }
      Integer seats = ElectiveSeatCounts.limitOf(
        (Decimal) example.get('seats'),
        (Boolean) example.get('noLimit')
      );
      List<Object> count = (List<Object>) example.get('count');
      List<Object> over = (List<Object>) example.get('over');
      for (Integer t = 0; t < times.size(); t++) {
        Integer counted = counts.at(times[t], offeringId);
        Assert.areEqual((Integer) count[t], counted, name);
        Assert.areEqual(
          (Boolean) over[t],
          seats != null && counted > seats,
          name
        );
      }
    }
  }

  private static Map<String, Object> examples() {
    String ours = ShoreshSchema.namespace();
    StaticResource examples = [
      SELECT Body
      FROM StaticResource
      WHERE Name = 'ShoreshSeatExamples' AND NamespacePrefix = :ours
      LIMIT 1
    ];
    return (Map<String, Object>) JSON.deserializeUntyped(
      examples.Body.toString()
    );
  }

  private static Id bunkId(Map<String, Id> bunks, String name) {
    if (!bunks.containsKey(name)) {
      bunks.put(name, BUNK_PREFIX.rightPad(14, '0') + bunks.size());
    }
    return bunks.get(name);
  }
}
