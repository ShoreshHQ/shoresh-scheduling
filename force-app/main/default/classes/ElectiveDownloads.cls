/**
 * What the elective downloads are made from (electives slice E10; repo ADR 0018 choices 51 to 54;
 * plan §7): a final run as the seats screen shows it, and each bunk's week from the schedule it
 * was finalized against, so a camper's week has their bunk's activities with their electives in
 * place. Downloads come once seats are final (decision 48.2: Finalize, then downloads); a
 * committed run is refused, saying so. The files themselves are made in the browser (SheetJS),
 * from what the director can already read: nothing is stored in the org.
 *
 * Read in user mode through ElectiveRunState, in its fixed number of queries, and the kept
 * version's days once more for the bunks' weeks: one query more, whatever the size.
 */
public with sharing class ElectiveDownloads {
  public static final String NOT_FINAL = 'Downloads come once seats are final. Finalize first.';

  public class Download {
    @AuraEnabled
    public ElectiveSeats.RunView view;
    @AuraEnabled
    public String weekName;
    @AuraEnabled
    public List<BunkDay> days = new List<BunkDay>();
  }

  /** One day of the schedule: its time blocks and what each bunk of the program has. */
  public class BunkDay {
    @AuraEnabled
    public Date day;
    @AuraEnabled
    public List<BlockInfo> blocks = new List<BlockInfo>();
    @AuraEnabled
    public List<BunkCells> bunks = new List<BunkCells>();
  }

  public class BlockInfo {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String startTime;
  }

  public class BunkCells {
    @AuraEnabled
    public Id groupId;
    @AuraEnabled
    public List<Cell> cells = new List<Cell>();
  }

  /**
   * What a bunk has from one time block, once however many blocks it takes: its name as the
   * schedule saved it, its kind (ScheduleGrid's A, F, R, E, D, S, T), how many blocks, and
   * whether it is this run's elective set (where a camper's seat goes).
   */
  public class Cell {
    @AuraEnabled
    public String blockId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String kind;
    @AuraEnabled
    public Integer blocks = 1;
    @AuraEnabled
    public Boolean thisSet = false;
  }

  /** A final run and its bunks' week, or refused when it is not final yet. */
  public static Download forRun(Id runId) {
    ElectiveRunState state = new ElectiveRunState(runId);
    if (!state.isFinal()) {
      throw new ShoreshException(NOT_FINAL);
    }
    Download result = new Download();
    result.view = ElectiveSeats.viewOf(state);
    result.weekName = state.run.Week__r.Name;
    String setId = String.valueOf(state.run.ElectiveSet__c);
    // The version kept at Finalize (read once more here), or the live days without one.
    List<ScheduleDays.DayGrid> days = state.run.FinalSchedule__c == null
      ? state.liveDays
      : ScheduleDays.read(state.run.FinalSchedule__c);
    for (ScheduleDays.DayGrid each : days) {
      if (each.grid != null) {
        result.days.add(dayOf(each, state.groups, setId));
      }
    }
    return result;
  }

  private static BunkDay dayOf(
    ScheduleDays.DayGrid each,
    Map<Id, Group__c> groups,
    String setId
  ) {
    ScheduleGrid grid = each.grid;
    BunkDay made = new BunkDay();
    made.day = each.day;
    for (ScheduleGrid.Block block : grid.blocks) {
      BlockInfo info = new BlockInfo();
      info.id = block.id;
      info.name = block.name;
      info.startTime = block.startTime;
      made.blocks.add(info);
    }
    for (Integer g = 0; g < grid.groups.size(); g++) {
      String groupId = grid.groups[g].id;
      if (GridItems.isId(groupId) && groups.containsKey(Id.valueOf(groupId))) {
        made.bunks.add(bunkOf(grid, g, setId));
      }
    }
    return made;
  }

  /** A bunk's cells, one per thing it does, with how many blocks it carries on for. */
  private static BunkCells bunkOf(ScheduleGrid grid, Integer g, String setId) {
    BunkCells bunk = new BunkCells();
    bunk.groupId = Id.valueOf(grid.groups[g].id);
    Cell open = null;
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      String text = grid.rows[g][b];
      if (text == ScheduleGrid.CARRIES_ON && open != null) {
        open.blocks++;
        continue;
      }
      open = null;
      ScheduleGrid.Item item = GridItems.itemAt(grid, g, b);
      if (item == null) {
        continue;
      }
      open = new Cell();
      open.blockId = grid.blocks[b].id;
      open.name = item.name;
      open.kind = item.kind;
      open.thisSet = item.kind == ElectiveTimes.ELECTIVE && item.id == setId;
      bunk.cells.add(open);
    }
    return bunk;
  }
}
