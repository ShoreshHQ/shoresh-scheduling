/**
 * Apply to other weeks (WEEK-6.2): what the grid can't say stays as it is in the target week, and
 * is listed (WeekApplyKeep), and only the same screen's draft changes. Camp: WeekApplyTestData.
 */
@IsTest
private class WeekApplyKeepTest {
  // WEEK-6.2: a date a special day replaces, in either week, stays as it is and is listed:
  // nothing is copied from or into a grid the special day hides.
  @IsTest
  static void aSpecialDayInEitherWeekStaysAndIsListed() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      SpecialDay__c colorWar = new SpecialDay__c(
        Season__c = WeekApplyTestData.ids.get('Season'),
        Name = 'Color War'
      );
      Database.insert(colorWar, AccessLevel.SYSTEM_MODE);
      Database.insert(
        new List<SpecialDate__c>{
          new SpecialDate__c(
            Season__c = WeekApplyTestData.ids.get('Season'),
            SpecialDay__c = colorWar.Id,
            Week__c = WeekApplyTestData.ids.get('Week 1'),
            Day__c = 'Tuesday'
          ),
          new SpecialDate__c(
            Season__c = WeekApplyTestData.ids.get('Season'),
            SpecialDay__c = colorWar.Id,
            Week__c = WeekApplyTestData.ids.get('Week 2'),
            Day__c = 'Wednesday'
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      for (Integer d = 0; d < 3; d++) {
        WeekApplyTestData.put(
          source,
          WeekApplyTestData.W1 + d,
          new List<String>{ 'Swim', 'Group A', 'Period 2' }
        );
      }
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2 + 2,
        new List<String>{ 'Soccer', 'Group A', 'Period 2' }
      );
      Test.startTest();
      WeekApply.Outcome done = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      List<String> cell = new List<String>{ 'Group A', 'Period 2' };
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(target, WeekApplyTestData.W2, cell)
      );
      Assert.areEqual(
        '',
        WeekApplyTestData.slot(target, WeekApplyTestData.W2 + 1, cell),
        'Not from a hidden grid'
      );
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(target, WeekApplyTestData.W2 + 2, cell),
        'Not into one'
      );
      Assert.isTrue(
        done.leftOut.contains('Day 2: Color War stays') &&
        done.leftOut.contains('Day 3: Color War stays'),
        String.join(done.leftOut, '; ')
      );
    }
  }

  // WEEK-6.2: a day switched to its rain plan, in either week, stays as it is and is listed.
  @IsTest
  static void aRainyDayInEitherWeekStaysAndIsListed() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      for (Integer d = 0; d < 3; d++) {
        WeekApplyTestData.put(
          source,
          WeekApplyTestData.W1 + d,
          new List<String>{ 'Swim', 'Group A', 'Period 2' }
        );
      }
      WeekApplyTestData.rainOn(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2 + 1,
        new List<String>{ 'Soccer', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.rainOn(
        target,
        WeekApplyTestData.W2 + 1,
        new List<String>{ 'Soccer', 'Group A', 'Period 2' }
      );
      Test.startTest();
      WeekApply.Outcome done = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      List<String> cell = new List<String>{ 'Group A', 'Period 2' };
      Assert.areEqual(
        '',
        WeekApplyTestData.slot(target, WeekApplyTestData.W2, cell),
        'Not copied from rain'
      );
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(target, WeekApplyTestData.W2 + 1, cell),
        'Not over rain'
      );
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(target, WeekApplyTestData.W2 + 2, cell)
      );
      Assert.isTrue(
        done.leftOut.contains('Day 1: rainy day, stays as it is') &&
        done.leftOut.contains('Day 2: rainy day, stays as it is'),
        String.join(done.leftOut, '; ')
      );
    }
  }

  // WEEK-6.2: a group away in either week keeps its row, said once, never refused cell by cell.
  @IsTest
  static void aGroupAwayInEitherWeekKeepsItsRowAndIsListedOnce() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id target = WeekApplyTestData.manualDraft('Week 2');
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group B', 'Period 2' }
      );
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1 + 1,
        new List<String>{ 'Swim', 'Group B', 'Period 2' }
      );
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group C', 'Period 2' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group C', 'Period 1' }
      );
      Database.insert(
        new List<WeekException__c>{
          new WeekException__c(
            Week__c = WeekApplyTestData.ids.get('Week 2'),
            Group__c = WeekApplyTestData.ids.get('Group B')
          ),
          new WeekException__c(
            Week__c = WeekApplyTestData.ids.get('Week 1'),
            Group__c = WeekApplyTestData.ids.get('Group C')
          )
        },
        AccessLevel.SYSTEM_MODE
      );
      Test.startTest();
      WeekApply.Outcome done = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      Assert.areEqual(
        '',
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group B', 'Period 2' }
        )
      );
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group C', 'Period 1' }
        )
      );
      Assert.isTrue(
        done.leftOut.contains('Group B: away this week, stays as it is') &&
        done.leftOut.contains('Group C: away in Week 1, stays as it is'),
        String.join(done.leftOut, '; ')
      );
      for (String line : done.leftOut) {
        Assert.isFalse(line.contains('not at camp'), line);
      }
    }
  }

  // WEEK-6.2: a group or a time block the source week's day lacks: the target's cells there
  // stay, and are listed, never cleared silently.
  @IsTest
  static void aGroupOrTimeBlockTheSourceLacksStaysAndIsListed() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      // Added since Week 1 was started: Week 2's draft has them, Week 1's doesn't.
      WeekApplyTestData.ids.put(
        'Period 3',
        ShoreshTestData.timeBlock(
            WeekApplyTestData.ids.get('Main'),
            'Period 3',
            11
          )
          .Id
      );
      WeekApplyTestData.ids.put(
        'Group D',
        ShoreshTestData.groupIn(WeekApplyTestData.ids.get('Juniors'), 'Group D')
          .Id
      );
      Id target = WeekApplyTestData.manualDraft('Week 2');
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group A', 'Period 3' }
      );
      WeekApplyTestData.put(
        target,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group D', 'Period 1' }
      );
      Test.startTest();
      WeekApply.Outcome done = WeekApplyTestData.applied(source, 'Week 2');
      Test.stopTest();
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group A', 'Period 3' }
        )
      );
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(
          target,
          WeekApplyTestData.W2,
          new List<String>{ 'Group D', 'Period 1' }
        )
      );
      Assert.isTrue(
        done.leftOut.contains(
          'Soccer · Group A · Day 1: Week 1 has no Period 3, stays as it is'
        ) &&
        done.leftOut.contains('Group D · Day 1: not in Week 1, stays as it is'),
        String.join(done.leftOut, '; ')
      );
    }
  }

  // WEEK-6.2: a week with both drafts: only the one on the same screen as the source changes.
  @IsTest
  static void onlyTheSameScreensDraftChanges() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
      Id manualTarget = WeekApplyTestData.manualDraft('Week 2');
      Id generatedTarget = WeekApplyTestData.generatedDraft('Week 2');
      List<String> cell = new List<String>{ 'Group A', 'Period 2' };
      WeekApplyTestData.put(
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Swim', 'Group A', 'Period 2' }
      );
      WeekApplyTestData.put(
        generatedTarget,
        WeekApplyTestData.W2,
        new List<String>{ 'Soccer', 'Group A', 'Period 2' }
      );
      Test.startTest();
      Assert.isTrue(WeekApplyTestData.applied(source, 'Week 2').applied);
      Test.stopTest();
      Assert.areEqual(
        WeekApplyTestData.a('Swim'),
        WeekApplyTestData.slot(manualTarget, WeekApplyTestData.W2, cell)
      );
      Assert.areEqual(
        WeekApplyTestData.a('Soccer'),
        WeekApplyTestData.slot(generatedTarget, WeekApplyTestData.W2, cell)
      );
    }
  }

  // WEEK-6.2: the source week saved between the preview and the apply: refused, nothing changed.
  @IsTest
  static void theSourceWeekSavedSinceThePreviewIsRefused() {
    System.runAs(ShoreshTestData.scheduler()) {
      WeekApplyTestData.camp();
      Id source = WeekApplyTestData.manualDraft('Week 1');
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
        source,
        WeekApplyTestData.W1,
        new List<String>{ 'Soccer', 'Group B', 'Period 2' }
      );
      WeekApply.Outcome done = WeekApplyController.applyToWeek(
        source,
        WeekApplyTestData.ids.get('Week 2'),
        preview.seen
      );
      Test.stopTest();
      Assert.isTrue(done.changedSince);
      Assert.isFalse(done.applied);
      Assert.isTrue(
        WeekApplyTestData.drafts('Week 2', 'Manual').isEmpty(),
        'Nothing made'
      );
    }
  }
}
