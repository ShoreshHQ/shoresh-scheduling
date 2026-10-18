/**
 * KeptCamp, the ids a test class's @TestSetup keeps for its tests: ids come back as they went in,
 * and a name with no id (null) is kept as null instead of failing the read.
 */
@IsTest
private class KeptCampTest {
  @IsTest
  static void idsComeBackAsTheyWentInAndANullStaysNull() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    KeptCamp.keepIds(
      new Map<String, Id>{ 'Camp' => camp.Id, 'Nobody' => null }
    );
    Map<String, Id> kept = KeptCamp.keptIds();
    Assert.areEqual(camp.Id, kept.get('Camp'));
    Assert.isTrue(kept.containsKey('Nobody'));
    Assert.isNull(kept.get('Nobody'));
  }
}
