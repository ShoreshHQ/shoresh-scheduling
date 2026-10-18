/**
 * What building a test camp costs, held down so a test's own work has room inside Salesforce's
 * 100-query limit: the shared builders defer the clash check to one check at the end, keep what
 * they made instead of reading it back, and the checks read the camp's words only to word a
 * refusal. A builder that grows past these bounds fails here, with the number it used.
 */
@IsTest
private class SetupCostTest {
  @IsTest
  static void aSetTimeCampIsCheap() {
    Test.startTest();
    Integer before = Limits.getQueries();
    Map<String, Id> ids = SetTimeTestData.camp();
    Integer used = Limits.getQueries() - before;
    Test.stopTest();
    Assert.isTrue(used <= 25, 'Queries for SetTimeTestData.camp(): ' + used);
    // Everything the tests ask for by name is still there.
    for (
      String name : new List<String>{
        'Camp',
        'Season',
        'Main',
        'Week 1',
        'Week 6',
        'Period 1',
        'Period 2',
        'Lunch',
        'Juniors',
        'Seniors',
        'Group A',
        'Group B',
        'Group C',
        'Field',
        'Pool',
        'Field A',
        'Gym',
        'Swim',
        'Soccer',
        'Gym games'
      }
    ) {
      Assert.isNotNull(ids.get(name), name);
    }
    Assert.areEqual(
      3,
      [
        SELECT COUNT()
        FROM Group__c
        WHERE
          Division__r.Program__c = :ids.get('Main')
          AND Availability__c = 'AllDay'
        WITH SYSTEM_MODE
      ]
    );
  }

  @IsTest
  static void aGeneratedScheduleCampIsCheap() {
    Test.startTest();
    Integer before = Limits.getQueries();
    GeneratedTestData.camp();
    Integer used = Limits.getQueries() - before;
    Test.stopTest();
    Assert.isTrue(used <= 35, 'Queries for GeneratedTestData.camp(): ' + used);
  }

  /** A save no check refuses reads none of the camp's words (only the duplicate-name check). */
  @IsTest
  static void aCleanSaveReadsNoCampWords() {
    Map<String, Id> ids = SetTimeTestData.camp();
    Test.startTest();
    Integer before = Limits.getQueries();
    Database.insert(
      new LocationType__c(Season__c = ids.get('Season'), Name = 'Lake'),
      AccessLevel.SYSTEM_MODE
    );
    Integer used = Limits.getQueries() - before;
    Test.stopTest();
    Assert.isTrue(used <= 1, 'Queries for a clean location type: ' + used);
  }

  /** Many refused rows in one save: the camp's words are read once, not once per row. */
  @IsTest
  static void manyRefusedRowsStayInsideTheLimit() {
    Map<String, Id> ids = SetTimeTestData.camp();
    Program__c other = ShoreshTestData.program(ids.get('Season'), 'Other');
    TimeBlock__c otherBlock = ShoreshTestData.timeBlock(
      other.Id,
      'Elsewhere',
      9
    );
    List<FixedActivity__c> rows = new List<FixedActivity__c>();
    for (Integer i = 0; i < 60; i++) {
      FixedActivity__c row = SetTimeTestData.fixed(ids, 'Row ' + i, 'Period 1');
      row.TimeBlock__c = otherBlock.Id;
      rows.add(row);
    }
    Test.startTest();
    List<Database.SaveResult> results = Database.insert(
      rows,
      false,
      AccessLevel.SYSTEM_MODE
    );
    Test.stopTest();
    for (Database.SaveResult result : results) {
      Assert.isFalse(result.isSuccess());
      Assert.isTrue(
        result.getErrors()[0].getMessage().contains('belongs to a different'),
        result.getErrors()[0].getMessage()
      );
    }
  }

  /** A refusal still words itself in the camp's words, read only then. */
  @IsTest
  static void aRefusalStillUsesTheCampsWords() {
    Map<String, Id> ids = SetTimeTestData.camp();
    Database.insert(
      new CampLabel__c(
        Camp__c = ids.get('Camp'),
        ModelTerm__c = 'Week',
        Singular__c = 'Session',
        Plural__c = 'Sessions'
      ),
      AccessLevel.SYSTEM_MODE
    );
    Database.SaveResult result = Database.insert(
      new Week__c(
        Season__c = ids.get('Season'),
        Name = 'Again',
        StartDate__c = Date.newInstance(2026, 6, 29),
        EndDate__c = Date.newInstance(2026, 7, 3)
      ),
      false,
      AccessLevel.SYSTEM_MODE
    );
    Assert.isFalse(result.isSuccess());
    Assert.isTrue(
      result.getErrors()[0].getMessage().contains('Each Session in a'),
      result.getErrors()[0].getMessage()
    );
  }
}
