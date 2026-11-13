@IsTest
private class SetTimeAroundTest {
  private static SetTimeAround.Piece piece(
    Id target,
    Id block,
    Integer length
  ) {
    SetTimeAround.Piece result = new SetTimeAround.Piece();
    result.target = target;
    result.timeBlock = block;
    result.length = length;
    return result;
  }

  /**
   * CORE-3.9: "Field day, not at Period 2" saves Rest and keeps Field day at Period 1 and at
   * Lunch, the copy with the same days, who it covers and weeks off; without it, the save is
   * refused as before.
   */
  @IsTest
  static void core39AFixedActivityOverARecurringOneKeepsItAtItsOtherTimeBlocks() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id fieldDayId = fieldDay(ids);

      String refused = SetTimeTestData.refusal(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Rest', 'Period 2') }
      );
      Assert.isTrue(refused.contains('"Field day"'), refused);

      ScreenSaves.Extras around = new ScreenSaves.Extras();
      around.around = fieldDayAround(ids, fieldDayId);
      Test.startTest();
      RowSaves.Result result = SetupTablesController.saveRow(
        SetTimeTestData.fixed(ids, 'Rest', 'Period 2'),
        null,
        around
      );
      Integer queries = Limits.getQueries();
      Test.stopTest();
      Assert.isNotNull(result.id);
      Assert.isTrue(queries < 60, 'Queries: ' + queries);

      List<RecurringActivity__c> pieces = [
        SELECT Id, TimeBlock__c, Length__c, Monday__c, Tuesday__c, Location__c
        FROM RecurringActivity__c
        WHERE Name = 'Field day'
        WITH SYSTEM_MODE
        ORDER BY TimeBlock__r.StartTime__c
      ];
      Assert.areEqual(2, pieces.size());
      Assert.areEqual(fieldDayId, pieces[0].Id);
      Assert.areEqual(ids.get('Period 1'), pieces[0].TimeBlock__c);
      Assert.areEqual(1, pieces[0].Length__c);
      RecurringActivity__c copy = pieces[1];
      Assert.areEqual(ids.get('Lunch'), copy.TimeBlock__c);
      Assert.areEqual(1, copy.Length__c);
      Assert.isTrue(copy.Monday__c);
      Assert.isFalse(copy.Tuesday__c);
      Assert.areEqual(ids.get('Gym'), copy.Location__c);
      Assert.areEqual(
        ids.get('Group A'),
        [
          SELECT Group__c
          FROM Coverage__c
          WHERE RecurringActivity__c = :copy.Id
          WITH SYSTEM_MODE
        ]
        .Group__c
      );
      Assert.areEqual(
        ids.get('Week 2'),
        [
          SELECT Week__c
          FROM WeekException__c
          WHERE RecurringActivity__c = :copy.Id
          WITH SYSTEM_MODE
        ]
        .Week__c
      );
    }
  }

  /**
   * CORE-3.9: nothing is saved when the recurring activity changed since the screen showed it,
   * is gone, or the save isn't a fixed activity's.
   */
  @IsTest
  static void core39ARecurringActivityChangedSinceOrGoneSavesNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id fieldDayId = fieldDay(ids);
      // Someone else made it 2 long.
      update as user new RecurringActivity__c(Id = fieldDayId, Length__c = 2);
      ScreenSaves.Extras around = new ScreenSaves.Extras();
      around.around = fieldDayAround(ids, fieldDayId);
      String changed = refusalOf(
        SetTimeTestData.fixed(ids, 'Rest', 'Period 2'),
        around
      );
      Assert.isTrue(changed.contains('"Field day" was changed'), changed);

      around.around[0].target = ids.get('Period 1');
      around.around[1].target = ids.get('Period 1');
      String gone = refusalOf(
        SetTimeTestData.fixed(ids, 'Rest', 'Period 2'),
        around
      );
      Assert.isTrue(gone.contains('"Field day" is no longer there'), gone);

      around.around = fieldDayAround(ids, fieldDayId);
      String notFixed = refusalOf(
        new RecurringActivity__c(Id = fieldDayId, Name = 'Field days'),
        around
      );
      Assert.isTrue(notFixed.contains('can\'t save that'), notFixed);
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM FixedActivity__c WITH SYSTEM_MODE]
      );
      Assert.areEqual(
        2,
        [
          SELECT Length__c
          FROM RecurringActivity__c
          WHERE Id = :fieldDayId
          WITH SYSTEM_MODE
        ]
        .Length__c
      );
    }
  }
}
