/**
 * One day's grid while "Start a blank week" fills it (BlankWeek): the program's time blocks and
 * groups, every slot Open, then each fixed or recurring activity placed in the groups it takes.
 */
public with sharing class BlankDay {
  public ScheduleGrid grid = new ScheduleGrid();
  // "Rest · Bunk 3": a fixed or recurring activity whose slot was already taken.
  public List<String> notPlaced = new List<String>();
  private Map<Id, Integer> blockIndex = new Map<Id, Integer>();
  private Map<Id, Integer> groupIndex = new Map<Id, Integer>();

  public BlankDay(List<TimeBlock__c> blocks, List<Group__c> groups) {
    for (TimeBlock__c block : blocks) {
      blockIndex.put(block.Id, grid.blocks.size());
      grid.blocks.add(
        new ScheduleGrid.Block(block.Id, block.Name)
          .at(
            BlankWeek.clock(block.StartTime__c),
            BlankWeek.clock(block.EndTime__c)
          )
      );
    }
    for (Group__c grp : groups) {
      groupIndex.put(grp.Id, grid.groups.size());
      grid.groups.add(new ScheduleGrid.GroupRef(grp.Id, grp.Name));
      List<String> row = new List<String>();
      for (TimeBlock__c block : blocks) {
        row.add('');
      }
      grid.rows.add(row);
    }
  }

  /**
   * One fixed or recurring activity, in every group it takes. A slot already taken is left as
   * it is and named in notPlaced: setup refuses such clashes (slice 3b), so it only happens with
   * setup saved around them, and the director is told rather than left to find it.
   */
  public void place(SetTimePlan.Item item) {
    List<Integer> span = item.span();
    if (span.isEmpty()) {
      return;
    }
    String position = null;
    for (Group__c grp : item.program.groups) {
      List<String> row = rowFor(item, grp);
      // A group at camp for only part of the item's length (a morning-only or afternoon-only
      // group, an item that crosses midday) takes the part it is there for, as the clash
      // checks count it (SetTimeGroupClashes).
      List<Integer> part = row == null
        ? new List<Integer>()
        : atCampPart(item, grp, span);
      if (part.isEmpty()) {
        continue;
      }
      Integer first = blockIndex.get(item.program.blocks[part[0]].Id);
      if (!free(row, first, part.size())) {
        notPlaced.add(item.name + ' · ' + grp.Name);
        continue;
      }
      position = position == null ? add(item) : position;
      row[first] = position;
      for (Integer b = first + 1; b < first + part.size(); b++) {
        row[b] = ScheduleGrid.CARRIES_ON;
      }
    }
  }

  /** The group's row of this day, when the item takes the group and the group is on it. */
  private List<String> rowFor(SetTimePlan.Item item, Group__c grp) {
    return item.groupIds.contains(grp.Id) && groupIndex.containsKey(grp.Id)
      ? grid.rows[groupIndex.get(grp.Id)]
      : null;
  }

  /**
   * The item's blocks the group is at camp for: from the first such block, unbroken. Also how a
   * new special day brings an item in (SpecialDayStart).
   */
  public static List<Integer> atCampPart(
    SetTimePlan.Item item,
    Group__c grp,
    List<Integer> span
  ) {
    List<Integer> part = new List<Integer>();
    for (Integer b : span) {
      if (SetTimePlan.atCamp(grp, item.program.blocks[b])) {
        part.add(b);
      } else if (!part.isEmpty()) {
        break;
      }
    }
    return part;
  }

  private String add(SetTimePlan.Item item) {
    grid.items.add(
      new ScheduleGrid.Item(
        item.term == 'FixedActivity' ? 'F' : 'R',
        item.record.Id,
        item.name
      )
    );
    return String.valueOf(grid.items.size());
  }

  private Boolean free(List<String> row, Integer first, Integer length) {
    for (Integer b = first; b < first + length; b++) {
      if (b >= row.size() || String.isNotBlank(row[b])) {
        return false;
      }
    }
    return true;
  }
}
