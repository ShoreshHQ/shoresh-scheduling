@IsTest
private class ShoreshSchemaTest {
  private static final List<Schema.SObjectType> OWN_OBJECTS = new List<Schema.SObjectType>{
    Activity__c.SObjectType,
    ActivityEligibility__c.SObjectType,
    Camp__c.SObjectType,
    CampLabel__c.SObjectType,
    Coverage__c.SObjectType,
    Division__c.SObjectType,
    FixedActivity__c.SObjectType,
    Group__c.SObjectType,
    Import__c.SObjectType,
    ImportAnswer__c.SObjectType,
    Location__c.SObjectType,
    LocationType__c.SObjectType,
    Program__c.SObjectType,
    RecurringActivity__c.SObjectType,
    Schedule__c.SObjectType,
    ScheduleDay__c.SObjectType,
    Season__c.SObjectType,
    TimeBlock__c.SObjectType,
    Week__c.SObjectType,
    WeekException__c.SObjectType
  };

  @IsTest
  static void prefixIsNoneTodayOrTheShoreshNamespace() {
    String prefix = ShoreshSchema.prefix();
    Assert.isTrue(
      prefix == '' || prefix == 'shoresh__',
      'Unexpected namespace prefix: ' + prefix
    );
    ShoreshSchema.simulatedPrefix = 'shoresh__';
    Assert.areEqual(
      'shoresh__',
      ShoreshSchema.prefix(),
      'Tests can see the namespaced names'
    );
  }

  @IsTest
  static void findsAFieldWithOrWithoutThePrefixInAnyCase() {
    ShoreshSchema.simulatedPrefix = 'shoresh__';
    Schema.SObjectType week = Week__c.SObjectType;
    Schema.SObjectField start = Week__c.StartDate__c;
    Assert.areEqual(start, ShoreshSchema.field(week, 'StartDate__c'), 'Bare');
    Assert.areEqual(
      start,
      ShoreshSchema.field(week, 'shoresh__StartDate__c'),
      'Prefixed'
    );
    Assert.areEqual(
      start,
      ShoreshSchema.field(week, 'SHORESH__startdate__C'),
      'Any case'
    );
    Assert.areEqual(
      Week__c.Name,
      ShoreshSchema.field(week, 'Name'),
      'Standard'
    );
  }

  @IsTest
  static void findsNothingForNamesTheObjectDoesNotHave() {
    ShoreshSchema.simulatedPrefix = 'shoresh__';
    Schema.SObjectType week = Week__c.SObjectType;
    Assert.isNull(
      ShoreshSchema.field(week, 'other__StartDate__c'),
      'Another namespace'
    );
    Assert.isNull(ShoreshSchema.field(week, 'Nope__c'), 'Unknown');
    Assert.isNull(
      ShoreshSchema.field(week, 'Length__c'),
      'Another object\'s field'
    );
    Assert.isNull(ShoreshSchema.field(week, ''), 'Blank');
    Assert.isNull(ShoreshSchema.field(week, null), 'Null name');
    Assert.isNull(ShoreshSchema.field(null, 'Name'), 'Null object');
  }

  @IsTest
  static void everyFieldRoundTripsThroughItsStoredAndPackagedNames() {
    ShoreshSchema.simulatedPrefix = 'shoresh__';
    Integer checked = 0;
    for (Schema.SObjectType type : OWN_OBJECTS) {
      for (
        Schema.SObjectField each : type.getDescribe(
            SObjectDescribeOptions.DEFERRED
          )
          .fields.getMap()
          .values()
      ) {
        Assert.areEqual(
          each,
          ShoreshSchema.field(type, ShoreshSchema.localName(each)),
          'Stored name of ' + each
        );
        Assert.areEqual(
          each,
          ShoreshSchema.field(type, ShoreshTestData.packagedName(each)),
          'Packaged name of ' + each
        );
        checked++;
      }
    }
    Assert.isTrue(
      checked > OWN_OBJECTS.size(),
      'Every object\'s fields were checked'
    );
  }

  @IsTest
  static void packagedNamesPrefixOnlyCustomFields() {
    ShoreshSchema.simulatedPrefix = 'shoresh__';
    Assert.areEqual(
      'shoresh__StartDate__c',
      ShoreshTestData.packagedName(Week__c.StartDate__c),
      'Custom field'
    );
    Assert.areEqual(
      'Name',
      ShoreshTestData.packagedName(Week__c.Name),
      'Standard field'
    );
  }

  @IsTest
  static void localNamesAreTheSameBeforeAndAfterTheNamespace() {
    Assert.areEqual(
      'StartDate__c',
      ShoreshSchema.localName(Week__c.StartDate__c),
      'Field'
    );
    Assert.areEqual(
      'Week__c',
      ShoreshSchema.localName(Week__c.SObjectType),
      'Object'
    );
  }

  @IsTest
  static void queryNamesCarryTheRealPrefixAndWorkInSoql() {
    // Queries run against the real org, so simulating the namespace doesn't change them.
    ShoreshSchema.simulatedPrefix = 'shoresh__';
    Schema.DescribeSObjectResult camp = Camp__c.SObjectType.getDescribe(
      SObjectDescribeOptions.DEFERRED
    );
    String real = camp.getName().removeEnd(camp.getLocalName());
    Assert.areEqual(
      real + 'StartDate__c',
      ShoreshSchema.queryName(Week__c.StartDate__c),
      'Field'
    );
    Assert.areEqual(
      real + 'Week__c',
      ShoreshSchema.queryName(Week__c.SObjectType),
      'Object'
    );
    String relationship = ShoreshSchema.childRelationship(
      Activity__c.SObjectType,
      ActivityEligibility__c.Activity__c
    );
    Assert.areEqual(real + 'Eligibilities__r', relationship, 'Child list');
    List<SObject> rows = Database.query(
      'SELECT ' +
        ShoreshSchema.queryName(Week__c.StartDate__c) +
        ', (SELECT Id FROM ' +
        ShoreshSchema.childRelationship(
          Week__c.SObjectType,
          WeekException__c.Week__c
        ) +
        ') FROM ' +
        ShoreshSchema.queryName(Week__c.SObjectType) +
        ' LIMIT 1',
      AccessLevel.USER_MODE
    );
    Assert.areEqual(0, rows.size(), 'The query runs (no weeks in a test)');
  }

  @IsTest
  static void noChildListForAFieldThatDoesNotPointAtTheParent() {
    Assert.isNull(
      ShoreshSchema.childRelationship(
        Activity__c.SObjectType,
        Coverage__c.Group__c
      ),
      'Coverage rows don\'t point at activities'
    );
  }
}
