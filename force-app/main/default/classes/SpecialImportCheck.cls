/**
 * Whether what the screen read from a file is shaped like one special day's or event's schedule
 * (ADR 0014 choice 17), before anything is matched or saved: time blocks with times, columns,
 * a cell in each column for each time block, and no more than one schedule could hold.
 */
public with sharing class SpecialImportCheck {
  private static final Integer MAX_BLOCKS = 40;
  private static final Integer MAX_COLUMNS = 150;

  /** Refuses a file read into a shape that can't be a schedule. */
  public static void check(SpecialScheduleImport.Imported imported) {
    if (!hasBoth(imported)) {
      throw new ShoreshException('No schedule could be read out of that file.');
    }
    checkSize(imported.blocks.size(), imported.columns.size());
    checkTimes(imported.blocks);
    checkColumns(imported);
  }

  /**
   * Refuses more time blocks or columns than one schedule holds (also for Import last year's
   * special days, INGEST-4.3).
   */
  public static void checkSize(Integer blocks, Integer columns) {
    if (blocks > MAX_BLOCKS || columns > MAX_COLUMNS) {
      throw new ShoreshException(
        'That file is too big to be one schedule. Check it is the right file.'
      );
    }
  }

  /** Time blocks and columns, at least one of each. */
  private static Boolean hasBoth(SpecialScheduleImport.Imported imported) {
    return imported != null &&
      imported.blocks != null &&
      !imported.blocks.isEmpty() &&
      imported.columns != null &&
      !imported.columns.isEmpty();
  }

  /** Every column has a cell for every time block. */
  private static void checkColumns(SpecialScheduleImport.Imported imported) {
    for (SpecialScheduleImport.ImportedColumn column : imported.columns) {
      if (
        column == null ||
        column.cells == null ||
        column.cells.size() != imported.blocks.size()
      ) {
        throw new ShoreshException('That file could not be read. Try again.');
      }
    }
  }

  private static void checkTimes(
    List<SpecialScheduleImport.ImportedBlock> blocks
  ) {
    for (SpecialScheduleImport.ImportedBlock block : blocks) {
      String startTime = block == null
        ? null
        : SpecialPlanClock.of(block.startTime);
      String endTime = block == null
        ? null
        : SpecialPlanClock.of(block.endTime);
      if (startTime == null || endTime == null || endTime <= startTime) {
        throw new ShoreshException(
          'A time in that file could not be read. Check its times and try again.'
        );
      }
    }
  }
}
