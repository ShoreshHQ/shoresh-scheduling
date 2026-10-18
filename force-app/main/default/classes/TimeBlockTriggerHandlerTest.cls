/**
 * Time blocks as on Shoresh desktop: no name means the time range, and no part of day means the
 * part the start time falls in. Saved the way the screens save. Synthetic camp.
 */
@IsTest
private class TimeBlockTriggerHandlerTest {
  private static Id programId() {
    Camp__c camp = ShoreshTestData.camp('Test Camp');
    Season__c season = ShoreshTestData.season(camp.Id, 'Summer 2026');
    return ShoreshTestData.program(season.Id, 'Main').Id;
  }

  private static TimeBlock__c saved(Id blockId) {
    return [
      SELECT Name, PartOfDay__c, StartTime__c, EndTime__c
      FROM TimeBlock__c
      WHERE Id = :blockId
    ];
  }

  @IsTest
  static void aBlankNameIsSavedAsTheTimeRange() {
    // The scheduler makes the camp, so it is theirs to see under sharing.
    User scheduler = ShoreshTestData.scheduler();
    Id programId;
    System.runAs(scheduler) {
      programId = programId();
    }
    System.runAs(scheduler) {
      List<Id> ids = SeasonSetupController.saveRecords(
        new List<SObject>{
          new TimeBlock__c(
            Program__c = programId,
            Name = '',
            StartTime__c = Time.newInstance(9, 0, 0, 0),
            EndTime__c = Time.newInstance(9, 45, 0, 0),
            PartOfDay__c = 'Morning'
          ),
          new TimeBlock__c(
            Program__c = programId,
            StartTime__c = Time.newInstance(13, 5, 0, 0),
            EndTime__c = Time.newInstance(14, 0, 0, 0),
            PartOfDay__c = 'Afternoon'
          )
        }
      );
      Assert.areEqual('9:00 AM – 9:45 AM', saved(ids[0]).Name);
      Assert.areEqual('1:05 PM – 2:00 PM', saved(ids[1]).Name);
    }
  }

  @IsTest
  static void noPartOfDayFollowsTheStartTimeFromNoon() {
    // The scheduler makes the camp, so it is theirs to see under sharing.
    User scheduler = ShoreshTestData.scheduler();
    Id programId;
    System.runAs(scheduler) {
      programId = programId();
    }
    System.runAs(scheduler) {
      List<Id> ids = SeasonSetupController.saveRecords(
        new List<SObject>{
          new TimeBlock__c(
            Program__c = programId,
            Name = 'Period 1',
            StartTime__c = Time.newInstance(11, 59, 0, 0),
            EndTime__c = Time.newInstance(12, 30, 0, 0),
            PartOfDay__c = null
          ),
          new TimeBlock__c(
            Program__c = programId,
            Name = 'Period 2',
            StartTime__c = Time.newInstance(12, 0, 0, 0),
            EndTime__c = Time.newInstance(12, 45, 0, 0),
            PartOfDay__c = null
          )
        }
      );
      Assert.areEqual('Morning', saved(ids[0]).PartOfDay__c);
      Assert.areEqual('Afternoon', saved(ids[1]).PartOfDay__c);
    }
  }

  @IsTest
  static void aPartOfDayTheDirectorChoseIsKept() {
    // The scheduler makes the camp, so it is theirs to see under sharing.
    User scheduler = ShoreshTestData.scheduler();
    Id programId;
    System.runAs(scheduler) {
      programId = programId();
    }
    System.runAs(scheduler) {
      List<Id> ids = SeasonSetupController.saveRecords(
        new List<SObject>{
          new TimeBlock__c(
            Program__c = programId,
            Name = 'Late lunch',
            StartTime__c = Time.newInstance(11, 30, 0, 0),
            EndTime__c = Time.newInstance(12, 15, 0, 0),
            PartOfDay__c = 'Afternoon'
          )
        }
      );
      Assert.areEqual('Afternoon', saved(ids[0]).PartOfDay__c);
    }
  }

  @IsTest
  static void aRangeNameFollowsNewTimesButAChosenNameStays() {
    // The scheduler makes the camp, so it is theirs to see under sharing.
    User scheduler = ShoreshTestData.scheduler();
    Id programId;
    System.runAs(scheduler) {
      programId = programId();
    }
    System.runAs(scheduler) {
      List<Id> ids = SeasonSetupController.saveRecords(
        new List<SObject>{
          new TimeBlock__c(
            Program__c = programId,
            StartTime__c = Time.newInstance(9, 0, 0, 0),
            EndTime__c = Time.newInstance(9, 45, 0, 0),
            PartOfDay__c = 'Morning'
          ),
          new TimeBlock__c(
            Program__c = programId,
            Name = 'Swim time',
            StartTime__c = Time.newInstance(10, 0, 0, 0),
            EndTime__c = Time.newInstance(10, 45, 0, 0),
            PartOfDay__c = 'Morning'
          )
        }
      );
      SeasonSetupController.saveRecords(
        new List<SObject>{
          new TimeBlock__c(
            Id = ids[0],
            EndTime__c = Time.newInstance(9, 50, 0, 0)
          ),
          new TimeBlock__c(
            Id = ids[1],
            EndTime__c = Time.newInstance(10, 50, 0, 0)
          )
        }
      );
      Assert.areEqual('9:00 AM – 9:50 AM', saved(ids[0]).Name);
      Assert.areEqual('Swim time', saved(ids[1]).Name);
    }
  }

  @IsTest
  static void clockTimesReadAsADirectorWritesThem() {
    Assert.areEqual(
      '12:00 PM',
      TimeBlockTriggerHandler.clock12(Time.newInstance(12, 0, 0, 0))
    );
    Assert.areEqual(
      '12:05 AM',
      TimeBlockTriggerHandler.clock12(Time.newInstance(0, 5, 0, 0))
    );
    Assert.isNull(
      TimeBlockTriggerHandler.rangeLabel(Time.newInstance(9, 0, 0, 0), null)
    );
  }
}
