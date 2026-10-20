/**
 * One day of "Update to match setup" (SetupMatch): the draft's day as it is (was) beside the day
 * as setup makes it now (now: SetupMatchCarry). Every cell of a placement that would not stay as
 * it is gets a dot saying why, and so does an Open cell a fixed or recurring activity is now set
 * up in. The cells that differ are grouped into changes the director can make one at a time
 * (SetupMatchClusters); when the day's time blocks or groups changed, the whole day is one change.
 * A name changed in setup is shown, not flagged (Greg, round 2 #3): cells are compared by record
 * Id, never by name.
 */
public with sharing class SetupMatchDay {
  public Date day;
  public List<SetupMatch.Change> changes = new List<SetupMatch.Change>();
  public List<SetupMatch.Dot> dots = new List<SetupMatch.Dot>();

  private SetupMatchRules rules;
  private SetupMatchNames names;
  private ScheduleGrid was;
  private ScheduleGrid now;
  private SetupMatchCells before;
  private SetupMatchCells after;
  private Boolean sameFrame;
  // The cells of each change, by its key.
  private Map<String, List<String>> cellsByKey = new Map<String, List<String>>();
  // Why each cell of the draft has a dot (cells: "groupId|blockId").
  private Map<String, String> whyByCell = new Map<String, String>();

  public SetupMatchDay(SetupMatchRules rules, Date day) {
    this.rules = rules;
    this.day = day;
  }

  /** was: the draft's day, or null; target: the blank day setup gives now, or null. */
  public SetupMatchDay compare(ScheduleGrid was, ScheduleGrid target) {
    this.was = was;
    names = new SetupMatchNames(rules, was, target);
    before = new SetupMatchCells(was);
    if (target != null) {
      SetupMatchCarry carried = new SetupMatchCarry(rules, names, target);
      carried.carry(before);
      whyByCell = carried.whyByCell;
      now = SetupMatchCells.gridOf(target, carried.cells, names);
    }
    after = new SetupMatchCells(now);
    sameFrame = SetupMatchCells.sameFrame(was, now);
    SetupMatchDots marks = new SetupMatchDots(rules, names, day);
    marks.whyByCell = whyByCell;
    marks.dayGoes = now == null;
    marks.explain(before, after, was);
    dots = marks.dots;
    group();
    return this;
  }

  // ---------- changes ----------

  /** The cells that differ, as changes: one per group of cells, or the whole day. */
  private void group() {
    List<List<String>> clusters = new SetupMatchClusters(before, after, names)
      .of(was, now);
    SetupMatchLines lines = new SetupMatchLines(day, rules, names);
    if (sameFrame) {
      for (List<String> cells : clusters) {
        SetupMatch.Change change = new SetupMatch.Change();
        change.lines.add(lineOf(lines, cells));
        finish(change, cells, canonical(cells));
      }
      return;
    }
    SetupMatch.Change change = new SetupMatch.Change();
    change.summary = lines.summary(was, now);
    List<String> all = new List<String>();
    List<String> parts = new List<String>{ change.summary };
    for (List<String> cells : clusters) {
      change.lines.add(lineOf(lines, cells));
      all.addAll(cells);
      parts.add(canonical(cells));
    }
    finish(change, all, String.join(parts, ';'));
  }

  private SetupMatch.Line lineOf(SetupMatchLines lines, List<String> cells) {
    SetupMatch.Line line = lines.lineOf(cells, before, after);
    for (String cell : cells) {
      if (line.reason == null && whyByCell.containsKey(cell)) {
        line.reason = whyByCell.get(cell);
      }
    }
    return line;
  }

  /** A change's key names exactly what it changes, so a key names one change and nothing else. */
  private void finish(
    SetupMatch.Change change,
    List<String> cells,
    String canonical
  ) {
    change.dateValue = day;
    change.key = EncodingUtil.convertToHex(
      Crypto.generateDigest(
        'SHA-256',
        Blob.valueOf(String.valueOf(day) + '|' + canonical)
      )
    );
    for (String cell : cells) {
      String owner = SlotIds.owner(before.at(cell));
      change.takesChoices =
        change.takesChoices ||
        (owner != SlotIds.OPEN && !SlotIds.isSetTime(owner));
    }
    cellsByKey.put(change.key, cells);
    changes.add(change);
  }

  private String canonical(List<String> cells) {
    List<String> parts = new List<String>();
    for (String cell : cells) {
      parts.add(cell + '=' + before.at(cell) + '>' + after.at(cell));
    }
    return String.join(parts, ',');
  }

  // ---------- making changes ----------

  /** Whether the day's changes include any of these. */
  public Boolean touches(Set<String> keys) {
    for (String key : cellsByKey.keySet()) {
      if (keys.contains(key)) {
        return true;
      }
    }
    return false;
  }

  /** Whether the day is no longer a day of the week once its change is made. */
  public Boolean goes() {
    return now == null;
  }

  /** The day with the chosen changes made (a whole-day change gives the day as setup makes it). */
  public ScheduleGrid madeWith(Set<String> keys) {
    if (!sameFrame) {
      return now;
    }
    Map<String, String> cells = new Map<String, String>(before.held);
    for (String key : cellsByKey.keySet()) {
      if (keys.contains(key)) {
        for (String cell : cellsByKey.get(key)) {
          cells.put(cell, after.at(cell));
        }
      }
    }
    return SetupMatchCells.gridOf(now, cells, names);
  }
}
