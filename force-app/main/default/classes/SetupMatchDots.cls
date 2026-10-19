/**
 * The dots of "Update to match setup" (SetupMatchDay): every cell of a draft placement that would
 * not stay as it is, with why (deleted from setup, not running this week, not at camp then, a
 * fixed activity set up there now, …), and every Open cell a fixed or recurring activity is now
 * set up in ("Lunch is set up here now"). A placement setup still has where it is gets none.
 */
public with sharing class SetupMatchDots {
  public List<SetupMatch.Dot> dots = new List<SetupMatch.Dot>();
  // Why each cell has a dot (SetupMatchCarry's reasons going in; cells: "groupId|blockId").
  public Map<String, String> whyByCell = new Map<String, String>();
  // The day is no longer a day of the week.
  public Boolean dayGoes = false;

  private SetupMatchRules rules;
  private SetupMatchNames names;
  private Date day;
  private SetupMatchCells before;
  private SetupMatchCells after;

  public SetupMatchDots(
    SetupMatchRules rules,
    SetupMatchNames names,
    Date day
  ) {
    this.rules = rules;
    this.names = names;
    this.day = day;
  }

  /** The dots of the draft's day (was, as before) beside the day now (after). */
  public void explain(
    SetupMatchCells before,
    SetupMatchCells after,
    ScheduleGrid was
  ) {
    this.before = before;
    this.after = after;
    for (String first : before.placements) {
      List<String> placement = before.cellsOf.get(first);
      String why = whyFor(first, placement);
      for (String cell : placement) {
        if (why == null) {
          whyByCell.remove(cell);
        } else {
          whyByCell.put(cell, why);
          dots.add(new SetupMatch.Dot(keyOf(was, cell), why));
        }
      }
    }
  }

  /** Why a placement (or an Open cell) of the draft has a dot, or null. */
  private String whyFor(String first, List<String> placement) {
    String owner = before.at(first);
    if (owner == SlotIds.OPEN) {
      String there = after.at(first);
      return SlotIds.isSetTime(there)
        ? rules.setUpHere(names.nameOf(SlotIds.owner(there)))
        : null;
    }
    if (dayGoes) {
      return rules.notADay();
    }
    if (kept(placement)) {
      return null;
    }
    return whyByCell.containsKey(first)
      ? whyByCell.get(first)
      : SetupMatchRules.NOT_HERE_NOW;
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

  /** The screen's key for a draft cell: "date|groupId|blockId", as the grid writes its Ids. */
  private String keyOf(ScheduleGrid was, String cell) {
    Integer g = SlotIds.indexOf(was.groupIds(), SetupMatchCells.groupOf(cell));
    Integer b = SlotIds.indexOf(was.blockIds(), SetupMatchCells.blockOf(cell));
    return String.valueOf(day) +
      '|' +
      was.groups[g].id +
      '|' +
      was.blocks[b].id;
  }
}
