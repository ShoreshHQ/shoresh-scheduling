/**
 * Import of one special day's or event's schedule from a file (ADR 0014 choice 17; desktop ADR
 * 2026-08-22-event-schedule-import): the screen reads the file with the import's own reader
 * (c/shoreshImportEngine) and sends one grid, its time blocks down and its columns across; this
 * saves it as the item's plan. For an event the columns become its stations; for a special day
 * each column is matched to a group of the camp by name, and a column that names none is left
 * out and said. Each name in a cell is the season's fixed or recurring activity of that name
 * (SPECIAL-2.2: Lunch in the file is the camp's Lunch, as a special day brings it in), else its
 * activity of that name, or a new one (SpecialActivities). Only a schedule with nothing the director put there is filled: one that
 * has entries is refused, as on the desktop, so a file never writes over what the director typed.
 * What a special day started with (its time blocks and the fixed and recurring activities
 * brought in) is not an entry, as the desktop's seed is not (its ADR 2026-08-22-event-schedule-import
 * §6): the file replaces it, and the screen names what it replaced. The file's time blocks (and an
 * event's stations) replace the plan's, and every change to them is named (SpecialImportFrame);
 * once the director has changed them, an import that would rename or remove any is not saved
 * until the director says yes (replaceEdited), so nothing they made goes quietly. Runs in user
 * mode; the plan is saved all at once under its item's lock.
 */
public with sharing class SpecialScheduleImport {
  /** What the screen read from the file. */
  public class Imported {
    @AuraEnabled
    public List<ImportedBlock> blocks { get; set; }
    @AuraEnabled
    public List<ImportedColumn> columns { get; set; }
    /**
     * The director said yes to replacing time blocks or stations they changed (asked when an
     * Outcome came back with asks).
     */
    @AuraEnabled
    public Boolean replaceEdited { get; set; }
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
    /** Brought in when the special day started, and replaced by the file (each name once). */
    @AuraEnabled
    public List<String> replaced = new List<String>();
    /** How many cells were filled. */
    @AuraEnabled
    public Integer placed = 0;
    /** What the file changes in the time blocks (and an event's stations). */
    @AuraEnabled
    public SpecialImportFrame.FrameChanges frame;
    /**
     * True when nothing was saved: the director changed the time blocks or stations the file
     * renames or removes (frame), and is asked first; sent again with replaceEdited to go ahead.
     */
    @AuraEnabled
    public Boolean asks = false;
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
    outcome.frame = SpecialImportFrame.between(owner, plan.grid, grid);
    if (
      imported.replaceEdited != true &&
      SpecialImportFrame.asksFirst(owner, plan.grid, outcome.frame)
    ) {
      outcome.asks = true;
      return outcome;
    }
    outcome.notGroups = columns.notGroups;
    outcome.replaced = SpecialPlanEntries.setTimesIn(plan.grid);
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
    if (plan.problem == null && SpecialPlanEntries.hasEntries(plan.grid)) {
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

  /**
   * Every name in the columns, each once: the season's fixed or recurring activity of that name
   * (SPECIAL-2.2), else its activity (made new if need be).
   */
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
    return SpecialActivities.namedInFile(owner.seasonId, names);
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
        row.add(tokenFor(grid, found.itemFor(name)));
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

  private static String tokenFor(ScheduleGrid grid, ScheduleGrid.Item item) {
    String key = String.valueOf(item.id);
    for (Integer i = 0; i < grid.items.size(); i++) {
      if (grid.items[i].id == key) {
        return String.valueOf(i + 1);
      }
    }
    grid.items.add(new ScheduleGrid.Item(item.kind, key, item.name));
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
