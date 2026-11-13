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
      RecurringActivity__c fieldDay = SetTimeTestData.recurring(
        ids,
        'Field day',
        'Period 1'
      );
      fieldDay.Length__c = 3;
      fieldDay.Location__c = ids.get('Gym');
      Id fieldDayId = SetTimeTestData.save(
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

      String refused = SetTimeTestData.refusal(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Rest', 'Period 2') }
      );
      Assert.isTrue(refused.contains('"Field day"'), refused);

      ScreenSaves.Extras around = new ScreenSaves.Extras();
      around.around = new List<SetTimeAround.Piece>{
        piece(fieldDayId, ids.get('Period 1'), 1),
        piece(fieldDayId, ids.get('Lunch'), 1)
      };
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

  /** CORE-3.9: a piece naming no recurring activity the director can see saves nothing. */
  @IsTest
  static void core39APieceForNothingSavesNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      ScreenSaves.Extras around = new ScreenSaves.Extras();
      around.around = new List<SetTimeAround.Piece>{
        piece(ids.get('Period 1'), ids.get('Period 1'), 1)
      };
      try {
        SetupTablesController.saveRow(
          SetTimeTestData.fixed(ids, 'Rest', 'Period 2'),
          null,
          around
        );
        Assert.fail('Expected the save to be refused');
      } catch (AuraHandledException e) {
        Assert.areEqual(
          0,
          [SELECT COUNT() FROM FixedActivity__c WITH SYSTEM_MODE]
        );
      }
    }
  }
}
