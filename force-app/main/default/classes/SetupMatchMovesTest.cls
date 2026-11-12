/**
 * Where "Update to match setup" says a placement moved (SetupMatchMoves), on one group's day of
 * six time blocks: a placement is paired, in order, with a new placement of the same thing in the
 * same group's day, a placement of several time blocks being one; anything else moved nowhere.
 */
@IsTest
private class SetupMatchMovesTest {
  private static final String GROUP_ID = 'groupA';

  /** One group's day: a token per time block ('' Open, '1' Rest, '^' carries on). */
  private static SetupMatchCells day(List<String> row) {
    ScheduleGrid grid = new ScheduleGrid();
    grid.groups.add(new ScheduleGrid.GroupRef(GROUP_ID, 'Group A'));
    for (Integer b = 1; b <= row.size(); b++) {
      grid.blocks.add(new ScheduleGrid.Block('p' + b, 'Period ' + b));
    }
    grid.items.add(new ScheduleGrid.Item('R', 'rest', 'Rest'));
    grid.rows.add(row);
    return new SetupMatchCells(grid);
  }

  private static String cell(Integer period) {
    return SetupMatchCells.cellOf(GROUP_ID, 'p' + period);
  }

  @IsTest
  static void aPlainMoveNamesWhereItWent() {
    SetupMatchMoves moves = new SetupMatchMoves(
      day(new List<String>{ '', '1', '', '', '', '' }),
      day(new List<String>{ '', '', '', '1', '', '' })
    );
    Assert.areEqual(cell(4), moves.movedTo(cell(2)));
    Assert.areEqual(cell(4), moves.movedInto(cell(4)));
    Assert.isNull(moves.movedInto(cell(2)));
  }

  @IsTest
  static void twiceADayOnlyTheOneThatMovedIsPaired() {
    // Draft: Rest at Period 1 and Period 5; setup now: Period 1 and Period 6.
    SetupMatchMoves moves = new SetupMatchMoves(
      day(new List<String>{ '1', '', '', '', '1', '' }),
      day(new List<String>{ '1', '', '', '', '', '1' })
    );
    Assert.areEqual(cell(6), moves.movedTo(cell(5)), 'Not Period 1');
    Assert.isNull(moves.movedTo(cell(1)), 'Period 1 stayed');
    Assert.areEqual(cell(6), moves.movedInto(cell(6)));
    Assert.isNull(moves.movedInto(cell(1)));
  }

  @IsTest
  static void aSecondPlacementAddedMovedNowhere() {
    // Draft: Rest at Period 1 and Period 5; setup now adds a third at Period 6.
    SetupMatchMoves moves = new SetupMatchMoves(
      day(new List<String>{ '1', '', '', '', '1', '' }),
      day(new List<String>{ '1', '', '', '', '1', '1' })
    );
    Assert.isNull(moves.movedInto(cell(6)), 'Nothing moved: it goes here');
    Assert.isNull(moves.movedTo(cell(5)));
    Assert.isNull(moves.movedTo(cell(1)));
  }

  @IsTest
  static void aTwoPeriodPlacementMovesAsOne() {
    // Draft: Rest over Period 1 and 2; setup now: over Period 3 and 4.
    SetupMatchMoves moves = new SetupMatchMoves(
      day(new List<String>{ '1', '^', '', '', '', '' }),
      day(new List<String>{ '', '', '1', '^', '', '' })
    );
    Assert.areEqual(cell(3), moves.movedTo(cell(1)));
    Assert.areEqual(cell(3), moves.movedInto(cell(3)));
    Assert.areEqual(cell(3), moves.movedInto(cell(4)), 'Its second period');
  }

  @IsTest
  static void aPlacementGoneWithNothingNewMovedNowhere() {
    SetupMatchMoves moves = new SetupMatchMoves(
      day(new List<String>{ '', '1', '', '', '', '' }),
      day(new List<String>{ '', '', '', '', '', '' })
    );
    Assert.isNull(moves.movedTo(cell(2)));
  }
}
