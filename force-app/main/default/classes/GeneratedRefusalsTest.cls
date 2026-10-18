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
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Test.startTest();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      GeneratedWeek.Save cleared = request(read, GeneratedSaves.GENERATE);
      GeneratedTestData.setCell(
        cleared.days[0],
        GeneratedTestData.at(0, GeneratedTestData.PERIOD_1),
        ''
      );
      GeneratedWeek.Save covered = request(read, GeneratedSaves.GENERATE);
      GeneratedTestData.put(
        covered.days[0],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_C,
          GeneratedTestData.LUNCH
        ),
        'Soccer'
      );
      GeneratedWeek.Save placed = request(read, GeneratedSaves.GENERATE);
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
      Test.stopTest();
      Assert.areEqual(0, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void nothingIsPutWhereAGroupIsNotAtCampButALeftoverMayGo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
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
      Database.update(
        new Group__c(Id = ids.get('Group B'), Availability__c = 'MorningOnly'),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      GeneratedWeek.Save away = request(
        GeneratedTestData.inputs(),
        GeneratedSaves.FILL_OPEN
      );
      GeneratedTestData.put(away.days[1], lunchB, 'Soccer');
      Assert.areEqual(
        'Group B isn\'t at camp in Lunch.',
        GeneratedTestData.refusal(away)
      );
      // Fill the open cells keeps the leftover as it is.
      Assert.isFalse(
        GeneratedTestData.save(
            request(GeneratedTestData.inputs(), GeneratedSaves.FILL_OPEN)
          )
          .conflict
      );
      // A full build clears it (ADR 0010 §3).
      GeneratedWeek.Save cleared = request(
        GeneratedTestData.inputs(),
        GeneratedSaves.TRY_ANOTHER
      );
      GeneratedTestData.setCell(cleared.days[0], lunchB, '');
      Assert.isFalse(GeneratedTestData.save(cleared).conflict);
      Test.stopTest();
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
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
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
      Test.stopTest();
      Assert.areEqual(0, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void theWeekSentMustBeTheDraftsOwnDays() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
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
      String refused = GeneratedTestData.refusal(shortRow);
      Assert.isTrue(
        refused.startsWith('That change could not be read: '),
        refused
      );
      Test.stopTest();
      Assert.areEqual(read.revision, GeneratedTestData.inputs().revision);
    }
  }

  @IsTest
  static void aFirstGenerateAfterSetupChangedItsDaysIsAConflict() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      // A time block added after the week was read: the blank week isn't what was built on.
      ShoreshTestData.timeBlock(ids.get('Main'), 'Period 3', 11);
      Test.startTest();
      GeneratedWeek.Result result = GeneratedTestData.save(
        GeneratedTestData.filled(
          request(read, GeneratedSaves.GENERATE),
          'Gym games'
        )
      );
      Test.stopTest();
      Assert.isTrue(result.conflict);
      Assert.areEqual(
        'Main\'s time blocks or groups changed since you opened this week. Open it again, then generate.',
        result.message
      );
      Assert.areEqual(0, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void fillTheOpenCellsChangesOnlyOpenCells() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
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
      Test.stopTest();
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
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      generated();
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      Schedule__c version = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Imported from last-summer.xlsx (made up)'
      );
      Test.startTest();
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
      Test.stopTest();
      Assert.areEqual(read.revision, GeneratedTestData.inputs().revision);
      // Only the imported version: nothing was kept before a refused Rebuild.
      Assert.areEqual(1, GeneratedTestData.versions());
    }
  }

  @IsTest
  static void aSaveTheScreenCouldNotHaveSentIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
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
      for (
        GeneratedWeek.Save refused : new List<GeneratedWeek.Save>{
          generateAgain,
          rebuildNothing,
          unknownAction,
          noDays
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
      Test.stopTest();
      Assert.areEqual(read.revision, GeneratedTestData.inputs().revision);
      Assert.areEqual(1, GeneratedTestData.generatedDrafts());
    }
  }

  @IsTest
  static void aDayThatCannotBeReadIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = generated();
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
      Test.startTest();
      String refused = GeneratedTestData.refusal(
        request(read, GeneratedSaves.REBUILD)
      );
      Test.stopTest();
      Assert.isTrue(refused.startsWith('Monday could not be read: '), refused);
      Assert.areEqual(0, GeneratedTestData.versions());
    }
  }

  @IsTest
  static void someoneWithoutShoreshCanNeitherReadNorSave() {
    GeneratedWeek.Save request;
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
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
