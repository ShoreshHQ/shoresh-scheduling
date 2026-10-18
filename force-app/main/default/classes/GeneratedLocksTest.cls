/**
 * Locks on Generated Schedule (ADR 0010 G4), as a scheduler with the Shoresh Scheduler
 * permission set: a hand edit locks what it fills; Lock and Unlock a cell (its whole placement),
 * a day or a group, never a fixed or recurring activity; Rebuild, Try another and Fill the open
 * cells keep every locked cell, and the server refuses a build that changes one; Start over
 * clears the locks after keeping a version that has them. Camp and helpers: GeneratedTestData
 * (Main runs Monday to Thursday; Group A, Group B, Group C; Period 1 with Flagpole, Period 2,
 * Lunch with Rest for Group C on Mondays).
 */
@IsTest
private class GeneratedLocksTest {
  // One day and group's locks, as stored.
  private static final List<String> NONE = new List<String>{ '', '', '' };
  private static final List<String> PERIOD_2 = new List<String>{ '', '1', '' };

  private static GeneratedWeek.LockChange change(
    String action,
    Date day,
    String groupId
  ) {
    GeneratedWeek.LockChange change = new GeneratedWeek.LockChange();
    change.action = action;
    change.dateValue = day;
    change.groupId = groupId;
    return change;
  }

  private static GeneratedWeek.LockChange cell(
    Date day,
    String groupId,
    String blockId
  ) {
    GeneratedWeek.LockChange change = change(GeneratedWeek.LOCK, day, groupId);
    change.blockId = blockId;
    return change;
  }

  /** What the draft's days are saved at now, as a screen that just read them has it. */
  private static String revisionNow(Id draftId) {
    return GeneratedDrafts.revisionOf(ScheduleDays.read(draftId));
  }

  /** A lock change from a screen that has the week as it is now. */
  private static GeneratedWeek.Locked setLocks(
    Id draftId,
    List<GeneratedWeek.LockChange> changes
  ) {
    return GeneratedScheduleController.setLocks(
      draftId,
      changes,
      revisionNow(draftId)
    );
  }

  /** One hand edit from a screen that has the week as it is now. */
  private static SlotEdits.Result handEdit(Id draftId, SlotEdits.Edit edit) {
    return GeneratedScheduleController.saveSlots(
      draftId,
      new List<SlotEdits.Edit>{ edit },
      revisionNow(draftId)
    );
  }

  private static void useBlocks(Map<String, Id> ids) {
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
  }

  /** Locked cells of one day and group, as stored ('1' or ''). */
  private static List<String> locks(Id draftId, List<Integer> dayAndGroup) {
    ScheduleGrid grid = ScheduleDays.read(draftId)[dayAndGroup[0]].grid;
    List<String> result = new List<String>();
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      result.add(
        ScheduleGridLocks.isLocked(grid, dayAndGroup[1], b)
          ? ScheduleGridLocks.LOCKED
          : ''
      );
    }
    return result;
  }

  @IsTest
  static void aHandEditLocksWhatItFillsAndUnlocksWhatItLeavesOpen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      useBlocks(ids);
      Test.startTest();
      // Swim by hand in Group A's Monday Lunch; Group B's Period 2 cleared by hand.
      SlotEdits.Result placed = GeneratedScheduleController.saveSlots(
        draftId,
        new List<SlotEdits.Edit>{
          SlotRunsTestData.edit(
            SlotRunsTestData.at(
              GeneratedTestData.MONDAY,
              ids.get('Group A'),
              ids.get('Lunch')
            ),
            new List<String>{ '' },
            new List<String>{ GeneratedTestData.a('Swim') }
          ),
          SlotRunsTestData.edit(
            SlotRunsTestData.at(
              GeneratedTestData.MONDAY,
              ids.get('Group B'),
              ids.get('Period 2')
            ),
            new List<String>{ GeneratedTestData.a('Gym games') },
            new List<String>{ '' }
          )
        },
        revisionNow(draftId)
      );
      Assert.isTrue(placed.conflicts.isEmpty());
      Assert.areEqual(
        new List<String>{ '', '', '1' },
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
      Assert.areEqual(
        NONE,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_B))
      );
      // The answer names what the days are saved at now, for the next whole-week save.
      Assert.areEqual(GeneratedTestData.inputs().revision, placed.revision);
      // The locks reach the screen with the days.
      Assert.areEqual(
        new List<String>{ ',,1', ',,', ',,' },
        placed.schedule.days[0].locks
      );
      Assert.isTrue(placed.schedule.days[1].locks.isEmpty());
    }
  }

  @IsTest
  static void theShortcutsLockFilledCellsButNeverAFixedActivity() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      // A whole day: every filled cell of every group but Flagpole and Rest (Lunch, Open, is not:
      // keeping a cell empty is a Lock on that one cell).
      GeneratedWeek.Locked day = setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.LOCK, GeneratedTestData.MONDAY, null)
        }
      );
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_C))
      );
      Assert.areEqual(
        NONE,
        locks(draftId, GeneratedTestData.at(1, GeneratedTestData.GROUP_A))
      );
      Assert.areEqual(GeneratedTestData.inputs().revision, day.revision);
      // A whole group, every day, then unlocked.
      setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.LOCK, null, ids.get('Group B'))
        }
      );
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(3, GeneratedTestData.GROUP_B))
      );
      setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.UNLOCK, null, ids.get('Group B'))
        }
      );
      Assert.areEqual(
        NONE,
        locks(draftId, GeneratedTestData.at(3, GeneratedTestData.GROUP_B))
      );
    }
  }

  @IsTest
  static void aLockOnOneBlockOfALongerActivityLocksAllOfIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      // Swim two blocks long in Group A's Monday Period 2 and Lunch.
      GeneratedWeek.Save first = GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE,
        1
      );
      GeneratedTestData.put(
        first.days[0],
        GeneratedTestData.at(0, GeneratedTestData.PERIOD_2),
        'Swim'
      );
      GeneratedTestData.setCell(
        first.days[0],
        GeneratedTestData.at(0, GeneratedTestData.LUNCH),
        '^'
      );
      Id draftId = GeneratedTestData.save(first).scheduleId;
      Test.startTest();
      setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          cell(GeneratedTestData.MONDAY, ids.get('Group A'), ids.get('Lunch'))
        }
      );
      Assert.areEqual(
        new List<String>{ '', '1', '1' },
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
    }
  }

  @IsTest
  static void aBuildThatChangesALockedCellIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          cell(
            GeneratedTestData.MONDAY,
            ids.get('Group A'),
            ids.get('Period 2')
          )
        }
      );
      // Try another that changes the locked cell: refused, nothing written.
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      GeneratedWeek.Save over = GeneratedTestData.filled(
        GeneratedTestData.request(read, GeneratedSaves.TRY_ANOTHER, 2),
        'Soccer'
      );
      Assert.areEqual(
        'Group A · Monday · Period 2 is locked.',
        GeneratedTestData.refusal(over)
      );
      Assert.areEqual(read.revision, revisionNow(draftId));
    }
  }

  /** Group A's Monday Period 2 (Gym games) locked. */
  private static Id generatedWithALock(Map<String, Id> ids) {
    Id draftId = GeneratedTestData.generated();
    setLocks(
      draftId,
      new List<GeneratedWeek.LockChange>{
        cell(GeneratedTestData.MONDAY, ids.get('Group A'), ids.get('Period 2'))
      }
    );
    return draftId;
  }

  @IsTest
  static void aBuildAroundALockedCellIsSavedAndKeepsTheLock() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Test.startTest();
      // Locked inside the test's own query limit: setup alone uses much of the first one.
      Id draftId = generatedWithALock(ids);
      GeneratedInputs.Inputs read = GeneratedTestData.inputs();
      // Rebuild around it: saved, and the lock is still there (the server's, not the screen's).
      GeneratedWeek.Save around = GeneratedTestData.request(
        read,
        GeneratedSaves.REBUILD,
        2
      );
      GeneratedTestData.put(
        around.days[0],
        GeneratedTestData.at(
          GeneratedTestData.GROUP_B,
          GeneratedTestData.LUNCH
        ),
        'Soccer'
      );
      Assert.isFalse(GeneratedTestData.save(around).conflict);
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
      // The inputs carry the lock, for the engine to keep.
      Assert.areEqual(
        new List<String>{ ',1,', ',,', ',,' },
        read.days[0].locks
      );
    }
  }

  @IsTest
  static void aStaleScreenNeitherLocksNorGoesOnFromSomeoneElsesSave() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      useBlocks(ids);
      Test.startTest();
      String seen = revisionNow(draftId);
      // Someone else tries another option.
      GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.TRY_ANOTHER,
            2
          ),
          'Soccer'
        )
      );
      GeneratedWeek.Locked locked = GeneratedScheduleController.setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.LOCK, GeneratedTestData.MONDAY, null)
        },
        seen
      );
      Assert.isTrue(locked.conflict);
      Assert.areEqual(ScheduleDaySaves.CHANGED_SINCE, locked.message);
      Assert.areEqual(
        NONE,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
      // A hand edit is still made (slot by slot, as Manual Build's), but gives no revision to
      // build on: the screen reads the week again before a whole-week save.
      SlotEdits.Result edited = GeneratedScheduleController.saveSlots(
        draftId,
        new List<SlotEdits.Edit>{
          SlotRunsTestData.edit(
            SlotRunsTestData.at(
              GeneratedTestData.MONDAY,
              ids.get('Group A'),
              ids.get('Lunch')
            ),
            new List<String>{ '' },
            new List<String>{ GeneratedTestData.a('Swim') }
          )
        },
        seen
      );
      Assert.isTrue(edited.conflicts.isEmpty());
      Assert.isNull(edited.revision);
    }
  }

  @IsTest
  static void aHandEditOverALockItDidNotSeeIsAConflict() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      useBlocks(ids);
      Test.startTest();
      // Locked inside the test's own query limit: setup alone uses much of the first one.
      Id draftId = generatedWithALock(ids);
      SlotEdits.Edit over = SlotRunsTestData.edit(
        SlotRunsTestData.at(
          GeneratedTestData.MONDAY,
          ids.get('Group A'),
          ids.get('Period 2')
        ),
        new List<String>{ GeneratedTestData.a('Gym games') },
        new List<String>{ GeneratedTestData.a('Soccer') }
      );
      Assert.areEqual(
        new List<Integer>{ 0 },
        handEdit(draftId, over).conflicts
      );
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
      // Naming the lock it saw, it is made, and the cell stays locked.
      over.runs[0].locksBefore = new List<String>{ ScheduleGridLocks.LOCKED };
      Assert.isTrue(handEdit(draftId, over).conflicts.isEmpty());
      Assert.areEqual(
        GeneratedTestData.a('Soccer'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
    }
  }

  @IsTest
  static void aHandEditLocksWholePlacementsButNeverAFixedActivity() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      useBlocks(ids);
      Test.startTest();
      // A run over Flagpole (unchanged) and Period 2.
      handEdit(
        draftId,
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            GeneratedTestData.MONDAY,
            ids.get('Group A'),
            ids.get('Period 1')
          ),
          new List<String>{
            'F:' + ids.get('Flagpole'),
            GeneratedTestData.a('Gym games')
          },
          new List<String>{
            'F:' + ids.get('Flagpole'),
            GeneratedTestData.a('Swim')
          }
        )
      );
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
      // Made two blocks long by hand: both are locked.
      SlotEdits.Edit longer = SlotRunsTestData.edit(
        SlotRunsTestData.at(
          GeneratedTestData.MONDAY,
          ids.get('Group A'),
          ids.get('Period 2')
        ),
        new List<String>{ GeneratedTestData.a('Swim'), '' },
        new List<String>{
          GeneratedTestData.a('Swim'),
          '^' + GeneratedTestData.a('Swim')
        }
      );
      longer.runs[0].locksBefore = new List<String>{
        ScheduleGridLocks.LOCKED,
        ''
      };
      Assert.isTrue(handEdit(draftId, longer).conflicts.isEmpty());
      Assert.areEqual(
        new List<String>{ '', '1', '1' },
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
    }
  }

  @IsTest
  static void fillTheOpenCellsLeavesALockedOpenCellOpen() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          cell(GeneratedTestData.MONDAY, ids.get('Group A'), ids.get('Lunch'))
        }
      );
      GeneratedWeek.Save fill = GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.FILL_OPEN,
        1
      );
      GeneratedTestData.put(
        fill.days[0],
        GeneratedTestData.at(0, GeneratedTestData.LUNCH),
        'Swim'
      );
      Assert.areEqual(
        'Group A · Monday · Lunch is locked.',
        GeneratedTestData.refusal(fill)
      );
    }
  }

  @IsTest
  static void unlockOnADayOrAGroupReachesACellLockedEmpty() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      List<String> lunchLocked = new List<String>{
        '',
        '',
        ScheduleGridLocks.LOCKED
      };
      List<List<GeneratedWeek.LockChange>> unlocks = new List<List<GeneratedWeek.LockChange>>{
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.UNLOCK, GeneratedTestData.MONDAY, null)
        },
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.UNLOCK, null, ids.get('Group A'))
        },
        new List<GeneratedWeek.LockChange>{
          change(
            GeneratedWeek.UNLOCK,
            GeneratedTestData.MONDAY,
            ids.get('Group A')
          )
        }
      };
      for (List<GeneratedWeek.LockChange> unlock : unlocks) {
        // Lunch is Open for Group A on Monday: kept empty by a Lock on that one cell.
        setLocks(
          draftId,
          new List<GeneratedWeek.LockChange>{
            cell(GeneratedTestData.MONDAY, ids.get('Group A'), ids.get('Lunch'))
          }
        );
        Assert.areEqual(
          lunchLocked,
          locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
        );
        setLocks(draftId, unlock);
        Assert.areEqual(
          NONE,
          locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
        );
      }
    }
  }

  @IsTest
  static void manualBuildNeverLocksAndGeneratedEditsDoNotReachIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      useBlocks(ids);
      Test.startTest();
      Id manualId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      SlotEdits.Edit edit = SlotRunsTestData.edit(
        SlotRunsTestData.at(
          GeneratedTestData.MONDAY,
          ids.get('Group A'),
          ids.get('Period 2')
        ),
        new List<String>{ '' },
        new List<String>{ GeneratedTestData.a('Swim') }
      );
      ManualBuildController.saveSlots(
        manualId,
        new List<SlotEdits.Edit>{ edit }
      );
      ScheduleDay__c stored = [
        SELECT GridFormatVersion__c, Grid__c
        FROM ScheduleDay__c
        WHERE Schedule__c = :manualId AND Date__c = :GeneratedTestData.MONDAY
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(1, stored.GridFormatVersion__c);
      Assert.isFalse(stored.Grid__c.contains('"l"'));
      String notHere = 'Only this week\'s Generated Schedule can be saved here. Reload the page.';
      try {
        handEdit(manualId, edit);
        Assert.fail('A Generated hand edit reached Manual Build');
      } catch (AuraHandledException e) {
        Assert.areEqual(notHere, e.getMessage());
      }
      try {
        setLocks(
          manualId,
          new List<GeneratedWeek.LockChange>{
            change(GeneratedWeek.LOCK, GeneratedTestData.MONDAY, null)
          }
        );
        Assert.fail('Manual Build was locked');
      } catch (AuraHandledException e) {
        Assert.areEqual(notHere, e.getMessage());
      }
    }
  }

  @IsTest
  static void startOverClearsTheLocksAfterKeepingAVersionThatHasThem() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.LOCK, null, ids.get('Group A'))
        }
      );
      GeneratedWeek.Result result = GeneratedTestData.save(
        GeneratedTestData.filled(
          GeneratedTestData.request(
            GeneratedTestData.inputs(),
            GeneratedSaves.START_OVER,
            3
          ),
          'Soccer'
        )
      );
      Assert.isFalse(result.conflict);
      Assert.areEqual(
        GeneratedTestData.a('Soccer'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
      Assert.areEqual(
        NONE,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
      Assert.areEqual(
        PERIOD_2,
        locks(
          result.versionId,
          GeneratedTestData.at(0, GeneratedTestData.GROUP_A)
        )
      );
      ScheduleDay__c stored = [
        SELECT GridFormatVersion__c
        FROM ScheduleDay__c
        WHERE
          Schedule__c = :result.versionId
          AND Date__c = :GeneratedTestData.MONDAY
        WITH SYSTEM_MODE
      ];
      Assert.areEqual(2, stored.GridFormatVersion__c);
    }
  }

  @IsTest
  static void aLockThatNamesNothingOrNotAGeneratedDraftIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      Schedule__c version = ShoreshTestData.version(
        ids.get('Main'),
        ids.get('Week 1'),
        'Imported from last-summer.xlsx (made up)'
      );
      List<List<GeneratedWeek.LockChange>> unreadable = new List<List<GeneratedWeek.LockChange>>{
        new List<GeneratedWeek.LockChange>(),
        new List<GeneratedWeek.LockChange>{
          change('Pin', GeneratedTestData.MONDAY, null)
        },
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.LOCK, Date.newInstance(2026, 7, 3), null)
        },
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.LOCK, null, ids.get('Swim'))
        },
        // Lock and Unlock are spelled exactly.
        new List<GeneratedWeek.LockChange>{
          change('lock', GeneratedTestData.MONDAY, null)
        },
        // Neither a day nor a group: not one of the shortcuts.
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.LOCK, null, null)
        },
        // A time block alone (every group, every day): not one of the shortcuts.
        new List<GeneratedWeek.LockChange>{
          cell(null, null, ids.get('Period 2'))
        }
      };
      for (List<GeneratedWeek.LockChange> changes : unreadable) {
        try {
          setLocks(draftId, changes);
          Assert.fail('Locked ' + changes);
        } catch (AuraHandledException e) {
          Assert.areEqual(GeneratedTestData.UNREADABLE, e.getMessage());
        }
      }
      try {
        setLocks(
          version.Id,
          new List<GeneratedWeek.LockChange>{
            change(GeneratedWeek.LOCK, GeneratedTestData.MONDAY, null)
          }
        );
        Assert.fail('Locked a version');
      } catch (AuraHandledException e) {
        Assert.areEqual('A saved version can\'t be changed.', e.getMessage());
      }
      Assert.isTrue(GeneratedTestData.inputs().days[0].locks.isEmpty());
    }
  }

  @IsTest
  static void aGroupsDayLocksThatGroupOnThatDayOnly() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      String tuesdayBefore = [
          SELECT Revision__c
          FROM ScheduleDay__c
          WHERE
            Schedule__c = :draftId
            AND Date__c = :GeneratedTestData.MONDAY.addDays(1)
          WITH SYSTEM_MODE
        ]
        .Revision__c.format();
      setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          change(
            GeneratedWeek.LOCK,
            GeneratedTestData.MONDAY,
            ids.get('Group B')
          )
        }
      );
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_B))
      );
      Assert.areEqual(
        NONE,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
      Assert.areEqual(
        NONE,
        locks(draftId, GeneratedTestData.at(1, GeneratedTestData.GROUP_B))
      );
      // Only the day whose locks changed is written again.
      Assert.areEqual(
        tuesdayBefore,
        [
            SELECT Revision__c
            FROM ScheduleDay__c
            WHERE
              Schedule__c = :draftId
              AND Date__c = :GeneratedTestData.MONDAY.addDays(1)
            WITH SYSTEM_MODE
          ]
          .Revision__c.format()
      );
      // A day and a time block with no group isn't one of the shortcuts.
      try {
        setLocks(
          draftId,
          new List<GeneratedWeek.LockChange>{
            cell(GeneratedTestData.MONDAY, null, ids.get('Period 2'))
          }
        );
        Assert.fail('Locked a time block across every group');
      } catch (AuraHandledException e) {
        Assert.areEqual(GeneratedTestData.UNREADABLE, e.getMessage());
      }
    }
  }

  @IsTest
  static void undoAndRedoRestoreTheLocksFromBeforeTheirStep() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      useBlocks(ids);
      Test.startTest();
      SlotEdits.Run at = SlotRunsTestData.at(
        GeneratedTestData.MONDAY,
        ids.get('Group A'),
        ids.get('Period 2')
      );
      // Swim over Gym games by hand: locked.
      handEdit(
        draftId,
        SlotRunsTestData.edit(
          at,
          new List<String>{ GeneratedTestData.a('Gym games') },
          new List<String>{ GeneratedTestData.a('Swim') }
        )
      );
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
      // Undo: Gym games back, and unlocked as it was before the step.
      SlotEdits.Edit undo = SlotRunsTestData.edit(
        SlotRunsTestData.at(
          GeneratedTestData.MONDAY,
          ids.get('Group A'),
          ids.get('Period 2')
        ),
        new List<String>{ GeneratedTestData.a('Swim') },
        new List<String>{ GeneratedTestData.a('Gym games') }
      );
      undo.runs[0].locksBefore = new List<String>{ ScheduleGridLocks.LOCKED };
      undo.runs[0].locksAfter = new List<String>{ '' };
      Assert.isTrue(handEdit(draftId, undo).conflicts.isEmpty());
      Assert.areEqual(
        GeneratedTestData.a('Gym games'),
        GeneratedTestData.slots(draftId, GeneratedTestData.at(0, 0))[
          GeneratedTestData.PERIOD_2
        ]
      );
      Assert.areEqual(
        NONE,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
      // Redo: Swim again, locked as the step left it.
      SlotEdits.Edit redo = SlotRunsTestData.edit(
        SlotRunsTestData.at(
          GeneratedTestData.MONDAY,
          ids.get('Group A'),
          ids.get('Period 2')
        ),
        new List<String>{ GeneratedTestData.a('Gym games') },
        new List<String>{ GeneratedTestData.a('Swim') }
      );
      redo.runs[0].locksAfter = new List<String>{ ScheduleGridLocks.LOCKED };
      handEdit(draftId, redo);
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
    }
  }

  @IsTest
  static void onlyTheCellsAHandEditChangesAreLocked() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      useBlocks(ids);
      Test.startTest();
      // A run over Gym games (unchanged) and an Open Lunch (Swim by hand).
      handEdit(
        draftId,
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            GeneratedTestData.MONDAY,
            ids.get('Group A'),
            ids.get('Period 2')
          ),
          new List<String>{ GeneratedTestData.a('Gym games'), '' },
          new List<String>{
            GeneratedTestData.a('Gym games'),
            GeneratedTestData.a('Swim')
          }
        )
      );
      Assert.areEqual(
        new List<String>{ '', '', '1' },
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
    }
  }

  @IsTest
  static void anActivityMadeShorterByHandIsLockedAsItIsLeft() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      // Generated with Swim two blocks long in Group A's Monday Period 2 and Lunch, unlocked.
      GeneratedWeek.Save first = GeneratedTestData.request(
        GeneratedTestData.inputs(),
        GeneratedSaves.GENERATE,
        1
      );
      GeneratedTestData.put(
        first.days[0],
        GeneratedTestData.at(0, GeneratedTestData.PERIOD_2),
        'Swim'
      );
      GeneratedTestData.setCell(
        first.days[0],
        GeneratedTestData.at(0, GeneratedTestData.LUNCH),
        '^'
      );
      Id draftId = GeneratedTestData.save(first).scheduleId;
      useBlocks(ids);
      Test.startTest();
      handEdit(
        draftId,
        SlotRunsTestData.edit(
          SlotRunsTestData.at(
            GeneratedTestData.MONDAY,
            ids.get('Group A'),
            ids.get('Period 2')
          ),
          new List<String>{
            GeneratedTestData.a('Swim'),
            '^' + GeneratedTestData.a('Swim')
          },
          new List<String>{ GeneratedTestData.a('Swim'), '' }
        )
      );
      // What is left is locked, so a build keeps it short; the cell it gave up is free.
      Assert.areEqual(
        PERIOD_2,
        locks(draftId, GeneratedTestData.at(0, GeneratedTestData.GROUP_A))
      );
    }
  }

  @IsTest
  static void aLockShowsDeletedSinceAsOpeningTheWeekDoes() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      // Monday's saved day names a group that is still in Salesforce but isn't in Main's setup
      // (another program's): "deleted since" for Generated Schedule, which asks the program's
      // setup, though the record itself exists.
      Program__c evenings = ShoreshTestData.program(
        ids.get('Season'),
        'Evenings'
      );
      Group__c stranger = ShoreshTestData.groupIn(
        ShoreshTestData.division(evenings.Id, 'Evening campers').Id,
        'Evening bunk'
      );
      ScheduleDays.DayGrid monday = ScheduleDays.read(draftId)[0];
      monday.grid.groups.add(
        new ScheduleGrid.GroupRef(stranger.Id, 'Evening bunk')
      );
      monday.grid.rows.add(new List<String>{ '', '', '' });
      ScheduleDaySaves.write(
        draftId,
        new List<ScheduleDaySaves.DaySave>{
          new ScheduleDaySaves.DaySave(monday.day, monday.grid, monday.revision)
        }
      );
      Integer last = 3;
      Assert.isTrue(GeneratedTestData.inputs().days[0].groups[last].gone);
      GeneratedWeek.Locked locked = setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          cell(
            GeneratedTestData.MONDAY,
            ids.get('Group A'),
            ids.get('Period 2')
          )
        }
      );
      // The same note after a Lock as on opening the week...
      Assert.isTrue(locked.schedule.days[0].groups[last].gone);
      Assert.isFalse(
        locked.schedule.days[0].groups[GeneratedTestData.GROUP_A].gone
      );
      // ...where the Schedules page, which asks whether the record exists, sees it.
      Assert.isFalse(ScheduleViews.open(draftId).days[0].groups[last].gone);
    }
  }
}
