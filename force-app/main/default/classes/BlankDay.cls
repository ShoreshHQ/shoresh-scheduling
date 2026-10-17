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
    Integer first = blockIndex.get(item.program.blocks[span[0]].Id);
    String position = null;
    for (Group__c grp : item.groupsIn(span[0])) {
      List<String> row = groupIndex.containsKey(grp.Id)
        ? grid.rows[groupIndex.get(grp.Id)]
        : null;
      if (row == null) {
        continue;
      }
      if (!free(row, first, span.size())) {
        notPlaced.add(item.name + ' · ' + grp.Name);
        continue;
      }
      if (position == null) {
        position = add(item);
      }
      row[first] = position;
      for (Integer b = first + 1; b < first + span.size(); b++) {
        row[b] = ScheduleGrid.CARRIES_ON;
      }
    }
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
