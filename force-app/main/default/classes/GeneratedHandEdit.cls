/**
 * Generated Schedule's hand edit (ADR 0010 decision 2, LOCK-1.1): a director typing in a cell, or
 * an AI changing cells as the screen does (AgentCells). In order, under the draft's lock: Manual
 * Build's slot saves make the edits (SlotSaves, the same runs and conflicts), each run only if its
 * locks are as the screen saw them, and what it changes is locked (GeneratedEdits); then the
 * engine's notes the request carries are kept (GeneratedEngineNotes judges them). The answer has
 * the week as Generated Schedule shows it and the week's revision after the edit. The revision,
 * and the notes, only when nobody else saved the week since the screen read it.
 */
public with sharing class GeneratedHandEdit {
  public static SlotEdits.Result save(GeneratedWeek.HandEdits request) {
    if (request == null) {
      throw GeneratedFrames.unreadable();
    }
    Schedule__c draft = GeneratedDrafts.lockedToEdit(request.scheduleId);
    SlotSaves.Saved saved = SlotSaves.saveLocked(
      draft,
      request.edits == null ? new List<SlotEdits.Edit>() : request.edits,
      new GeneratedEdits()
    );
    SlotEdits.Result result = saved.result;
    // Shown with "deleted since" as Generated Schedule's own reader works it out.
    result.schedule = GeneratedInputs.view(draft);
    result.revision = revisionAfter(saved, request.revision);
    keepNotes(draft.Id, request.engineNotes, result.revision);
    return result;
  }

  /**
   * The draft's ticket after the save, given only when the days were at the screen's revision
   * (seen) before it: otherwise someone else saved the week since the screen read it, and a
   * whole-week save built on the screen's copy must stay a conflict (the screen reads the week again).
   */
  private static String revisionAfter(SlotSaves.Saved saved, String seen) {
    return WeekTickets.seenNullAsEmpty(WeekTickets.stamp(saved.read), seen)
      ? WeekTickets.afterWrite(saved.read, saved.written)
      : null;
  }

  /**
   * The notes without the reasons of the cells the edits changed (null: kept as they are). Kept
   * only when nobody else saved the week since the screen read it (revision: the answer's, given
   * only then); else they are notes on a week the screen hasn't seen, and the stored ones stay.
   */
  private static void keepNotes(
    Id scheduleId,
    String engineNotes,
    String revision
  ) {
    if (engineNotes == null || String.isEmpty(revision)) {
      return;
    }
    Database.update(
      new Schedule__c(
        Id = scheduleId,
        EngineNotes__c = GeneratedEngineNotes.kept(engineNotes)
      ),
      AccessLevel.USER_MODE
    );
  }
}
