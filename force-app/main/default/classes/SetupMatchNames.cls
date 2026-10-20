/**
 * What "Update to match setup" (SetupMatchDay) calls things: the items, time blocks and groups of
 * the draft's day and of the day setup makes now, setup's names winning (Greg, Manual Build round
 * 2 #3: a rename shows the new name). Anything deleted since keeps the name it was saved with.
 */
public with sharing class SetupMatchNames {
  private SetupMatchRules rules;
  private Map<String, ScheduleGrid.Item> itemByOwner = new Map<String, ScheduleGrid.Item>();
  private Map<String, ScheduleGrid.Block> blockById = new Map<String, ScheduleGrid.Block>();
  private Map<String, String> groupNames = new Map<String, String>();

  /** was: the draft's day, now: the blank day setup gives (either may be null). */
  public SetupMatchNames(
    SetupMatchRules rules,
    ScheduleGrid was,
    ScheduleGrid now
  ) {
    this.rules = rules;
    collect(was);
    collect(now);
  }

  /** The later grid's names win: the blank day's are setup's own. */
  private void collect(ScheduleGrid grid) {
    if (grid == null) {
      return;
    }
    for (ScheduleGrid.Item item : grid.items) {
      itemByOwner.put(SlotIds.of(item), item);
    }
    for (ScheduleGrid.Block block : grid.blocks) {
      blockById.put(SetupMatchCells.normal(block.id), block);
    }
    for (ScheduleGrid.GroupRef grp : grid.groups) {
      groupNames.put(SetupMatchCells.normal(grp.id), grp.name);
    }
  }

  /** Every time block either day has, by Id (18 characters). */
  public Map<String, ScheduleGrid.Block> blocks() {
    return blockById;
  }

  public ScheduleGrid.Block block(String blockId) {
    return blockById.get(blockId);
  }

  /** The item an identity stands for, with its name in setup now. */
  public ScheduleGrid.Item itemNow(String owner) {
    ScheduleGrid.Item item = itemByOwner.get(owner);
    return new ScheduleGrid.Item(item.kind, item.id, nameOf(owner));
  }

  /** What an identity is called now: an activity by its setup name, else as the grids name it. */
  public String nameOf(String owner) {
    Id activityId = SlotIds.activityIn(owner);
    if (activityId != null && rules.activities.containsKey(activityId)) {
      return rules.activities.get(activityId).Name;
    }
    return itemByOwner.containsKey(owner) ? itemByOwner.get(owner).name : owner;
  }

  /** A group's name now, or as the grids name it once it is no longer in the program. */
  public String groupName(String groupId) {
    String name = rules.groupName(Id.valueOf(groupId));
    return name != null ? name : groupNames.get(groupId);
  }

  /** "Period 1 – Period 2": the blocks from first to last (Ids, 18 characters). */
  public String range(String firstBlockId, String lastBlockId) {
    return BlockRange.of(
      blockById.get(firstBlockId),
      blockById.get(lastBlockId)
    );
  }
}
