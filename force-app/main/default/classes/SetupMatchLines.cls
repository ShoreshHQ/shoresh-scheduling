/**
 * The words of "Update to match setup" (SetupMatchDay): each change as a line ("Group A · Monday ·
 * Period 2", "Swim" → "Open", "Deleted from setup") and, for a day whose time blocks or groups
 * changed, its summary ("Monday: Period 3 added, Group B not at camp this week").
 */
public with sharing class SetupMatchLines {
  private Date day;
  private SetupMatchRules rules;
  private SetupMatchNames names;

  public SetupMatchLines(
    Date day,
    SetupMatchRules rules,
    SetupMatchNames names
  ) {
    this.day = day;
    this.rules = rules;
    this.names = names;
  }

  /** One change's line: where, what is there, what it becomes, and why (the first cell's dot). */
  public SetupMatch.Line lineOf(
    List<String> cells,
    SetupMatchCells before,
    SetupMatchCells after
  ) {
    SetupMatch.Line line = new SetupMatch.Line();
    line.place =
      names.groupName(SetupMatchCells.groupOf(cells[0])) +
      ' · ' +
      BlankWeek.weekdayOf(day) +
      ' · ' +
      names.range(
        SetupMatchCells.blockOf(cells[0]),
        SetupMatchCells.blockOf(cells[cells.size() - 1])
      );
    line.before = namesIn(before, cells);
    line.after = namesIn(after, cells);
    if (line.before == line.after) {
      // The same activity, now set up for other blocks (a fixed activity made longer, say).
      line.before += ' · ' + heldRange(before, cells);
      line.after += ' · ' + heldRange(after, cells);
    }
    return line;
  }

  /** What a side holds in the cells, by name ("Swim + Art"), or "Open". */
  private String namesIn(SetupMatchCells side, List<String> cells) {
    List<String> found = new List<String>();
    for (String cell : cells) {
      String owner = SlotIds.owner(side.at(cell));
      if (owner != SlotIds.OPEN && !found.contains(names.nameOf(owner))) {
        found.add(names.nameOf(owner));
      }
    }
    return found.isEmpty() ? 'Open' : String.join(found, ' + ');
  }

  /** The blocks of the cells a side fills ("Period 1 – Period 2"). */
  private String heldRange(SetupMatchCells side, List<String> cells) {
    List<String> filled = new List<String>();
    for (String cell : cells) {
      if (side.at(cell) != SlotIds.OPEN) {
        filled.add(SetupMatchCells.blockOf(cell));
      }
    }
    return names.range(filled[0], filled[filled.size() - 1]);
  }

  /**
   * "Monday: Period 6 added, Period 5 no longer set up, Period 2 now 10:30 AM – 11:15 AM, Bunk 3
   * not at camp this week".
   */
  public String summary(ScheduleGrid was, ScheduleGrid now) {
    String weekday = BlankWeek.weekdayOf(day);
    if (was == null) {
      return weekday + ': added';
    }
    if (now == null) {
      return weekday + ': ' + lowerFirst(rules.notADay());
    }
    List<String> parts = blockParts(was, now);
    parts.addAll(timeParts(was, now));
    parts.addAll(groupParts(was, now));
    if (parts.isEmpty()) {
      // The same time blocks in a new order (one was moved to another time).
      parts.add(rules.blocksReordered());
    }
    return weekday + ': ' + String.join(parts, ', ');
  }

  private static List<String> blockParts(ScheduleGrid was, ScheduleGrid now) {
    List<String> parts = new List<String>();
    Set<String> wasBlocks = SetupMatchCells.ids(was.blockIds());
    Set<String> nowBlocks = SetupMatchCells.ids(now.blockIds());
    for (ScheduleGrid.Block block : now.blocks) {
      if (!wasBlocks.contains(SetupMatchCells.normal(block.id))) {
        parts.add(block.name + ' added');
      }
    }
    for (ScheduleGrid.Block block : was.blocks) {
      if (!nowBlocks.contains(SetupMatchCells.normal(block.id))) {
        parts.add(block.name + ' no longer set up');
      }
    }
    return parts;
  }

  /** A time block in both whose times changed, by its name in the week and its new times. */
  private List<String> timeParts(ScheduleGrid was, ScheduleGrid now) {
    Map<String, ScheduleGrid.Block> nowBlocks = new Map<String, ScheduleGrid.Block>();
    for (ScheduleGrid.Block block : now.blocks) {
      nowBlocks.put(SetupMatchCells.normal(block.id), block);
    }
    List<String> parts = new List<String>();
    for (ScheduleGrid.Block block : was.blocks) {
      ScheduleGrid.Block moved = nowBlocks.get(
        SetupMatchCells.normal(block.id)
      );
      if (
        moved != null &&
        SetupMatchCells.timesOf(moved) != SetupMatchCells.timesOf(block)
      ) {
        parts.add(rules.blockAt(block.name, moved.startTime, moved.endTime));
      }
    }
    return parts;
  }

  private List<String> groupParts(ScheduleGrid was, ScheduleGrid now) {
    List<String> parts = new List<String>();
    Set<String> wasGroups = SetupMatchCells.ids(was.groupIds());
    Set<String> nowGroups = SetupMatchCells.ids(now.groupIds());
    for (ScheduleGrid.GroupRef grp : now.groups) {
      if (!wasGroups.contains(SetupMatchCells.normal(grp.id))) {
        parts.add(grp.name + ' added');
      }
    }
    for (ScheduleGrid.GroupRef grp : was.groups) {
      String groupId = SetupMatchCells.normal(grp.id);
      if (!nowGroups.contains(groupId)) {
        parts.add(
          names.groupName(groupId) +
            ' ' +
            lowerFirst(rules.whyNoRow(Id.valueOf(groupId)))
        );
      }
    }
    return parts;
  }

  private static String lowerFirst(String text) {
    return text.left(1).toLowerCase() + text.substring(1);
  }
}
