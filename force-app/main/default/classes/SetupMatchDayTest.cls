/**
 * One day of "Update to match setup" (SetupMatchDay), through its interface: the draft's day and
 * the day setup makes now go in; the dots, and the changes with their reasons, come out. One
 * group's day of six time blocks, setup held in memory (nothing saved). Where a placement moved:
 * it is paired, in order, with a new placement of the same thing in the same group's day, a
 * placement of several time blocks being one; anything else moved nowhere (SetupMatchMoves).
 */
@IsTest
private class SetupMatchDayTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);
  private static final Id GROUP_ID = fakeId(Group__c.SObjectType, 1);
  private static final ScheduleGrid.Item REST = new ScheduleGrid.Item(
    'R',
    fakeId(RecurringActivity__c.SObjectType, 1),
    'Rest'
  );
  private static final ScheduleGrid.Item SWIM = new ScheduleGrid.Item(
    'A',
    fakeId(Activity__c.SObjectType, 1),
    'Swim'
  );

  private static Id fakeId(Schema.SObjectType type, Integer n) {
    return Id.valueOf(
      type.getDescribe(SObjectDescribeOptions.DEFERRED).getKeyPrefix() +
      String.valueOf(n).leftPad(12, '0')
    );
  }

  private static Id blockId(Integer period) {
    return fakeId(TimeBlock__c.SObjectType, period);
  }

  /** Program Main: one group at camp all day, six time blocks, no activity set up. */
  private static SetupMatchRules rules() {
    GeneratedSetup setup = new GeneratedSetup(
      new Program__c(Name = 'Main'),
      new Week__c(Name = 'Week 1')
    );
    setup.groups = new List<Group__c>{
      new Group__c(Id = GROUP_ID, Name = 'Group A')
    };
    setup.blocks = new List<TimeBlock__c>();
    for (Integer b = 1; b <= 6; b++) {
      setup.blocks.add(new TimeBlock__c(Id = blockId(b), Name = 'Period ' + b));
    }
    setup.exceptions = new List<WeekException__c>();
    return new SetupMatchRules(setup);
  }

  /** The group's day: a token per time block ('' Open, '1' the item, '^' carries on). */
  private static ScheduleGrid day(ScheduleGrid.Item item, List<String> row) {
    ScheduleGrid grid = new ScheduleGrid();
    grid.groups.add(
      new ScheduleGrid.GroupRef(String.valueOf(GROUP_ID), 'Group A')
    );
    for (Integer b = 1; b <= row.size(); b++) {
      grid.blocks.add(
        new ScheduleGrid.Block(String.valueOf(blockId(b)), 'Period ' + b)
      );
    }
    grid.items.add(item);
    grid.rows.add(row);
    return grid;
  }

  private static SetupMatchDay compare(ScheduleGrid was, ScheduleGrid target) {
    return new SetupMatchDay(rules(), MONDAY).compare(was, target);
  }

  /** The day's dots by period ("2" for Period 2). */
  private static Map<String, String> dotsOf(SetupMatchDay compared) {
    Map<String, String> result = new Map<String, String>();
    for (SetupMatch.Dot dot : compared.dots) {
      for (Integer b = 1; b <= 6; b++) {
        if (dot.key.endsWith('|' + blockId(b))) {
          result.put(String.valueOf(b), dot.words);
        }
      }
    }
    return result;
  }

  @IsTest
  static void aPlainMoveNamesWhereItWent() {
    SetupMatchDay compared = compare(
      day(REST, new List<String>{ '', '1', '', '', '', '' }),
      day(REST, new List<String>{ '', '', '', '1', '', '' })
    );
    Assert.areEqual(
      new Map<String, String>{
        '2' => 'Rest moved to Period 4',
        '4' => 'Rest moved to Period 4'
      },
      dotsOf(compared)
    );
    Assert.areEqual(
      String.valueOf(MONDAY) + '|' + GROUP_ID + '|' + blockId(2),
      compared.dots[0].key,
      'The screen key, in the order of the day'
    );
  }

  @IsTest
  static void twiceADayOnlyTheOneThatMovedIsPaired() {
    // Draft: Rest at Period 1 and Period 5; setup now: Period 1 and Period 6.
    SetupMatchDay compared = compare(
      day(REST, new List<String>{ '1', '', '', '', '1', '' }),
      day(REST, new List<String>{ '1', '', '', '', '', '1' })
    );
    Assert.areEqual(
      new Map<String, String>{
        '5' => 'Rest moved to Period 6',
        '6' => 'Rest moved to Period 6'
      },
      dotsOf(compared),
      'Not Period 1, which stayed'
    );
  }

  @IsTest
  static void aSecondPlacementAddedMovedNowhere() {
    // Draft: Rest at Period 1 and Period 5; setup now adds a third at Period 6.
    SetupMatchDay compared = compare(
      day(REST, new List<String>{ '1', '', '', '', '1', '' }),
      day(REST, new List<String>{ '1', '', '', '', '1', '1' })
    );
    Assert.areEqual(
      new Map<String, String>{ '6' => 'Rest goes here' },
      dotsOf(compared),
      'Nothing moved: it goes here'
    );
  }

  @IsTest
  static void aTwoPeriodPlacementMovesAsOne() {
    // Draft: Rest over Period 1 and 2; setup now: over Period 3 and 4.
    SetupMatchDay compared = compare(
      day(REST, new List<String>{ '1', '^', '', '', '', '' }),
      day(REST, new List<String>{ '', '', '1', '^', '', '' })
    );
    Assert.areEqual(
      new Map<String, String>{
        '1' => 'Rest moved to Period 3',
        '2' => 'Rest moved to Period 3',
        '3' => 'Rest moved to Period 3',
        '4' => 'Rest moved to Period 3'
      },
      dotsOf(compared),
      'Every cell of both placements, its second period included'
    );
  }

  @IsTest
  static void aPlacementGoneWithNothingNewMovedNowhere() {
    SetupMatchDay compared = compare(
      day(REST, new List<String>{ '', '1', '', '', '', '' }),
      day(REST, new List<String>{ '', '', '', '', '', '' })
    );
    Assert.areEqual(
      new Map<String, String>{ '2' => 'Rest is no longer set up here' },
      dotsOf(compared)
    );
    Assert.areEqual(
      'Rest is no longer set up here',
      compared.changes[0].lines[0].reason
    );
  }

  @IsTest
  static void aPlacementLeftOutSaysWhyOnItsDotAndItsChange() {
    // Swim is no longer in setup: it is left out of the day now, and both say why.
    SetupMatchDay compared = compare(
      day(SWIM, new List<String>{ '', '1', '', '', '', '' }),
      day(SWIM, new List<String>{ '', '', '', '', '', '' })
    );
    Assert.areEqual(
      new Map<String, String>{ '2' => SetupMatchRules.DELETED },
      dotsOf(compared)
    );
    Assert.areEqual(1, compared.changes.size());
    Assert.areEqual(
      SetupMatchRules.DELETED,
      compared.changes[0].lines[0].reason
    );
    Assert.isTrue(compared.changes[0].takesChoices);
  }

  @IsTest
  static void aDayNoLongerOfTheWeekIsOneChange() {
    SetupMatchDay compared = compare(
      day(SWIM, new List<String>{ '', '1', '', '', '', '' }),
      null
    );
    Assert.areEqual(
      new Map<String, String>{ '2' => 'Not a day of Main now' },
      dotsOf(compared)
    );
    Assert.areEqual(1, compared.changes.size());
    Assert.isTrue(compared.goes());
  }
}
