/**
 * Rainy day (repo docs/adr/0018), as a scheduler with the Shoresh Scheduler permission set: the
 * version kept first ("Before rainy Monday", Auto-saved), the switch saved as one edit with its
 * "Rain plan full" marks, a mark going when its cell changes, Undo taking the marks away, and
 * Restore of the version bringing the day back without them. Synthetic camp (SetTimeTestData):
 * Group A and Group B (Juniors), Group C (Seniors); Period 1, Period 2, Lunch; Soccer is outdoors
 * with Gym games as its rain plan.
 */
@IsTest
private class RainyDayTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  // A whole rainy-day request stays well under the 100-query limit.
  private static final Integer FEW = 40;
  private static Map<String, Id> ids;

  private static void camp() {
    ids = SetTimeTestData.camp();
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
  }

  private static Id startWeek() {
    return ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      )
      .schedule.schedule.id;
  }

  /** One group's Monday Period 2 changed from one slot to another. */
  private static SlotEdits.Edit period2(String grp, String was, String now) {
    return SlotRunsTestData.edit(
      SlotRunsTestData.at(MONDAY, ids.get(grp), ids.get('Period 2')),
      new List<String>{ was },
      new List<String>{ now }
    );
  }

  private static String a(String activity) {
    return 'A:' + ids.get(activity);
  }

  /** A "Rain plan full" mark on a group's Monday Period 2. */
  private static String mark(String grp, String activity) {
    return String.valueOf(ids.get(grp)) +
      '|' +
      String.valueOf(ids.get('Period 2')) +
      '|' +
      String.valueOf(ids.get(activity));
  }

  private static SlotEdits.Edit withRain(
    SlotEdits.Edit edit,
    List<String> cells
  ) {
    SlotEdits.RainDay day = new SlotEdits.RainDay();
    day.day = MONDAY;
    day.cells = cells;
    edit.rain = new List<SlotEdits.RainDay>{ day };
    return edit;
  }

  private static SlotEdits.Result save(Id draftId, SlotEdits.Edit edit) {
    SlotEdits.Result result = ManualBuildController.saveSlots(
      draftId,
      new List<SlotEdits.Edit>{ edit }
    );
    Assert.isTrue(result.conflicts.isEmpty(), 'The edit was a conflict');
    return result;
  }

  /** Soccer in Group A's and Group B's Monday Period 2: a wet morning's outdoor activities. */
  private static Id soccerMorning() {
    Id draftId = startWeek();
    save(draftId, period2('Group A', '', a('Soccer')));
    save(draftId, period2('Group B', '', a('Soccer')));
    return draftId;
  }

  /** What a group's Monday Period 2 holds in a day as the screen gets it. */
  private static String period2Of(ScheduleViews.DayView day, String grp) {
    Integer g = SlotIds.indexOf(groupIdsOf(day), ids.get(grp));
    return SlotRunsTestData.slots(day, g)[1];
  }

  private static List<String> groupIdsOf(ScheduleViews.DayView day) {
    List<String> result = new List<String>();
    for (ScheduleViews.Ref grp : day.groups) {
      result.add(grp.id);
    }
    return result;
  }

  /** The switch, as the screen sends it: Group A to its rain plan, Group B's marked full. */
  private static SlotEdits.Edit switchMonday() {
    return withRain(
      period2('Group A', a('Soccer'), a('Gym games')),
      new List<String>{ mark('Group B', 'Soccer') }
    );
  }

  @IsTest
  static void theVersionIsKeptFirstAsAutoSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      Id draftId = soccerMorning();
      Test.startTest();
      Integer before = Limits.getQueries();
      Id versionId = RainyDayController.keepManualWeek(
        draftId,
        'Before rainy Monday'
      );
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(used <= FEW, 'Keeping the version used ' + used);
      Schedule__c version = [
        SELECT Name, Status__c, Origin__c, VersionReason__c, SourceSchedule__c
        FROM Schedule__c
        WHERE Id = :versionId
        WITH USER_MODE
      ];
      Assert.areEqual('Before rainy Monday', version.Name);
      Assert.areEqual('Version', version.Status__c);
      Assert.areEqual('Manual', version.Origin__c);
      Assert.areEqual('AutoSaved', version.VersionReason__c);
      Assert.areEqual(draftId, version.SourceSchedule__c);
      ScheduleViews.DayView kept = ScheduleViews.open(versionId).days[0];
      Assert.areEqual(a('Soccer'), period2Of(kept, 'Group A'));
    }
  }

  @IsTest
  static void theSwitchSavesItsCellsAndItsMarksAsOneEdit() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      Id draftId = soccerMorning();
      Test.startTest();
      Integer before = Limits.getQueries();
      SlotEdits.Result result = save(draftId, switchMonday());
      Integer used = Limits.getQueries() - before;
      Test.stopTest();
      Assert.isTrue(used <= FEW, 'The rainy day used ' + used + ' queries');
      ScheduleViews.DayView monday = result.schedule.days[0];
      Assert.areEqual(a('Gym games'), period2Of(monday, 'Group A'));
      Assert.areEqual(a('Soccer'), period2Of(monday, 'Group B'));
      Assert.areEqual(
        new List<String>{ mark('Group B', 'Soccer') },
        monday.rainFull
      );
      // Read again as any screen would: the mark is kept with the day.
      Assert.areEqual(
        new List<String>{ mark('Group B', 'Soccer') },
        ScheduleViews.open(draftId).days[0].rainFull
      );
    }
  }

  @IsTest
  static void aMarkGoesWhenItsCellChangesAndStaysWhenAnotherDoes() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      Id draftId = soccerMorning();
      save(draftId, switchMonday());
      Test.startTest();
      // Another cell of the day changes: the mark stays.
      SlotEdits.Result other = save(draftId, period2('Group C', '', a('Swim')));
      // Its own cell changes: the mark goes.
      SlotEdits.Result own = save(
        draftId,
        period2('Group B', a('Soccer'), a('Swim'))
      );
      Test.stopTest();
      Assert.areEqual(
        new List<String>{ mark('Group B', 'Soccer') },
        other.schedule.days[0].rainFull
      );
      Assert.isTrue(own.schedule.days[0].rainFull.isEmpty());
      // Soccer put back by hand later is not marked again.
      SlotEdits.Result back = save(
        draftId,
        period2('Group B', a('Swim'), a('Soccer'))
      );
      Assert.isTrue(back.schedule.days[0].rainFull.isEmpty());
    }
  }

  @IsTest
  static void undoPutsTheCellsBackAndTakesTheMarksAway() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      Id draftId = soccerMorning();
      save(draftId, switchMonday());
      Test.startTest();
      SlotEdits.Result undone = save(
        draftId,
        withRain(
          period2('Group A', a('Gym games'), a('Soccer')),
          new List<String>()
        )
      );
      Test.stopTest();
      ScheduleViews.DayView monday = undone.schedule.days[0];
      Assert.areEqual(a('Soccer'), period2Of(monday, 'Group A'));
      Assert.areEqual(a('Soccer'), period2Of(monday, 'Group B'));
      Assert.isTrue(monday.rainFull.isEmpty());
    }
  }

  @IsTest
  static void aMarkOnACellThatDoesNotHoldItsActivityIsNotKept() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      Id draftId = soccerMorning();
      Test.startTest();
      // A rainy day with only a full cell (no switch) is an edit with no runs.
      SlotEdits.Edit marksOnly = new SlotEdits.Edit();
      marksOnly.runs = new List<SlotEdits.Run>();
      SlotEdits.Result result = save(
        draftId,
        withRain(
          marksOnly,
          new List<String>{
            mark('Group B', 'Soccer'),
            mark('Group C', 'Soccer')
          }
        )
      );
      Test.stopTest();
      // Group C's Period 2 is Open: its mark is dropped.
      Assert.areEqual(
        new List<String>{ mark('Group B', 'Soccer') },
        result.schedule.days[0].rainFull
      );
    }
  }

  @IsTest
  static void aGarbledMarkIsRefusedWithNothingSaved() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      Id draftId = soccerMorning();
      Test.startTest();
      String refusal;
      try {
        ManualBuildController.saveSlots(
          draftId,
          new List<SlotEdits.Edit>{
            withRain(
              period2('Group A', a('Soccer'), a('Gym games')),
              new List<String>{ 'Group B|Period 2|Soccer' }
            )
          }
        );
      } catch (AuraHandledException e) {
        refusal = e.getMessage();
      }
      Test.stopTest();
      Assert.isNotNull(refusal, 'A garbled mark was taken');
      ScheduleViews.DayView monday = ScheduleViews.open(draftId).days[0];
      Assert.areEqual(a('Soccer'), period2Of(monday, 'Group A'));
      Assert.isTrue(monday.rainFull.isEmpty());
    }
  }

  @IsTest
  static void restoringBeforeRainyBringsTheDayBackWithoutMarks() {
    System.runAs(ShoreshTestData.scheduler()) {
      camp();
      Id draftId = soccerMorning();
      Id versionId = RainyDayController.keepManualWeek(
        draftId,
        'Before rainy Monday'
      );
      save(draftId, switchMonday());
      Test.startTest();
      ManualBuildViews.DraftView restored = ManualBuildController.restoreVersion(
        draftId,
        versionId,
        ScheduleDays.stamp(ScheduleDays.read(draftId))
      );
      Test.stopTest();
      ScheduleViews.DayView monday = restored.schedule.days[0];
      Assert.areEqual(a('Soccer'), period2Of(monday, 'Group A'));
      Assert.areEqual(a('Soccer'), period2Of(monday, 'Group B'));
      Assert.isTrue(monday.rainFull.isEmpty());
    }
  }

  @IsTest
  static void onGeneratedTheVersionKeepsItsOriginAndALockKeepsTheMarks() {
    System.runAs(ShoreshTestData.scheduler()) {
      ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      SlotEdits.Edit marksOnly = new SlotEdits.Edit();
      marksOnly.runs = new List<SlotEdits.Run>();
      withRain(marksOnly, new List<String>{ mark('Group A', 'Gym games') });
      GeneratedScheduleController.saveSlots(
        draftId,
        new List<SlotEdits.Edit>{ marksOnly },
        GeneratedDrafts.revisionOf(ScheduleDays.read(draftId))
      );
      Test.startTest();
      Integer before = Limits.getQueries();
      Id versionId = RainyDayController.keepGeneratedWeek(
        draftId,
        'Before rainy Monday'
      );
      Integer used = Limits.getQueries() - before;
      GeneratedWeek.LockChange lock = new GeneratedWeek.LockChange();
      lock.action = GeneratedWeek.LOCK;
      lock.dateValue = MONDAY;
      lock.groupId = ids.get('Group A');
      GeneratedWeek.Locked locked = GeneratedScheduleController.setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{ lock },
        GeneratedDrafts.revisionOf(ScheduleDays.read(draftId))
      );
      Test.stopTest();
      Assert.isTrue(used <= FEW, 'Keeping the version used ' + used);
      Schedule__c version = [
        SELECT Origin__c, VersionReason__c
        FROM Schedule__c
        WHERE Id = :versionId
        WITH USER_MODE
      ];
      Assert.areEqual(GeneratedDrafts.GENERATED, version.Origin__c);
      Assert.areEqual('AutoSaved', version.VersionReason__c);
      Assert.isFalse(locked.conflict);
      Assert.areEqual(
        new List<String>{ mark('Group A', 'Gym games') },
        locked.schedule.days[0].rainFull
      );
    }
  }
}
