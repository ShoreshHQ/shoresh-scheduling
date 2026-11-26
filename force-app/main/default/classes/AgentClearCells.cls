/**
 * clear_day and clear_week: a day or week of a program's Manual Build cleared, as the person,
 * through an agent or the command line (docs/protocol/api/week-edits.md API-1.143). Web address
 * /v1/clear_cells; the edit is AgentCells', asked first as the screen asks it (WEEK-6.15, API-1.106:
 * its preview is the screen's own, worked out by the connector with the week editor's
 * clearPreview), and the week kept first as Clear keeps it on the screen ("Before Clear Monday",
 * WEEK-6.14).
 */
@RestResource(urlMapping='/v1/clear_cells')
global with sharing class AgentClearCells {
  private static final String CLEARED = 'Cleared ';
  private static final String UNREADABLE = 'That change could not be read. Download Shoresh\'s connector again from Settings in Shoresh.';

  @HttpPost
  global static void post() {
    AgentRequest.answer(new Clear());
  }

  /** A hand edit that asks first and keeps the week first, named for what was cleared. */
  public with sharing class Clear extends AgentCells implements AgentAskFirst.Preview {
    public override Set<String> fields() {
      Set<String> taken = new Set<String>(super.fields());
      taken.add('preview');
      return taken;
    }

    /**
     * The screen's preview as the connector worked it out ("Bunk 1 · Monday: Swim, Soccer", what
     * stays, the version kept), said for this week; its confirm is tied to the week as it is now,
     * so a week saved since asks again.
     */
    public String preview(Map<String, Object> body) {
      AgentWeeks.Week week = AgentSchedules.eitherOf(body);
      String change = AgentFields.text(body, 'change');
      refuseUnlessClear(week, change);
      AgentAskFirst.stateIs(
        WeekTickets.stamp(ScheduleDays.read(week.draft.Id))
      );
      return 'This clears ' +
        change.removeStart(CLEARED) +
        ' in ' +
        week.name +
        ' (' +
        week.program.Name +
        ', ' +
        AgentSchedules.screenOf(week) +
        '). ' +
        sentences(body.get('preview'));
    }

    protected override Map<String, Object> keepFirst(
      AgentWeeks.Week week,
      String change
    ) {
      refuseUnlessClear(week, change);
      String kept = 'Before Clear ' + change.removeStart(CLEARED);
      return new Map<String, Object>{
        'version' => AgentScreenVersions.keepVersion(week, kept),
        'version_name' => kept
      };
    }
  }

  private static void refuseUnlessClear(AgentWeeks.Week week, String change) {
    if (String.isBlank(change) || !change.startsWith(CLEARED)) {
      throw new ShoreshException(UNREADABLE);
    }
    // Generated Schedule has no Clear (its Start over is start_over_week), as on the screen.
    if (!week.manual) {
      throw new ShoreshException(
        'Clear day and Clear week are on Manual Build only. Nothing was changed.'
      );
    }
  }

  /** The preview's lines as sentences, each ending with its full stop; anything else is refused. */
  private static String sentences(Object lines) {
    if (!(lines instanceof List<Object>) || ((List<Object>) lines).isEmpty()) {
      throw new ShoreshException(UNREADABLE);
    }
    List<String> said = new List<String>();
    for (Object line : (List<Object>) lines) {
      if (!(line instanceof String) || String.isBlank((String) line)) {
        throw new ShoreshException(UNREADABLE);
      }
      String text = ((String) line).trim();
      said.add(text.endsWith('.') ? text : text + '.');
    }
    return String.join(said, ' ');
  }
}
