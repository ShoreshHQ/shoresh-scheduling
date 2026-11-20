/**
 * undo_last_change for a special day's or event's own schedule (docs/protocol/api.md
 * API-1.14, API-1.77), asked with special (and kind) instead of a week: its page's Undo. The
 * connector holds a cell's runs back for the conversation, as the page's history does, and sends
 * them as held (by the plan's item); they go back through the page's own save
 * (SpecialScheduleController.saveCells), each made only where its cells still hold what the
 * change left, as the page's history sends them. A frame change or an import has no Undo there.
 */
public with sharing class AgentUndoSpecial {
  /** Whether the request names a special day's or event's own schedule. */
  public static Boolean isAsked(Map<String, Object> body) {
    return String.isNotBlank(AgentFields.text(body, 'special'));
  }

  /** What it takes back (API-1.106); null when nothing can be, so it is refused at once. */
  public static String preview(Map<String, Object> body) {
    AgentSpecials.Found found = AgentSpecials.find(body);
    Map<String, Object> held = AgentUndoHeld.heldAt(body, found.owner.itemId);
    if (AgentUndoHeld.kindOf(held) != AgentUndo.EDIT) {
      return null;
    }
    // The runs as sent, their fields in name order: the order they come in never changes the ticket.
    AgentAskFirst.stateIs(
      AgentRequestInOrder.of(
        JSON.serialize(new Map<String, Object>{ 'runs' => held.get('runs') })
      )
    );
    return 'This undoes "' +
      held.get('label') +
      '" in "' +
      found.owner.name +
      '", as its page\'s Undo does: the cells it changed go back to what they held before it.';
  }

  /** The page's Undo of a cell: its runs back through the page's own save. */
  public static String run(Map<String, Object> body) {
    AgentSpecials.Found found = AgentSpecials.find(body);
    Map<String, Object> held = AgentUndoHeld.heldAt(body, found.owner.itemId);
    refuseUnlessEdit(found, held);
    String label = (String) held.get('label');
    save(found.owner.itemId, AgentUndoHeld.editOf(held), label);
    AgentUndoHeld.hold(
      AgentUndoHeld.entry(found.owner.itemId, 'undone', label)
    );
    return 'Undone: ' + label + '.';
  }

  /** Nothing held for the plan, or a change its page has no Undo for: said, nothing changed. */
  private static void refuseUnlessEdit(
    AgentSpecials.Found found,
    Map<String, Object> held
  ) {
    if (held == null) {
      throw new ShoreshException(
        'Nothing to undo: this conversation hasn\'t changed "' +
          found.owner.name +
          '". Its page\'s Undo lasts only while the page is open, and Undo here only for the conversation that made the change.'
      );
    }
    if (AgentUndoHeld.kindOf(held) != AgentUndo.EDIT) {
      throw new ShoreshException(
        'The page has no Undo for "' +
          held.get('label') +
          '", so nothing was undone.'
      );
    }
  }

  /** The page's own save of the runs back; a cell changed since is a conflict, nothing changed. */
  private static void save(Id itemId, SlotEdits.Edit edit, String label) {
    SlotEdits.Result result;
    try {
      result = SpecialScheduleController.saveCells(
        itemId,
        new List<SlotEdits.Edit>{ edit }
      );
    } catch (Exception e) {
      throw new ShoreshException(
        'Nothing was undone. ' + ScreenErrors.words(e)
      );
    }
    if (!result.conflicts.isEmpty()) {
      throw new AgentWeeks.ConflictException(
        'Changed by someone else since "' +
          label +
          '": nothing was undone. Read it again with read_special_schedule.'
      );
    }
  }
}
