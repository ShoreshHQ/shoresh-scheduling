/**
 * The day as setup makes it now, for "Update to match setup" (SetupMatchDay): Start a blank week's
 * day (BlankDay: today's time blocks, groups at camp, and fixed and recurring activities) with
 * each of the director's placements carried over, whole, at the same group and time blocks
 * (matched by record Id), when it still fits: its activity is still in setup and running this
 * week, its group and blocks are still there and in the same order, the group is at camp then,
 * and no fixed or recurring activity is now there. Placements go in the order of the day, so the
 * same draft and setup always give the same day. A placement that can't go is left out, with why.
 */
public with sharing class SetupMatchCarry {
  // The day now, as cells (identities by cell).
  public Map<String, String> cells;
  // Why each cell of a placement left out can't go.
  public Map<String, String> whyByCell = new Map<String, String>();

  private SetupMatchRules rules;
  private SetupMatchNames names;
  private ScheduleGrid target;

  public SetupMatchCarry(
    SetupMatchRules rules,
    SetupMatchNames names,
    ScheduleGrid target
  ) {
    this.rules = rules;
    this.names = names;
    this.target = target;
    cells = new Map<String, String>(new SetupMatchCells(target).held);
  }

  /** Carries the draft's placements (set-time items aside: the day now has its own). */
  public void carry(SetupMatchCells before) {
    for (String first : before.placements) {
      String owner = before.at(first);
      if (owner == SlotIds.OPEN || SlotIds.isSetTime(owner)) {
        continue;
      }
      List<String> placement = before.cellsOf.get(first);
      String why = whyNot(owner, placement);
      for (String cell : placement) {
        if (why == null) {
          cells.put(cell, before.at(cell));
        } else {
          whyByCell.put(cell, why);
        }
      }
    }
  }

  /** Why a placement can't stay where it is in the day now, or null when it can. */
  private String whyNot(String owner, List<String> placement) {
    String why = rules.whyNotActivity(owner);
    if (why == null) {
      why = whyNotRow(placement);
    }
    if (why == null) {
      why = whyNotBlocks(placement);
    }
    return why == null ? whyNotFree(placement) : why;
  }

  /** Its group is no longer in the day (away this week, or no longer in the program). */
  private String whyNotRow(List<String> placement) {
    Id groupId = Id.valueOf(SetupMatchCells.groupOf(placement[0]));
    return SlotIds.indexOf(target.groupIds(), groupId) < 0
      ? rules.whyNoRow(groupId)
      : null;
  }

  /** A block of it is gone, or one was added inside it. */
  private String whyNotBlocks(List<String> placement) {
    List<String> blockIds = target.blockIds();
    Integer first = -1;
    for (Integer i = 0; i < placement.size(); i++) {
      String blockId = SetupMatchCells.blockOf(placement[i]);
      Integer at = SlotIds.indexOf(blockIds, blockId);
      if (at < 0) {
        return rules.blockGone(names.block(blockId).name);
      }
      first = i == 0 ? at : first;
      if (at != first + i) {
        return rules.blocksChanged();
      }
    }
    return null;
  }

  /** Its group isn't at camp then, or a fixed or recurring activity is there now. */
  private String whyNotFree(List<String> placement) {
    Id groupId = Id.valueOf(SetupMatchCells.groupOf(placement[0]));
    for (String cell : placement) {
      if (!rules.atCamp(groupId, Id.valueOf(SetupMatchCells.blockOf(cell)))) {
        return SetupMatchRules.NOT_AT_CAMP_THEN;
      }
    }
    for (String cell : placement) {
      String there = cells.get(cell);
      if (there != SlotIds.OPEN) {
        return rules.setUpHere(names.nameOf(SlotIds.owner(there)));
      }
    }
    return null;
  }
}
