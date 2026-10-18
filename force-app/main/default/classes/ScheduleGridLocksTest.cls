/**
 * Locks in the compact grid format (version 2, ScheduleGridLocks): stored only when a cell is
 * locked, so an unlocked day keeps version 1's exact text; read back; refused when unclear; and
 * split and joined with their groups when a day takes several parts. Synthetic grids.
 */
@IsTest
private class ScheduleGridLocksTest {
  private static ScheduleGrid day(Integer groupCount) {
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks.add(
      new ScheduleGrid.Block('block-1', 'Period 1').at('09:00', '09:45')
    );
    grid.blocks.add(
      new ScheduleGrid.Block('block-2', 'Period 2').at('10:00', '10:45')
    );
    grid.items.add(new ScheduleGrid.Item('A', 'activity-1', 'Swim'));
    for (Integer g = 0; g < groupCount; g++) {
      grid.groups.add(new ScheduleGrid.GroupRef('group-' + g, 'Bunk ' + g));
      grid.rows.add(new List<String>{ '1', '' });
    }
    return grid;
  }

  private static List<Integer> at(Integer g, Integer b) {
    return new List<Integer>{ g, b };
  }

  @IsTest
  static void aLockedCellIsStoredAsVersionTwoAndReadBack() {
    ScheduleGrid grid = day(2);
    String unlocked = grid.toText();
    ScheduleGridLocks.lock(grid, at(1, 0));
    String text = grid.toText();
    Assert.areEqual(unlocked.removeEnd('}') + ',"l":[",","1,"]}', text);
    Assert.areEqual(2, ScheduleGridLocks.formatOf(grid));
    ScheduleGrid read = ScheduleGrid.fromText(text);
    Assert.isTrue(ScheduleGridLocks.isLocked(read, 1, 0));
    Assert.isFalse(ScheduleGridLocks.isLocked(read, 0, 0));
    Assert.areEqual(text, read.toText());
    // Unlocked again, it is version 1's text exactly: the same day, the same text.
    ScheduleGridLocks.unlock(read, at(1, 0));
    ScheduleGridLocks.tidy(read);
    Assert.areEqual(unlocked, read.toText());
    Assert.areEqual(1, ScheduleGridLocks.formatOf(read));
    Assert.isTrue(read.locks.isEmpty());
  }

  @IsTest
  static void aCellFilledByHandIsLockedAndOneLeftOpenIsNot() {
    ScheduleGrid grid = day(1);
    ScheduleGridLocks.lockIfFilled(grid, at(0, 0));
    ScheduleGridLocks.lockIfFilled(grid, at(0, 1));
    Assert.isTrue(ScheduleGridLocks.isLocked(grid, 0, 0));
    Assert.isFalse(ScheduleGridLocks.isLocked(grid, 0, 1));
    grid.rows[0][0] = '';
    ScheduleGridLocks.lockIfFilled(grid, at(0, 0));
    Assert.isFalse(ScheduleGridLocks.hasAny(grid));
  }

  @IsTest
  static void unclearLocksAreRefused() {
    String unlocked = day(2).toText().removeEnd('}');
    for (
      String locks : new List<String>{
        '"l":["x,","1,"]',
        '"l":["1"]',
        '"l":["1,","1,","1,"]',
        '"l":"1,"'
      }
    ) {
      try {
        ScheduleGrid.fromText(unlocked + ',' + locks + '}');
        Assert.fail('Read ' + locks);
      } catch (ScheduleGridRules.GridException e) {
        Assert.isTrue(e.getMessage().contains('lock'), e.getMessage());
      }
    }
  }

  @IsTest
  static void locksAreSplitAndJoinedWithTheirGroups() {
    ScheduleGrid grid = day(30);
    ScheduleGridLocks.lock(grid, at(0, 0));
    ScheduleGridLocks.lock(grid, at(29, 1));
    ScheduleGrid frame = day(0);
    ScheduleGridParts.partLimit = frame.toText().length() + 200;
    List<String> parts = ScheduleGridParts.split(grid);
    Assert.isTrue(parts.size() > 2, 'split into ' + parts.size());
    // A part with no lock is stored as version 1, without lock rows.
    Assert.isFalse(parts[1].contains('"l"'), parts[1]);
    ScheduleGrid joined = ScheduleGridParts.join(parts);
    Assert.areEqual(grid.toText(), joined.toText());
    Assert.isTrue(ScheduleGridLocks.isLocked(joined, 29, 1));
    Assert.isFalse(ScheduleGridLocks.isLocked(joined, 15, 0));
  }
}
