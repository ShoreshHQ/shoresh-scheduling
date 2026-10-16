@IsTest
private class ScreenErrorsTest {
  @IsTest
  static void aRefusedDeleteIsExplainedInPlainWords() {
    Camp__c camp = ShoreshTestData.camp('Camp Willow');
    ShoreshTestData.season(camp.Id, 'Summer 2026');
    try {
      Database.delete(camp, AccessLevel.SYSTEM_MODE);
      Assert.fail('A camp with seasons is kept');
    } catch (DmlException e) {
      Assert.isTrue(
        ScreenErrors.of(e)
          .getMessage()
          .startsWith(
            'This can\'t be deleted while other records still use it.'
          )
      );
    }
  }

  @IsTest
  static void otherProblemsKeepTheirOwnMessage() {
    Assert.areEqual(
      'Plain words.',
      ScreenErrors.of(new ShoreshException('Plain words.')).getMessage()
    );
  }
}
