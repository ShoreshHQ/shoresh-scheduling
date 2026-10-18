@IsTest
private class SetupTablesTest {
  private static Map<String, Id> ids;

  /** A version of Main's week, with one day naming these groups and Swim. */
  private static Id scheduleNaming(
    String name,
    Integer week,
    List<String> groups
  ) {
    Week__c saved = [
      SELECT Id, StartDate__c
      FROM Week__c
      WHERE Id = :ids.get('Week ' + week)
      WITH SYSTEM_MODE
    ];
    Schedule__c schedule = ShoreshTestData.version(
      ids.get('Main'),
      saved.Id,
      name
    );
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks.add(
      new ScheduleGrid.Block(ids.get('Period 1'), 'Period 1')
        .at('09:00', '09:45')
    );
    grid.items.add(new ScheduleGrid.Item('A', ids.get('Swim'), 'Swim'));
    for (String groupName : groups) {
      grid.groups.add(new ScheduleGrid.GroupRef(ids.get(groupName), groupName));
      grid.rows.add(new List<String>{ '1' });
    }
    Database.insert(
      new ScheduleDay__c(
        Schedule__c = schedule.Id,
        Date__c = saved.StartDate__c,
        Grid__c = grid.toText(),
        GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION,
        Revision__c = 1,
        Part__c = 1
      ),
      AccessLevel.SYSTEM_MODE
    );
    return schedule.Id;
  }

  private static Integer uses(String name) {
    ScheduleUses.Count count = SetupTablesController.scheduleUses(
      name == null ? null : ids.get(name)
    );
    Assert.isTrue(count.complete);
    return count.schedules;
  }

  @IsTest
  static void aBunkOrActivityCountsTheSchedulesItIsIn() {
    // The camp is the scheduler's own, as when they set it up (sharing: they see what they own).
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
      scheduleNaming('First', 1, new List<String>{ 'Group A', 'Group B' });
      scheduleNaming('Second', 2, new List<String>{ 'Group A' });
      {
        Assert.areEqual(2, uses('Group A'));
        Assert.areEqual(1, uses('Group B'));
        Assert.areEqual(0, uses('Group C'));
        Assert.areEqual(2, uses('Swim'));
        Assert.areEqual(0, uses('Soccer'));
        // Only bunks and activities are counted.
        Assert.areEqual(0, uses('Pool'));
        Assert.areEqual(0, uses(null));
      }
    }
  }

  /** 60 more versions of Week 2, each with 10 day parts naming Group A and Swim. */
  private static void bigSeason() {
    String grid = [
      SELECT Grid__c
      FROM ScheduleDay__c
      WHERE
        Schedule__c = :scheduleNaming('First', 1, new List<String>{ 'Group A' })
      WITH SYSTEM_MODE
    ]
    .Grid__c;
    Week__c week = [
      SELECT Id, StartDate__c
      FROM Week__c
      WHERE Id = :ids.get('Week 2')
      WITH SYSTEM_MODE
    ];
    List<Schedule__c> schedules = new List<Schedule__c>();
    for (Integer i = 0; i < 60; i++) {
      schedules.add(
        new Schedule__c(
          Program__c = ids.get('Main'),
          Week__c = week.Id,
          Name = 'Version ' + i,
          Status__c = 'Version',
          Origin__c = 'Imported',
          VersionReason__c = 'Imported'
        )
      );
    }
    Database.insert(schedules, AccessLevel.SYSTEM_MODE);
    List<ScheduleDay__c> days = new List<ScheduleDay__c>();
    for (Schedule__c schedule : schedules) {
      for (Integer part = 1; part <= 10; part++) {
        days.add(
          new ScheduleDay__c(
            Schedule__c = schedule.Id,
            Date__c = week.StartDate__c,
            Grid__c = grid,
            GridFormatVersion__c = ScheduleGrid.FORMAT_VERSION,
            Revision__c = 1,
            Part__c = part
          )
        );
      }
    }
    Database.insert(days, AccessLevel.SYSTEM_MODE);
  }

  /** A big season: the text is read a few days at a time, in a capped number of queries. */
  @IsTest
  static void aBigSeasonIsCountedInBoundedQueries() {
    // The camp is the scheduler's own, as when they set it up (sharing: they see what they own).
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
      bigSeason();
      {
        Test.startTest();
        Integer before = Limits.getQueries();
        ScheduleUses.Count count = SetupTablesController.scheduleUses(
          ids.get('Soccer')
        );
        Integer used = Limits.getQueries() - before;
        Test.stopTest();
        // 601 days, none naming Soccer: every one read, 25 at a time (25 queries), plus 2.
        Assert.areEqual(0, count.schedules);
        Assert.isTrue(count.complete);
        Assert.isTrue(used <= 30, 'Queries used: ' + used);
        // Group A: a schedule found is not read again.
        Assert.areEqual(61, uses('Group A'));
      }
    }
  }

  /** Past any budget the count stops, and says it isn't complete; it never guesses. */
  @IsTest
  static void pastItsBudgetTheCountSaysItIsNotComplete() {
    // The camp is the scheduler's own, as when they set it up (sharing: they see what they own).
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
      bigSeason();
      {
        ScheduleUses.partsAtOnce = 10;
        ScheduleUses.queryBudget = 2;
        ScheduleUses.Count count = SetupTablesController.scheduleUses(
          ids.get('Group A')
        );
        // Two reads of 10 days each: some schedules found, the rest not read.
        Assert.isTrue(
          count.schedules >= 1 && count.schedules < 61,
          'Found: ' + count.schedules
        );
        Assert.isFalse(count.complete);
        ScheduleUses.queryBudget = 90;
        ScheduleUses.rowBudget = 100;
        count = SetupTablesController.scheduleUses(ids.get('Soccer'));
        Assert.areEqual(0, count.schedules);
        Assert.isFalse(count.complete);
        ScheduleUses.rowBudget = 40000;
        ScheduleUses.textBudget = 1;
        count = SetupTablesController.scheduleUses(ids.get('Swim'));
        Assert.isFalse(count.complete);
      }
    }
  }

  @IsTest
  static void someoneWhoCannotSeeTheSeasonCannotCount() {
    ids = SetTimeTestData.camp();
    scheduleNaming('First', 1, new List<String>{ 'Group A' });
    System.runAs(ShoreshTestData.outsider()) {
      try {
        SetupTablesController.scheduleUses(ids.get('Group A'));
        Assert.fail('No access: refused, never a count of 0');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e.getMessage());
      }
    }
  }

  /** "pool " (fits 2), with Diving, closed in Weeks 1 and 2; the Pool is closed in Week 1. */
  private static Id secondPool() {
    Location__c other = new Location__c(
      Season__c = ids.get('Season'),
      Name = 'pool ',
      GroupsThatFit__c = 2
    );
    Database.insert(other, AccessLevel.SYSTEM_MODE);
    Database.insert(
      ShoreshTestData.activity(ids.get('Season'), 'Diving', other.Id),
      AccessLevel.SYSTEM_MODE
    );
    Database.insert(
      new List<WeekException__c>{
        new WeekException__c(
          Week__c = ids.get('Week 1'),
          Location__c = other.Id
        ),
        new WeekException__c(
          Week__c = ids.get('Week 2'),
          Location__c = other.Id
        ),
        new WeekException__c(
          Week__c = ids.get('Week 1'),
          Location__c = ids.get('Pool')
        )
      },
      AccessLevel.SYSTEM_MODE
    );
    return other.Id;
  }

  @IsTest
  static void sameLocationMovesEverythingToTheKeptPlace() {
    // The camp is the scheduler's own, as when they set it up (sharing: they see what they own).
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
      Id other = secondPool();
      RecurringActivity__c swim = SetTimeTestData.recurring(
        ids,
        'Bunk swim',
        'Period 1'
      );
      swim.Location__c = other;
      // Group A only: "pool " fits 2, and everyone would be 3.
      SetTimeTestData.save(
        new List<SObject>{ swim },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(0, null, new List<Id>{ ids.get('Group A') })
          }
        )
      );
      Location__c copy = new Location__c(
        Season__c = ids.get('Season'),
        Name = 'Pool next year',
        GroupsThatFit__c = 1,
        CopiedFrom__c = other
      );
      Database.insert(copy, AccessLevel.SYSTEM_MODE);
      {
        SetupTablesController.mergeLocations(
          ids.get('Pool'),
          new List<Id>{ other },
          2
        );
      }
      Id pool = ids.get('Pool');
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Location__c WHERE Id = :other WITH SYSTEM_MODE]
      );
      Assert.areEqual(
        2,
        [
          SELECT GroupsThatFit__c
          FROM Location__c
          WHERE Id = :pool
          WITH SYSTEM_MODE
        ]
        .GroupsThatFit__c
      );
      Assert.areEqual(
        2,
        [
          SELECT COUNT()
          FROM Activity__c
          WHERE Location__c = :pool
          WITH SYSTEM_MODE
        ]
      );
      Assert.areEqual(
        pool,
        [
          SELECT Location__c
          FROM RecurringActivity__c
          WHERE Id = :swim.Id
          WITH SYSTEM_MODE
        ]
        .Location__c
      );
      Assert.areEqual(
        pool,
        [
          SELECT CopiedFrom__c
          FROM Location__c
          WHERE Id = :copy.Id
          WITH SYSTEM_MODE
        ]
        .CopiedFrom__c
      );
      Set<Id> closed = new Set<Id>();
      for (WeekException__c mark : [
        SELECT Week__c
        FROM WeekException__c
        WHERE Location__c = :pool
        WITH SYSTEM_MODE
      ]) {
        Assert.isTrue(closed.add(mark.Week__c), 'One mark per week');
      }
      Assert.areEqual(
        new Set<Id>{ ids.get('Week 1'), ids.get('Week 2') },
        closed
      );
    }
  }

  @IsTest
  static void fixedActivitiesMoveAndPastedSpacesCount() {
    // The camp is the scheduler's own, as when they set it up (sharing: they see what they own).
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
      Location__c other = new Location__c(
        Season__c = ids.get('Season'),
        Name = 'Pool\u00A0',
        GroupsThatFit__c = 3
      );
      Database.insert(other, AccessLevel.SYSTEM_MODE);
      FixedActivity__c flag = SetTimeTestData.fixed(
        ids,
        'Flagpole',
        'Period 1'
      );
      flag.Location__c = other.Id;
      SetTimeTestData.save(new List<SObject>{ flag });
      {
        SetupTablesController.mergeLocations(
          ids.get('Pool'),
          new List<Id>{ other.Id },
          3
        );
      }
      Assert.areEqual(
        ids.get('Pool'),
        [
          SELECT Location__c
          FROM FixedActivity__c
          WHERE Id = :flag.Id
          WITH SYSTEM_MODE
        ]
        .Location__c
      );
    }
  }

  @IsTest
  static void placesInAnotherSeasonAreNeverMerged() {
    // The camp is the scheduler's own, as when they set it up (sharing: they see what they own).
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
      Season__c next = ShoreshTestData.season(ids.get('Camp'), 'Summer 2027');
      Location__c nextPool = new Location__c(
        Season__c = next.Id,
        Name = 'Pool',
        GroupsThatFit__c = 1
      );
      Database.insert(nextPool, AccessLevel.SYSTEM_MODE);
      {
        try {
          SetupTablesController.mergeLocations(
            ids.get('Pool'),
            new List<Id>{ nextPool.Id },
            1
          );
          Assert.fail('Another season');
        } catch (AuraHandledException e) {
          Assert.areEqual(
            LocationMerge.changedMessage(ids.get('Pool')),
            e.getMessage()
          );
        }
      }
      Assert.areEqual(
        1,
        [
          SELECT COUNT()
          FROM Location__c
          WHERE Id = :nextPool.Id
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  @IsTest
  static void aMergeThatWouldCrowdThePlaceIsRefusedAndChangesNothing() {
    // The camp is the scheduler's own, as when they set it up (sharing: they see what they own).
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
      Id other = secondPool();
      RecurringActivity__c first = SetTimeTestData.recurring(
        ids,
        'A swim',
        'Period 1'
      );
      first.Location__c = ids.get('Pool');
      RecurringActivity__c second = SetTimeTestData.recurring(
        ids,
        'B swim',
        'Period 1'
      );
      second.Location__c = other;
      SetTimeTestData.save(
        new List<SObject>{ first, second },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(0, null, new List<Id>{ ids.get('Group A') }),
            SetTimeTestData.who(1, null, new List<Id>{ ids.get('Group B') })
          }
        )
      );
      {
        try {
          SetupTablesController.mergeLocations(
            ids.get('Pool'),
            new List<Id>{ other },
            1
          );
          Assert.fail('Two bunks at a place that fits 1');
        } catch (AuraHandledException e) {
          Assert.isTrue(e.getMessage().contains('"Pool"'), e.getMessage());
        }
      }
      Assert.areEqual(
        1,
        [SELECT COUNT() FROM Location__c WHERE Id = :other WITH SYSTEM_MODE]
      );
      Assert.areEqual(
        other,
        [
          SELECT Location__c
          FROM RecurringActivity__c
          WHERE Id = :second.Id
          WITH SYSTEM_MODE
        ]
        .Location__c
      );
    }
  }

  @IsTest
  static void onlyNearDuplicatesInOneSeasonStillThereAreMerged() {
    // The camp is the scheduler's own, as when they set it up (sharing: they see what they own).
    System.runAs(ShoreshTestData.scheduler()) {
      ids = SetTimeTestData.camp();
      Id other = secondPool();
      {
        List<List<Id>> refused = new List<List<Id>>{
          // Different names.
          new List<Id>{ ids.get('Pool'), ids.get('Gym') },
          // The kept place among the others.
          new List<Id>{ ids.get('Pool'), ids.get('Pool') },
          // Not a location.
          new List<Id>{ ids.get('Pool'), ids.get('Swim') }
        };
        for (List<Id> pair : refused) {
          try {
            SetupTablesController.mergeLocations(
              pair[0],
              new List<Id>{ pair[1] },
              1
            );
            Assert.fail('Refused: ' + pair);
          } catch (AuraHandledException e) {
            Assert.isNotNull(e.getMessage());
          }
        }
        Database.delete(other, AccessLevel.SYSTEM_MODE);
        try {
          SetupTablesController.mergeLocations(
            ids.get('Pool'),
            new List<Id>{ other },
            1
          );
          Assert.fail('Someone else deleted it');
        } catch (AuraHandledException e) {
          Assert.areEqual(
            LocationMerge.changedMessage(ids.get('Pool')),
            e.getMessage()
          );
        }
      }
      Assert.areEqual(
        3,
        [
          SELECT COUNT()
          FROM Location__c
          WHERE Season__c = :ids.get('Season')
          WITH SYSTEM_MODE
        ]
      );
      Assert.areEqual('pool', LocationMerge.sameNameKey('  POOL '));
      // Every kind of space the screen folds, and capitals the same in every locale.
      Assert.areEqual(
        'indoor gym',
        LocationMerge.sameNameKey('\uFEFFINDOOR\u3000GYM\u00A0')
      );
      Assert.areEqual(
        'That merge could not be completed — someone may have changed these locations. Try again.',
        LocationMerge.changedMessage(ids.get('Pool'))
      );
    }
  }

  @IsTest
  static void someoneWithoutAccessCannotMerge() {
    ids = SetTimeTestData.camp();
    Id other = secondPool();
    System.runAs(ShoreshTestData.outsider()) {
      try {
        SetupTablesController.mergeLocations(
          ids.get('Pool'),
          new List<Id>{ other },
          2
        );
        Assert.fail('Refused');
      } catch (AuraHandledException e) {
        Assert.isNotNull(e.getMessage());
      }
    }
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Location__c WHERE Id = :other WITH SYSTEM_MODE]
    );
  }
}
