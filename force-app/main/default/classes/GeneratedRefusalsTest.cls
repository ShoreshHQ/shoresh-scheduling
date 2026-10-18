/**
 * What the server refuses when a generated week is saved (ADR 0010, G2): moving, covering or
 * placing a fixed or recurring activity; anything new where a group isn't at camp (a leftover
 * there may be cleared); another season's activity; something not set up yet newly placed;
 * days that aren't the draft's own; a version, Manual Build's draft or another week's; a save
 * the screen could not have sent; an option that can't be built; a day that can't be read; and
 * anyone without Shoresh access. Each refusal writes nothing. Camp and helpers:
 * GeneratedTestData.
 */
@IsTest
private class GeneratedRefusalsTest {
  private static final String REOPEN = ' changed since you opened this week. Open it again, then generate.';

  // The camp is built once, by the scheduler, in setup; each test finds it again by name. Every
  // test still starts from the same camp, because a test's changes are undone when it ends.
  @TestSetup
  static void makeCamp() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
    }
  }

  /** The scheduler setup made (the outsider test makes its own other user later). */
  private static User scheduler() {
    return [
      SELECT Id
      FROM User
      WHERE
        Alias = 'sched'
        AND Id IN (
          SELECT AssigneeId
          FROM PermissionSetAssignment
          WHERE PermissionSet.Name = 'Shoresh_Scheduler'
        )
      LIMIT 1
    ];
  }

  /** The camp setup made, by name, as GeneratedTestData.camp() returned it. */
  private static Map<String, Id> camp() {
    Map<String, Id> ids = new Map<String, Id>();
    ids.put('Camp', [SELECT Id FROM Camp__c WITH SYSTEM_MODE LIMIT 1].Id);
    ids.put('Season', [SELECT Id FROM Season__c WITH SYSTEM_MODE LIMIT 1].Id);
    List<SObject> named = new List<SObject>();
    named.addAll([SELECT Name FROM Week__c WITH SYSTEM_MODE]);
    named.addAll([SELECT Name FROM Program__c WITH SYSTEM_MODE]);
    named.addAll([SELECT Name FROM TimeBlock__c WITH SYSTEM_MODE]);
    named.addAll([SELECT Name FROM Division__c WITH SYSTEM_MODE]);
    named.addAll([SELECT Name FROM Group__c WITH SYSTEM_MODE]);
    named.addAll([SELECT Name FROM Location__c WITH SYSTEM_MODE]);
    named.addAll([SELECT Name FROM Activity__c WITH SYSTEM_MODE]);
    named.addAll([SELECT Name FROM FixedActivity__c WITH SYSTEM_MODE]);
    named.addAll([SELECT Name FROM RecurringActivity__c WITH SYSTEM_MODE]);
    for (SObject record : named) {
      ids.put((String) record.get('Name'), record.Id);
    }
    GeneratedTestData.ids = ids;
    return ids;
  }

  private static GeneratedWeek.Save request(
    GeneratedInputs.Inputs read,
    String action
  ) {
    return GeneratedTestData.request(read, action, 1);
  }

  private static Id generated() {
    return GeneratedTestData.save(
        GeneratedTestData.filled(
          request(GeneratedTestData.inputs(), GeneratedSaves.GENERATE),
          'Gym games'
        )
      )
      .scheduleId;
  }

  @IsTest
  static void fixedAndRecurringActivitiesStayWhereTheyAreSetUp() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      // On a draft: before one, a fixed activity that moved is setup that changed (a conflict).
      generated();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      GeneratedWeek.Save cleared = request(read, GeneratedSaves.TRY_ANOTHER);
      GeneratedTestData.setCell(
        cleared.days[0],
        GeneratedTestData.at(0, GeneratedTestData.PERIOD_1),
        ''
      );
      GeneratedWeek.Save covered = request(read, GeneratedSaves.TRY_ANOTHER);
      GeneratedTestData.put(
        covered.days[0],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_C,
          GeneratedTestData.LUNCH
        ),
        'Soccer'
      );
      GeneratedWeek.Save placed = request(read, GeneratedSaves.TRY_ANOTHER);
      GeneratedTestData.put(
        placed.days[1],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_B,
          GeneratedTestData.PERIOD_2
        ),
        GeneratedTestData.item('R', ids.get('Rest'), 'Rest')
      );
      for (
        GeneratedWeek.Save refused : new List<GeneratedWeek.Save>{
          cleared,
          covered,
          placed
        }
      ) {
        Assert.areEqual(
          'Fixed activities and recurring activities stay where they are set up.',
          GeneratedTestData.refusal(refused)
        );
      }
      Assert.areEqual(read.revision, GeneratedTestData.inputs().revision);
    }
  }

  @IsTest
  static void nothingIsPutWhereAGroupIsNotAtCampButALeftoverMayGo() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      List<Integer> lunchB = GeneratedTestData.at(
        GeneratedTestData.GROUP_B,
        GeneratedTestData.LUNCH
      );
      // Generated while Group B was at camp all day, with Soccer at Monday's Lunch.
      GeneratedWeek.Save first = request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE
      );
      GeneratedTestData.put(first.days[0], lunchB, 'Soccer');
      Id draftId = GeneratedTestData.save(first).scheduleId;
      Test.startTest();
      Database.update(
        new Group__c(Id = ids.get('Group B'), Availability__c = 'MorningOnly'),
        AccessLevel.SYSTEM_MODE
      );
      GeneratedWeek.Save away = request(
        GeneratedTestData.inputs(),
        GeneratedSaves.FILL_OPEN
      );
      GeneratedTestData.put(away.days[1], lunchB, 'Soccer');
      Assert.areEqual(
        'Group B isn\'t at camp in Lunch.',
        GeneratedTestData.refusal(away)
      );
      // Fill the open cells keeping it: leftoversOfAGroupAwayOrOfWhatIsClosedMayStayOrGo.
      // A full build clears it (ADR 0010 §3).
      GeneratedWeek.Save cleared = request(
        GeneratedTestData.inputs(),
        GeneratedSaves.TRY_ANOTHER
      );
      GeneratedTestData.setCell(cleared.days[0], lunchB, '');
      Assert.isFalse(GeneratedTestData.save(cleared).conflict);
      Assert.areEqual(
        '',
        GeneratedTestData.slots(
          draftId,
          GeneratedTestData.at(0, GeneratedTestData.GROUP_B)
        )[
          GeneratedTestData.LUNCH
        ]
      );
    }
  }

  @IsTest
  static void onlyThisSeasonsActivitiesArePlaced() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      Season__c other = ShoreshTestData.season(ids.get('Camp'), 'Other summer');
      Activity__c stranger = ShoreshTestData.activity(
        other.Id,
        'Archery',
        null
      );
      Database.insert(stranger, AccessLevel.SYSTEM_MODE);
      List<Integer> cell = GeneratedTestData.at(0, GeneratedTestData.PERIOD_2);
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      GeneratedWeek.Save otherSeason = request(read, GeneratedSaves.GENERATE);
      GeneratedTestData.put(
        otherSeason.days[0],
        cell,
        GeneratedTestData.item('A', stranger.Id, 'Archery')
      );
      Assert.areEqual(
        'That activity was not found. It may have been deleted.',
        GeneratedTestData.refusal(otherSeason)
      );
      // Something not set up yet (a trip) is only ever kept from an import, never placed.
      GeneratedWeek.Save trip = request(read, GeneratedSaves.GENERATE);
      GeneratedTestData.put(
        trip.days[0],
        cell,
        GeneratedTestData.item('T', '', 'Zoo trip')
      );
      Assert.areEqual(
        GeneratedTestData.UNREADABLE,
        GeneratedTestData.refusal(trip)
      );
      Assert.areEqual(0, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void theWeekSentMustBeTheDraftsOwnDays() {
    System.runAs(scheduler()) {
      camp();
      generated();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      GeneratedWeek.Save dayMissing = request(read, GeneratedSaves.TRY_ANOTHER);
      dayMissing.days.remove(3);
      GeneratedWeek.Save dayTwice = request(read, GeneratedSaves.TRY_ANOTHER);
      dayTwice.days[3].dateValue = GeneratedTestData.MONDAY;
      GeneratedWeek.Save otherBlocks = request(
        read,
        GeneratedSaves.TRY_ANOTHER
      );
      List<String> swapped = otherBlocks.days[0].blockIds;
      String first = swapped[0];
      swapped[0] = swapped[1];
      swapped[1] = first;
      for (
        GeneratedWeek.Save refused : new List<GeneratedWeek.Save>{
          dayMissing,
          dayTwice,
          otherBlocks
        }
      ) {
        Assert.areEqual(
          GeneratedTestData.UNREADABLE,
          GeneratedTestData.refusal(refused)
        );
      }
      GeneratedWeek.Save shortRow = request(read, GeneratedSaves.TRY_ANOTHER);
      shortRow.days[0].rows[0] = '1,';
      // A broken grid is refused in plain words, never the format's own.
      Assert.areEqual(
        GeneratedTestData.UNREADABLE,
        GeneratedTestData.refusal(shortRow)
      );
      Assert.areEqual(read.revision, GeneratedTestData.inputs().revision);
    }
  }

  /** A first Generate built on the week as it was read, saved after setup changed. */
  private static GeneratedWeek.Result generateFrom(
    GeneratedInputs.Inputs read
  ) {
    return GeneratedTestData.save(
      GeneratedTestData.filled(
        request(read, GeneratedSaves.GENERATE),
        'Gym games'
      )
    );
  }

  @IsTest
  static void aTimeBlockAddedBeforeTheFirstGenerateIsAConflictThatSaysSo() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      ShoreshTestData.timeBlock(ids.get('Main'), 'Period 3', 11);
      GeneratedWeek.Result result = generateFrom(read);
      Assert.isTrue(result.conflict);
      Assert.areEqual('Main\'s time blocks on Monday' + REOPEN, result.message);
      Assert.areEqual(0, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void aFixedActivityAddedBeforeTheFirstGenerateIsAConflictNotARefusal() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      // Added where the engine had placed an activity: not the director's doing.
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Database.insert(
        SetTimeTestData.fixed(ids, 'Assembly', 'Period 2'),
        AccessLevel.SYSTEM_MODE
      );
      GeneratedWeek.Result result = generateFrom(read);
      Assert.isTrue(result.conflict);
      Assert.areEqual(
        'Period 2 for Group A on Monday' + REOPEN,
        result.message
      );
      Assert.areEqual(0, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void aDayDroppedBeforeTheFirstGenerateIsAConflictThatSaysSo() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      // The program no longer runs on Thursdays.
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      Database.update(
        new Program__c(Id = ids.get('Main'), Thursday__c = false),
        AccessLevel.SYSTEM_MODE
      );
      GeneratedWeek.Result result = generateFrom(read);
      Assert.isTrue(result.conflict);
      Assert.areEqual('Main\'s days' + REOPEN, result.message);
      Assert.areEqual(0, GeneratedTestData.generatedDrafts());
    }
  }

  /** Group B marked away in Week 1, after the screen read the week. */
  private static void groupBAwayNow(Map<String, Id> ids) {
    Database.insert(
      new WeekException__c(
        Week__c = ids.get('Week 1'),
        Group__c = ids.get('Group B')
      ),
      AccessLevel.SYSTEM_MODE
    );
  }

  @IsTest
  static void aGroupMarkedAwayAfterTheWeekWasOpenedIsCheckedOnSave() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      generated();
      Test.startTest();
      // A stale screen: it still has Group B, and the save checks this week's exceptions as they
      // are now. (An Apex test runs in one transaction, so it can't show that the save reads them
      // only after taking its lock; that order is in GeneratedSaves.save.)
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      groupBAwayNow(ids);
      GeneratedWeek.Save stale = request(read, GeneratedSaves.FILL_OPEN);
      GeneratedTestData.put(
        stale.days[0],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_B,
          GeneratedTestData.LUNCH
        ),
        'Swim'
      );
      Assert.areEqual(
        'Group B isn\'t at camp in Week 1.',
        GeneratedTestData.refusal(stale)
      );
      Assert.areEqual(read.revision, GeneratedTestData.inputs().revision);
    }
  }

  @IsTest
  static void aGroupMarkedAwayBeforeTheFirstGenerateIsAConflictThatSaysSo() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      groupBAwayNow(ids);
      GeneratedWeek.Result result = generateFrom(read);
      Assert.isTrue(result.conflict);
      Assert.areEqual('Main\'s groups on Monday' + REOPEN, result.message);
      Assert.areEqual(0, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void nothingNewForAGroupAwayOrWhatIsClosedThisWeek() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      generated();
      Test.startTest();
      // After the week was generated: Group B is away, Soccer and the Gym are closed.
      Database.insert(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = ids.get('Week 1'),
            Group__c = ids.get('Group B')
          ),
          new WeekException__c(
            Week__c = ids.get('Week 1'),
            Activity__c = ids.get('Soccer')
          ),
          new WeekException__c(
            Week__c = ids.get('Week 1'),
            Location__c = ids.get('Gym')
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      List<Integer> lunchA = GeneratedTestData.at(0, GeneratedTestData.LUNCH);
      GeneratedWeek.Save awayGroup = request(read, GeneratedSaves.FILL_OPEN);
      GeneratedTestData.put(
        awayGroup.days[0],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_B,
          GeneratedTestData.LUNCH
        ),
        'Swim'
      );
      Assert.areEqual(
        'Group B isn\'t at camp in Week 1.',
        GeneratedTestData.refusal(awayGroup)
      );
      GeneratedWeek.Save closed = request(read, GeneratedSaves.FILL_OPEN);
      GeneratedTestData.put(closed.days[0], lunchA, 'Soccer');
      Assert.areEqual(
        'Soccer is closed in Week 1.',
        GeneratedTestData.refusal(closed)
      );
      GeneratedWeek.Save closedPlace = request(read, GeneratedSaves.FILL_OPEN);
      GeneratedTestData.put(closedPlace.days[0], lunchA, 'Gym games');
      Assert.areEqual(
        'Gym is closed in Week 1.',
        GeneratedTestData.refusal(closedPlace)
      );
    }
  }

  @IsTest
  static void leftoversOfAGroupAwayOrOfWhatIsClosedMayStayOrGo() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = generated();
      Test.startTest();
      // After the week was generated: Group B is away, Soccer and the Gym are closed.
      Database.insert(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = ids.get('Week 1'),
            Group__c = ids.get('Group B')
          ),
          new WeekException__c(
            Week__c = ids.get('Week 1'),
            Activity__c = ids.get('Soccer')
          ),
          new WeekException__c(
            Week__c = ids.get('Week 1'),
            Location__c = ids.get('Gym')
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      List<Integer> lunchA = GeneratedTestData.at(0, GeneratedTestData.LUNCH);
      // Leftovers may stay (Gym games in Period 2, Group B's row) or be cleared.
      GeneratedWeek.Save kept = request(read, GeneratedSaves.FILL_OPEN);
      GeneratedTestData.put(kept.days[0], lunchA, 'Swim');
      GeneratedWeek.Result keptResult = GeneratedTestData.save(kept);
      Assert.isFalse(keptResult.conflict);
      GeneratedWeek.Save cleared = request(
        GeneratedTestData.inputs(),
        GeneratedSaves.TRY_ANOTHER
      );
      GeneratedTestData.setCell(
        cleared.days[0],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_B,
          GeneratedTestData.PERIOD_2
        ),
        ''
      );
      Assert.isFalse(GeneratedTestData.save(cleared).conflict);
      Assert.areEqual(
        '',
        GeneratedTestData.slots(
          draftId,
          GeneratedTestData.at(0, GeneratedTestData.GROUP_B)
        )[
          GeneratedTestData.PERIOD_2
        ]
      );
    }
  }

  @IsTest
  static void somethingNotSetUpYetStaysWhereItIs() {
    System.runAs(scheduler()) {
      camp();
      Id draftId = generated();
      Test.startTest();
      // An elective in Group A's Monday Lunch, as an import could have left it.
      ScheduleDays.DayGrid monday = ScheduleDays.read(draftId)[0];
      monday.grid.items.add(new ScheduleGrid.Item('E', '', 'Chugim'));
      monday.grid.rows[0][GeneratedTestData.LUNCH] = String.valueOf(
        monday.grid.items.size()
      );
      ScheduleDaySaves.write(
        draftId,
        new List<ScheduleDaySaves.DaySave>{
          new ScheduleDaySaves.DaySave(monday.day, monday.grid, monday.revision)
        }
      );
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      List<Integer> lunchA = GeneratedTestData.at(0, GeneratedTestData.LUNCH);
      GeneratedWeek.Save cleared = request(read, GeneratedSaves.TRY_ANOTHER);
      GeneratedTestData.setCell(cleared.days[0], lunchA, '');
      GeneratedWeek.Save replaced = request(read, GeneratedSaves.TRY_ANOTHER);
      GeneratedTestData.put(replaced.days[0], lunchA, 'Soccer');
      for (
        GeneratedWeek.Save refused : new List<GeneratedWeek.Save>{
          cleared,
          replaced
        }
      ) {
        Assert.areEqual(
          'Chugim stays where it is.',
          GeneratedTestData.refusal(refused)
        );
      }
      Assert.areEqual(read.revision, GeneratedTestData.inputs().revision);
    }
  }

  @IsTest
  static void fillTheOpenCellsChangesOnlyOpenCells() {
    System.runAs(scheduler()) {
      camp();
      Id draftId = generated();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      List<Integer> filledCell = GeneratedTestData.at(
        0,
        GeneratedTestData.PERIOD_2
      );
      GeneratedWeek.Save replaced = request(read, GeneratedSaves.FILL_OPEN);
      GeneratedTestData.put(replaced.days[0], filledCell, 'Soccer');
      GeneratedWeek.Save cleared = request(read, GeneratedSaves.FILL_OPEN);
      GeneratedTestData.setCell(cleared.days[0], filledCell, '');
      for (
        GeneratedWeek.Save refused : new List<GeneratedWeek.Save>{
          replaced,
          cleared
        }
      ) {
        Assert.areEqual(
          GeneratedTestData.UNREADABLE,
          GeneratedTestData.refusal(refused)
        );
      }
      // Filling an Open cell is what it is for.
      GeneratedWeek.Save filled = request(read, GeneratedSaves.FILL_OPEN);
      GeneratedTestData.put(
        filled.days[0],
        GeneratedTestData.at(0, GeneratedTestData.LUNCH),
        'Soccer'
      );
      Assert.isFalse(GeneratedTestData.save(filled).conflict);
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
    }
  }

  @IsTest
  static void onlyThisWeeksGeneratedDraftCanBeSaved() {
    System.runAs(scheduler()) {
      Map<String, Id> ids = camp();
      generated();
      Test.startTest();
      Schedule__c version = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Imported from last-summer.xlsx (made up)'
      );
      Program__c evenings = ShoreshTestData.program(
        ids.get('Season'),
        'Evenings'
      );
      // Manual Build's draft of the same week (made directly: only its kind matters here).
      Schedule__c manual = new Schedule__c(
        Program__c = ids.get('Main'),
        Week__c = ids.get('Week 1'),
        Name = ManualDrafts.NAME,
        Status__c = ManualDrafts.DRAFT,
        Origin__c = ManualDrafts.MANUAL
      );
      Database.insert(manual, AccessLevel.SYSTEM_MODE);
      Id manualId = manual.Id;
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      GeneratedWeek.Save onVersion = request(read, GeneratedSaves.REBUILD);
      onVersion.scheduleId = version.Id;
      Assert.areEqual(
        'A saved version can\'t be changed.',
        GeneratedTestData.refusal(onVersion)
      );
      String notHere = 'Only this week\'s Generated Schedule can be saved here. Reload the page.';
      GeneratedWeek.Save onManual = request(read, GeneratedSaves.REBUILD);
      onManual.scheduleId = manualId;
      Assert.areEqual(notHere, GeneratedTestData.refusal(onManual));
      GeneratedWeek.Save otherWeek = request(read, GeneratedSaves.REBUILD);
      otherWeek.weekId = ids.get('Week 2');
      Assert.areEqual(notHere, GeneratedTestData.refusal(otherWeek));
      // Another program of the season, naming Main's draft.
      GeneratedWeek.Save otherProgram = request(read, GeneratedSaves.REBUILD);
      otherProgram.programId = evenings.Id;
      Assert.areEqual(notHere, GeneratedTestData.refusal(otherProgram));
      Assert.areEqual(read.revision, GeneratedTestData.inputs().revision);
      // Only the imported version: nothing was kept before a refused Rebuild.
      Assert.areEqual(1, GeneratedTestData.versions());
    }
  }

  @IsTest
  static void aSaveTheScreenCouldNotHaveSentIsRefused() {
    System.runAs(scheduler()) {
      camp();
      generated();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      // Generate is only the week's first save; the others need the draft.
      GeneratedWeek.Save generateAgain = request(read, GeneratedSaves.GENERATE);
      GeneratedWeek.Save rebuildNothing = request(read, GeneratedSaves.REBUILD);
      rebuildNothing.scheduleId = null;
      rebuildNothing.revision = '';
      GeneratedWeek.Save unknownAction = request(read, 'Publish');
      GeneratedWeek.Save noDays = request(read, GeneratedSaves.TRY_ANOTHER);
      noDays.days = null;
      GeneratedWeek.Save noBlocks = request(read, GeneratedSaves.TRY_ANOTHER);
      noBlocks.days[0].blockIds = null;
      GeneratedWeek.Save noGroups = request(read, GeneratedSaves.TRY_ANOTHER);
      noGroups.days[1].groupIds = null;
      // A first save names no revision: there was nothing to have read.
      GeneratedWeek.Save firstWithRevision = request(
        read,
        GeneratedSaves.GENERATE
      );
      firstWithRevision.scheduleId = null;
      for (
        GeneratedWeek.Save refused : new List<GeneratedWeek.Save>{
          generateAgain,
          rebuildNothing,
          unknownAction,
          noDays,
          noBlocks,
          noGroups,
          firstWithRevision
        }
      ) {
        Assert.areEqual(
          GeneratedTestData.UNREADABLE,
          GeneratedTestData.refusal(refused)
        );
      }
      for (Integer option : new List<Integer>{ null, 0, -1, 10000 }) {
        Assert.areEqual(
          'That option can\'t be built.',
          GeneratedTestData.refusal(
            GeneratedTestData.request(read, GeneratedSaves.TRY_ANOTHER, option)
          )
        );
      }
      Assert.areEqual(read.revision, GeneratedTestData.inputs().revision);
      Assert.areEqual(1, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void aDayThatCannotBeReadIsRefused() {
    System.runAs(scheduler()) {
      camp();
      Id draftId = generated();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      ScheduleDay__c stored = [
        SELECT Id
        FROM ScheduleDay__c
        WHERE Schedule__c = :draftId AND Date__c = :GeneratedTestData.MONDAY
        WITH SYSTEM_MODE
      ];
      Database.update(
        new ScheduleDay__c(Id = stored.Id, Grid__c = 'not a grid'),
        AccessLevel.SYSTEM_MODE
      );
      String refused = GeneratedTestData.refusal(
        request(read, GeneratedSaves.REBUILD)
      );
      Assert.isTrue(refused.startsWith('Monday could not be read: '), refused);
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }

  @IsTest
  static void someoneWithoutShoreshCanNeitherReadNorSave() {
    GeneratedWeek.Save request;
    System.runAs(scheduler()) {
      camp();
      request = GeneratedTestData.filled(
        request(GeneratedTestData.inputs(), GeneratedSaves.GENERATE),
        'Swim'
      );
    }
    System.runAs(ShoreshTestData.outsider()) {
      try {
        GeneratedTestData.inputs();
        Assert.fail('An outsider read the week.');
      } catch (Exception e) {
        Assert.isInstanceOfType(e, AuraHandledException.class);
      }
      try {
        GeneratedTestData.save(request);
        Assert.fail('An outsider saved the week.');
      } catch (Exception e) {
        Assert.isInstanceOfType(e, AuraHandledException.class);
      }
    }
    Assert.areEqual(0, GeneratedTestData.generatedDrafts());
  }
}
