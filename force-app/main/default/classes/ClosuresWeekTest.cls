/**
 * CLOSE (docs/protocol/close.md) where it lives only in Apex: a fixed or recurring activity closed
 * for one week (a week exception on it) is not laid down in that week's new grid and still is in
 * its other weeks; a group away that week has no row in it. Synthetic camp (SetTimeTestData):
 * Main runs Monday to Thursday; Group A is away in Week 3 (ShoreshTestData.fullSeason).
 */
@IsTest
private class ClosuresWeekTest {
  // Every item name a new week's grid holds, on any day.
  private static Set<String> namesIn(Id programId, Id weekId) {
    Set<String> names = new Set<String>();
    for (
      ScheduleDaySaves.DaySave day : BlankWeek.build(programId, weekId).days
    ) {
      for (ScheduleGrid.Item item : day.grid.items) {
        names.add(item.name);
      }
    }
    return names;
  }

  private static void saveOffInWeek2(Map<String, Id> ids, SObject row) {
    SetTimeTestData.save(
      new List<SObject>{ row },
      SetTimeTestData.extras(
        new List<RunsIn.WeekOff>{
          SetTimeTestData.weekOff(0, null, ids.get('Week 2'))
        },
        null,
        null
      )
    );
  }

  // CLOSE-4.3
  @IsTest
  static void aFixedActivityOffForAWeekIsNotLaidDownThatWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      saveOffInWeek2(ids, SetTimeTestData.fixed(ids, 'Flagpole', 'Period 1'));
      Test.startTest();
      Assert.isTrue(
        namesIn(ids.get('Main'), ids.get('Week 1')).contains('Flagpole'),
        'Flagpole runs in Week 1'
      );
      Assert.isFalse(
        namesIn(ids.get('Main'), ids.get('Week 2')).contains('Flagpole'),
        'Flagpole is closed in Week 2'
      );
      Test.stopTest();
    }
  }

  // CLOSE-4.3
  @IsTest
  static void aRecurringActivityOffForAWeekIsNotLaidDownThatWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      saveOffInWeek2(ids, SetTimeTestData.recurring(ids, 'Rest', 'Period 1'));
      Test.startTest();
      Assert.isTrue(
        namesIn(ids.get('Main'), ids.get('Week 1')).contains('Rest'),
        'Rest runs in Week 1'
      );
      Assert.isFalse(
        namesIn(ids.get('Main'), ids.get('Week 2')).contains('Rest'),
        'Rest is closed in Week 2'
      );
      Test.stopTest();
    }
  }

  // CLOSE-4.1
  @IsTest
  static void aGroupAwayHasNoRowInANewWeek() {
    System.runAs(ShoreshTestData.scheduler()) {
      Map<String, Id> ids = SetTimeTestData.camp();
      Test.startTest();
      for (String weekName : new List<String>{ 'Week 1', 'Week 3' }) {
        Set<String> groupIds = new Set<String>();
        for (
          ScheduleDaySaves.DaySave day : BlankWeek.build(
              ids.get('Main'),
              ids.get(weekName)
            )
            .days
        ) {
          for (ScheduleGrid.GroupRef grp : day.grid.groups) {
            groupIds.add(grp.id);
          }
        }
        Assert.areEqual(
          weekName == 'Week 1',
          groupIds.contains(ids.get('Group A')),
          'Group A is away in Week 3 only'
        );
        Assert.isTrue(groupIds.contains(ids.get('Group B')), weekName);
      }
      Test.stopTest();
    }
  }
}
