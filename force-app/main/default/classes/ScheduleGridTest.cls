/**
 * The compact grid format: what it stores, what it refuses, how big a large camp's day is, and
 * how a day too big for one record is split into parts and joined back.
 */
@IsTest
private class ScheduleGridTest {
  private static ScheduleGrid small() {
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks.add(
      new ScheduleGrid.Block('block-1', 'Period 1').at('09:00', '09:45')
    );
    grid.blocks.add(
      new ScheduleGrid.Block('block-2', 'Period 2').at('10:00', '10:45')
    );
    grid.groups.add(new ScheduleGrid.GroupRef('group-1', 'Bunk 1'));
    grid.groups.add(new ScheduleGrid.GroupRef('group-2', 'Bunk 2'));
    grid.items.add(new ScheduleGrid.Item('A', 'activity-1', 'Swim'));
    grid.items.add(new ScheduleGrid.Item('F', 'fixed-1', 'Flagpole'));
    grid.items.add(new ScheduleGrid.Item('T', '', 'Zoo trip'));
    grid.rows.add(new List<String>{ '1', '^' });
    grid.rows.add(new List<String>{ '2', '' });
    return grid;
  }

  @IsTest
  static void aDayIsStoredAndReadBackUnchanged() {
    String text = small().toText();
    Assert.areEqual(
      '{"b":[["block-1","Period 1","09:00","09:45"],["block-2","Period 2","10:00","10:45"]],' +
        '"g":[["group-1","Bunk 1"],["group-2","Bunk 2"]],' +
        '"i":[["A","activity-1","Swim"],["F","fixed-1","Flagpole"],["T","","Zoo trip"]],' +
        '"r":["1,^","2,"]}',
      text
    );
    ScheduleGrid back = ScheduleGrid.fromText(text);
    Assert.areEqual(text, back.toText(), 'same day, same text');
    Assert.areEqual('Zoo trip', back.items[2].name);
    Assert.areEqual('', back.rows[1][1], 'an empty last cell is kept');
  }

  @IsTest
  static void gridsWithBrokenRowsOrCellsAreRefused() {
    Map<String, ScheduleGrid> broken = new Map<String, ScheduleGrid>();
    ScheduleGrid grid = small();
    grid.rows.remove(1);
    broken.put('a row missing', grid);
    grid = small();
    grid.rows[0].add('1');
    broken.put('a cell too many', grid);
    grid = small();
    grid.rows[1][1] = '4';
    broken.put('an item not in the list', grid);
    grid = small();
    grid.rows[1][1] = 'x';
    broken.put('a cell that is not a number', grid);
    grid = small();
    grid.rows[1][0] = '^';
    broken.put('carrying on in the first block', grid);
    grid = small();
    grid.rows[1][0] = '';
    grid.rows[1][1] = '^';
    broken.put('carrying on from an empty block', grid);
    Assert.areEqual(broken.size(), refusals(broken), 'every one refused');
  }

  @IsTest
  static void gridsWithBrokenNamesKindsOrTimesAreRefused() {
    Map<String, ScheduleGrid> broken = new Map<String, ScheduleGrid>();
    ScheduleGrid grid = small();
    grid.items[0].kind = 'Q';
    broken.put('an unknown kind', grid);
    grid = small();
    grid.items[0].id = '';
    broken.put('an activity pointing at nothing', grid);
    grid = small();
    grid.items[2].name = ' ';
    broken.put('an item with no name', grid);
    grid = small();
    grid.rows[1][1] = '\uFF11';
    broken.put('a digit that is not 0 to 9', grid);
    grid = small();
    grid.blocks[0].startTime = '9';
    broken.put('a time that is not HH:mm', grid);
    grid = small();
    grid.groups[1].id = '';
    broken.put('a group pointing at nothing', grid);
    grid = small();
    grid.blocks[1].name = '';
    broken.put('a time block with no name', grid);
    Assert.areEqual(broken.size(), refusals(broken), 'every one refused');
  }

  /** How many of the grids are refused, each with a reason. */
  private static Integer refusals(Map<String, ScheduleGrid> broken) {
    Integer refused = 0;
    for (String why : broken.keySet()) {
      try {
        broken.get(why).toText();
        Assert.fail('refused: ' + why);
      } catch (ScheduleGridRules.GridException e) {
        Assert.isNotNull(e.getMessage(), why);
        refused++;
      }
    }
    return refused;
  }

  @IsTest
  static void unreadableTextIsRefused() {
    for (
      String text : new List<String>{
        'not json',
        '{"b":[],"g":[],"i":[]}',
        '{"b":[["only one"]],"g":[],"i":[],"r":[]}',
        '{"b":[],"g":[["a","Bunk 1"]],"i":[],"r":[]}'
      }
    ) {
      try {
        ScheduleGrid.fromText(text);
        Assert.fail('refused: ' + text);
      } catch (ScheduleGridRules.GridException e) {
        Assert.isNotNull(e.getMessage());
      }
    }
  }

  /** 100 groups, 14 time blocks, every cell filled, 150 items with long names. */
  private static ScheduleGrid large(Integer groupCount) {
    ScheduleGrid grid = new ScheduleGrid();
    for (Integer b = 0; b < 14; b++) {
      grid.blocks.add(
        new ScheduleGrid.Block(
            'a0B00000000' + String.valueOf(1000 + b) + 'AAA',
            'Period ' + (b + 1)
          )
          .at('09:00', '09:45')
      );
    }
    for (Integer i = 0; i < 150; i++) {
      grid.items.add(
        new ScheduleGrid.Item(
          'A',
          'a0A00000000' + String.valueOf(1000 + i) + 'AAA',
          'Activity with a long name ' + i
        )
      );
    }
    for (Integer g = 0; g < groupCount; g++) {
      grid.groups.add(
        new ScheduleGrid.GroupRef(
          'a0G00000000' + String.valueOf(1000 + g) + 'AAA',
          'Bunk number ' + g
        )
      );
      List<String> row = new List<String>();
      for (Integer b = 0; b < 14; b++) {
        row.add(String.valueOf(100 + Math.mod(g + b, 50)));
      }
      grid.rows.add(row);
    }
    return grid;
  }

  @IsTest
  static void aHundredGroupFourteenBlockDayFitsInOneRecord() {
    // The data model requires this check before release.
    String text = large(100).toText();
    System.debug('100 groups x 14 blocks: ' + text.length() + ' characters');
    Assert.isTrue(text.length() < 25000, 'was ' + text.length());
    Assert.areEqual(1, ScheduleGridParts.split(large(100)).size());
    Assert.areEqual(text, ScheduleGrid.fromText(text).toText());
  }

  @IsTest
  static void aDayTooBigForOneRecordIsSplitIntoWholeGroupsAndJoined() {
    // Room for the time blocks and items plus about a dozen groups per part.
    Integer limitLength = large(0).toText().length() + 1000;
    ScheduleGridParts.partLimit = limitLength;
    ScheduleGrid grid = large(40);
    List<String> parts = ScheduleGridParts.split(grid);
    Assert.isTrue(parts.size() > 2, 'split into ' + parts.size());
    Integer groups = 0;
    for (String part : parts) {
      Assert.isTrue(part.length() <= limitLength, 'part is ' + part.length());
      groups += ScheduleGrid.fromText(part).groups.size();
    }
    Assert.areEqual(40, groups, 'every group in exactly one part');
    Assert.areEqual(grid.toText(), ScheduleGridParts.join(parts).toText());
  }

  @IsTest
  static void timeBlocksAndItemsTooBigForAnyPartAreRefused() {
    ScheduleGridParts.partLimit = 100;
    try {
      ScheduleGridParts.split(small());
      Assert.fail('refused');
    } catch (ScheduleGridRules.GridException e) {
      Assert.isTrue(e.getMessage().contains('items alone'), e.getMessage());
    }
  }

  @IsTest
  static void aGroupTooBigForAnyPartIsRefused() {
    ScheduleGrid frame = small();
    frame.groups.clear();
    frame.rows.clear();
    ScheduleGridParts.partLimit = frame.toText().length() + 5;
    try {
      ScheduleGridParts.split(small());
      Assert.fail('refused');
    } catch (ScheduleGridRules.GridException e) {
      Assert.isTrue(e.getMessage().contains('too long'), e.getMessage());
    }
  }

  @IsTest
  static void partsThatDoNotMatchAreNotJoined() {
    ScheduleGrid other = small();
    other.items[0].name = 'Swimming';
    try {
      ScheduleGridParts.join(
        new List<String>{ small().toText(), other.toText() }
      );
      Assert.fail('refused');
    } catch (ScheduleGridRules.GridException e) {
      Assert.isTrue(e.getMessage().contains('parts'), e.getMessage());
    }
  }
}
