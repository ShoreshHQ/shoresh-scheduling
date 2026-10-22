/**
 * What an imported file gives a special day's or event's plan (ADR 0014 choice 17), before any
 * name is matched: its time blocks, and its columns, an
 * event's as its stations, a special day's matched to the camp's groups by name (a column naming
 * none is left out and said). Pure: no queries.
 */
public with sharing class SpecialImportShape {
  /** The plan's rows, and the column that fills each (in the same order). */
  public class Columns {
    public List<ScheduleGrid.GroupRef> rows = new List<ScheduleGrid.GroupRef>();
    public List<SpecialScheduleImport.ImportedColumn> filling = new List<SpecialScheduleImport.ImportedColumn>();
    /** Columns that name no group of the camp, left out. */
    public List<String> notGroups = new List<String>();
  }

  /** The file's time blocks as the plan's own ("b1"...), in the file's order. */
  public static List<ScheduleGrid.Block> blocks(
    SpecialScheduleImport.Imported imported
  ) {
    List<ScheduleGrid.Block> result = new List<ScheduleGrid.Block>();
    for (SpecialScheduleImport.ImportedBlock block : imported.blocks) {
      String startTime = SpecialPlanClock.of(block.startTime);
      String endTime = SpecialPlanClock.of(block.endTime);
      String name = block.name == null ? '' : block.name.normalizeSpace();
      result.add(
        new ScheduleGrid.Block(
            'b' + (result.size() + 1),
            name == ''
              ? SpecialPlanClock.rangeName(startTime, endTime)
              : name.left(SpecialActivities.NAME_LIMIT)
          )
          .at(startTime, endTime)
      );
    }
    return result;
  }

  /** An event: every column is one of its stations, in the file's order. */
  public static Columns stations(SpecialScheduleImport.Imported imported) {
    Columns result = new Columns();
    for (SpecialScheduleImport.ImportedColumn column : imported.columns) {
      String name = column.name == null ? '' : column.name.normalizeSpace();
      Integer c = result.rows.size() + 1;
      result.rows.add(
        new ScheduleGrid.GroupRef(
          's' + c,
          name == '' ? 'Station ' + c : name.left(SpecialActivities.NAME_LIMIT)
        )
      );
      result.filling.add(column);
    }
    return result;
  }

  /**
   * A special day: its groups as they are, each filled from the column that names it (spaces and
   * capitals aside); a name two groups share fills the first of them.
   */
  public static Columns forGroups(
    List<ScheduleGrid.GroupRef> groups,
    SpecialScheduleImport.Imported imported
  ) {
    Map<String, Integer> groupAt = new Map<String, Integer>();
    for (Integer g = groups.size() - 1; g >= 0; g--) {
      groupAt.put(SpecialActivities.looseName(groups[g].name), g);
    }
    Map<Integer, SpecialScheduleImport.ImportedColumn> byGroup = new Map<Integer, SpecialScheduleImport.ImportedColumn>();
    Columns result = new Columns();
    for (SpecialScheduleImport.ImportedColumn column : imported.columns) {
      Integer g = groupAt.get(SpecialActivities.looseName(column.name));
      if (g != null && !byGroup.containsKey(g)) {
        byGroup.put(g, column);
      } else if (String.isNotBlank(column.name)) {
        result.notGroups.add(column.name.normalizeSpace());
      }
    }
    for (Integer g = 0; g < groups.size(); g++) {
      result.rows.add(groups[g]);
      result.filling.add(
        byGroup.containsKey(g)
          ? byGroup.get(g)
          : emptyColumn(imported.blocks.size())
      );
    }
    return result;
  }

  private static SpecialScheduleImport.ImportedColumn emptyColumn(
    Integer size
  ) {
    SpecialScheduleImport.ImportedColumn column = new SpecialScheduleImport.ImportedColumn();
    column.cells = new List<String>();
    for (Integer b = 0; b < size; b++) {
      column.cells.add('');
    }
    return column;
  }
}
