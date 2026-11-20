/**
 * undo: take back the last change made through this conversation to a program's Generated
 * Schedule or Manual Build week, as the screen's Undo takes back what was just done
 * (docs/protocol/api.md API-1.14, API-1.41, API-1.148). Web address /v1/undo_last_change,
 * POST {season, week, program, schedule, held}. Salesforce keeps nothing for it: the connector
 * holds, for this conversation only, what each change's answer left for its Undo (AgentUndoHeld),
 * as the screen holds its Undo only while the page is open, and sends it here as held (by the
 * week's draft). What it takes back is the screen's own Undo:
 *   - a hand edit (a cell, several cells, a clear, rain plans, a special event): its runs sent
 *     back through the same hand-edit save, as the editor's history does; no version is kept;
 *   - Rebuild or Start over: GeneratedUndoController.undoBuild with the version the save kept,
 *     which keeps the week first as "Before Undo".
 * What the screen has no Undo for, and a week this conversation hasn't changed, is refused in
 * plain words naming the way back (Versions' Restore). A newer change is never taken back
 * unseen: on Generated Schedule it is refused, nothing changed, when anyone has saved the week
 * since (the week's revision); on Manual Build, as its own save checks every edit, cell by cell:
 * a cell someone changed since refuses it, nothing changed.
 * With special (and kind) instead of a week, it is a special day's or event's own schedule, as
 * its page's Undo (AgentUndoSpecial).
 */
@RestResource(urlMapping='/v1/undo_last_change')
global with sharing class AgentUndo implements AgentWeeks.Action, AgentAskFirst.Preview {
  public static final String EDIT = 'edit';
  public static final String BUILD = 'build';
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'special',
    'kind',
    'held'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentUndo());
  }

  /** What it takes back (API-1.106); null when there is nothing it can, so it is refused at once. */
  public String preview() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    if (AgentUndoSpecial.isAsked(body)) {
      return AgentUndoSpecial.preview(body);
    }
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    Map<String, Object> held = AgentUndoHeld.heldAt(body, week.draft.Id);
    String kind = AgentUndoHeld.kindOf(held);
    if (kind != EDIT && kind != BUILD) {
      return null;
    }
    AgentAskFirst.stateIs((String) held.get('seen'));
    return 'This undoes "' +
      held.get('label') +
      '" in ' +
      week.name +
      ' (' +
      week.program.Name +
      ', ' +
      AgentSchedules.screenOf(week) +
      '), as the screen\'s Undo does: ' +
      (kind == EDIT
        ? 'the cells it changed go back to what they held before it.'
        : 'the week goes back to "' +
          held.get('version_name') +
          '", and the week as it is now is kept in Versions as "Before Undo".');
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    if (AgentUndoSpecial.isAsked(body)) {
      return AgentUndoSpecial.run(body);
    }
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    Map<String, Object> held = AgentUndoHeld.heldAt(body, week.draft.Id);
    String kind = AgentUndoHeld.kindOf(held);
    if (kind == EDIT) {
      return undoEdit(week, held);
    }
    if (kind == BUILD) {
      return undoBuild(week, held);
    }
    throw new ShoreshException(
      held == null ? nothingHeld(week) : noScreenUndo(week, held)
    );
  }

  /** A hand edit's runs back through the same save, as the editor's history sends them. */
  private static String undoEdit(
    AgentWeeks.Week week,
    Map<String, Object> held
  ) {
    String label = (String) held.get('label');
    String seen = AgentSchedules.holdAsSeen(
      week,
      new Map<String, Object>{ 'seen' => held.get('seen') },
      'seen'
    );
    SlotEdits.Result result = week.manual
      ? ManualBuildController.saveSlots(
          week.draft.Id,
          new List<SlotEdits.Edit>{ AgentUndoHeld.editOf(held) }
        )
      : AgentCells.handEdit(week, seen, AgentUndoHeld.editOf(held));
    if (!result.conflicts.isEmpty()) {
      throw new AgentWeeks.ConflictException(ScheduleDaySaves.CHANGED_SINCE);
    }
    Map<String, Object> undone = AgentUndoHeld.entry(
      week.draft.Id,
      'undone',
      label
    );
    undone.put('seen', result.revision);
    AgentUndoHeld.hold(undone);
    return 'Undone: ' + label + '.';
  }

  /** Rebuild's or Start over's Undo on Generated Schedule: the screen's own. */
  private static String undoBuild(
    AgentWeeks.Week week,
    Map<String, Object> held
  ) {
    String label = (String) held.get('label');
    Boolean done = GeneratedUndoController.undoBuild(
      week.draft.Id,
      Id.valueOf((String) held.get('version')),
      (String) held.get('seen')
    );
    if (!done) {
      throw new AgentWeeks.ConflictException(ScheduleDaySaves.CHANGED_SINCE);
    }
    AgentUndoHeld.hold(AgentUndoHeld.entry(week.draft.Id, 'undone', label));
    return 'Undone: ' + label + '.';
  }

  /** Nothing changed through this conversation: as a page opened again, which has no Undo. */
  private static String nothingHeld(AgentWeeks.Week week) {
    return 'Nothing to undo: this conversation hasn\'t changed ' +
      week.name +
      ' (' +
      AgentSchedules.screenOf(week) +
      '). The screen\'s Undo lasts only while its page is open, and Undo here only for the conversation that made the change. Versions has the versions kept; restore_version brings one back.';
  }

  /** What the screen offers no Undo for: said, with the version it kept, if it kept one. */
  private static String noScreenUndo(
    AgentWeeks.Week week,
    Map<String, Object> held
  ) {
    String kept = (String) held.get('version_name');
    return 'The screen has no Undo for "' +
      held.get('label') +
      '", so nothing was undone. ' +
      (String.isBlank(kept)
        ? 'It kept no version of ' +
          week.name +
          ' before it; Versions has the versions there are, and restore_version brings one back.'
        : 'Versions has "' +
          kept +
          '", ' +
          week.name +
          ' as it was before it; restore_version brings it back.');
  }
}
