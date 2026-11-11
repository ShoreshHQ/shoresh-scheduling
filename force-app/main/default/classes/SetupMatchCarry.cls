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

  private static final String AT_ITS_TIME = 'Now at its set time';
  // The elective sets the day now has at their time, each with a group it is there for
  // ("setId|groupId"): a group the set's time left out (taken, or not at camp) keeps its own.
  private Set<String> timedSets = new Set<String>();
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
    for (String cell : cells.keySet()) {
      Id setId = SlotIds.electiveIn(SlotIds.owner(cells.get(cell)));
      if (setId != null) {
        timedSets.add(setId + '|' + SetupMatchCells.groupOf(cell));
      }
    }
  }

  /**
   * Carries the draft's placements. Set-time items aren't carried (the day now has its own), but
   * one whose group or time blocks changed says so, as an activity's placement does.
   */
  public void carry(SetupMatchCells before) {
    for (String first : before.placements) {
      String owner = before.at(first);
      if (owner == SlotIds.OPEN) {
        continue;
      }
      List<String> placement = before.cellsOf.get(first);
      if (SlotIds.isSetTime(owner)) {
        explainSetTime(placement);
        continue;
      }
      if (atItsTime(owner, first)) {
        leaveOut(placement, AT_ITS_TIME);
        continue;
      }
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

  private void leaveOut(List<String> placement, String why) {
    for (String cell : placement) {
      whyByCell.put(cell, why);
    }
  }

  /**
   * An elective set that now has a time is at it in the day now (BlankDay.placeSet): a placement
   * of it elsewhere for the same group isn't carried as well, so the set is never there twice for
   * a group that day (repo ADR 0027).
   */
  private Boolean atItsTime(String owner, String first) {
    Id setId = SlotIds.electiveIn(SlotIds.owner(owner));
    return setId != null &&
      timedSets.contains(setId + '|' + SetupMatchCells.groupOf(first));
  }

  /** A set-time item's placement: why, when its group or time blocks changed. */
  private void explainSetTime(List<String> placement) {
    String why = whyNotFrame(placement);
    if (why == null) {
      return;
    }
    for (String cell : placement) {
      whyByCell.put(cell, why);
    }
  }

  /** Why a placement can't stay where it is in the day now, or null when it can. */
  private String whyNot(String owner, List<String> placement) {
    String why = rules.whyNotActivity(owner);
    if (why == null) {
      why = whyNotFrame(placement);
    }
    return why == null ? whyNotFree(placement) : why;
  }

  /** Its group is not in the day or not at camp then, or its time blocks changed; or null. */
  private String whyNotFrame(List<String> placement) {
    String why = whyNotRow(placement);
    if (why == null) {
      why = whyNotBlocks(placement);
    }
    return why == null ? whyNotAtCamp(placement) : why;
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

  /** Its group isn't at camp then (a group now mornings only). */
  private String whyNotAtCamp(List<String> placement) {
    Id groupId = Id.valueOf(SetupMatchCells.groupOf(placement[0]));
    for (String cell : placement) {
      if (!rules.atCamp(groupId, Id.valueOf(SetupMatchCells.blockOf(cell)))) {
        return SetupMatchRules.NOT_AT_CAMP_THEN;
      }
    }
    return null;
  }

  /** A fixed or recurring activity is there now. */
  private String whyNotFree(List<String> placement) {
    for (String cell : placement) {
      String there = cells.get(cell);
      if (there != SlotIds.OPEN) {
        return rules.setUpHere(names.nameOf(SlotIds.owner(there)));
      }
    }
    return null;
  }
}
