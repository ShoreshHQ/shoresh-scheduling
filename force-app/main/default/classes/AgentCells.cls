/**
 * cells: an edit of several cells of a program's Generated Schedule or Manual Build week (a placement moved,
 * swapped, taken out whole, or cells copied and pasted), as the person, through an agent or the
 * command line (docs/protocol/api.md API-1.38 to API-1.40; on Manual Build, Manual Build's own
 * save, ManualBuildController.saveSlots, API-1.45). Web addresses /v1/move_cell,
 * /v1/take_out_cell and /v1/copy_cells (AgentMoveCell, AgentTakeOutCell, AgentCopyCells), each
 * POST {season, week, program, change, said, runs}. The edit is worked out where the screen works it
 * out, outside Salesforce: the connector runs the week editor's own module (c/shoreshWeekEditor
 * handEdits.js) on the week as it read it, and sends the runs the screen would send, with the
 * screen's words for them (change, and said: what stayed or was left out). This makes them the
 * screen's own hand edit (GeneratedEngineNotes.saveHandEdits: the same save, conflicts and
 * locking), each run made only when its cells still hold what the agent saw, so someone else's
 * change is never replaced unseen. A version marked "Through an agent" is kept first, so the
 * person sees it and Undo brings the week back (AgentUndo).
 */
public with sharing class AgentCells implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'change',
    'said',
    'runs'
  };

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    String change = AgentFields.text(body, 'change');
    List<SlotEdits.Run> runs = runsOf(body.get('runs'));
    if (String.isBlank(change) || runs.isEmpty()) {
      throw new ShoreshException(
        'That change could not be read. Download Shoresh\'s connector again from Settings in Shoresh.'
      );
    }
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(week.draft.Id);
    Id versionId = AgentWeeks.keepBefore(week.draft, days, change);

    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = runs;
    // One edit, as the screen sends one step: made whole or not at all.
    SlotEdits.Result result = week.manual
      ? ManualBuildController.saveSlots(
          week.draft.Id,
          new List<SlotEdits.Edit>{ edit }
        )
      : handEdit(week, days, edit);
    if (!result.conflicts.isEmpty()) {
      throw new AgentWeeks.ConflictException(
        'Changed by someone else since you read the week: ' +
          change +
          '. Nothing was changed.'
      );
    }
    AgentWeeks.changed(versionId, week.draft.Id);
    String said = AgentFields.text(body, 'said');
    return change + '.' + (String.isBlank(said) ? '' : ' ' + said);
  }

  /** Generated Schedule's own hand-edit save, the cells' Open reasons dropped as the screen drops them. */
  private static SlotEdits.Result handEdit(
    AgentWeeks.Week week,
    List<ScheduleDays.DayGrid> days,
    SlotEdits.Edit edit
  ) {
    GeneratedWeek.HandEdits request = new GeneratedWeek.HandEdits();
    request.scheduleId = week.draft.Id;
    request.revision = GeneratedDrafts.revisionOf(days);
    request.edits = new List<SlotEdits.Edit>{ edit };
    request.engineNotes = notesWithout(week.draft.EngineNotes__c, edit.runs);
    return GeneratedEngineNotes.saveHandEdits(request);
  }

  /** The runs as the screen sends them (SlotEdits.Run); anything else is refused. */
  private static List<SlotEdits.Run> runsOf(Object sent) {
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
