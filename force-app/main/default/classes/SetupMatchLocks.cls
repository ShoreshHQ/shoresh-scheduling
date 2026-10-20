/**
 * A Generated Schedule draft's locks through "Update to match setup" (SetupMatchDay; ADR 0010
 * §56): a lock is the director's own choice (a hand edit or a Lock, §33), so it stays on every
 * cell an update leaves holding what it held (a placement carried over, an Open cell kept
 * empty), and goes only with the placement it kept. A fixed or recurring activity is never
 * locked (§34). Manual Build's draft has no locks, so nothing changes there.
 */
public with sharing class SetupMatchLocks {
  // The draft's locked cells ("groupId|blockId").
  private Set<String> locked = new Set<String>();

  public SetupMatchLocks(ScheduleGrid was) {
    if (was == null || was.locks.isEmpty()) {
      return;
    }
    for (Integer g = 0; g < was.groups.size(); g++) {
      for (Integer b = 0; b < was.blocks.size(); b++) {
        if (ScheduleGridLocks.isLocked(was, g, b)) {
          locked.add(
            SetupMatchCells.cellOf(was.groups[g].id, was.blocks[b].id)
          );
        }
      }
    }
  }

  /** The grid, with the draft's locks on the cells that still hold what they held (before). */
  public ScheduleGrid onto(ScheduleGrid grid, SetupMatchCells before) {
    if (locked.isEmpty() || grid == null) {
      return grid;
    }
    SetupMatchCells made = new SetupMatchCells(grid);
    for (Integer g = 0; g < grid.groups.size(); g++) {
      for (Integer b = 0; b < grid.blocks.size(); b++) {
        String cell = SetupMatchCells.cellOf(
          grid.groups[g].id,
          grid.blocks[b].id
        );
        if (keeps(cell, made.at(cell), before)) {
          ScheduleGridLocks.lock(grid, new List<Integer>{ g, b });
        }
      }
    }
    return grid;
  }

  private Boolean keeps(String cell, String held, SetupMatchCells before) {
    return locked.contains(cell) &&
      held == before.at(cell) &&
      !SlotIds.isSetTime(held);
  }
}
