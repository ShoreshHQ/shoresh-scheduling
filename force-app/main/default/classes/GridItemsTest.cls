/**
 * GridItems.isId: a day's grid text is read as a record Id only when it is one, so the elective
 * seats' reads never take a saved name of an Id's length for a group, block or offering.
 */
@IsTest
private class GridItemsTest {
  @IsTest
  static void onlyARealIdIsAnId() {
    Id real =
      Group__c.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED)
        .getKeyPrefix() + '000000000001';
    Assert.isTrue(GridItems.isId(String.valueOf(real)), '18 characters');
    Assert.isTrue(GridItems.isId(String.valueOf(real).left(15)), '15');
    // Names an Id's length long: never Ids.
    Assert.isFalse(GridItems.isId('Archery morning'), '15 characters');
    Assert.isFalse(GridItems.isId('Group A, cabin 12!'), '18 characters');
    Assert.isFalse(GridItems.isId('Period 1'));
    Assert.isFalse(GridItems.isId(''));
    Assert.isFalse(GridItems.isId(null));
  }
}
