/**
 * cells: a hand edit of a program's Generated Schedule or Manual Build week (a cell typed in, a
 * placement moved, swapped, made longer or shorter, taken out whole, cells copied and pasted, a
 * day or week cleared), as the person, through an agent or the command line (docs/protocol/api.md
 * API-1.11, API-1.13, API-1.38 to API-1.40; on Manual Build, Manual Build's own save,
 * ManualBuildController.saveSlots, API-1.42, API-1.45). Web addresses /v1/schedule_cell,
 * /v1/move_cell, /v1/take_out_cell and /v1/copy_cells (AgentCell, AgentMoveCell,
 * AgentTakeOutCell, AgentCopyCells), each POST {season, week, program, change, said, runs,
 * revision}. The edit is worked out where the screen works it
 * out, outside Salesforce: the connector runs the week editor's own module (c/shoreshWeekEditor
 * handEdits.js) on the week as it read it, and sends the runs the screen would send, with the
 * screen's words for them (change, and said: what stayed or was left out). This makes them the
 * screen's own hand edit (GeneratedHandEdit: the same save, conflicts and
 * locking), each run made only when its cells still hold what the agent saw, so someone else's
 * change is never replaced unseen. As on the screen, no version is kept, except before a day or
 * week is cleared (AgentClearCells: "Before Clear Monday", WEEK-6.14): the answer gives the
 * week's revision after the edit, so the connector can hold its Undo (the runs back, as the
 * editor's history holds them) for the rest of the conversation (AgentUndo, API-1.14).
 */
public virtual with sharing class AgentCells implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'change',
    'said',
    'runs',
    'revision'
  };

  public virtual Set<String> fields() {
    return FIELDS;
  }

  public String run(Map<String, Object> body) {
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    String change = AgentFields.text(body, 'change');
    List<SlotEdits.Run> runs = runsOf(body.get('runs'));
    if (String.isBlank(change) || runs.isEmpty()) {
      throw new ShoreshException(
        'That change could not be read. Download Shoresh\'s connector again from Settings in Shoresh.'
      );
    }
    String seen = AgentSchedules.holdAsSeen(week, body, 'revision');
    Map<String, Object> kept = keepFirst(week, change);
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = runs;
    // One edit, as the screen sends one step: made whole or not at all.
    SlotEdits.Result result = AgentSchedules.saveEdit(week, seen, edit);
    if (!result.conflicts.isEmpty()) {
      throw AgentWeeks.changedSince(change);
    }
    Map<String, Object> undo = AgentUndoHeld.entry(
      week.draft.Id,
      'edit',
      change
    );
    undo.put('seen', result.revision);
    undo.putAll(kept);
    AgentUndoHeld.hold(undo);
    String said = AgentFields.text(body, 'said');
    return change +
      '.' +
      (String.isBlank(said) ? '' : ' ' + said) +
      (kept.isEmpty()
        ? ''
        : ' The week as it was is kept in Versions as "' +
          kept.get('version_name') +
          '".');
  }

  /**
   * The version kept before the edit, as the screen keeps one ({ version, version_name } for its
   * Undo), or none: a hand edit keeps none.
   */
  protected virtual Map<String, Object> keepFirst(
    AgentWeeks.Week week,
    String change
  ) {
    return new Map<String, Object>();
  }

  /**
   * Generated Schedule's own hand-edit save, the cells' Open reasons dropped as the screen drops
   * them, with the week's ticket (seen) as the screen sends the revision it read.
   */
  public static SlotEdits.Result handEdit(
    AgentWeeks.Week week,
    String seen,
    SlotEdits.Edit edit
  ) {
    GeneratedWeek.HandEdits request = new GeneratedWeek.HandEdits();
    request.scheduleId = week.draft.Id;
    request.revision = seen;
    request.edits = new List<SlotEdits.Edit>{ edit };
    request.engineNotes = notesWithout(week.draft.EngineNotes__c, edit.runs);
    return GeneratedHandEdit.save(request);
  }

  /** The runs as the screen sends them (SlotEdits.Run); anything else is refused. */
  public static List<SlotEdits.Run> runsOf(Object sent) {
    if (!(sent instanceof List<Object>)) {
      return new List<SlotEdits.Run>();
    }
    try {
      return (List<SlotEdits.Run>) JSON.deserialize(
        JSON.serialize(sent),
        List<SlotEdits.Run>.class
      );
    } catch (JSONException e) {
      return new List<SlotEdits.Run>();
    }
  }

  /**
   * The engine's notes without the Open reasons of every cell the runs change, as the screen
   * drops them before it saves a hand edit (GeneratedEngineNotes.withoutCell, cell by cell).
   */
  private static String notesWithout(String notes, List<SlotEdits.Run> runs) {
    String kept = notes;
    for (SlotEdits.Run run : runs) {
      for (
        String blockId : run.blockIds == null
          ? new List<String>()
          : run.blockIds
      ) {
        if (kept == null) {
          return null;
        }
        kept = GeneratedEngineNotes.withoutCell(
          kept,
          new List<String>{ String.valueOf(run.day), run.groupId, blockId }
        );
      }
    }
    return kept;
  }
}
