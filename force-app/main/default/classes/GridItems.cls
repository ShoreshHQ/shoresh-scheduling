/**
 * Whether a day's grid text (ScheduleGrid, repo ADR 0005) is a record Id. For the elective seats'
 * reads (ElectiveTimes, ElectivePlaceClashes; repo ADR 0018 slice E7). The item a cell holds is
 * ScheduleGridCells.itemAt.
 */
public with sharing class GridItems {
  /** Whether a grid's text is a record Id (an item not set up yet has none). */
  public static Boolean isId(String text) {
    if (String.isBlank(text) || (text.length() != 15 && text.length() != 18)) {
      return false;
    }
    try {
      return Id.valueOf(text) != null;
    } catch (Exception e) {
      return false;
    }
  }
}
