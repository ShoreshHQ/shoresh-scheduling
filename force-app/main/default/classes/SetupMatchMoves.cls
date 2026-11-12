/**
 * Where a placement of the draft's day went in the day setup makes now, for the dots of "Update
 * to match setup" (SetupMatchDots). In each group's day, the placements of one thing the day now
 * no longer holds where they were are paired, in order, with the placements of that same thing
 * the day now holds newly; a placement of several time blocks is one placement. A placement left
 * unpaired went nowhere (or arrived from nowhere), so "moved to" never names a slot that was
 * already that thing's, or one another placement has accounted for.
 */
public with sharing class SetupMatchMoves {
  // The first cell, in the day now, that each moved placement went to, by its first cell before.
  private Map<String, String> toByFrom = new Map<String, String>();
  // The first cells, in the day now, of placements that moved there.
  private Set<String> arrivals = new Set<String>();
  private SetupMatchCells after;

  public SetupMatchMoves(SetupMatchCells before, SetupMatchCells after) {
    this.after = after;
    Map<String, List<String>> gone = changed(before, after);
    Map<String, List<String>> come = changed(after, before);
    for (String key : gone.keySet()) {
      if (come.containsKey(key)) {
        pair(gone.get(key), come.get(key));
      }
    }
  }

  /** The first cell (day now) a draft placement moved to, by its first cell, or null. */
  public String movedTo(String first) {
    return toByFrom.get(first);
  }

  /** The first cell (day now) of the placement that moved into a cell, or null. */
  public String movedInto(String cell) {
    List<String> placement = after.cellsWith(cell);
    return !placement.isEmpty() && arrivals.contains(placement[0])
      ? placement[0]
      : null;
  }

  private void pair(List<String> froms, List<String> tos) {
    Integer count = Math.min(froms.size(), tos.size());
    for (Integer i = 0; i < count; i++) {
      toByFrom.put(froms[i], tos[i]);
      arrivals.add(tos[i]);
    }
  }

  /**
   * The placements of one day the other doesn't hold where they are, in the order of the day,
   * by "groupId|identity".
   */
  private static Map<String, List<String>> changed(
    SetupMatchCells one,
    SetupMatchCells other
  ) {
    Map<String, List<String>> result = new Map<String, List<String>>();
    for (String first : one.placements) {
      String identity = one.at(first);
      if (identity == SlotIds.OPEN || holds(other, one, first)) {
        continue;
      }
      String key = SetupMatchCells.groupOf(first) + '|' + identity;
      if (!result.containsKey(key)) {
        result.put(key, new List<String>());
      }
      result.get(key).add(first);
    }
    return result;
  }

  /** Whether the other day holds the placement exactly where it is. */
  private static Boolean holds(
    SetupMatchCells other,
    SetupMatchCells one,
    String first
  ) {
    for (String cell : one.cellsOf.get(first)) {
      if (!other.at(cell).equals(one.at(cell))) {
        return false;
      }
    }
    return true;
  }
}
