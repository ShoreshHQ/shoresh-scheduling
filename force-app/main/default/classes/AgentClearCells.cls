/**
 * clear_day and clear_week: a day or week of a program's Manual Build cleared, as the person,
 * through an agent or the command line (docs/protocol/api/week-edits.md API-1.143). Web address
 * /v1/clear_cells; the edit is AgentCells', with the week kept first as Clear keeps it on the
 * screen ("Before Clear Monday", WEEK-6.14).
 */
@RestResource(urlMapping='/v1/clear_cells')
global with sharing class AgentClearCells {
  private static final String CLEARED = 'Cleared ';

  @HttpPost
  global static void post() {
    AgentRequest.answer(new Clear());
  }

  /** A hand edit that keeps the week first, named for what was cleared. */
  public with sharing class Clear extends AgentCells {
    protected override Map<String, Object> keepFirst(
      AgentWeeks.Week week,
      String change
    ) {
      if (!change.startsWith(CLEARED)) {
        throw new ShoreshException(
          'That change could not be read. Download Shoresh\'s connector again from Settings in Shoresh.'
        );
      }
      // Generated Schedule has no Clear (its Start over is start_over_week), as on the screen.
      if (!week.manual) {
        throw new ShoreshException(
          'Clear day and Clear week are on Manual Build only. Nothing was changed.'
        );
      }
      // Shortened to fit as the version's own name is (RainyDayController.keep), so the name
      // said and held for Undo is the one saved.
      String kept = ('Before Clear ' + change.removeStart(CLEARED))
        .abbreviate(SchedulesController.NAME_LIMIT);
      return new Map<String, Object>{
        'version' => AgentScreenVersions.keepVersion(week, kept),
        'version_name' => kept
      };
    }
  }
}
