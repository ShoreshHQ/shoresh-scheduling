/**
 * "Update to match setup" with an elective set given a time (repo ADR 0027; ELECT-7.1), as a
 * scheduler with the Shoresh Scheduler permission set. Synthetic camp (SetupMatchTestData, as
 * SetupMatchTest): Group A and Group B, Period 1 and Period 2, Main on Mondays.
 */
@IsTest
private class SetupMatchSetTimesTest {
  private static final Date MONDAY = SetupMatchTestData.MONDAY;

  /** Week 1's Manual Build, blank. */
  private static Id started(Map<String, Id> ids) {
    return ManualBuildController.startBlankWeek(
        ids.get('Main'),
        ids.get('Week 1')
      )
      .schedule.schedule.id;
  }

  /** Every change the preview lists, made. */
  private static SetupMatch.Updated updateAll(Id draftId) {
    SetupMatch.Preview preview = SetupMatchController.getSetupChanges(draftId);
    SetupMatch.Ask ask = new SetupMatch.Ask();
    ask.keys = new List<String>();
    for (SetupMatch.Change change : preview.changes) {
      ask.keys.add(change.key);
    }
    ask.seenRevisions = preview.revisions;
    ask.versionKept = false;
    return SetupMatchController.updateToMatchSetup(draftId, ask);
  }

  // ELECT-7.1
  @IsTest
  static void aSetGivenATimeIsThereOnceAfterUpdateNeverTwice() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetupMatchTestData.camp();
      Id draftId = started(ids);
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      // By hand in Group B's Monday Period 1; then the set is given its time, Period 2.
      SlotEdits.Result placed = ManualBuildController.saveSlots(
        draftId,
        new List<SlotEdits.Edit>{
          SlotRunsTestData.edit(
            SlotRunsTestData.at(
              MONDAY,
              ids.get('Group B'),
              ids.get('Period 1')
            ),
            new List<String>{ '' },
            new List<String>{ 'E:' + chugim.Id }
          )
        }
      );
      Assert.isTrue(placed.conflicts.isEmpty());
      Database.update(
        new ElectiveSet__c(
          Id = chugim.Id,
          TimeBlock__c = ids.get('Period 2'),
          Monday__c = true
        ),
        AccessLevel.USER_MODE
      );

      Test.startTest();
      SetupMatch.Updated updated = updateAll(draftId);
      Test.stopTest();

      Assert.isNull(updated.refused);
      Assert.areEqual(
        '',
        SetupMatchTestData.mondayAt(updated.view, 'Group B', 'Period 1'),
        'Not carried: the set is at its time now'
      );
      Assert.areEqual(
        'Chugim',
        SetupMatchTestData.mondayAt(updated.view, 'Group B', 'Period 2')
      );
    }
  }

  // ELECT-7.1: a group the set's time leaves out (its slot taken) keeps its own placement.
  @IsTest
  static void aGroupItsSetTimeLeavesOutKeepsTheSetWhereTheDirectorPutIt() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetupMatchTestData.camp();
      Id draftId = started(ids);
      ElectiveSet__c chugim = new ElectiveSet__c(
        Season__c = ids.get('Season'),
        Name = 'Chugim'
      );
      Database.insert(chugim, AccessLevel.USER_MODE);
      SlotEdits.Result placed = ManualBuildController.saveSlots(
        draftId,
        new List<SlotEdits.Edit>{
          SlotRunsTestData.edit(
            SlotRunsTestData.at(
              MONDAY,
              ids.get('Group B'),
              ids.get('Period 1')
            ),
            new List<String>{ '' },
            new List<String>{ 'E:' + chugim.Id }
          )
        }
      );
      Assert.isTrue(placed.conflicts.isEmpty());
      // Group B's Period 2 is taken on Mondays (a recurring activity for Group B only), then
      // the set is given Period 2 on Mondays.
      RecurringActivity__c rest = SetTimeTestData.recurring(
        ids,
        'Rest',
        'Period 2'
      );
      SetTimeGuard.defer();
      try {
        Database.insert(rest, AccessLevel.SYSTEM_MODE);
        Database.insert(
          new Coverage__c(
            RecurringActivity__c = rest.Id,
            Group__c = ids.get('Group B'),
            Season__c = ids.get('Season')
          ),
          AccessLevel.SYSTEM_MODE
        );
      } finally {
        SetTimeGuard.resume();
      }
      Database.update(
        new ElectiveSet__c(
          Id = chugim.Id,
          TimeBlock__c = ids.get('Period 2'),
          Monday__c = true
        ),
        AccessLevel.USER_MODE
      );

      Test.startTest();
      SetupMatch.Updated updated = updateAll(draftId);
      Test.stopTest();

      Assert.isNull(updated.refused);
      Assert.areEqual(
        'Rest',
        SetupMatchTestData.mondayAt(updated.view, 'Group B', 'Period 2')
      );
      Assert.areEqual(
        'Chugim',
        SetupMatchTestData.mondayAt(updated.view, 'Group B', 'Period 1'),
        'Kept: the set\'s time left Group B out'
      );
    }
  }
}
