/**
 * Import of one special day's or event's schedule from a file (ADR 0014 choice 17; desktop ADR
 * 2026-08-22-event-schedule-import): the screen reads the file with the import's own reader
 * (c/shoreshImportEngine) and sends one grid, its time blocks down and its columns across; this
 * saves it as the item's plan. For an event the columns become its stations; for a special day
 * each column is matched to a group of the camp by name, and a column that names none is left
 * out and said. Each name in a cell is the season's activity of that name, or a new one
 * (SpecialActivities). Only an empty schedule is filled: one that already has entries is
 * refused, as on the desktop, so a file never writes over what the director typed. Runs in user
 * mode; the plan is saved all at once under its item's lock.
 */
public with sharing class SpecialScheduleImport {
  /** What the screen read from the file. */
  public class Imported {
    @AuraEnabled
    public List<ImportedBlock> blocks { get; set; }
    @AuraEnabled
    public List<ImportedColumn> columns { get; set; }
  }

  public class ImportedBlock {
    @AuraEnabled
    public String name { get; set; }
    /** "HH:mm". */
    @AuraEnabled
    public String startTime { get; set; }
    @AuraEnabled
    public String endTime { get; set; }
  }

  /** One column: its heading, and per time block a name, '' (nothing) or '^' (carries on). */
  public class ImportedColumn {
    @AuraEnabled
    public String name { get; set; }
    @AuraEnabled
    public List<String> cells { get; set; }
  }

  /** The plan as saved, and what the screen says about the import. */
  public class Outcome {
    @AuraEnabled
    public SpecialSchedule.PlanView plan;
    /** Activities the import added, each once. */
    @AuraEnabled
    public List<String> added = new List<String>();
    /** Columns that name no group of the camp (a special day's), left out. */
    @AuraEnabled
    public List<String> notGroups = new List<String>();
    /** How many cells were filled. */
    @AuraEnabled
    public Integer placed = 0;
  }

  public static Outcome apply(Id itemId, Integer revision, Imported imported) {
    SpecialImportCheck.check(imported);
    SpecialSchedule.Owner owner = SpecialSchedule.lockedOwnerOf(itemId);
    SpecialPlans.Plan plan = SpecialPlans.read(itemId);
    checkEmpty(owner, plan, revision);
    ScheduleGrid grid = new ScheduleGrid();
    grid.blocks = SpecialImportShape.blocks(imported);
    SpecialImportShape.Columns columns = owner.isEvent()
      ? SpecialImportShape.stations(imported)
      : SpecialImportShape.forGroups(groupsOf(owner, plan), imported);
    grid.groups = columns.rows;
    Outcome outcome = new Outcome();
    outcome.notGroups = columns.notGroups;
    SpecialActivities.Named found = activitiesFor(owner, columns.filling);
    outcome.added = found.added;
    for (ImportedColumn column : columns.filling) {
      grid.rows.add(rowOf(column, grid, found));
    }
    outcome.placed = placedIn(grid);
    grid.dropUnusedItems();
    SpecialPlans.write(itemId, grid, plan.revision);
    outcome.plan = SpecialSchedule.reread(owner);
    return outcome;
  }

  /** Refused when the plan was saved since the screen read it, or has entries. */
  private static void checkEmpty(
    SpecialSchedule.Owner owner,
    SpecialPlans.Plan plan,
    Integer revision
  ) {
    if (plan.revision != revision) {
      throw new ShoreshException(
        'Someone else changed this ' +
          CampLabels.forCamp(owner.campId).singularInSentence(owner.term) +
          ' since you opened it. Open it again to see their changes, then make yours.'
      );
    }
    if (plan.problem == null && SpecialSchedule.hasEntries(plan.grid)) {
      throw new ShoreshException(
        owner.name +
        ' already has entries. Clear it first if you want to replace it with an import, or add to it by hand.'
      );
    }
  }

  /** A special day's groups: its plan's, or every group in the camp when nothing is saved. */
  private static List<ScheduleGrid.GroupRef> groupsOf(
    SpecialSchedule.Owner owner,
    SpecialPlans.Plan plan
  ) {
    return plan.grid == null
      ? SpecialSchedule.emptyGrid(owner, null).groups
      : plan.grid.groups;
  }

  /** Every name in the columns, each once, as the season's activity (made new if need be). */
  private static SpecialActivities.Named activitiesFor(
    SpecialSchedule.Owner owner,
    List<ImportedColumn> columns
  ) {
    List<String> names = new List<String>();
    Set<String> seen = new Set<String>();
    for (ImportedColumn column : columns) {
      for (String cell : column.cells) {
        String name = nameIn(cell);
        if (name != null && seen.add(SpecialActivities.looseName(name))) {
          names.add(name);
        }
      }
    }
    return names.isEmpty()
      ? new SpecialActivities.Named()
      : SpecialActivities.named(owner.seasonId, names);
  }

  /** A cell's name, tidied; null for nothing or a carry-on. */
  private static String nameIn(String cell) {
    String name = cell == null ? '' : cell.normalizeSpace();
    if (name == '' || name == ScheduleGrid.CARRIES_ON) {
      return null;
    }
    return SpecialActivities.checkedName(name);
  }

  /** One column as a row of cells, adding each activity to the plan's list once. */
  private static List<String> rowOf(
    ImportedColumn column,
    ScheduleGrid grid,
    SpecialActivities.Named found
  ) {
    List<String> row = new List<String>();
    for (String cell : column.cells) {
      String name = nameIn(cell);
      if (name != null) {
        row.add(
          tokenFor(grid, found.byName.get(SpecialActivities.looseName(name)))
        );
      } else if (cell != null && cell.trim() == ScheduleGrid.CARRIES_ON) {
        // Carries on only from something above it in the same column.
        row.add(
          !row.isEmpty() && row[row.size() - 1] != ''
            ? ScheduleGrid.CARRIES_ON
            : ''
        );
      } else {
        row.add('');
      }
    }
    return row;
  }

  private static String tokenFor(ScheduleGrid grid, Activity__c activity) {
    String key = String.valueOf(activity.Id);
    for (Integer i = 0; i < grid.items.size(); i++) {
      if (grid.items[i].id == key) {
        return String.valueOf(i + 1);
      }
    }
    grid.items.add(new ScheduleGrid.Item('A', key, activity.Name));
    return String.valueOf(grid.items.size());
  }

  /** How many cells the import filled (where a name starts). */
  private static Integer placedIn(ScheduleGrid grid) {
    Integer placed = 0;
    for (List<String> row : grid.rows) {
      for (String cell : row) {
        if (cell != '' && cell != ScheduleGrid.CARRIES_ON) {
          placed++;
        }
      }
    }
    return placed;
  }
}
