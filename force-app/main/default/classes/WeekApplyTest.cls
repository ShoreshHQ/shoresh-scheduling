/**
 * Apply to other weeks (WEEK-6.2, ADR 0025 choice 5), as a scheduler with the Shoresh Scheduler
 * permission set. Synthetic camp (SetTimeTestData): Group A and Group B (Juniors), Group C
 * (Seniors); Period 1, Period 2, Lunch; Main runs Monday to Thursday, so Monday is Day 1. Drafts
 * are started and their cells written directly, so each test's queries are the apply's.
 */
@IsTest
private class WeekApplyTest {
  private static final Date W1 = Date.newInstance(2026, 6, 29);
  private static final Date W2 = W1 + 7;

  private static Map<String, Id> ids;

  /** The camp; numbered: its season's days are numbered. */
  private static void camp(Boolean numbered) {
    SetTimeGuard.defer();
    try {
      ids = SetTimeTestData.camp();
      SetTimeGuard.checkPending();
    } finally {
      SetTimeGuard.resume();
    }
    Database.update(
      new Season__c(Id = ids.get('Season'), NumberedDays__c = numbered),
      AccessLevel.SYSTEM_MODE
    );
    DayWords.forgetSeasons();
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
  }

  private static Id manualDraft(String week) {
    return ManualDrafts.startWith(setupOf(week)).draftId;
  }

  private static Id generatedDraft(String week) {
    GeneratedSetup setup = setupOf(week);
    return GeneratedDrafts.startBlank(setup, setup.blankWeek());
  }

  private static GeneratedSetup setupOf(String week) {
    return new GeneratedSetup(ids.get('Main'), ids.get(week));
  }

  /** cell: the activity (or null to leave it), group, time block and 'lock' to lock it: written directly. */
  private static void put(Id draftId, Date day, List<String> cell) {
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == day) {
        List<Integer> at = positions(read.grid, cell[1], cell[2]);
        if (cell[0] != null) {
          read.grid.rows[at[0]][at[1]] = tokenFor(read.grid, cell[0]);
        }
        if (cell.size() > 3) {
          ScheduleGridLocks.lock(read.grid, at);
        }
        ScheduleDaySaves.write(
          draftId,
          new List<ScheduleDaySaves.DaySave>{
            new ScheduleDaySaves.DaySave(read.day, read.grid, read.revision)
          }
        );
      }
    }
  }

  /** The activity's place in the day's list of items, added if it isn't there. */
  private static String tokenFor(ScheduleGrid grid, String activity) {
    String wanted = 'A:' + ids.get(activity);
    for (Integer i = 0; i < grid.items.size(); i++) {
      if (SlotIds.of(grid.items[i]) == wanted) {
        return String.valueOf(i + 1);
      }
    }
    grid.items.add(new ScheduleGrid.Item('A', ids.get(activity), activity));
    return String.valueOf(grid.items.size());
  }

  private static List<Integer> positions(
    ScheduleGrid grid,
    String groupName,
    String block
  ) {
    return new List<Integer>{
      SlotIds.indexOf(grid.groupIds(), ids.get(groupName)),
      SlotIds.indexOf(grid.blockIds(), ids.get(block))
    };
  }

  /** What a cell (group, time block) holds now ('' Open, else 'A:<Id>'); null: no such day. */
  private static String slot(Id draftId, Date day, List<String> cell) {
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == day) {
        List<Integer> at = positions(read.grid, cell[0], cell[1]);
        return SlotIds.ofRow(read.grid, at[0])[at[1]];
      }
    }
    return null;
  }

  private static Boolean isLocked(Id draftId, Date day, List<String> cell) {
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == day) {
        List<Integer> at = positions(read.grid, cell[0], cell[1]);
        return ScheduleGridLocks.isLocked(read.grid, at[0], at[1]);
      }
    }
    return false;
  }

  private static String a(String activity) {
    return 'A:' + ids.get(activity);
  }

  /** The preview, then the apply, as the screen makes them. */
  private static WeekApply.Outcome applied(Id sourceId, String week) {
    WeekApply.Outcome preview = WeekApplyController.previewApply(
      sourceId,
      ids.get(week),
      ScheduleDays.stamp(ScheduleDays.read(sourceId))
    );
    return WeekApplyController.applyToWeek(
      sourceId,
      ids.get(week),
      preview.seen
    );
  }

  private static List<Schedule__c> drafts(String week, String origin) {
    Id weekId = ids.get(week);
    return [
      SELECT Id
      FROM Schedule__c
      WHERE Week__c = :weekId AND Status__c = 'Draft' AND Origin__c = :origin
      WITH SYSTEM_MODE
    ];
  }

  // WEEK-6.2: shown first, nothing changed, then copied by Day number into a new draft.
  @IsTest
  static void aPreviewChangesNothingThenTheWeekGoesByDayNumberIntoANewDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = manualDraft('Week 1');
      put(source, W1, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      put(source, W1 + 2, new List<String>{ 'Soccer', 'Group B', 'Period 1' });
      Test.startTest();
      WeekApply.Outcome preview = WeekApplyController.previewApply(
        source,
        ids.get('Week 2'),
        ScheduleDays.stamp(ScheduleDays.read(source))
      );
      Assert.isTrue(preview.startsDraft);
      Assert.areEqual(2, preview.cellsChanging);
      Assert.isFalse(preview.applied);
      Assert.isTrue(drafts('Week 2', 'Manual').isEmpty(), 'nothing yet');
      WeekApply.Outcome done = WeekApplyController.applyToWeek(
        source,
        ids.get('Week 2'),
        preview.seen
      );
      Test.stopTest();
      Assert.isTrue(done.applied);
      Assert.areEqual(2, done.cellsChanging);
      Id target = drafts('Week 2', 'Manual')[0].Id;
      Assert.areEqual(
        a('Swim'),
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' })
      );
      Assert.areEqual(
        a('Soccer'),
        slot(target, W2 + 2, new List<String>{ 'Group B', 'Period 1' })
      );
      // A new draft has nothing to keep.
      Assert.areEqual(
        0,
        [
          SELECT COUNT()
          FROM Schedule__c
          WHERE Status__c = 'Version'
          WITH SYSTEM_MODE
        ]
      );
    }
  }

  // WEEK-6.2: the grid repeats: a cell the other week has empty or different changes too.
  @IsTest
  static void whatTheOtherWeekDoesntHaveComesOffAndWhatIsAlreadyThereStays() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = manualDraft('Week 1');
      Id target = manualDraft('Week 2');
      put(source, W1, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      put(target, W2, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      put(target, W2, new List<String>{ 'Soccer', 'Group B', 'Period 1' });
      Test.startTest();
      WeekApply.Outcome done = applied(source, 'Week 2');
      Test.stopTest();
      Assert.areEqual(1, done.cellsChanging, 'Only Soccer comes off');
      Assert.areEqual(
        a('Swim'),
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' })
      );
      Assert.areEqual(
        '',
        slot(target, W2, new List<String>{ 'Group B', 'Period 1' })
      );
    }
  }

  // WEEK-6.2, LOCK-4.3: a locked cell is never overwritten, and each kept is listed.
  @IsTest
  static void aLockedCellIsKeptAndListedAndWhatCantGoThereIsListed() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = generatedDraft('Week 1');
      Id target = generatedDraft('Week 2');
      put(source, W1, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      put(source, W1, new List<String>{ 'Swim', 'Group B', 'Period 2' });
      put(
        target,
        W2,
        new List<String>{ 'Soccer', 'Group A', 'Period 2', 'lock' }
      );
      put(target, W2, new List<String>{ null, 'Group B', 'Period 2', 'lock' });
      Test.startTest();
      WeekApply.Outcome done = applied(source, 'Week 2');
      Test.stopTest();
      Assert.isFalse(done.applied, 'Both cells are locked: nothing changes');
      Assert.areEqual(
        a('Soccer'),
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' })
      );
      Assert.areEqual(
        '',
        slot(target, W2, new List<String>{ 'Group B', 'Period 2' })
      );
      Assert.isTrue(
        done.keptLocked.contains('Soccer · Group A · Day 1 · Period 2'),
        String.join(done.keptLocked, '; ')
      );
      Assert.isTrue(
        done.keptLocked.contains('Locked empty · Group B · Day 1 · Period 2'),
        String.join(done.keptLocked, '; ')
      );
      Assert.isTrue(
        done.leftOut.contains('Swim · Group A · Day 1: Soccer is there'),
        String.join(done.leftOut, '; ')
      );
      Assert.isTrue(
        done.leftOut.contains('Swim · Group B · Day 1: locked empty'),
        String.join(done.leftOut, '; ')
      );
    }
  }

  // WEEK-6.2: what it fills on Generated isn't locked, so applying again still reaches it.
  @IsTest
  static void applyingAgainReachesWhatTheLastApplyFilled() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = generatedDraft('Week 1');
      put(
        source,
        W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2', 'lock' }
      );
      Test.startTest();
      Assert.isTrue(applied(source, 'Week 2').applied);
      Id target = drafts('Week 2', 'Generated')[0].Id;
      Assert.isFalse(
        isLocked(target, W2, new List<String>{ 'Group A', 'Period 2' }),
        'A lock on the other week does not come along'
      );
      put(source, W1, new List<String>{ 'Soccer', 'Group A', 'Period 2' });
      Assert.isTrue(applied(source, 'Week 2').applied);
      Test.stopTest();
      Assert.areEqual(
        a('Soccer'),
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' })
      );
    }
  }

  // WEEK-6.2: the target's draft goes to its Versions first, and Restore brings it back.
  @IsTest
  static void theTargetsDraftIsInItsVersionsAndCanBeRestored() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = manualDraft('Week 1');
      Id target = manualDraft('Week 2');
      put(source, W1, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      put(target, W2, new List<String>{ 'Soccer', 'Group A', 'Period 2' });
      Test.startTest();
      Assert.isTrue(applied(source, 'Week 2').applied);
      Schedule__c kept = [
        SELECT Id, Name, VersionReason__c, SourceSchedule__c, Week__c
        FROM Schedule__c
        WHERE Status__c = 'Version'
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Before applying Week 1', kept.Name);
      Assert.areEqual(ManualVersions.AUTO_SAVED, kept.VersionReason__c);
      Assert.areEqual(target, kept.SourceSchedule__c);
      Assert.areEqual(ids.get('Week 2'), kept.Week__c);
      Assert.areEqual(
        a('Swim'),
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' })
      );
      ManualVersions.restore(
        target,
        kept.Id,
        ScheduleDays.stamp(ScheduleDays.read(target))
      );
      Test.stopTest();
      Assert.areEqual(
        a('Soccer'),
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' })
      );
    }
  }

  // WEEK-2.4, WEEK-6.2: a Day the target week doesn't have is listed; a short week keeps its own.
  @IsTest
  static void aDayTheOtherWeekLacksIsListedWithTheReasonNeverDropped() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = manualDraft('Week 1');
      put(source, W1, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      put(source, W1 + 1, new List<String>{ 'Soccer', 'Group A', 'Period 2' });
      // Week 2 starts on the Tuesday: it has no Day 1.
      Database.update(
        new Week__c(Id = ids.get('Week 2'), StartDate__c = W2 + 1),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      WeekApply.Outcome done = applied(source, 'Week 2');
      Test.stopTest();
      Assert.isTrue(
        done.leftOut.contains('Day 1: that week has no such day'),
        String.join(done.leftOut, '; ')
      );
      Id target = drafts('Week 2', 'Manual')[0].Id;
      Assert.areEqual(
        a('Soccer'),
        slot(target, W2 + 1, new List<String>{ 'Group A', 'Period 2' })
      );
      Assert.isNull(
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' }),
        'No such day'
      );
    }
  }

  // WEEK-6.2, PUB-4.2: a published week's published schedule stays; only its draft changes.
  @IsTest
  static void aPublishedWeeksPublishedScheduleStaysAsItIs() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = manualDraft('Week 1');
      Id target = manualDraft('Week 2');
      put(source, W1, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      put(target, W2, new List<String>{ 'Soccer', 'Group A', 'Period 2' });
      Test.startTest();
      SchedulePublish.Result published = ManualBuildController.publish(
        target,
        ScheduleDays.stamp(ScheduleDays.read(target)),
        null
      );
      WeekApply.Outcome done = applied(source, 'Week 2');
      Test.stopTest();
      Assert.isTrue(done.published);
      Assert.isTrue(done.applied);
      Assert.areEqual(
        a('Swim'),
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' })
      );
      Assert.areEqual(
        a('Soccer'),
        slot(
          published.published.id,
          W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
    }
  }

  // WEEK-6.2: a named-days season doesn't have it.
  @IsTest
  static void aSeasonWithNamedDaysIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(false);
      Id source = manualDraft('Week 1');
      Test.startTest();
      for (Integer call = 0; call < 2; call++) {
        try {
          if (call == 0) {
            WeekApplyController.previewApply(source, ids.get('Week 2'), null);
          } else {
            WeekApplyController.applyToWeek(source, ids.get('Week 2'), '|');
          }
          Assert.fail('Expected a refusal');
        } catch (AuraHandledException e) {
          Assert.isTrue(
            e.getMessage().contains('numbered days'),
            e.getMessage()
          );
        }
      }
      Test.stopTest();
      Assert.isTrue(drafts('Week 2', 'Manual').isEmpty());
    }
  }

  // WEEK-6.1: saving a week reaches no other week: only this action, and only the week it names.
  @IsTest
  static void nothingElseChangesAnotherWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = manualDraft('Week 1');
      Id target = manualDraft('Week 2');
      Id other = manualDraft('Week 3');
      put(source, W1, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      Test.startTest();
      Assert.areEqual(
        '',
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' }),
        'Not by saving'
      );
      String sourceBefore = ScheduleDays.stamp(ScheduleDays.read(source));
      String otherBefore = ScheduleDays.stamp(ScheduleDays.read(other));
      Assert.isTrue(applied(source, 'Week 2').applied);
      Test.stopTest();
      Assert.areEqual(
        a('Swim'),
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' })
      );
      Assert.areEqual(
        sourceBefore,
        ScheduleDays.stamp(ScheduleDays.read(source))
      );
      Assert.areEqual(
        otherBefore,
        ScheduleDays.stamp(ScheduleDays.read(other))
      );
    }
  }

  // WEEK-6.2: either week saved since the preview: refused, nothing changed.
  @IsTest
  static void aWeekChangedSinceThePreviewIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = manualDraft('Week 1');
      Id target = manualDraft('Week 2');
      put(source, W1, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      Test.startTest();
      WeekApply.Outcome preview = WeekApplyController.previewApply(
        source,
        ids.get('Week 2'),
        null
      );
      put(target, W2, new List<String>{ 'Soccer', 'Group B', 'Period 2' });
      WeekApply.Outcome done = WeekApplyController.applyToWeek(
        source,
        ids.get('Week 2'),
        preview.seen
      );
      Assert.isTrue(done.changedSince);
      Assert.isFalse(done.applied);
      Assert.isTrue(
        WeekApplyController.previewApply(source, ids.get('Week 2'), 'old')
          .changedSince,
        'The week on screen is older than the server'
      );
      Test.stopTest();
      Assert.areEqual(
        '',
        slot(target, W2, new List<String>{ 'Group A', 'Period 2' })
      );
    }
  }

  // WEEK-6.2: as Start from another week: an elective set goes, a special event doesn't, and a
  // special event already on the other week's day stays.
  @IsTest
  static void anElectiveSetGoesAndASpecialEventIsListedEitherWay() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = manualDraft('Week 1');
      Id target = manualDraft('Week 2');
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      SpecialEvent__c carnival = new SpecialEvent__c(
        Season__c = ids.get('Season'),
        Name = 'Carnival'
      );
      Database.insert(carnival, AccessLevel.USER_MODE);
      SlotEdits.Edit toSource = SlotRunsTestData.edit(
        SlotRunsTestData.at(W1, ids.get('Group A'), ids.get('Period 1')),
        new List<String>{ '' },
        new List<String>{ 'E:' + chugim.Id }
      );
      SlotEdits.Edit eventToSource = SlotRunsTestData.edit(
        SlotRunsTestData.at(W1, ids.get('Group B'), ids.get('Period 1')),
        new List<String>{ '' },
        new List<String>{ 'S:' + carnival.Id }
      );
      SlotEdits.Edit eventToTarget = SlotRunsTestData.edit(
        SlotRunsTestData.at(W2, ids.get('Group C'), ids.get('Period 1')),
        new List<String>{ '' },
        new List<String>{ 'S:' + carnival.Id }
      );
      Test.startTest();
      ManualBuildController.saveSlots(
        source,
        new List<SlotEdits.Edit>{ toSource, eventToSource }
      );
      ManualBuildController.saveSlots(
        target,
        new List<SlotEdits.Edit>{ eventToTarget }
      );
      WeekApply.Outcome done = applied(source, 'Week 2');
      Test.stopTest();
      Assert.areEqual(
        'E:' + chugim.Id,
        slot(target, W2, new List<String>{ 'Group A', 'Period 1' })
      );
      Assert.areEqual(
        '',
        slot(target, W2, new List<String>{ 'Group B', 'Period 1' })
      );
      Assert.areEqual(
        'S:' + carnival.Id,
        slot(target, W2, new List<String>{ 'Group C', 'Period 1' })
      );
      Assert.areEqual(2, done.leftOut.size(), String.join(done.leftOut, '; '));
    }
  }

  // WEEK-6.2: one week's preview and apply each fit a request with room to spare; a season's many
  // weeks don't, so the screen sends one week per call (ADR 0025). Bounds reasoned from the reads,
  // not yet measured: lower them to what the test org measures, and never raise them.
  @IsTest
  static void oneWeeksPreviewAndApplyStayWithinTheirBounds() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp(true);
      Id source = manualDraft('Week 1');
      Id target = manualDraft('Week 2');
      put(source, W1, new List<String>{ 'Swim', 'Group A', 'Period 2' });
      put(target, W2, new List<String>{ 'Soccer', 'Group A', 'Period 2' });
      Test.startTest();
      Integer before = Limits.getQueries();
      WeekApply.Outcome preview = WeekApplyController.previewApply(
        source,
        ids.get('Week 2'),
        null
      );
      Integer previewQueries = Limits.getQueries() - before;
      before = Limits.getQueries();
      WeekApply.Outcome done = WeekApplyController.applyToWeek(
        source,
        ids.get('Week 2'),
        preview.seen
      );
      Integer applyQueries = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(done.applied);
      Assert.isTrue(previewQueries <= 25, 'Preview used ' + previewQueries);
      Assert.isTrue(applyQueries <= 45, 'Apply used ' + applyQueries);
    }
  }
}
