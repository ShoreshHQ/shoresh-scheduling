/**
 * The cells where the draft's day and the day setup makes now differ, grouped for "Update to
 * match setup" (SetupMatchDay): a differing cell together with every cell of the placements it is
 * part of on either side, and theirs in turn. So a group always takes whole placements on both
 * sides, and making it alone leaves a whole day. Groups come in the order of the day: groups as
 * the draft lists them (then new ones), time blocks by their start time.
 */
public with sharing class SetupMatchClusters {
  private SetupMatchCells before;
  private SetupMatchCells after;
  private SetupMatchNames names;

  public SetupMatchClusters(
    SetupMatchCells before,
    SetupMatchCells after,
    SetupMatchNames names
  ) {
    this.before = before;
    this.after = after;
    this.names = names;
  }

  /** The groups of differing cells between the draft's day (was) and the day now. */
  public List<List<String>> of(ScheduleGrid was, ScheduleGrid now) {
    List<String> order = cellOrder(groupIds(was, now));
    Set<String> seen = new Set<String>();
    List<List<String>> result = new List<List<String>>();
    for (String cell : order) {
      if (!seen.contains(cell) && !before.at(cell).equals(after.at(cell))) {
        result.add(inOrder(around(cell, seen), order));
      }
    }
    return result;
  }

  /** A cell and every cell of the placements it is part of, on either side, and theirs. */
  private Set<String> around(String start, Set<String> seen) {
    List<String> queue = new List<String>{ start };
    seen.add(start);
    for (Integer i = 0; i < queue.size(); i++) {
      List<String> linked = new List<String>(before.cellsWith(queue[i]));
      linked.addAll(after.cellsWith(queue[i]));
      for (String cell : linked) {
        if (seen.add(cell)) {
          queue.add(cell);
        }
      }
    }
    return new Set<String>(queue);
  }

  private static List<String> inOrder(Set<String> cells, List<String> order) {
    List<String> result = new List<String>();
    for (String cell : order) {
      if (cells.contains(cell)) {
        result.add(cell);
      }
    }
    return result;
  }

  /** Every group either day has: as the draft lists them, then new ones. */
  private static List<String> groupIds(ScheduleGrid was, ScheduleGrid now) {
    List<String> result = new List<String>();
    for (ScheduleGrid grid : new List<ScheduleGrid>{ was, now }) {
      for (
        String groupId : grid == null ? new List<String>() : grid.groupIds()
      ) {
        if (!result.contains(SetupMatchCells.normal(groupId))) {
          result.add(SetupMatchCells.normal(groupId));
        }
      }
    }
    return result;
  }

  /** Every cell either day has, group by group, each group's blocks by start time. */
  private List<String> cellOrder(List<String> groupIds) {
    List<String> byTime = new List<String>();
    for (String blockId : names.blocks().keySet()) {
      byTime.add(names.block(blockId).startTime + '|' + blockId);
    }
    byTime.sort();
    List<String> result = new List<String>();
    for (String groupId : groupIds) {
      for (String entry : byTime) {
        String cell = groupId + '|' + entry.substringAfter('|');
        if (before.held.containsKey(cell) || after.held.containsKey(cell)) {
          result.add(cell);
        }
      }
    }
    return result;
  }
}
