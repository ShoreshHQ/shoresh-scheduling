/**
 * Who an elective set's time is for, and a set over a double period (repo ADR 0027, amended
 * 2026-11-27; ELECT-7.4, ELECT-7.5): a fresh week places the set only for the groups it names and
 * in every block to its last, one set cell, where all of them are free; a camp with neither gets
 * exactly the week it always got; the Electives screen saves both and refuses what can't be; Copy
 * season carries them; deleting a set takes its rows. As a scheduler, with records made inside
 * the same System.runAs. Synthetic camp only (SetTimeTestData: Period 1, Period 2, Lunch; Juniors
 * with Group A and Group B, Seniors with Group C, all here all day).
 */
@IsTest
private class ElectiveSetWhoTest {
  /** Chugim on Mondays, at a block and (for a double period) until a later one. */
  private static Id chugim(Map<String, Id> ids, String block, String last) {
    ElectiveSet__c item = new ElectiveSet__c(
      Season__c = ids.get('Season'),
      Name = 'Chugim',
      TimeBlock__c = ids.get(block),
      LastTimeBlock__c = last == null ? null : ids.get(last),
      Monday__c = true
    );
    Database.insert(item, AccessLevel.USER_MODE);
    return item.Id;
  }

  /** Who the set's time is for: a Coverage row per division or group named. */
  private static void whoFor(
    Map<String, Id> ids,
    Id setId,
    List<String> names
  ) {
    List<Coverage__c> rows = new List<Coverage__c>();
    for (String name : names) {
      Id target = ids.get(name);
      Coverage__c row = new Coverage__c(
        Season__c = ids.get('Season'),
        ElectiveSet__c = setId
      );
      row.put(
        target.getSObjectType() == Division__c.SObjectType
          ? Coverage__c.Division__c
          : Coverage__c.Group__c,
        target
      );
      rows.add(row);
    }
    Database.insert(rows, AccessLevel.USER_MODE);
  }

  private static ManualBuildViews.DraftView blankWeek(
    Map<String, Id> ids,
    String week
  ) {
    return ManualBuildController.startBlankWeek(ids.get('Main'), ids.get(week));
  }

  /** Monday's rows (Group A, Group B, Group C), each "Period 1,Period 2,Lunch". */
  private static List<String> mondayRows(ManualBuildViews.DraftView view) {
    ScheduleViews.DayView monday = view.schedule.days[0];
    Assert.areEqual('Group A', monday.groups[0].name);
    Assert.areEqual('Group C', monday.groups[2].name);
    return monday.rows;
  }

  /** Every message a refused save gives, one per line. */
  private static String refusals(Database.SaveResult result) {
    Assert.isFalse(result.isSuccess(), 'Expected the save to be refused');
    List<String> messages = new List<String>();
    for (Database.Error error : result.getErrors()) {
      messages.add(error.getMessage());
    }
    return String.join(messages, '\n');
  }

  private static Integer coverageOf(Id setId) {
    return [
      SELECT COUNT()
      FROM Coverage__c
      WHERE ElectiveSet__c = :setId
      WITH USER_MODE
    ];
  }

  // ELECT-7.4, ELECT-7.1: no rows and no last block is the week a camp always got.
  @IsTest
  static void aSetWithNoWhoAndNoLastBlockGivesTheWeekItAlwaysGot() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids, 'Period 2', null);

      Test.startTest();
      Integer before = Limits.getQueries();
      ManualBuildViews.DraftView first = blankWeek(ids, 'Week 1');
      Integer used = Limits.getQueries() - before;
      // Who named as every division there is: the same week again.
      whoFor(ids, setId, new List<String>{ 'Juniors', 'Seniors' });
      ManualBuildViews.DraftView named = blankWeek(ids, 'Week 2');
      Test.stopTest();

      Assert.isTrue(used <= 60, 'Queries to start a blank week: ' + used);
      // As before: Period 2 holds the set, as one set cell across every group.
      Assert.areEqual(
        new List<String>{ ',1,', ',1,', ',1,' },
        mondayRows(first)
      );
      ScheduleViews.DayView monday = first.schedule.days[0];
      Assert.areEqual(1, monday.items.size());
      Assert.areEqual('E', monday.items[0].kind);
      Assert.areEqual(String.valueOf(setId), monday.items[0].id);
      Assert.isTrue(first.notPlaced.isEmpty(), String.valueOf(first.notPlaced));
      Assert.areEqual(mondayRows(first), mondayRows(named));
    }
  }

  // ELECT-7.4
  @IsTest
  static void aSetForADivisionOrAGroupStartsAFreshWeekOnlyForThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id juniorsOnly = chugim(ids, 'Period 2', null);
      whoFor(ids, juniorsOnly, new List<String>{ 'Juniors' });
      ElectiveSet__c bechirot = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Bechirot',
        TimeBlock__c = ids.get('Period 1'),
        Monday__c = true
      );
      Database.insert(bechirot, AccessLevel.USER_MODE);
      whoFor(ids, bechirot.Id, new List<String>{ 'Group C' });

      Test.startTest();
      ManualBuildViews.DraftView view = blankWeek(ids, 'Week 1');
      Test.stopTest();

      // Bechirot (Period 1) is Group C's alone; Chugim (Period 2) the Juniors' groups'.
      Assert.areEqual(
        new List<String>{ ',2,', ',2,', '1,,' },
        mondayRows(view)
      );
      Assert.isTrue(view.notPlaced.isEmpty(), String.valueOf(view.notPlaced));
    }
  }

  // ELECT-7.5
  @IsTest
  static void aDoublePeriodIsOneSetCellOverEveryBlockToItsLast() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      chugim(ids, 'Period 1', 'Period 2');

      Test.startTest();
      ManualBuildViews.DraftView view = blankWeek(ids, 'Week 1');
      Test.stopTest();

      Assert.areEqual(
        new List<String>{ '1,^,', '1,^,', '1,^,' },
        mondayRows(view)
      );
    }
  }

  // ELECT-7.5, ELECT-7.1: a group with any of the blocks taken keeps what it has.
  @IsTest
  static void aTakenSlotKeepsWhatItHasAndTheSetIsNamedAsNotPlaced() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      RecurringActivity__c rest = SetTimeTestData.recurring(
        ids,
        'Rest',
        'Period 2'
      );
      Database.insert(rest, AccessLevel.USER_MODE);
      Database.insert(
        new Coverage__c(
          RecurringActivity__c = rest.Id,
          Group__c = ids.get('Group A'),
          Season__c = ids.get('Season')
        ),
        AccessLevel.USER_MODE
      );
      chugim(ids, 'Period 1', 'Period 2');

      Test.startTest();
      ManualBuildViews.DraftView view = blankWeek(ids, 'Week 1');
      Test.stopTest();

      // Rest is item 1 in Group A's Period 2; Chugim (item 2) goes in for the others only.
      Assert.areEqual(
        new List<String>{ ',1,', '2,^,', '2,^,' },
        mondayRows(view)
      );
      Assert.areEqual(1, view.notPlaced.size(), String.valueOf(view.notPlaced));
      Assert.isTrue(
        view.notPlaced[0].startsWith('Chugim · Group A'),
        view.notPlaced[0]
      );
    }
  }

  // ELECT-7.4, ELECT-7.5
  @IsTest
  static void theScreenSavesUntilAndWhoWithTheSetsRow() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids, 'Period 1', null);
      ScreenSaves.Extras extras = SetTimeTestData.extras(
        null,
        null,
        new List<SetTimeWho.Who>{
          SetTimeTestData.who(
            null,
            setId,
            new List<Id>{ ids.get('Seniors'), ids.get('Group A') }
          )
        }
      );
      extras.seenWho = new List<Id>();

      Test.startTest();
      Integer before = Limits.getQueries();
      RowSaves.Result result = SetupTablesController.saveRow(
        new ElectiveSet__c(Id = setId, LastTimeBlock__c = ids.get('Period 2')),
        new ElectiveSet__c(Id = setId, LastTimeBlock__c = null),
        extras
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();

      Assert.isTrue(result.saved(), String.valueOf(result.changed));
      Assert.isTrue(used <= 30, 'Queries to save a set\'s row: ' + used);
      ElectiveSet__c saved = [
        SELECT
          LastTimeBlock__r.Name,
          (SELECT Division__c, Group__c FROM Coverages__r ORDER BY Id)
        FROM ElectiveSet__c
        WHERE Id = :setId
        WITH USER_MODE
      ];
      Assert.areEqual('Period 2', saved.LastTimeBlock__r.Name);
      Set<Id> who = new Set<Id>();
      for (Coverage__c row : saved.Coverages__r) {
        who.add(row.Division__c != null ? row.Division__c : row.Group__c);
      }
      Assert.areEqual(
        new Set<Id>{ ids.get('Seniors'), ids.get('Group A') },
        who
      );
    }
  }

  // ELECT-7.5: Until is a later block of the same program; no time, no Until.
  @IsTest
  static void anUntilThatIsNotLaterIsRefusedAndNoTimeClearsIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids, 'Period 2', null);

      Test.startTest();
      String refusal = SetTimeTestData.refusal(
        new List<SObject>{
          new ElectiveSet__c(Id = setId, LastTimeBlock__c = ids.get('Period 1'))
        }
      );
      SetTimeTestData.save(
        new List<SObject>{
          new ElectiveSet__c(Id = setId, LastTimeBlock__c = ids.get('Lunch'))
        }
      );
      SetTimeTestData.save(
        new List<SObject>{ new ElectiveSet__c(Id = setId, TimeBlock__c = null) }
      );
      Test.stopTest();

      Assert.isTrue(
        refusal.contains('Choose a later time block of the same program.'),
        refusal
      );
      ElectiveSet__c saved = [
        SELECT TimeBlock__c, LastTimeBlock__c
        FROM ElectiveSet__c
        WHERE Id = :setId
        WITH USER_MODE
      ];
      Assert.isNull(saved.TimeBlock__c);
      Assert.isNull(saved.LastTimeBlock__c, 'No time, no last block');
    }
  }

  // ELECT-7.4: one set, one division or group, of the set's season.
  @IsTest
  static void whoRowsNamingTwoThingsOrAnotherSeasonAreRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids, 'Period 1', null);
      Season__c other = ShoreshTestData.season(ids.get('Camp'), 'Summer 2027');
      Program__c elsewhere = ShoreshTestData.program(other.Id, 'Main');
      Division__c otherDivision = ShoreshTestData.division(
        elsewhere.Id,
        'Juniors'
      );

      Test.startTest();
      String both = refusals(
        Database.insert(
          new Coverage__c(
            Season__c = ids.get('Season'),
            ElectiveSet__c = setId,
            Division__c = ids.get('Juniors'),
            Group__c = ids.get('Group C')
          ),
          false,
          AccessLevel.USER_MODE
        )
      );
      String noTarget = refusals(
        Database.insert(
          new Coverage__c(
            Season__c = ids.get('Season'),
            ElectiveSet__c = setId
          ),
          false,
          AccessLevel.USER_MODE
        )
      );
      String otherSeason = SetTimeTestData.refusal(
        new List<SObject>{ new ElectiveSet__c(Id = setId, Name = 'Chugim') },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(null, setId, new List<Id>{ otherDivision.Id })
          }
        )
      );
      Test.stopTest();

      String oneOfEach = 'Each row names one elective set and one division or group.';
      Assert.isTrue(both.contains(oneOfEach), both);
      Assert.isTrue(noTarget.contains(oneOfEach), noTarget);
      Assert.isTrue(
        otherSeason.contains(
          'This division belongs to a different season than the elective set.'
        ),
        otherSeason
      );
      Assert.areEqual(0, coverageOf(setId));
    }
  }

  // ELECT-7.4, ELECT-7.5: in the copy's own blocks, divisions and groups.
  @IsTest
  static void copySeasonCarriesTheLastBlockAndWho() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids, 'Period 1', 'Period 2');
      whoFor(ids, setId, new List<String>{ 'Juniors', 'Group C' });

      Test.startTest();
      Id copyId = new SeasonCopier(
          ids.get('Season'),
          Date.newInstance(2027, 6, 28)
        )
        .copy('Summer 2027');
      Test.stopTest();

      ElectiveSet__c copy = [
        SELECT
          CopiedFrom__c,
          TimeBlock__r.Name,
          LastTimeBlock__r.Name,
          LastTimeBlock__r.Program__r.Season__c,
          (
            SELECT
              Season__c,
              Division__r.Name,
              Division__r.Program__r.Season__c,
              Group__r.Name,
              Group__r.Division__r.Program__r.Season__c
            FROM Coverages__r
            ORDER BY Id
          )
        FROM ElectiveSet__c
        WHERE Season__c = :copyId
        WITH USER_MODE
      ];
      Assert.areEqual(setId, copy.CopiedFrom__c);
      Assert.areEqual('Period 1', copy.TimeBlock__r.Name);
      Assert.areEqual('Period 2', copy.LastTimeBlock__r.Name);
      Assert.areEqual(copyId, copy.LastTimeBlock__r.Program__r.Season__c);
      Assert.areEqual(2, copy.Coverages__r.size());
      Set<String> names = new Set<String>();
      for (Coverage__c row : copy.Coverages__r) {
        Assert.areEqual(copyId, row.Season__c);
        if (row.Division__c != null) {
          names.add(row.Division__r.Name);
          Assert.areEqual(copyId, row.Division__r.Program__r.Season__c);
        } else {
          names.add(row.Group__r.Name);
          Assert.areEqual(
            copyId,
            row.Group__r.Division__r.Program__r.Season__c
          );
        }
      }
      Assert.areEqual(new Set<String>{ 'Juniors', 'Group C' }, names);
    }
  }

  // ELECT-7.4: the rows go first, so the set's own delete is not stopped by them.
  @IsTest
  static void deletingASetTakesWhoItsTimeIsFor() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids, 'Period 1', null);
      whoFor(ids, setId, new List<String>{ 'Juniors' });

      Test.startTest();
      SeasonSetupController.deleteRecord(setId);
      Test.stopTest();

      Assert.areEqual(
        0,
        [SELECT COUNT() FROM ElectiveSet__c WHERE Id = :setId WITH USER_MODE]
      );
      Assert.areEqual(0, coverageOf(setId));
    }
  }

  // ELECT-7.5: a part-day group takes the part of a double period it is at camp for, from the
  // first such block (as BlankDay.atCampPart for fixed and recurring activities).
  @IsTest
  static void aPartDayGroupTakesThePartOfADoublePeriodItIsHereFor() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Database.update(
        new List<Group__c>{
          new Group__c(
            Id = ids.get('Group B'),
            Availability__c = 'MorningOnly'
          ),
          new Group__c(
            Id = ids.get('Group C'),
            Availability__c = 'AfternoonOnly'
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      // Period 2 (morning) to Lunch (afternoon): across midday.
      chugim(ids, 'Period 2', 'Lunch');

      Test.startTest();
      ManualBuildViews.DraftView view = blankWeek(ids, 'Week 1');
      Test.stopTest();

      // Group A both; Group B its morning's Period 2; Group C its afternoon's Lunch.
      Assert.areEqual(
        new List<String>{ ',1,^', ',1,', ',,1' },
        mondayRows(view)
      );
      Assert.isTrue(view.notPlaced.isEmpty(), String.valueOf(view.notPlaced));
    }
  }

  /** A second program, Teens, in the same season: Period 1 and a Leaders division. */
  private static void addTeens(Map<String, Id> ids) {
    Program__c teens = ShoreshTestData.program(ids.get('Season'), 'Teens');
    ids.put('Teens', teens.Id);
    ids.put(
      'Teens Period 1',
      ShoreshTestData.timeBlock(teens.Id, 'Period 1', 9).Id
    );
    Division__c leaders = ShoreshTestData.division(teens.Id, 'Leaders');
    ids.put('Leaders', leaders.Id);
    ids.put('Group T', ShoreshTestData.groupIn(leaders.Id, 'Group T').Id);
  }

  // ELECT-7.4: with two programs, who is in the set's time block's program; a set moves to
  // another program with its new who in one save, and never away from who it is for alone.
  @IsTest
  static void whoIsInTheSetsProgramAndMovesWithItInOneSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      addTeens(ids);
      Id setId = chugim(ids, 'Period 1', null);

      Test.startTest();
      String otherProgram = refusals(
        Database.insert(
          new Coverage__c(
            Season__c = ids.get('Season'),
            ElectiveSet__c = setId,
            Division__c = ids.get('Leaders')
          ),
          false,
          AccessLevel.USER_MODE
        )
      );
      whoFor(ids, setId, new List<String>{ 'Juniors' });
      // One row save: Teens' block and Teens' Leaders together.
      SetTimeTestData.save(
        new List<SObject>{
          new ElectiveSet__c(
            Id = setId,
            TimeBlock__c = ids.get('Teens Period 1')
          )
        },
        SetTimeTestData.extras(
          null,
          null,
          new List<SetTimeWho.Who>{
            SetTimeTestData.who(null, setId, new List<Id>{ ids.get('Leaders') })
          }
        )
      );
      // Counter-case: back to Main's block with no new who is refused, saying what to do.
      String moved = SetTimeTestData.refusal(
        new List<SObject>{
          new ElectiveSet__c(Id = setId, TimeBlock__c = ids.get('Period 1'))
        }
      );
      Test.stopTest();

      Assert.isTrue(
        otherProgram.contains(
          'This division belongs to a different program than the elective set.'
        ),
        otherProgram
      );
      Assert.isTrue(
        moved.contains('Choose Who for Main in the same change.'),
        moved
      );
      ElectiveSet__c saved = [
        SELECT TimeBlock__c, (SELECT Division__c FROM Coverages__r)
        FROM ElectiveSet__c
        WHERE Id = :setId
        WITH USER_MODE
      ];
      Assert.areEqual(ids.get('Teens Period 1'), saved.TimeBlock__c);
      Assert.areEqual(1, saved.Coverages__r.size());
      Assert.areEqual(ids.get('Leaders'), saved.Coverages__r[0].Division__c);
    }
  }

  // ELECT-7.4: someone who can't read who a set is for gets its time as before, for everyone.
  @IsTest
  static void whoThatCannotBeReadLeavesTheSetPlacedAsBefore() {
    System.runAs(FieldAccessTestData.schedulerWithout(
      Coverage__c.ElectiveSet__c
    )) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Id setId = chugim(ids, 'Period 2', null);
      // Made by someone who can (not this user).
      Database.insert(
        new Coverage__c(
          Season__c = ids.get('Season'),
          ElectiveSet__c = setId,
          Division__c = ids.get('Juniors')
        ),
        AccessLevel.SYSTEM_MODE
      );

      Test.startTest();
      ManualBuildViews.DraftView view = blankWeek(ids, 'Week 1');
      ElectiveMenus.Setup menus = ElectiveMenus.forSeason(ids.get('Season'));
      Test.stopTest();

      Assert.areEqual(
        new List<String>{ ',1,', ',1,', ',1,' },
        mondayRows(view)
      );
      Assert.areEqual(1, menus.sets.size());
    }
  }

  // ELECT-7.5: someone who can't read a set's last block gets its block alone, as before.
  @IsTest
  static void aLastBlockThatCannotBeReadLeavesTheSetInItsBlock() {
    System.runAs(FieldAccessTestData.schedulerWithout(
      ElectiveSet__c.LastTimeBlock__c
    )) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Database.insert(
        new ElectiveSet__c(
          Season__c = ids.get('Season'),
          Name = 'Chugim',
          TimeBlock__c = ids.get('Period 1'),
          LastTimeBlock__c = ids.get('Period 2'),
          Monday__c = true
        ),
        AccessLevel.SYSTEM_MODE
      );

      Test.startTest();
      ManualBuildViews.DraftView view = blankWeek(ids, 'Week 1');
      ElectiveMenus.Setup menus = ElectiveMenus.forSeason(ids.get('Season'));
      Test.stopTest();

      Assert.areEqual(
        new List<String>{ '1,,', '1,,', '1,,' },
        mondayRows(view)
      );
      Assert.areEqual(1, menus.sets.size());
      Assert.isFalse(
        menus.sets[0]
          .getPopulatedFieldsAsMap()
          .containsKey(
            ShoreshSchema.queryName(ElectiveSet__c.LastTimeBlock__c)
          ),
        'Its last block is left out'
      );
    }
  }
}
