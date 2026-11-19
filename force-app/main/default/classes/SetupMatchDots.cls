/**
 * The dots of "Update to match setup" (SetupMatchDay): every cell of a draft placement that would
 * not stay as it is, with why (deleted from setup, not running this week, not at camp then, a
 * fixed activity set up there now, …), and every Open cell a fixed or recurring activity is now
 * set up in ("Lunch is set up here now"). A placement setup still has where it is gets none.
 */
public with sharing class SetupMatchDots {
  private SetupMatchRules rules;
  private SetupMatchNames names;
  // The day is no longer a day of the week.
  private Boolean dayGoes;
  private SetupMatchCells before;
  private SetupMatchCells after;
  private SetupMatchMoves moves;
  // Why SetupMatchCarry left a placement out (cells: "groupId|blockId").
  private Map<String, String> carried;

  public SetupMatchDots(
    SetupMatchRules rules,
    SetupMatchNames names,
    Boolean dayGoes
  ) {
    this.rules = rules;
    this.names = names;
    this.dayGoes = dayGoes;
  }

  /**
   * Why each cell of the draft's day (before) has a dot beside the day now (after), given why
   * SetupMatchCarry left placements out (carried). A cell without a dot isn't in it.
   */
  public Map<String, String> explain(
    SetupMatchCells before,
    SetupMatchCells after,
    Map<String, String> carried
  ) {
    this.before = before;
    this.after = after;
    this.carried = carried;
    moves = new SetupMatchMoves(before, after);
    Map<String, String> whyByCell = new Map<String, String>();
    for (String first : before.placements) {
      List<String> placement = before.cellsOf.get(first);
      String why = whyFor(first, placement);
      if (why == null) {
        continue;
      }
      for (String cell : placement) {
        whyByCell.put(cell, why);
      }
    }
    return whyByCell;
  }

  /** Why a placement (or an Open cell) of the draft has a dot, or null. */
  private String whyFor(String first, List<String> placement) {
    String owner = before.at(first);
    if (owner == SlotIds.OPEN) {
      String there = after.at(first);
      return SlotIds.isSetTime(there) ? arrived(first, there) : null;
    }
    if (dayGoes) {
      return rules.notADay();
    }
    if (kept(placement)) {
      return null;
    }
    return carried.containsKey(first) ? carried.get(first) : left(first, owner);
  }

  /**
   * A fixed or recurring activity setup now puts in an Open cell, named with its change: "Morning
   * meeting moved to Period 2" when it moved here from elsewhere in the group's day (every cell
   * of its placement says so), else "Lunch goes here" (coordinator's wording for Greg, 2026-11-12).
   */
  private String arrived(String cell, String there) {
    String name = names.nameOf(SlotIds.owner(there));
    String now = moves.movedInto(cell);
    return now == null ? rules.setUpHere(name) : movedTo(name, now);
  }

  /** A placement setup no longer has here: where it went that day, or that it is gone. */
  private String left(String first, String owner) {
    String name = names.nameOf(SlotIds.owner(owner));
    String now = moves.movedTo(first);
    return now == null || now.equals(first)
      ? name + ' is no longer set up here'
      : movedTo(name, now);
  }

  /** "Morning meeting moved to Period 2". */
  private String movedTo(String name, String cell) {
    String blockId = SetupMatchCells.blockOf(cell);
    return name + ' moved to ' + names.range(blockId, blockId);
  }

  /** Whether the day now holds the placement exactly where it is. */
  private Boolean kept(List<String> placement) {
    for (String cell : placement) {
      if (!after.at(cell).equals(before.at(cell))) {
        return false;
      }
    }
    return true;
  }
}
