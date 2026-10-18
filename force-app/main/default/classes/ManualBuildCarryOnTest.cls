/**
 * Manual Build's slot saves, as a scheduler with the Shoresh Scheduler permission set: clearing an
 * activity someone else has since made longer comes back as a conflict ("keep theirs or use
 * yours"), never an error, and leaves theirs whole. Synthetic camp (SetTimeTestData): Group A and
 * Group B (Juniors), Group C (Seniors); Period 1, Period 2, Lunch; Main runs Monday to Thursday.
 */
@IsTest
private class ManualBuildCarryOnTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  private static Map<String, Id> camp() {
    // The clash check runs once, at the end, as a screen save does (SetTimeGuard).
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

  /** Group B's Monday, from Period 2: what the edit saw and what it makes. */
  private static SlotEdits.Result save(
    Id draftId,
    Map<String, Id> ids,
    List<List<String>> beforeAndAfter
  ) {
    return ManualBuildController.saveSlots(
      draftId,
      new List<SlotEdits.Edit>{
        SlotRunsTestData.edit(
          SlotRunsTestData.at(MONDAY, ids.get('Group B'), ids.get('Period 2')),
          beforeAndAfter[0],
          beforeAndAfter[1]
        )
      }
    );
  }

  @IsTest
  static void clearingWhatSomeoneElseMadeLongerIsAConflictNotAnError() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = camp();
      Id draftId = ManualBuildController.startBlankWeek(
          ids.get('Main'),
          ids.get('Week 1')
        )
        .schedule.schedule.id;
      String soccer = 'A:' + ids.get('Soccer');
      Test.startTest();
      save(
        draftId,
        ids,
        new List<List<String>>{
          new List<String>{ '' },
          new List<String>{ soccer }
        }
      );
      // Someone else makes Soccer run on into Lunch.
      save(
        draftId,
        ids,
        new List<List<String>>{
          new List<String>{ soccer, '' },
          new List<String>{ soccer, '^' + soccer }
        }
      );
      // The director, who saw Soccer in Period 2 only, clears it: Lunch would be left carrying
      // on from nothing. It comes back as a conflict (keep theirs or use yours), not an error.
      SlotEdits.Result late = save(
        draftId,
        ids,
        new List<List<String>>{
          new List<String>{ soccer },
          new List<String>{ '' }
        }
      );
      Test.stopTest();
      Assert.areEqual(new List<Integer>{ 0 }, late.conflicts);
      // Nothing changed: theirs stands, whole.
      ScheduleViews.DayView monday = late.schedule.days[0];
      Integer g = -1;
      for (Integer i = 0; i < monday.groups.size(); i++) {
        if (monday.groups[i].name == 'Group B') {
          g = i;
        }
      }
      List<String> row = monday.rows[g].split(',', -1);
      Assert.areEqual('Soccer', monday.items[Integer.valueOf(row[1]) - 1].name);
      Assert.areEqual('^', row[2]);
    }
  }
}
