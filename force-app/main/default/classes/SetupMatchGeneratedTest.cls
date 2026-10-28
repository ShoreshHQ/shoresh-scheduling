/**
 * "Setup changed since the week started" and "Update to match setup" on Generated Schedule's
 * draft (SetupMatch; ADR 0010 §56), as a scheduler with the Shoresh Scheduler permission set: the
 * same dots, list and update as Manual Build's, with the draft's locks kept on every cell an
 * update leaves as it was, and a lock going only with the placement it kept. Camp and helpers:
 * GeneratedTestData (Main runs Monday to Thursday; Group A, Group B, Group C; Period 1 with
 * Flagpole, Period 2, Lunch with Rest for Group C on Mondays; Gym games in every Period 2).
 */
@IsTest
private class SetupMatchGeneratedTest {
  private static final Date MONDAY = GeneratedTestData.MONDAY;

  /** What the draft's days are saved at now, as a screen that just read them has it. */
  private static String revisionNow(Id draftId) {
    return GeneratedDrafts.revisionOf(ScheduleDays.read(draftId));
  }

  /** Locks every filled cell of Monday (Lock Monday). */
  private static void lockMonday(Id draftId) {
    GeneratedWeek.LockChange change = new GeneratedWeek.LockChange();
    change.action = GeneratedWeek.LOCK;
    change.dateValue = MONDAY;
    GeneratedScheduleController.setLocks(
      draftId,
      new List<GeneratedWeek.LockChange>{ change },
      revisionNow(draftId)
    );
  }

  /**
   * The generated week with Swim in Group A's Monday Lunch too, as the engine would place it: the
   * week, Swim and the locks are set in few requests, so the setup and the two answers measured
   * fit in one test's queries.
   */
  private static Id generatedWithSwim() {
    GeneratedWeek.Save request = GeneratedTestData.filled(
      GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE,
        1
      ),
      'Gym games'
    );
    GeneratedTestData.put(
      request.days[0],
      GeneratedTestData.at(GeneratedTestData.GROUP_A, GeneratedTestData.LUNCH),
      'Swim'
    );
    return GeneratedTestData.save(request).scheduleId;
  }

  /** Lock Monday (every filled cell), and one Open Monday cell locked too (kept empty). */
  private static void lockMondayAndCell(Id draftId, Id groupId, Id blockId) {
    GeneratedWeek.LockChange wholeDay = new GeneratedWeek.LockChange();
    wholeDay.action = GeneratedWeek.LOCK;
    wholeDay.dateValue = MONDAY;
    GeneratedWeek.LockChange cell = new GeneratedWeek.LockChange();
    cell.action = GeneratedWeek.LOCK;
    cell.dateValue = MONDAY;
    cell.groupId = groupId;
    cell.blockId = blockId;
    GeneratedScheduleController.setLocks(
      draftId,
      new List<GeneratedWeek.LockChange>{ wholeDay, cell },
      revisionNow(draftId)
    );
  }

  /** A day's locks for a group, cell by cell ('1' or ''), in a grid. */
  private static List<String> locksOf(ScheduleGrid grid, Id groupId) {
    Integer g = SlotIds.indexOf(grid.groupIds(), groupId);
    List<String> result = new List<String>();
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      result.add(
        ScheduleGridLocks.isLocked(grid, g, b) ? ScheduleGridLocks.LOCKED : ''
      );
    }
    return result;
  }

  private static SetupMatch.Ask ask(List<String> keys, String seenRevisions) {
    SetupMatch.Ask ask = new SetupMatch.Ask();
    ask.keys = keys;
    ask.seenRevisions = seenRevisions;
    ask.versionKept = false;
    return ask;
  }

  @IsTest
  static void aGeneratedWeekAsSetupMakesItShowsNothing() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Test.stopTest();
      Assert.isTrue(preview.changes.isEmpty(), JSON.serialize(preview.changes));
      Assert.isTrue(preview.dots.isEmpty());
      Assert.isNull(preview.problem);
      Assert.areEqual(revisionNow(draftId), preview.revisions);
    }
  }

  // LOCK-5.3
  @IsTest
  static void aDeletedActivityIsShownAndUpdateKeepsEveryOtherLock() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = generatedWithSwim();
      // Monday locked: its Gym games and Group A's Swim in Lunch; Group B's Lunch locked empty.
      // Then Swim is deleted from setup.
      lockMondayAndCell(draftId, ids.get('Group B'), ids.get('Lunch'));
      Database.delete(ids.get('Swim'), AccessLevel.SYSTEM_MODE);
      Test.startTest();
      Integer before = Limits.getQueries();
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Integer read = Limits.getQueries() - before;
      Assert.areEqual(1, preview.changes.size(), JSON.serialize(preview));
      SetupMatch.Change change = preview.changes[0];
      Assert.isTrue(change.takesChoices);
      SetupMatch.Line line = change.lines[0];
      Assert.areEqual('Group A · Monday · Lunch', line.place);
      Assert.areEqual('Swim', line.before);
      Assert.areEqual('Open', line.after);
      Assert.areEqual('Deleted from setup', line.reason);
      before = Limits.getQueries();
      SetupMatch.Updated updated = SetupMatchController.updateToMatchSetup(
        draftId,
        ask(new List<String>{ change.key }, preview.revisions)
      );
      Integer made = Limits.getQueries() - before;
      // A fixed number of queries, well under 100 (Generated reads no view back). Measured
      // 2026-10-20: 15 to show the change (bound 18; Manual Build's is 15 too once cells changed,
      // SetupMatchTest) and 23 to make it (bound 45, as Manual Build's).
      Assert.isTrue(read <= 18, 'Setup changes used ' + read + ' queries');
      Assert.isTrue(made <= 45, 'Update to match used ' + made + ' queries');
      Assert.isNull(updated.refused);
      Assert.isTrue(updated.kept);
      Assert.isNull(updated.view, 'Generated Schedule reads its week again');
      ScheduleGrid monday = ScheduleDays.read(draftId)[0].grid;
      // Swim goes, and its lock with it; Gym games stay locked; the cell kept empty stays so.
      Assert.areEqual(
        '',
        GeneratedTestData.slots(
          draftId,
          GeneratedTestData.at(0, GeneratedTestData.GROUP_A)
        )[
          GeneratedTestData.LUNCH
        ]
      );
      Assert.areEqual(
        new List<String>{ '', '1', '' },
        locksOf(monday, ids.get('Group A'))
      );
      Assert.areEqual(
        new List<String>{ '', '1', '1' },
        locksOf(monday, ids.get('Group B'))
      );
      Assert.areEqual(
        new List<String>{ '', '1', '' },
        locksOf(monday, ids.get('Group C'))
      );
      // The way back keeps the week as it was, Swim's lock too.
      List<Schedule__c> kept = [
        SELECT Id, Origin__c
        FROM Schedule__c
        WHERE Status__c = 'Version' AND Name = :SetupMatch.BEFORE_UPDATE
        WITH USER_MODE
      ];
      Assert.areEqual(1, kept.size());
      Assert.areEqual(GeneratedDrafts.GENERATED, kept[0].Origin__c);
      Assert.areEqual(
        new List<String>{ '', '1', '1' },
        locksOf(ScheduleDays.read(kept[0].Id)[0].grid, ids.get('Group A'))
      );
      Assert.isTrue(
        SetupMatchController.getSetupChanges(draftId).changes.isEmpty()
      );
      Test.stopTest();
    }
  }

  // LOCK-5.3
  @IsTest
  static void aWholeDayChangeKeepsTheLocksOfWhatItCarries() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      lockMonday(draftId);
      Test.startTest();
      Id period3 = ShoreshTestData.timeBlock(ids.get('Main'), 'Period 3', 11)
        .Id;
      SetupMatch.Preview preview = SetupMatchController.getSetupChanges(
        draftId
      );
      Assert.areEqual(4, preview.changes.size(), JSON.serialize(preview));
      Assert.isFalse(SetupMatchTestData.mondayChange(preview).takesChoices);
      SetupMatch.Updated updated = SetupMatchController.updateToMatchSetup(
        draftId,
        ask(SetupMatchTestData.keysOf(preview), preview.revisions)
      );
      Test.stopTest();
      Assert.isNull(updated.refused);
      Assert.isFalse(updated.kept);
      ScheduleGrid monday = ScheduleDays.read(draftId)[0].grid;
      Assert.areEqual(4, monday.blocks.size());
      List<String> groupA = locksOf(monday, ids.get('Group A'));
      Integer p2 = SlotIds.indexOf(monday.blockIds(), ids.get('Period 2'));
      Integer p3 = SlotIds.indexOf(monday.blockIds(), period3);
      Assert.areEqual(ScheduleGridLocks.LOCKED, groupA[p2]);
      Assert.areEqual('', groupA[p3]);
      // Tuesday had no lock and has none.
      Assert.isFalse(
        ScheduleGridLocks.hasAny(ScheduleDays.read(draftId)[1].grid)
      );
    }
  }

  @IsTest
  static void aGeneratedVersionIsNotComparedOrUpdated() {
    System.runAs(ShoreshTestData.scheduler()) {
      GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Id versionId = GeneratedScheduleController.saveVersion(draftId, 'Kept');
      Test.startTest();
      try {
        SetupMatchController.getSetupChanges(versionId);
        Assert.fail('A version is not compared with setup');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('not found'), e.getMessage());
      }
      try {
        SetupMatchController.updateToMatchSetup(
          versionId,
          ask(new List<String>{ 'any' }, '')
        );
        Assert.fail('A version is not updated');
      } catch (AuraHandledException e) {
        Assert.isTrue(e.getMessage().contains('not found'), e.getMessage());
      }
      Test.stopTest();
    }
  }
}
