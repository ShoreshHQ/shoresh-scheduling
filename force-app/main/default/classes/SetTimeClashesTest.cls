/**
 * Clashes between fixed and recurring activities are refused, never just shown (Greg,
 * 2026-10-16), from whichever side the change comes, with a message naming the fix. Every test
 * acts as a scheduler. Camp: see SetTimeTestData.
 */
@IsTest
private class SetTimeClashesTest {
  private static Integer count(String objectName) {
    return Database.countQuery(
      'SELECT COUNT() FROM ' + objectName,
      AccessLevel.SYSTEM_MODE
    );
  }

  @IsTest
  static void twoFixedActivitiesInOneTimeBlockAreRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Flagpole', 'Period 1') }
      );
      String message = SetTimeTestData.refusal(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Carpool', 'Period 1') }
      );
      Assert.areEqual(
        '"Carpool" and "Flagpole" would both have Group A in Period 1 on Monday in Week 1. ' +
        'Change the time block, length, or weeks of one of them.',
        message
      );
      Assert.areEqual(1, count('FixedActivity__c'), 'Nothing more saved');
    }
  }

  @IsTest
  static void aFixedAndARecurringActivityInOneTimeBlockAreRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Flagpole', 'Period 1') }
      );
      RecurringActivity__c swim = SetTimeTestData.recurring(
        ids,
        'Swim',
        'Period 1'
      );
      String message = SetTimeTestData.refusal(
        new List<SObject>{ swim },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(0, null, new List<Id>{ ids.get('Group C') })
          }
        )
      );
      Assert.areEqual(
        '"Flagpole" and "Swim" would both have Group C in Period 1 on Monday in Week 1. ' +
        'Change the time block, length, days, who it covers, or weeks of one of them.',
        message
      );
      Assert.areEqual(0, count('RecurringActivity__c'));
      Assert.areEqual(0, count('Coverage__c'), 'Who is not saved either');
    }
  }

  @IsTest
  static void anActivityRunningPastTheLastTimeBlockIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      FixedActivity__c rest = SetTimeTestData.fixed(ids, 'Rest', 'Period 2');
      rest.Length__c = 3;
      Assert.areEqual(
        '"Rest" takes 3 time blocks, which would run past the last time block of Main. ' +
        'Shorten it, or choose an earlier time block.',
        SetTimeTestData.refusal(new List<SObject>{ rest })
      );
      // The screen sends the row again as a new row.
      FixedActivity__c again = SetTimeTestData.fixed(ids, 'Rest', 'Period 2');
      again.Length__c = 2;
      SetTimeTestData.save(new List<SObject>{ again });
      Assert.areEqual(1, count('FixedActivity__c'), 'Period 2 and Lunch fit');
    }
  }

  @IsTest
  static void differentDaysWeeksOrGroupsDoNotClash() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      RecurringActivity__c swim = SetTimeTestData.recurring(
        ids,
        'Swim',
        'Period 1'
      );
      RecurringActivity__c art = SetTimeTestData.recurring(
        ids,
        'Art',
        'Period 1'
      );
      art.Monday__c = false;
      art.Tuesday__c = true;
      RecurringActivity__c drama = SetTimeTestData.recurring(
        ids,
        'Drama',
        'Period 1'
      );
      // Swim takes the Juniors and Drama the Seniors, both on Mondays; Art everyone on Tuesdays.
      SetTimeTestData.save(
        new List<SObject>{ swim, art, drama },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(0, null, new List<Id>{ ids.get('Juniors') }),
            SetTimeTestData.who(2, null, new List<Id>{ ids.get('Group C') })
          }
        )
      );
      Assert.areEqual(3, count('RecurringActivity__c'));
      Assert.areEqual(2, count('Coverage__c'));

      // Flag runs only in Week 1 and Carpool only in Week 2, in the same block.
      List<RunsIn.WeekOff> off = new List<RunsIn.WeekOff>();
      for (Integer week = 1; week <= 6; week++) {
        off.add(
          SetTimeTestData.weekOff(
            week == 1 ? 1 : 0,
            null,
            ids.get('Week ' + week)
          )
        );
      }
      SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.fixed(ids, 'Flag', 'Period 2'),
          SetTimeTestData.fixed(ids, 'Carpool', 'Period 2')
        },
        SetTimeTestData.extras(off, null, null)
      );
      Assert.areEqual(2, count('FixedActivity__c'));
    }
  }

  @IsTest
  static void tickingAWeekBackOnThatWouldClashIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      List<RunsIn.WeekOff> off = new List<RunsIn.WeekOff>();
      for (Integer week = 2; week <= 6; week++) {
        off.add(SetTimeTestData.weekOff(0, null, ids.get('Week ' + week)));
      }
      off.add(SetTimeTestData.weekOff(1, null, ids.get('Week 1')));
      List<Id> saved = SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.fixed(ids, 'Flag', 'Period 2'),
          SetTimeTestData.fixed(ids, 'Carpool', 'Period 2')
        },
        SetTimeTestData.extras(off, null, null)
      );
      WeekException__c week2 = [
        SELECT Id
        FROM WeekException__c
        WHERE FixedActivity__c = :saved[0] AND Week__c = :ids.get('Week 2')
        WITH SYSTEM_MODE
      ];
      String message = SetTimeTestData.refusal(
        new List<SObject>(),
        SetTimeTestData.extras(null, new List<Id>{ week2.Id }, null)
      );
      Assert.isTrue(
        message.startsWith('"Carpool" and "Flag" would both have Group A'),
        message
      );
      Assert.isTrue(message.contains('in Week 2.'), message);
      Assert.areEqual(6, count('WeekException__c') - 1, 'Week 2 still off');
    }
  }

  @IsTest
  static void widenedWhoThatWouldClashIsRefusedFromTheScreenAndDirectly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      List<Id> saved = SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.recurring(ids, 'Swim', 'Period 1'),
          SetTimeTestData.recurring(ids, 'Gym', 'Period 1')
        },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(0, null, new List<Id>{ ids.get('Juniors') }),
            SetTimeTestData.who(1, null, new List<Id>{ ids.get('Seniors') })
          }
        )
      );
      // On screen: Gym's who emptied (everyone).
      String message = SetTimeTestData.refusal(
        new List<SObject>(),
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(null, saved[1], new List<Id>())
          }
        )
      );
      Assert.areEqual(
        '"Gym" and "Swim" would both have Group A in Period 1 on Monday in Week 1. ' +
        'Change the time block, length, days, who it covers, or weeks of one of them.',
        message
      );
      Assert.areEqual(2, count('Coverage__c'), 'Who is unchanged');

      // Directly in Salesforce: removing Gym's row is refused the same way, without &quot;.
      Coverage__c gymRow = [
        SELECT Id
        FROM Coverage__c
        WHERE RecurringActivity__c = :saved[1]
        WITH SYSTEM_MODE
      ];
      Database.DeleteResult result = Database.delete(
        gymRow,
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(result.isSuccess());
      Assert.isTrue(
        result.getErrors()[0].getMessage().startsWith('"Gym" and "Swim"'),
        result.getErrors()[0].getMessage()
      );
    }
  }

  @IsTest
  static void aDayTheProgramDoesNotRunIsRefusedFromEitherSide() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      RecurringActivity__c swim = SetTimeTestData.recurring(
        ids,
        'Swim',
        'Period 1'
      );
      swim.Friday__c = true;
      Assert.areEqual(
        '"Swim" is ticked for Friday, but Main does not run on Fridays. Untick Friday.',
        SetTimeTestData.refusal(new List<SObject>{ swim })
      );
      // The screen sends the row again as a new row.
      swim = swim.clone(false, true);
      swim.Friday__c = false;
      swim.Thursday__c = true;
      SetTimeTestData.save(new List<SObject>{ swim });
      Assert.areEqual(
        '"Swim" is ticked for Thursday, but Main does not run on Thursdays. ' +
        'Change "Swim" first, then try again.',
        SetTimeTestData.refusal(
          new List<SObject>{
            new Program__c(Id = ids.get('Main'), Thursday__c = false)
          }
        )
      );
    }
  }

  @IsTest
  static void moreGroupsThanALocationFitsIsRefusedFromEitherSide() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      FixedActivity__c flagpole = SetTimeTestData.fixed(
        ids,
        'Flagpole',
        'Period 1'
      );
      flagpole.Location__c = ids.get('Pool');
      Assert.areEqual(
        '"Pool" fits 1 group at once, but "Flagpole" would have 3 there in Period 1 on ' +
        'Monday in Week 1. Choose another location, or raise how many groups fit at "Pool".',
        SetTimeTestData.refusal(new List<SObject>{ flagpole })
      );
      flagpole = flagpole.clone(false, true);
      flagpole.Location__c = ids.get('Gym');
      SetTimeTestData.save(new List<SObject>{ flagpole });
      Assert.areEqual(
        '"Gym" fits 2 groups at once, but "Flagpole" would have 3 there in Period 1 on ' +
        'Monday in Week 1. Keep it at 3 or more, or move it to another location first.',
        SetTimeTestData.refusal(
          new List<SObject>{
            new Location__c(Id = ids.get('Gym'), GroupsThatFit__c = 2)
          }
        )
      );
      Assert.areEqual(
        3,
        [
          SELECT GroupsThatFit__c
          FROM Location__c
          WHERE Id = :ids.get('Gym')
          WITH SYSTEM_MODE
        ]
        .GroupsThatFit__c
      );
    }
  }

  @IsTest
  static void groupsFromAnotherProgramAtTheSameTimeCountAtALocation() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Program__c teens = ShoreshTestData.program(ids.get('Season'), 'Teens');
      TimeBlock__c early = new TimeBlock__c(
        Program__c = teens.Id,
        Name = 'Early',
        StartTime__c = Time.newInstance(9, 30, 0, 0),
        EndTime__c = Time.newInstance(10, 15, 0, 0),
        PartOfDay__c = 'Morning'
      );
      Database.insert(early, AccessLevel.SYSTEM_MODE);
      Division__c division = ShoreshTestData.division(teens.Id, 'Teens');
      Database.insert(
        new Group__c(
          Division__c = division.Id,
          Name = 'Teens 1',
          Availability__c = 'AllDay'
        ),
        AccessLevel.SYSTEM_MODE
      );
      FixedActivity__c flagpole = SetTimeTestData.fixed(
        ids,
        'Flagpole',
        'Period 1'
      );
      flagpole = flagpole.clone(false, true);
      flagpole.Location__c = ids.get('Gym');
      SetTimeTestData.save(new List<SObject>{ flagpole });
      String message = SetTimeTestData.refusal(
        new List<SObject>{
          new FixedActivity__c(
            Program__c = teens.Id,
            Name = 'Stretch',
            TimeBlock__c = early.Id,
            Length__c = 1,
            Location__c = ids.get('Gym')
          )
        }
      );
      Assert.areEqual(
        '"Gym" fits 3 groups at once, but "Flagpole" and "Stretch" would have 4 there in ' +
          'Early on Monday in Week 1. Choose another location, or raise how many groups fit ' +
          'at "Gym".',
        message
      );
    }
  }

  @IsTest
  static void timeBlockChangesThatWouldClashAreRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Test.startTest();
      FixedActivity__c rest = SetTimeTestData.fixed(ids, 'Rest', 'Period 2');
      rest.Length__c = 2;
      SetTimeTestData.save(new List<SObject>{ rest });

      // Deleting Lunch would leave Rest running past the end of the day.
      Assert.areEqual(
        '"Rest" takes 2 time blocks, which would run past the last time block of Main. ' +
        'Change "Rest" first, then try again.',
        SetTimeTestData.deleteRefusal(ids.get('Lunch'))
      );
      // So would moving Lunch before Period 2.
      Assert.isTrue(
        SetTimeTestData.refusal(
            new List<SObject>{
              new TimeBlock__c(
                Id = ids.get('Lunch'),
                StartTime__c = Time.newInstance(8, 0, 0, 0),
                EndTime__c = Time.newInstance(8, 45, 0, 0)
              )
            }
          )
          .startsWith('"Rest" takes 2 time blocks'),
        'Moving Lunch is refused'
      );
      // Deleting the block it starts in names it.
      Assert.areEqual(
        'This can\'t be deleted yet: "Rest" starts in it. First choose another time block ' +
        'for it, then delete it.',
        SetTimeTestData.deleteRefusal(ids.get('Period 2'))
      );
      Assert.areEqual(3, count('TimeBlock__c'));
      // A block nothing spans can go.
      SeasonSetupController.deleteRecord(ids.get('Period 1'));
      Assert.areEqual(2, count('TimeBlock__c'));
    }
  }

  @IsTest
  static void groupsNotAtCampAreLeftOutAndNotRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Database.update(
        new Group__c(Id = ids.get('Group C'), Availability__c = 'MorningOnly'),
        AccessLevel.SYSTEM_MODE
      );
      // Lunch break takes every group at camp in the afternoon: Groups A and B, not C.
      // Swim C takes the Seniors: only Group C, who is not at camp then. Both are kept.
      SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.fixed(ids, 'Lunch break', 'Lunch'),
          SetTimeTestData.recurring(ids, 'Swim C', 'Lunch')
        },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(1, null, new List<Id>{ ids.get('Seniors') })
          }
        )
      );
      Assert.areEqual(1, count('FixedActivity__c'));
      Assert.areEqual(1, count('RecurringActivity__c'));
      // Group C staying all day would put it in both.
      Assert.areEqual(
        '"Lunch break" and "Swim C" would both have Group C in Lunch on Monday in Week 1. ' +
        'Change one of them first, then try again.',
        SetTimeTestData.refusal(
          new List<SObject>{
            new Group__c(Id = ids.get('Group C'), Availability__c = 'AllDay')
          }
        )
      );
      // So would a new Senior group at camp all day.
      Assert.isTrue(
        SetTimeTestData.refusal(
            new List<SObject>{
              new Group__c(
                Division__c = ids.get('Seniors'),
                Name = 'Group D',
                Availability__c = 'AllDay'
              )
            }
          )
          .startsWith('"Lunch break" and "Swim C" would both have Group D'),
        'A new group is refused'
      );
      Assert.areEqual(0, [SELECT COUNT() FROM Group__c WHERE Name = 'Group D']);
    }
  }

  @IsTest
  static void aNewWeekOrADirectSaveThatWouldClashIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      List<RunsIn.WeekOff> off = new List<RunsIn.WeekOff>();
      for (Integer week = 2; week <= 6; week++) {
        off.add(SetTimeTestData.weekOff(0, null, ids.get('Week ' + week)));
      }
      off.add(SetTimeTestData.weekOff(1, null, ids.get('Week 1')));
      SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.fixed(ids, 'Flag', 'Period 2'),
          SetTimeTestData.fixed(ids, 'Carpool', 'Period 2')
        },
        SetTimeTestData.extras(off, null, null)
      );
      // A seventh week: both run in it.
      String message = SetTimeTestData.dmlRefusal(
        Database.insert(
          new Week__c(
            Season__c = ids.get('Season'),
            Name = 'Week 7',
            StartDate__c = Date.newInstance(2026, 8, 10),
            EndDate__c = Date.newInstance(2026, 8, 14),
            SortOrder__c = 7
          ),
          false,
          AccessLevel.USER_MODE
        )
      );
      Assert.isTrue(message.contains('in Week 7.'), message);
      Assert.isFalse(message.contains('&quot;'), message);

      // A fixed activity saved directly in a block that is taken.
      message = SetTimeTestData.dmlRefusal(
        Database.insert(
          SetTimeTestData.fixed(ids, 'Assembly', 'Period 2'),
          false,
          AccessLevel.USER_MODE
        )
      );
      Assert.isTrue(message.contains('"Assembly"'), message);
    }
  }

  @IsTest
  static void movingAWeekTickIntoAClashIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Test.startTest();
      List<Id> flag = SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Flag', 'Period 2') },
        SetTimeTestData.extras(
          new List<RunsIn.WeekOff>{
            SetTimeTestData.weekOff(0, null, ids.get('Week 1'))
          },
          null,
          null
        )
      );
      // Carpool runs only in Week 1, when Flag does not.
      List<RunsIn.WeekOff> off = new List<RunsIn.WeekOff>();
      for (Integer week = 2; week <= 6; week++) {
        off.add(SetTimeTestData.weekOff(0, null, ids.get('Week ' + week)));
      }
      SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Carpool', 'Period 2') },
        SetTimeTestData.extras(off, null, null)
      );
      // Moving Flag's Week 1 tick to Group A puts Flag back in Week 1.
      WeekException__c mark = [
        SELECT Id
        FROM WeekException__c
        WHERE FixedActivity__c = :flag[0]
        WITH SYSTEM_MODE
      ];
      String message = SetTimeTestData.dmlRefusal(
        Database.update(
          new WeekException__c(
            Id = mark.Id,
            FixedActivity__c = null,
            Group__c = ids.get('Group A')
          ),
          false,
          AccessLevel.USER_MODE
        )
      );
      Assert.isTrue(message.contains('"Carpool" and "Flag"'), message);
    }
  }

  @IsTest
  static void restoringAnItemIntoAClashIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Test.startTest();
      // A fixed activity deleted, then brought back from the Recycle Bin into a taken block.
      List<Id> rest = SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Rest', 'Lunch') }
      );
      SeasonSetupController.deleteRecord(rest[0]);
      SetTimeTestData.save(
        new List<SObject>{ SetTimeTestData.fixed(ids, 'Nap', 'Lunch') }
      );
      Database.UndeleteResult back = Database.undelete(
        rest[0],
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(back.isSuccess());
      Assert.isTrue(
        back.getErrors()[0].getMessage().contains('"Nap" and "Rest"'),
        back.getErrors()[0].getMessage()
      );
    }
  }

  @IsTest
  static void aBunkAwayThatWeekIsNoClash() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Test.startTest();
      // Group C is away in Week 1.
      SetTimeTestData.save(
        new List<SObject>(),
        SetTimeTestData.extras(
          new List<RunsIn.WeekOff>{
            SetTimeTestData.weekOff(null, ids.get('Group C'), ids.get('Week 1'))
          },
          null,
          null
        )
      );
      // Flag runs only in Week 1, where Swim C would share Group C: but Group C is away.
      List<RunsIn.WeekOff> off = new List<RunsIn.WeekOff>();
      for (Integer week = 2; week <= 6; week++) {
        off.add(SetTimeTestData.weekOff(0, null, ids.get('Week ' + week)));
      }
      SetTimeTestData.save(
        new List<SObject>{
          SetTimeTestData.fixed(ids, 'Flag', 'Period 2'),
          SetTimeTestData.recurring(ids, 'Swim C', 'Period 2')
        },
        SetTimeTestData.extras(
          off,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(1, null, new List<Id>{ ids.get('Group C') })
          }
        )
      );
      Assert.areEqual(
        2,
        count('FixedActivity__c') + count('RecurringActivity__c')
      );
      // Group C back in Week 1 would put it in both: refused.
      WeekException__c away = [
        SELECT Id
        FROM WeekException__c
        WHERE Group__c = :ids.get('Group C')
        WITH SYSTEM_MODE
      ];
      String message = SetTimeTestData.refusal(
        new List<SObject>(),
        SetTimeTestData.extras(null, new List<Id>{ away.Id }, null)
      );
      String expected =
        '"Flag" and "Swim C" would both have Group C in Period 2 on Monday in Week 1. ' +
        'Change one of them first, then try again.';
      Assert.areEqual(expected, message);
      // The same when the week is ticked back on directly in Salesforce.
      Database.DeleteResult direct = Database.delete(
        away,
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(direct.isSuccess());
      Assert.areEqual(expected, direct.getErrors()[0].getMessage());
    }
  }

  @IsTest
  static void aBunkAwayThatWeekIsNotCountedAtALocation() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Test.startTest();
      // Group C is away in Week 1; the Gym fits 2.
      WeekException__c away = new WeekException__c(
        Week__c = ids.get('Week 1'),
        Group__c = ids.get('Group C')
      );
      Database.insert(away, AccessLevel.SYSTEM_MODE);
      Database.update(
        new Location__c(Id = ids.get('Gym'), GroupsThatFit__c = 2),
        AccessLevel.SYSTEM_MODE
      );
      // Rest at the Gym, Week 1 only: Groups A and B come, Group C is away. Two fit.
      List<RunsIn.WeekOff> notWeek1 = new List<RunsIn.WeekOff>();
      for (Integer week = 2; week <= 6; week++) {
        notWeek1.add(SetTimeTestData.weekOff(0, null, ids.get('Week ' + week)));
      }
      FixedActivity__c rest = SetTimeTestData.fixed(ids, 'Rest', 'Period 1');
      rest.Location__c = ids.get('Gym');
      SetTimeTestData.save(
        new List<SObject>{ rest },
        SetTimeTestData.extras(notWeek1, null, null)
      );
      Assert.areEqual(1, count('FixedActivity__c'));
      // Group C back in Week 1, directly in Salesforce: three at the Gym, refused.
      Database.DeleteResult direct = Database.delete(
        away.Id,
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(direct.isSuccess());
      Assert.areEqual(
        '"Gym" fits 2 groups at once, but "Rest" would have 3 there in Period 1 on Monday ' +
        'in Week 1. Change "Rest" first, then try again.',
        direct.getErrors()[0].getMessage()
      );
    }
  }

  @IsTest
  static void aLocationClosedThatWeekIsNoClash() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Test.startTest();
      Database.insert(
        new WeekException__c(
          Week__c = ids.get('Week 2'),
          Location__c = ids.get('Gym')
        ),
        AccessLevel.SYSTEM_MODE
      );
      // Rest at the Gym in Week 2 only, with 3 groups, after the Gym's fit drops to 2: the
      // Gym is closed that week, so it is no clash. Opening it again is refused.
      Database.update(
        new Location__c(Id = ids.get('Gym'), GroupsThatFit__c = 2),
        AccessLevel.SYSTEM_MODE
      );
      List<RunsIn.WeekOff> notWeek2 = new List<RunsIn.WeekOff>();
      for (Integer week = 1; week <= 6; week++) {
        if (week != 2) {
          notWeek2.add(
            SetTimeTestData.weekOff(0, null, ids.get('Week ' + week))
          );
        }
      }
      FixedActivity__c rest = SetTimeTestData.fixed(ids, 'Rest', 'Period 1');
      rest.Location__c = ids.get('Gym');
      SetTimeTestData.save(
        new List<SObject>{ rest },
        SetTimeTestData.extras(notWeek2, null, null)
      );
      WeekException__c closed = [
        SELECT Id
        FROM WeekException__c
        WHERE Location__c = :ids.get('Gym')
        WITH SYSTEM_MODE
      ];
      String message = SetTimeTestData.refusal(
        new List<SObject>(),
        SetTimeTestData.extras(null, new List<Id>{ closed.Id }, null)
      );
      String expected =
        '"Gym" fits 2 groups at once, but "Rest" would have 3 there in Period 1 on Monday ' +
        'in Week 2. Change "Rest" first, then try again.';
      Assert.areEqual(expected, message);
      // The same when the Gym is opened again directly in Salesforce.
      Database.DeleteResult direct = Database.delete(
        closed,
        false,
        AccessLevel.USER_MODE
      );
      Assert.isFalse(direct.isSuccess());
      Assert.areEqual(expected, direct.getErrors()[0].getMessage());
    }
  }
}
