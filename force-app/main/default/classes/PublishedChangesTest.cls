/**
 * What a director is shown before publishing a week again: the cells that change from the
 * published schedule. Grids are built in memory (no records), so these tests need no camp.
 */
@IsTest
private class PublishedChangesTest {
  private static final Date MONDAY = Date.newInstance(2026, 6, 29);

  /** A day of Group A and Group B, Period 1 to 3, with the given items and rows. */
  private static ScheduleDays.DayGrid day(
    Date onDay,
    List<ScheduleGrid.Item> items,
    List<List<String>> rows
  ) {
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks.add(
      new ScheduleGrid.Block('b1', 'Period 1').at('09:00', '09:45')
    );
    grid.blocks.add(
      new ScheduleGrid.Block('b2', 'Period 2').at('10:00', '10:45')
    );
    grid.blocks.add(
      new ScheduleGrid.Block('b3', 'Period 3').at('11:00', '11:45')
    );
    grid.groups.add(new ScheduleGrid.GroupRef('gA', 'Group A'));
    grid.groups.add(new ScheduleGrid.GroupRef('gB', 'Group B'));
    grid.items.addAll(items);
    grid.rows.addAll(rows);
    ScheduleDays.DayGrid result = new ScheduleDays.DayGrid();
    result.day = onDay;
    result.revision = 1;
    result.grid = grid;
    return result;
  }

  private static List<ScheduleGrid.Item> items() {
    return new List<ScheduleGrid.Item>{
      new ScheduleGrid.Item('A', 'aSwim', 'Swim'),
      new ScheduleGrid.Item('A', 'aGym', 'Gym games'),
      new ScheduleGrid.Item('F', 'fLunch', 'Lunch')
    };
  }

  private static List<String> row(String a, String b, String c) {
    return new List<String>{ a, b, c };
  }

  private static PublishedChanges.Changes between(
    ScheduleDays.DayGrid published,
    ScheduleDays.DayGrid draft
  ) {
    return PublishedChanges.between(
      new List<ScheduleDays.DayGrid>{ published },
      new List<ScheduleDays.DayGrid>{ draft },
      30
    );
  }

  @IsTest
  static void theSameWeekHasNoChanges() {
    List<List<String>> rows = new List<List<String>>{
      row('1', '^', '3'),
      row('', '2', '3')
    };
    PublishedChanges.Changes changes = between(
      day(MONDAY, items(), rows),
      day(MONDAY, items(), rows)
    );
    Assert.areEqual(0, changes.count);
    Assert.isTrue(changes.lines.isEmpty());
  }

  @IsTest
  static void eachChangedCellIsALineInDayGroupAndBlockOrder() {
    PublishedChanges.Changes changes = between(
      day(
        MONDAY,
        items(),
        new List<List<String>>{ row('1', '', '3'), row('', '2', '3') }
      ),
      day(
        MONDAY,
        items(),
        new List<List<String>>{ row('2', '', '3'), row('1', '', '3') }
      )
    );
    Assert.areEqual(
      new List<String>{
        'Group A · Monday · Period 1: Swim → Gym games',
        'Group B · Monday · Period 1: Open → Swim',
        'Group B · Monday · Period 2: Gym games → Open'
      },
      changes.lines
    );
    Assert.areEqual(3, changes.count);
  }

  @IsTest
  static void neighbouringBlocksWithTheSameChangeShareALine() {
    // Swim over Period 1 and 2 (carried on) where both were Open.
    PublishedChanges.Changes changes = between(
      day(
        MONDAY,
        items(),
        new List<List<String>>{ row('', '', '3'), row('', '', '3') }
      ),
      day(
        MONDAY,
        items(),
        new List<List<String>>{ row('1', '^', '3'), row('', '', '3') }
      )
    );
    Assert.areEqual(
      new List<String>{ 'Group A · Monday · Period 1 – Period 2: Open → Swim' },
      changes.lines
    );
    // One line, two cells: the count is of cells (the screen says "2 cells change").
    Assert.areEqual(2, changes.count);
  }

  @IsTest
  static void itemsAreMatchedByRecordNotByTheirPlaceInTheList() {
    // The same placements, with the day's items listed in another order.
    List<ScheduleGrid.Item> reordered = new List<ScheduleGrid.Item>{
      new ScheduleGrid.Item('F', 'fLunch', 'Lunch'),
      new ScheduleGrid.Item('A', 'aSwim', 'Swim')
    };
    PublishedChanges.Changes changes = between(
      day(
        MONDAY,
        items(),
        new List<List<String>>{ row('1', '', '3'), row('', '', '3') }
      ),
      day(
        MONDAY,
        reordered,
        new List<List<String>>{ row('2', '', '1'), row('', '', '1') }
      )
    );
    Assert.areEqual(0, changes.count, String.valueOf(changes.lines));
  }

  @IsTest
  static void anActivityRenamedSinceIsAChangeEvenInCaseOnly() {
    List<ScheduleGrid.Item> renamed = items();
    renamed[0] = new ScheduleGrid.Item('A', 'aSwim', 'swim');
    PublishedChanges.Changes changes = between(
      day(
        MONDAY,
        items(),
        new List<List<String>>{ row('1', '', '3'), row('', '', '3') }
      ),
      day(
        MONDAY,
        renamed,
        new List<List<String>>{ row('1', '', '3'), row('', '', '3') }
      )
    );
    Assert.areEqual(
      new List<String>{ 'Group A · Monday · Period 1: Swim → swim' },
      changes.lines
    );
  }

  @IsTest
  static void aDayOnlyOneSideHasIsOpenOnTheOther() {
    ScheduleDays.DayGrid tuesday = day(
      MONDAY.addDays(1),
      items(),
      new List<List<String>>{ row('1', '', ''), row('', '', '') }
    );
    PublishedChanges.Changes changes = PublishedChanges.between(
      new List<ScheduleDays.DayGrid>(),
      new List<ScheduleDays.DayGrid>{ tuesday },
      30
    );
    Assert.areEqual(
      new List<String>{ 'Group A · Tuesday · Period 1: Open → Swim' },
      changes.lines
    );
    changes = PublishedChanges.between(
      new List<ScheduleDays.DayGrid>{ tuesday },
      new List<ScheduleDays.DayGrid>(),
      30
    );
    Assert.areEqual(
      new List<String>{ 'Group A · Tuesday · Period 1: Swim → Open' },
      changes.lines
    );
  }

  @IsTest
  static void aPublishedDayThatCantBeReadIsSaidOnce() {
    ScheduleDays.DayGrid unreadable = new ScheduleDays.DayGrid();
    unreadable.day = MONDAY;
    unreadable.problem = 'it was saved by a newer version of Shoresh';
    PublishedChanges.Changes changes = between(
      unreadable,
      day(
        MONDAY,
        items(),
        new List<List<String>>{ row('1', '', ''), row('', '', '') }
      )
    );
    Assert.areEqual(
      new List<String>{
        'Monday: the published day could not be read, so all of it is replaced'
      },
      changes.lines
    );
    // Every cell of the day being published: 2 groups × 3 time blocks.
    Assert.areEqual(6, changes.count);
  }

  @IsTest
  static void linesStopAtTheLimitButAllAreCounted() {
    PublishedChanges.Changes changes = PublishedChanges.between(
      new List<ScheduleDays.DayGrid>{
        day(
          MONDAY,
          items(),
          new List<List<String>>{ row('1', '', '1'), row('2', '', '2') }
        )
      },
      new List<ScheduleDays.DayGrid>{
        day(
          MONDAY,
          items(),
          new List<List<String>>{ row('', '', ''), row('', '', '') }
        )
      },
      2
    );
    Assert.areEqual(4, changes.count);
    Assert.areEqual(2, changes.lines.size());
    Assert.areEqual(2, changes.moreLines);
  }

  @IsTest
  static void locksAreNotChanges() {
    ScheduleDays.DayGrid locked = day(
      MONDAY,
      items(),
      new List<List<String>>{ row('1', '', '3'), row('', '', '3') }
    );
    locked.grid.locks.add(row('1', '', ''));
    locked.grid.locks.add(row('', '', ''));
    PublishedChanges.Changes changes = between(
      day(
        MONDAY,
        items(),
        new List<List<String>>{ row('1', '', '3'), row('', '', '3') }
      ),
      locked
    );
    Assert.areEqual(0, changes.count);
  }

  @IsTest
  static void blocksNamedByTheirTimesAreARunOfTimes() {
    // Blocks saved without a name are named by their times (TimeBlockTriggerHandler).
    ScheduleDays.DayGrid published = day(
      MONDAY,
      items(),
      new List<List<String>>{ row('', '', '3'), row('', '', '3') }
    );
    ScheduleDays.DayGrid draft = day(
      MONDAY,
      items(),
      new List<List<String>>{ row('1', '^', '3'), row('', '', '3') }
    );
    for (
      ScheduleDays.DayGrid each : new List<ScheduleDays.DayGrid>{
        published,
        draft
      }
    ) {
      each.grid.blocks[0].name = '9:00 AM – 9:45 AM';
      each.grid.blocks[1].name = '10:00 AM – 10:45 AM';
    }
    Assert.areEqual(
      new List<String>{ 'Group A · Monday · 9:00 AM – 10:45 AM: Open → Swim' },
      between(published, draft).lines
    );
  }

  @IsTest
  static void aRunIsNamedLikeTheRestOfTheApp() {
    ScheduleGrid.Block first = new ScheduleGrid.Block('b1', 'Period 1')
      .at('09:00', '09:45');
    ScheduleGrid.Block timed = new ScheduleGrid.Block(
        'b2',
        '10:00 AM – 10:45 AM'
      )
      .at('10:00', '10:45');
    ScheduleGrid.Block lunch = new ScheduleGrid.Block('b3', 'Lunch')
      .at('12:00', '12:45');
    // One block: its name.
    Assert.areEqual('Period 1', BlockRange.of(first, first));
    Assert.areEqual('10:00 AM – 10:45 AM', BlockRange.of(timed, timed));
    // Named blocks: "first – last", spaced as elsewhere.
    Assert.areEqual('Period 1 – Lunch', BlockRange.of(first, lunch));
    // Either end named by its times: the run's times.
    Assert.areEqual('9:00 AM – 10:45 AM', BlockRange.of(first, timed));
    Assert.areEqual('10:00 AM – 12:45 PM', BlockRange.of(timed, lunch));
  }
}
