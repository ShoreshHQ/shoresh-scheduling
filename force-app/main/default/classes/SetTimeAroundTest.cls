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

  /** Field day's pieces, as the screen saw it: Period 1 for 3. */
  private static List<SetTimeAround.Piece> fieldDayAround(
    Map<String, Id> ids,
    Id fieldDayId
  ) {
    List<SetTimeAround.Piece> result = new List<SetTimeAround.Piece>{
      piece(fieldDayId, ids.get('Period 1'), 1),
      piece(fieldDayId, ids.get('Lunch'), 1)
    };
    for (SetTimeAround.Piece one : result) {
      one.seenName = 'Field day';
      one.seenTimeBlock = ids.get('Period 1');
      one.seenLength = 3;
    }
    return result;
  }

  /** Field day: Period 1 for 3, on Mondays, for Group A, in the Gym, off Week 2. */
  private static Id fieldDay(Map<String, Id> ids) {
    RecurringActivity__c fieldDay = SetTimeTestData.recurring(
      ids,
      'Field day',
      'Period 1'
    );
    fieldDay.Length__c = 3;
    fieldDay.Location__c = ids.get('Gym');
    return SetTimeTestData.save(
      new List<SObject>{ fieldDay },
      SetTimeTestData.extras(
        new List<RunsIn.WeekOff>{
          SetTimeTestData.weekOff(0, null, ids.get('Week 2'))
        },
        null,
        new List<SetTimeWho.Who>{
          SetTimeTestData.who(0, null, new List<Id>{ ids.get('Group A') })
        }
      )
    )[0];
  }

  private static String refusalOf(SObject record, ScreenSaves.Extras extras) {
    try {
      SetupTablesController.saveRow(record, null, extras);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Expected the save to be refused');
    return null;
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
