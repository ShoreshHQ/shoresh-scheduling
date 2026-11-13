/**
 * Apply to other weeks (WEEK-6.2, ADR 0025 choice 5), as a scheduler with the Shoresh Scheduler
 * permission set. Synthetic camp (SetTimeTestData): Group A and Group B (Juniors), Group C
 * (Seniors); Period 1, Period 2, Lunch; Main runs Monday to Thursday, so Monday is Day 1. Drafts
 * are started and their cells written directly (WeekApplyTestData).
 */
@IsTest
private class WeekApplyTest {
  // WEEK-6.2: shown first, nothing changed, then copied by Day number into a new draft.
  @IsTest
  static void aPreviewChangesNothingThenTheWeekGoesByDayNumberIntoANewDraft() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1 + 2,
        new List<String>{ 'Soccer', 'Group B', 'Period 1' }
      );
      Test.startTest();
      WeekApply.Outcome preview = WeekApplyController.previewApply(
        source,
        WeekApplyTestData.ids.get('Week 2'),
        ScheduleDays.stamp(ScheduleDays.read(source))
      );
      Assert.isTrue(preview.startsDraft);
      Assert.areEqual(2, preview.cellsChanging);
      Assert.isFalse(preview.applied);
      Assert.isTrue(
        WeekApplyTestData.drafts('Week 2', 'Manual').isEmpty(),
        'nothing yet'
      );
      WeekApply.Outcome done = WeekApplyController.applyToWeek(
        source,
        WeekApplyTestData.ids.get('Week 2'),
        preview.seen
      );
      Test.stopTest();
      Assert.isTrue(done.applied);
      Assert.areEqual(2, done.cellsChanging);
      Id target = WeekApplyTestData.drafts('Week 2', 'Manual')[0].Id;
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2 + 2,
          new List<String>{ 'Group B', 'Period 1' }
        )
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
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group B', 'Period 1' }
      );
      Test.startTest();
      WeekApply.Outcome done = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      Assert.areEqual(1, done.cellsChanging, 'Only Soccer comes off');
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
      Assert.areEqual(
        '',
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group B', 'Period 1' }
        )
      );
    }
  }

  // WEEK-6.2, LOCK-4.3: a locked cell is never overwritten, and each kept is listed.
  @IsTest
  static void aLockedCellIsKeptAndListedAndWhatCantGoThereIsListed() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.generatedDraft('Week 1');
      Id target = WeekApplyTestData.generatedDraft('Week 2');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group B', 'Period 2' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group A', 'Period 2', 'lock' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ null, 'Group B', 'Period 2', 'lock' }
      );
      Test.startTest();
      WeekApply.Outcome done = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      Assert.isFalse(done.applied, 'Both cells are locked: nothing changes');
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
      Assert.areEqual(
        '',
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group B', 'Period 2' }
        )
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

  // WEEK-6.2, LOCK-1.1: on Generated what it fills is locked, as a hand edit's is (the source's
  // own lock doesn't come along); an Open cell isn't; applying again keeps it and lists it.
  @IsTest
  static void whatItFillsOnGeneratedIsLockedSoApplyingAgainKeepsIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.generatedDraft('Week 1');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      Test.startTest();
      Assert.isTrue(WeekApplyTestData.applied(source, 'Week 2').applied);
      Id target = WeekApplyTestData.drafts('Week 2', 'Generated')[0].Id;
      Assert.isTrue(
        WeekApplyTestData.isLocked(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        ),
        'What Apply filled is locked'
      );
      Assert.isFalse(
        WeekApplyTestData.isLocked(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group B', 'Period 2' }
        ),
        'An Open cell is not'
      );
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Soccer', 'Group A', 'Period 2' }
      );
      WeekApply.Outcome again = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      Assert.isFalse(again.applied, 'The only cell that differs is locked');
      Assert.isTrue(
        again.keptLocked.contains('Swim · Group A · Day 1 · Period 2'),
        String.join(again.keptLocked, '; ')
      );
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
    }
  }

  // WEEK-6.2, GEN-10.13: Rebuild keeps what Apply filled, as it keeps a hand edit: a build that
  // changes it is refused, and one around it is saved with the cell and its lock kept.
  @IsTest
  static void aRebuildAfterApplyKeepsTheCellsItFilled() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      GeneratedTestData.ids = WeekApplyTestData.ids;
      Id source = WeekApplyTestData.generatedDraft('Week 1');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      Assert.isTrue(WeekApplyTestData.applied(source, 'Week 2').applied);
      Id target = WeekApplyTestData.drafts('Week 2', 'Generated')[0].Id;
      Test.startTest();
      // A Rebuild that puts something else there.
      GeneratedWeek.Save over = rebuildOfWeek2();
      GeneratedTestData.put(
        over.days[0],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_A,
          GeneratedTestData.PERIOD_2
        ),
        'Soccer'
      );
      String refused = GeneratedTestData.refusal(over);
      Assert.isTrue(refused.endsWith('is locked.'), refused);
      // A Rebuild around it.
      GeneratedWeek.Save around = rebuildOfWeek2();
      GeneratedTestData.put(
        around.days[0],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_B,
          GeneratedTestData.PERIOD_2
        ),
        'Soccer'
      );
      Assert.isFalse(GeneratedTestData.save(around).conflict);
      Test.stopTest();
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
      Assert.isTrue(
        WeekApplyTestData.isLocked(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
    }
  }

  /** Week 2's Generated draft as read, sent back as a Rebuild. */
  private static GeneratedWeek.Save rebuildOfWeek2() {
    GeneratedWeek.Save save = GeneratedTestData.request(
      GeneratedScheduleController.getInputs(
        WeekApplyTestData.ids.get('Main'),
        WeekApplyTestData.ids.get('Week 2')
      ),
      GeneratedSaves.REBUILD,
      2
    );
    save.weekId = WeekApplyTestData.ids.get('Week 2');
    return save;
  }

  // WEEK-6.2: the target's draft goes to its Versions first, and Restore brings it back.
  @IsTest
  static void theTargetsDraftIsInItsVersionsAndCanBeRestored() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group A', 'Period 2' }
      );
      Test.startTest();
      Assert.isTrue(WeekApplyTestData.applied(source, 'Week 2').applied);
      Schedule__c kept = [
        SELECT Id, Name, VersionReason__c, SourceSchedule__c, Week__c
        FROM Schedule__c
        WHERE Status__c = 'Version'
        WITH SYSTEM_MODE
      ];
      Assert.areEqual('Before applying Week 1', kept.Name);
      Assert.areEqual(ManualVersions.AUTO_SAVED, kept.VersionReason__c);
      Assert.areEqual(target, kept.SourceSchedule__c);
      Assert.areEqual(WeekApplyTestData.ids.get('Week 2'), kept.Week__c);
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
      ManualVersions.restore(
        target,
        kept.Id,
        ScheduleDays.stamp(ScheduleDays.read(target))
      );
      Test.stopTest();
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
    }
  }

  // WEEK-2.4, WEEK-6.2: a Day the target week doesn't have is listed; a day the source week
  // doesn't have stays as it is in the target, and is listed.
  @IsTest
  static void aDayTheOtherWeekLacksIsListedWithTheReasonNeverDropped() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      // Week 1 ends on the Wednesday: it has no Day 4. Week 2 starts on the Tuesday: no Day 1.
      Database.update(
        new List<Week__c>{
          new Week__c(
            Id = WeekApplyTestData.ids.get('Week 1'),
            EndDate__c = WeekApplyTestData.W1 + 2
          ),
          new Week__c(
            Id = WeekApplyTestData.ids.get('Week 2'),
            StartDate__c = WeekApplyTestData.W2 + 1
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      Id source = WeekApplyTestData.manualDraft('Week 1');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1 + 1,
        new List<String>{ 'Soccer', 'Group A', 'Period 2' }
      );
      Test.startTest();
      WeekApply.Outcome done = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      Assert.isTrue(
        done.leftOut.contains('Day 1: that week has no such day'),
        String.join(done.leftOut, '; ')
      );
      Assert.isTrue(
        done.leftOut.contains('Day 4: stays as it is'),
        String.join(done.leftOut, '; ')
      );
      Id target = WeekApplyTestData.drafts('Week 2', 'Manual')[0].Id;
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2 + 1,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
      Assert.isNull(
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        ),
        'No such day'
      );
    }
  }

  // WEEK-6.2, PUB-4.2: a published week's published schedule stays; only its draft changes.
  @IsTest
  static void aPublishedWeeksPublishedScheduleStaysAsItIs() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group A', 'Period 2' }
      );
      Test.startTest();
      SchedulePublish.Result published = ManualBuildController.publish(
        target,
        ScheduleDays.stamp(ScheduleDays.read(target)),
        null
      );
      WeekApply.Outcome done = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      Assert.isTrue(done.published);
      Assert.isTrue(done.applied);
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(
          published.published.id,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
    }
  }

  // WEEK-6.2: a named-days season doesn't have it.
  @IsTest
  static void aSeasonWithNamedDaysIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Database.update(
        new Season__c(
          Id = WeekApplyTestData.ids.get('Season'),
          NumberedDays__c = false
        ),
        AccessLevel.SYSTEM_MODE
      );
      DayWords.forgetSeasons();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Test.startTest();
      for (Integer call = 0; call < 2; call++) {
        try {
          if (call == 0) {
            WeekApplyController.previewApply(
              source,
              WeekApplyTestData.ids.get('Week 2'),
              null
            );
          } else {
            WeekApplyController.applyToWeek(
              source,
              WeekApplyTestData.ids.get('Week 2'),
              '|'
            );
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
      Assert.isTrue(WeekApplyTestData.drafts('Week 2', 'Manual').isEmpty());
    }
  }

  // WEEK-6.1: saving a week reaches no other week: only this action, and only the week it names.
  @IsTest
  static void nothingElseChangesAnotherWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      Id other = WeekApplyTestData.manualDraft('Week 3');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      Test.startTest();
      Assert.areEqual(
        '',
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        ),
        'Not by saving'
      );
      String sourceBefore = ScheduleDays.stamp(ScheduleDays.read(source));
      String otherBefore = ScheduleDays.stamp(ScheduleDays.read(other));
      Assert.isTrue(WeekApplyTestData.applied(source, 'Week 2').applied);
      Test.stopTest();
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
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
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      Test.startTest();
      WeekApply.Outcome preview = WeekApplyController.previewApply(
        source,
        WeekApplyTestData.ids.get('Week 2'),
        null
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group B', 'Period 2' }
      );
      WeekApply.Outcome done = WeekApplyController.applyToWeek(
        source,
        WeekApplyTestData.ids.get('Week 2'),
        preview.seen
      );
      Assert.isTrue(done.changedSince);
      Assert.isFalse(done.applied);
      Assert.isTrue(
        WeekApplyController.previewApply(
            source,
            WeekApplyTestData.ids.get('Week 2'),
            'old'
          )
          .changedSince,
        'The week on screen is older than the server'
      );
      Test.stopTest();
      Assert.areEqual(
        '',
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 2' }
        )
      );
    }
  }

  // WEEK-6.2: as Start from another week: an elective set goes, a special event doesn't, and a
  // special event already on the other week's day stays.
  @IsTest
  static void anElectiveSetGoesAndASpecialEventIsListedEitherWay() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = WeekApplyTestData.ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      SpecialEvent__c carnival = new SpecialEvent__c(
        Season__c = WeekApplyTestData.ids.get('Season'),
        Name = 'Carnival'
      );
      Database.insert(carnival, AccessLevel.USER_MODE);
      SlotEdits.Edit toSource = SlotRunsTestData.edit(
        SlotRunsTestData.at(
          WeekApplyTestData.W1,
          WeekApplyTestData.ids.get('Group A'),
          WeekApplyTestData.ids.get('Period 1')
        ),
        new List<String>{ '' },
        new List<String>{ 'E:' + chugim.Id }
      );
      SlotEdits.Edit eventToSource = SlotRunsTestData.edit(
        SlotRunsTestData.at(
          WeekApplyTestData.W1,
          WeekApplyTestData.ids.get('Group B'),
          WeekApplyTestData.ids.get('Period 1')
        ),
        new List<String>{ '' },
        new List<String>{ 'S:' + carnival.Id }
      );
      SlotEdits.Edit eventToTarget = SlotRunsTestData.edit(
        SlotRunsTestData.at(
          WeekApplyTestData.W2,
          WeekApplyTestData.ids.get('Group C'),
          WeekApplyTestData.ids.get('Period 1')
        ),
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
      WeekApply.Outcome done = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      Assert.areEqual(
        'E:' + chugim.Id,
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 1' }
        )
      );
      Assert.areEqual(
        '',
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group B', 'Period 1' }
        )
      );
      Assert.areEqual(
        'S:' + carnival.Id,
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group C', 'Period 1' }
        )
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
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group A', 'Period 2' }
      );
      Test.startTest();
      Integer before = Limits.getQueries();
      WeekApply.Outcome preview = WeekApplyController.previewApply(
        source,
        WeekApplyTestData.ids.get('Week 2'),
        null
      );
      Integer previewQueries = Limits.getQueries() - before;
      before = Limits.getQueries();
      WeekApply.Outcome done = WeekApplyController.applyToWeek(
        source,
        WeekApplyTestData.ids.get('Week 2'),
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
