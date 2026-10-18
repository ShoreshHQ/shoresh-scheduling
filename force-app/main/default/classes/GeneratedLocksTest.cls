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

  private static GeneratedWeek.Locked setLocks(
    Id draftId,
    List<GeneratedWeek.LockChange> changes
  ) {
    return GeneratedScheduleController.setLocks(draftId, changes);
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
      SlotRunsTestData.useBlocks(
        new List<Id>{
          ids.get('Period 1'),
          ids.get('Period 2'),
          ids.get('Lunch')
        }
      );
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
        }
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
  static void aLockCoversTheWholePlacementButNeverAFixedActivity() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = GeneratedTestData.camp();
      Id draftId = GeneratedTestData.generated();
      Test.startTest();
      // A whole day: every cell of every group but Flagpole and Rest.
      GeneratedWeek.Locked day = setLocks(
        draftId,
        new List<GeneratedWeek.LockChange>{
          change(GeneratedWeek.LOCK, GeneratedTestData.MONDAY, null)
        }
      );
      Assert.areEqual(
        new List<String>{ '', '1', '1' },
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
        new List<String>{ '', '1', '1' },
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
  static void aBuildKeepsEveryLockedCellAndTheServerRefusesOneThatDoesNot() {
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
        GeneratedTestData.inputs().days[0].locks
      );
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
        new List<String>{ '', '1', '1' },
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
}
