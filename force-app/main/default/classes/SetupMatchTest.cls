/**
 * "Setup changed since the week started" and "Update to match setup" (SetupMatch), as a scheduler
 * with the Shoresh Scheduler permission set. Synthetic camp (SetTimeTestData): Group A and
 * Group B (Juniors), Group C (Seniors); Period 1 (9:00), Period 2 (10:00), Lunch (12:00); Main
 * runs Monday to Thursday. Week 1's Manual Build starts with Swim in Group A's Monday Period 2.
 */
@IsTest
private class SetupMatchTest {
  private static final Date MONDAY = SetupMatchTestData.MONDAY;
  // The draft the test's edits go to, and the camp's Ids by name.
  private static Id draft;
  private static Map<String, Id> campIds;

  private static Map<String, Id> camp() {
    SetTimeGuard.defer();
    Map<String, Id> ids;
    try {
      ids = SetTimeTestData.camp();
      SetTimeGuard.checkPending();
    } finally {
      SetTimeGuard.resume();
    }
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
    return ids;
  }

  /** Week 1's Manual Build, with Swim in Group A's Monday Period 2. */
  private static Id started(Map<String, Id> ids) {
    campIds = ids;
    draft = ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      )
      .schedule.schedule.id;
    place('Group A', 'Period 2', 'Swim');
    return draft;
  }

  /** An activity placed in a group's Monday time block, as the screen saves it. */
  private static void place(
    String groupName,
    String blockName,
    String activityName
  ) {
    SlotEdits.Result result = ManualBuildController.saveSlots(
      draft,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            MONDAY,
            campIds.get(groupName),
            campIds.get(blockName)
          ),
          new List<String>{ '' },
          new List<String>{ 'A:' + campIds.get(activityName) }
        )
      }
    );
    Assert.isTrue(result.conflicts.isEmpty());
  }

  /** A fixed activity for every group, saved around the clash check. */
  private static Id addFixed(Map<String, Id> ids, String name, String block) {
    FixedActivity__c fixed = SetTimeTestData.fixed(ids, name, block);
    SetTimeGuard.defer();
    try {
      Database.insert(fixed, AccessLevel.SYSTEM_MODE);
    } finally {
      SetTimeGuard.resume();
    }
    return fixed.Id;
  }

  /** The grid's key for a Monday cell, as the dots name it. */
  private static String mondayKey(
    Map<String, Id> ids,
    String grp,
    String block
  ) {
    return String.valueOf(MONDAY) +
      '|' +
      String.valueOf(ids.get(grp)) +
      '|' +
      String.valueOf(ids.get(block));
  }

  private static SetupMatch.Updated makeChanges(
    Id draftId,
    List<String> keys,
    SetupMatch.Preview preview
  ) {
    return SetupMatchController.updateToMatchSetup(
      draftId,
      keys,
      preview.revisions
    );
  }

  private static Integer versionsNamed(Map<String, Id> ids, String name) {
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE
        Program__c = :ids.get('Main')
        AND Status__c = 'Version'
        AND Name = :name
      WITH USER_MODE
    ];
  }

  /** Setup saved around the clash check, as a screen save defers it. */
  private static void saveDeferred(SObject record, Boolean remove) {
    SetTimeGuard.defer();
    try {
      if (remove) {
        Database.delete(record, AccessLevel.SYSTEM_MODE);
      } else {
        Database.update(record, AccessLevel.SYSTEM_MODE);
      }
    } finally {
      SetTimeGuard.resume();
    }
  }

  @IsTest
  static void aWeekAsSetupMakesItShowsNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Test.startTest();
      Integer before = Limits.getQueries();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      // A fixed number of queries, whatever the size of the week (nothing read per day, group
      // or cell), well under the limit of 100.
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(used <= 30, 'Setup changes used ' + used + ' queries');
      Assert.isTrue(preview.changes.isEmpty(), JSON.serialize(preview.changes));
      Assert.isTrue(preview.dots.isEmpty());
      Assert.isNull(preview.problem);
      Assert.isNotNull(preview.revisions);
    }
  }

  @IsTest
  static void aDeletedActivityGetsADotAndUpdateClearsItAfterKeepingAVersion() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Database.delete(ids.get('Swim'), AccessLevel.SYSTEM_MODE);
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Assert.areEqual(1, preview.changes.size(), JSON.serialize(preview));
      SetupMatch.Change change = preview.changes[0];
      Assert.areEqual(MONDAY, change.dateValue);
      Assert.isNull(change.summary);
      Assert.isTrue(change.takesChoices);
      Assert.areEqual(1, change.lines.size());
      SetupMatch.Line line = change.lines[0];
      Assert.areEqual('Group A · Monday · Period 2', line.place);
      Assert.areEqual('Swim', line.before);
      Assert.areEqual('Open', line.after);
      Assert.areEqual('Deleted from setup', line.reason);
      Assert.areEqual(
        new Map<String, String>{
          mondayKey(ids, 'Group A', 'Period 2') => 'Deleted from setup'
        },
        SetupMatchTestData.dotsOf(preview)
      );
      Integer before = Limits.getQueries();
      SetupMatch.Updated updated = makeChanges(
        draftId,
        new List<String>{ change.key },
        preview
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(used <= 60, 'Update to match used ' + used + ' queries');
      Assert.isNull(updated.refused);
      Assert.areEqual(
        '',
        SetupMatchTestData.mondayAt(updated.view, 'Group A', 'Period 2')
      );
      // The way back: the week as it was, Swim and all.
      Assert.areEqual(1, versionsNamed(ids, SetupMatch.BEFORE_UPDATE));
      Assert.isTrue(
        SetupMatchController.getSetupChanges(draftId).changes.isEmpty()
      );
    }
  }

  @IsTest
  static void anActivityClosedThisWeekGetsADotInTheCampsWords() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Database.insert(
        new WeekException__c(
          Week__c = ids.get('Week 1'),
          Activity__c = ids.get('Swim')
        ),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Test.stopTest();
      Assert.areEqual(
        'Not running this week',
        SetupMatchTestData.dotsOf(preview)
          .get(mondayKey(ids, 'Group A', 'Period 2'))
      );
      Assert.areEqual(
        new List<Id>{ ids.get('Swim') },
        preview.closedActivityIds
      );
    }
  }

  @IsTest
  static void aFixedActivityAddedSinceCanBePlacedOneCellAtATime() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Test.startTest();
      addFixed(ids, 'Assembly', 'Period 1');
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      // Three groups on four days, each cell its own change; nothing of the director's goes.
      Assert.areEqual(12, preview.changes.size(), JSON.serialize(preview));
      SetupMatch.Change groupB = SetupMatchTestData.changeAt(
        preview,
        'Group B · Monday · Period 1'
      );
      Assert.isFalse(groupB.takesChoices);
      Assert.areEqual('Open', groupB.lines[0].before);
      Assert.areEqual('Assembly', groupB.lines[0].after);
      Assert.areEqual('Assembly is set up here now', groupB.lines[0].reason);
      Assert.areEqual(
        'Assembly is set up here now',
        SetupMatchTestData.dotsOf(preview)
          .get(mondayKey(ids, 'Group B', 'Period 1'))
      );
      // The same week and setup give the same changes.
      Assert.areEqual(
        SetupMatchTestData.keysOf(preview),
        SetupMatchTestData.keysOf(SetupMatchController.getSetupChanges(draftId))
      );
      SetupMatch.Updated updated = makeChanges(
        draftId,
        new List<String>{ groupB.key },
        preview
      );
      Test.stopTest();
      Assert.isNull(updated.refused);
      Assert.areEqual(
        'Assembly',
        SetupMatchTestData.mondayAt(updated.view, 'Group B', 'Period 1')
      );
      Assert.areEqual(
        '',
        SetupMatchTestData.mondayAt(updated.view, 'Group A', 'Period 1')
      );
      Assert.areEqual(
        'Swim',
        SetupMatchTestData.mondayAt(updated.view, 'Group A', 'Period 2')
      );
      // Nothing of the director's was taken, so no version was kept.
      Assert.areEqual(0, versionsNamed(ids, SetupMatch.BEFORE_UPDATE));
      SetupMatch.Preview after = SetupMatchController.getSetupChanges(draftId);
      Assert.areEqual(11, after.changes.size());
      Assert.isFalse(
        SetupMatchTestData.dotsOf(after)
          .containsKey(mondayKey(ids, 'Group B', 'Period 1'))
      );
    }
  }

  @IsTest
  static void aFixedActivityWhereTheDirectorPlacedSomethingSaysWhatGoes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Test.startTest();
      addFixed(ids, 'Assembly', 'Period 2');
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      SetupMatch.Change change = SetupMatchTestData.changeAt(
        preview,
        'Group A · Monday · Period 2'
      );
      Assert.isTrue(change.takesChoices);
      Assert.areEqual('Swim', change.lines[0].before);
      Assert.areEqual('Assembly', change.lines[0].after);
      Assert.areEqual('Assembly is set up here now', change.lines[0].reason);
      SetupMatch.Updated updated = makeChanges(
        draftId,
        SetupMatchTestData.keysOf(preview),
        preview
      );
      Test.stopTest();
      Assert.isNull(updated.refused);
      Assert.areEqual(
        'Assembly',
        SetupMatchTestData.mondayAt(updated.view, 'Group A', 'Period 2')
      );
      Assert.areEqual(1, versionsNamed(ids, SetupMatch.BEFORE_UPDATE));
    }
  }

  @IsTest
  static void aRenameShowsTheNewNameWithNoDot() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Database.update(
        new List<SObject>{
          new Activity__c(Id = ids.get('Swim'), Name = 'Swimming'),
          new TimeBlock__c(Id = ids.get('Period 2'), Name = 'Second period'),
          new Group__c(Id = ids.get('Group A'), Name = 'Bunk Aleph')
        },
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      ManualBuildViews.DraftView view = ManualBuildController.getDraft(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Test.stopTest();
      Assert.isTrue(preview.changes.isEmpty(), JSON.serialize(preview.changes));
      Assert.isTrue(preview.dots.isEmpty());
      Assert.areEqual(
        'Swimming',
        SetupMatchTestData.mondayAt(view, 'Bunk Aleph', 'Second period')
      );
    }
  }

  @IsTest
  static void aTimeBlockAddedIsOneChangeForTheDayAndKeepsWhatFits() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Test.startTest();
      ShoreshTestData.timeBlock(ids.get('Main'), 'Period 3', 11);
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      // One change a day; Monday's keeps Swim, so nothing of the director's goes.
      Assert.areEqual(4, preview.changes.size(), JSON.serialize(preview));
      SetupMatch.Change monday = preview.changes[0];
      Assert.areEqual('Monday: Period 3 added', monday.summary);
      Assert.isTrue(monday.lines.isEmpty());
      Assert.isFalse(monday.takesChoices);
      Assert.isTrue(preview.dots.isEmpty());
      SetupMatch.Updated updated = makeChanges(
        draftId,
        SetupMatchTestData.keysOf(preview),
        preview
      );
      Test.stopTest();
      Assert.isNull(updated.refused);
      Assert.areEqual(4, updated.view.schedule.days[0].blocks.size());
      Assert.areEqual(
        'Swim',
        SetupMatchTestData.mondayAt(updated.view, 'Group A', 'Period 2')
      );
      Assert.areEqual(
        '',
        SetupMatchTestData.mondayAt(updated.view, 'Group A', 'Period 3')
      );
      Assert.isTrue(
        SetupMatchController.getSetupChanges(draftId).changes.isEmpty()
      );
    }
  }

  @IsTest
  static void aGroupAwayThisWeekIsOneChangeForTheDayNamingWhatGoes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Database.insert(
        new WeekException__c(
          Week__c = ids.get('Week 1'),
          Group__c = ids.get('Group A')
        ),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      SetupMatch.Change monday = preview.changes[0];
      Assert.areEqual('Monday: Group A not at camp this week', monday.summary);
      Assert.isTrue(monday.takesChoices);
      Assert.areEqual(1, monday.lines.size(), JSON.serialize(monday));
      Assert.areEqual('Group A · Monday · Period 2', monday.lines[0].place);
      Assert.areEqual('Swim', monday.lines[0].before);
      Assert.areEqual('Open', monday.lines[0].after);
      Assert.areEqual(
        'Not at camp this week',
        SetupMatchTestData.dotsOf(preview)
          .get(mondayKey(ids, 'Group A', 'Period 2'))
      );
      SetupMatch.Updated updated = makeChanges(
        draftId,
        new List<String>{ monday.key },
        preview
      );
      Test.stopTest();
      Assert.isNull(updated.refused);
      Assert.areEqual(2, updated.view.schedule.days[0].groups.size());
      // Only Monday changed: Tuesday still has Group A's row until its change is made.
      Assert.areEqual(3, updated.view.schedule.days[1].groups.size());
    }
  }

  @IsTest
  static void aGroupNowAtCampMorningsOnlyLosesItsAfternoon() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      place('Group B', 'Lunch', 'Soccer');
      Database.update(
        new Group__c(Id = ids.get('Group B'), Availability__c = 'MorningOnly'),
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Test.stopTest();
      Assert.areEqual(
        new Map<String, String>{
          mondayKey(ids, 'Group B', 'Lunch') => 'Not at camp then'
        },
        SetupMatchTestData.dotsOf(preview)
      );
      Assert.areEqual('Soccer', preview.changes[0].lines[0].before);
    }
  }

  @IsTest
  static void aWeekSavedSinceThePreviewIsNotUpdated() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Test.startTest();
      addFixed(ids, 'Assembly', 'Period 1');
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      // Someone saves Monday meanwhile.
      place('Group C', 'Period 2', 'Soccer');
      SetupMatch.Updated updated = makeChanges(
        draftId,
        SetupMatchTestData.keysOf(preview),
        preview
      );
      Test.stopTest();
      Assert.areEqual(SetupMatch.CHANGED_SINCE, updated.refused);
      Assert.isNull(updated.view);
      Assert.areEqual(
        12,
        SetupMatchController.getSetupChanges(draftId).changes.size()
      );
    }
  }

  @IsTest
  static void setupChangedAgainSinceThePreviewIsNotUpdated() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Test.startTest();
      Id assembly = addFixed(ids, 'Assembly', 'Period 1');
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      // The fixed activity moves to Period 2 before the director answers.
      SetTimeGuard.defer();
      try {
        Database.update(
          new FixedActivity__c(
            Id = assembly,
            TimeBlock__c = ids.get('Period 2')
          ),
          AccessLevel.SYSTEM_MODE
        );
      } finally {
        SetTimeGuard.resume();
      }
      SetupMatch.Updated updated = makeChanges(
        draftId,
        new List<String>{ preview.changes[0].key },
        preview
      );
      Test.stopTest();
      Assert.areEqual(SetupMatch.SETUP_CHANGED, updated.refused);
      ManualBuildViews.DraftView view = ManualBuildController.getDraft(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Assert.areEqual(
        '',
        SetupMatchTestData.mondayAt(view, 'Group A', 'Period 1')
      );
      Assert.areEqual(
        'Swim',
        SetupMatchTestData.mondayAt(view, 'Group A', 'Period 2')
      );
    }
  }

  @IsTest
  static void onlyAManualBuildDraftIsCompared() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Id versionId = ManualBuildController.saveVersion(draftId, 'Kept');
      Test.startTest();
      try {
        SetupMatchController.getSetupChanges(versionId);
        Assert.fail('A version is not compared with setup');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('not found'), e.getMessage());
      }
      Test.stopTest();
    }
  }

  @IsTest
  static void aTimeBlockAtNewTimesIsOneChangeForTheDayAndUpdateTakesThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      // Renamed and moved half an hour, in the same order.
      saveDeferred(
        new TimeBlock__c(
          Id = ids.get('Period 2'),
          Name = 'Second period',
          StartTime__c = Time.newInstance(10, 30, 0, 0),
          EndTime__c = Time.newInstance(11, 15, 0, 0)
        ),
        false
      );
      ManualBuildViews.DraftView view = ManualBuildController.getDraft(
        ids.get('Main'),
        ids.get('Week 1')
      );
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      // One change a day, named by the week's name for it; Swim stays where it is.
      Assert.areEqual(4, preview.changes.size(), JSON.serialize(preview));
      SetupMatch.Change monday = SetupMatchTestData.mondayChange(preview);
      Assert.areEqual(
        'Monday: Period 2 now 10:30 AM – 11:15 AM',
        monday.summary
      );
      Assert.isTrue(monday.lines.isEmpty(), JSON.serialize(monday));
      Assert.isFalse(monday.takesChoices);
      Assert.isTrue(preview.dots.isEmpty());
      // Until it is made, the row keeps the week's name with the week's times.
      ScheduleViews.Ref shown = view.schedule.days[0].blocks[1];
      Assert.areEqual('Period 2', shown.name);
      Assert.areEqual('10:00', shown.startTime);
      SetupMatch.Updated updated = makeChanges(
        draftId,
        SetupMatchTestData.keysOf(preview),
        preview
      );
      Test.stopTest();
      Assert.isNull(updated.refused);
      ScheduleViews.Ref now = updated.view.schedule.days[0].blocks[1];
      Assert.areEqual('Second period', now.name);
      Assert.areEqual('10:30', now.startTime);
      Assert.areEqual('11:15', now.endTime);
      Assert.areEqual(
        'Swim',
        SetupMatchTestData.mondayAt(updated.view, 'Group A', 'Second period')
      );
      Assert.isTrue(
        SetupMatchController.getSetupChanges(draftId).changes.isEmpty()
      );
    }
  }

  @IsTest
  static void aGroupNoLongerInTheProgramSaysSo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Database.delete(ids.get('Group A'), AccessLevel.SYSTEM_MODE);
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Test.stopTest();
      SetupMatch.Change monday = SetupMatchTestData.mondayChange(preview);
      Assert.areEqual('Monday: Group A no longer in Main', monday.summary);
      Assert.areEqual('Swim', monday.lines[0].before);
      Assert.areEqual(
        'No longer in Main',
        SetupMatchTestData.dotsOf(preview)
          .get(mondayKey(ids, 'Group A', 'Period 2'))
      );
    }
  }

  @IsTest
  static void aTimeBlockNoLongerSetUpSaysSo() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      saveDeferred(new TimeBlock__c(Id = ids.get('Period 2')), true);
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Test.stopTest();
      SetupMatch.Change monday = SetupMatchTestData.mondayChange(preview);
      Assert.areEqual('Monday: Period 2 no longer set up', monday.summary);
      Assert.isTrue(monday.takesChoices);
      Assert.areEqual(
        'Period 2 is no longer set up',
        SetupMatchTestData.dotsOf(preview)
          .get(mondayKey(ids, 'Group A', 'Period 2'))
      );
    }
  }

  @IsTest
  static void aTimeBlockAddedInsideAPlacementSaysItsPeriodsChanged() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      // Soccer runs Period 2 and Lunch for Group B; a period at 11 goes between them.
      SlotEdits.Result result = ManualBuildController.saveSlots(
        draftId,
        new List<SlotEdits.Edit>{
          SlotRunsTestData.edit(
            SlotRunsTestData.at(
              MONDAY,
              ids.get('Group B'),
              ids.get('Period 2')
            ),
            new List<String>{ '', '' },
            new List<String>{
              'A:' + ids.get('Soccer'),
              '^A:' + ids.get('Soccer')
            }
          )
        }
      );
      Assert.isTrue(result.conflicts.isEmpty());
      Test.startTest();
      ShoreshTestData.timeBlock(ids.get('Main'), 'Period 3', 11);
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Test.stopTest();
      Map<String, String> dots = SetupMatchTestData.dotsOf(preview);
      Assert.areEqual(
        'Its periods changed',
        dots.get(mondayKey(ids, 'Group B', 'Period 2'))
      );
      Assert.areEqual(
        'Its periods changed',
        dots.get(mondayKey(ids, 'Group B', 'Lunch'))
      );
      Assert.isFalse(dots.containsKey(mondayKey(ids, 'Group A', 'Period 2')));
    }
  }

  @IsTest
  static void aFixedActivityEndedSinceIsNotSetUpThereNow() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      // Start places Assembly in every group's Period 1.
      Id assembly = addFixed(ids, 'Assembly', 'Period 1');
      Id draftId = started(ids);
      saveDeferred(new FixedActivity__c(Id = assembly), true);
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Test.stopTest();
      Assert.areEqual(
        'Not set up here now',
        SetupMatchTestData.dotsOf(preview)
          .get(mondayKey(ids, 'Group A', 'Period 1'))
      );
      SetupMatch.Change change = SetupMatchTestData.changeAt(
        preview,
        'Group A · Monday · Period 1'
      );
      Assert.areEqual('Assembly', change.lines[0].before);
      Assert.areEqual('Open', change.lines[0].after);
      Assert.isFalse(change.takesChoices);
    }
  }

  @IsTest
  static void aDayTheProgramNoLongerRunsIsOneChange() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = started(ids);
      Program__c main = new Program__c(Id = ids.get('Main'));
      main.put(SetTimePlan.dayField(Program__c.SObjectType, 'Monday'), false);
      saveDeferred(main, false);
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Test.stopTest();
      SetupMatch.Change monday = SetupMatchTestData.mondayChange(preview);
      Assert.areEqual('Monday: not a day of Main now', monday.summary);
      Assert.isTrue(monday.takesChoices);
      Assert.areEqual(
        'Not a day of Main now',
        SetupMatchTestData.dotsOf(preview)
          .get(mondayKey(ids, 'Group A', 'Period 2'))
      );
    }
  }
}
