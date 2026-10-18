/**
 * The server's lock rule for a hand edit (GeneratedEdits.lock) against the week editor's own
 * (lwc/shoreshWeekEditor/locks.js foldRun), which works the same out beforehand so a lock shows at
 * once: the same cases, the same answers. The Jest test lockRule.test.js reads LOCK_CASES from this
 * file and runs each through foldRun, so a change to either rule, or to the cases, fails one side.
 *
 * Each case: name; Bunk 1's row before (tokens: 1 Flagpole, 2 Swim, 3 Chapel, 4 Boating; '^'
 * carries on); the cells locked before; the runs in order ("block|after+after", block 1 to 3,
 * after as slot identities), " / " between runs; an Undo or Redo's locks to restore ("-" for a
 * hand edit); the cells locked after. A cell is its block number, or "g2:" and it for Bunk 2.
 * Synthetic grids only; no records, no queries.
 */
@IsTest
private class GeneratedEditLocksTest {
  public static final List<String> LOCK_CASES = new List<String>{
    'places an activity; ,,; ; 2|A:a1; -; 2',
    'clears a locked cell; ,2,; 2; 2|; -; ',
    'lengthens an unlocked activity; ,2,; ; 3|^A:a1; -; 2 3',
    'shortens an activity; ,2,^; ; 3|; -; 2',
    'shortens an activity of three; 2,^,^; ; 3|; -; 1 2',
    'clears the end of a locked placement; ,2,^; 2 3; 3|; -; 2',
    'clears a whole two-block placement; ,2,^; 2 3; 2|+; -; ',
    'places a fixed activity; ,,; ; 1|F:f2; -; ',
    'leaves another bunk alone; ,,; g2:2; 2|A:a1; -; 2 g2:2',
    'two runs in a row; ,,; ; 2|A:a1 / 3|^A:a1; -; 2 3',
    'a second run reaches past its blocks; 2,,; ; 2|^A:a1 / 1|A:a2; -; 1 2',
    'undo takes the locks to restore; ,2,^; 2; 2|+; 1 3; 3',
    'undo keeps a lock outside the run; ,2,^; 1 2; 2|+; 1 3; 1 3',
    'undo to no locks; ,2,^; 2 3; 2|+; ; ',
    'undo keeps a lock set after its step; ,,; 2; 2|A:a1; 2; 2',
    'redo keeps a lock set after its step; ,2,; 2; 2|; 2; 2'
  };

  private static final List<String> ITEMS = new List<String>{
    'F:f1',
    'A:a1',
    'F:f2',
    'A:a2'
  };

  @IsTest
  static void theServerLocksWhatTheEditorWorksOut() {
    for (String spec : LOCK_CASES) {
      List<String> parts = spec.split(';', -1);
      ScheduleGrid grid = gridOf(parts[1].trim(), parts[2].trim());
      for (String runText : parts[3].trim().split(' / ')) {
        make(grid, runText, parts[4].trim());
      }
      Assert.areEqual(
        parts[5].trim(),
        lockedIn(grid),
        parts[0] + ': the cells locked after'
      );
    }
  }

  /** Bunk 1's row as given, Bunk 2's empty; three blocks; the cells locked as given. */
  private static ScheduleGrid gridOf(String row, String locked) {
    ScheduleGrid grid = new ScheduleGrid();
    for (Integer b = 1; b <= 3; b++) {
      grid.blocks.add(new ScheduleGrid.Block('t' + b, 'Period ' + b));
    }
    grid.groups.add(new ScheduleGrid.GroupRef('g1', 'Bunk 1'));
    grid.groups.add(new ScheduleGrid.GroupRef('g2', 'Bunk 2'));
    grid.items.add(new ScheduleGrid.Item('F', 'f1', 'Flagpole'));
    grid.items.add(new ScheduleGrid.Item('A', 'a1', 'Swim'));
    grid.items.add(new ScheduleGrid.Item('F', 'f2', 'Chapel'));
    grid.items.add(new ScheduleGrid.Item('A', 'a2', 'Boating'));
    grid.rows.add(row.split(',', -1));
    grid.rows.add(new List<String>{ '', '', '' });
    for (String cell : words(locked)) {
      ScheduleGridLocks.lock(grid, cellAt(cell));
    }
    return grid;
  }

  /** A run on Bunk 1, made as SlotSaves makes it: the slots written, then GeneratedEdits.lock. */
  private static void make(ScheduleGrid grid, String runText, String target) {
    Integer first = Integer.valueOf(runText.substringBefore('|')) - 1;
    List<String> after = runText.substringAfter('|').split('\\+', -1);
    List<String> was = SlotIds.ofRow(grid, 0);
    SlotEdits.Run run = new SlotEdits.Run();
    run.groupId = 'g1';
    run.firstBlockId = grid.blocks[first].id;
    run.before = new List<String>();
    run.blockIds = new List<String>();
    for (Integer i = 0; i < after.size(); i++) {
      run.before.add(was[first + i]);
      run.blockIds.add(grid.blocks[first + i].id);
      grid.rows[0][first + i] = tokenOf(after[i]);
    }
    run.after = after;
    if (target != '-') {
      Set<String> restore = new Set<String>(words(target));
      run.locksAfter = new List<String>();
      for (Integer i = 0; i < after.size(); i++) {
        run.locksAfter.add(
          restore.contains(String.valueOf(first + i + 1))
            ? ScheduleGridLocks.LOCKED
            : ''
        );
      }
    }
    new GeneratedEdits(run, was).lock(grid, new List<Integer>{ 0, first });
  }

  private static String tokenOf(String identity) {
    if (String.isBlank(identity)) {
      return '';
    }
    if (identity.startsWith(ScheduleGrid.CARRIES_ON)) {
      return ScheduleGrid.CARRIES_ON;
    }
    return String.valueOf(ITEMS.indexOf(identity) + 1);
  }

  /** "2" is Bunk 1's second block; "g2:2" Bunk 2's. */
  private static List<Integer> cellAt(String cell) {
    return cell.startsWith('g2:')
      ? new List<Integer>{ 1, Integer.valueOf(cell.substringAfter(':')) - 1 }
      : new List<Integer>{ 0, Integer.valueOf(cell) - 1 };
  }

  private static String lockedIn(ScheduleGrid grid) {
    List<String> cells = new List<String>();
    for (Integer g = 0; g < 2; g++) {
      for (Integer b = 0; b < 3; b++) {
        if (ScheduleGridLocks.isLocked(grid, g, b)) {
          cells.add((g == 0 ? '' : 'g2:') + (b + 1));
        }
      }
    }
    return String.join(cells, ' ');
  }

  private static List<String> words(String text) {
    return String.isBlank(text) ? new List<String>() : text.split(' ');
  }
}
