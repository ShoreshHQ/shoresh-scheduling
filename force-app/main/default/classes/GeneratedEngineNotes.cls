/**
 * What the generator said about the week it last built, kept on the Generated draft
 * (Schedule__c.EngineNotes__c, ADR 0010 "The engine's notes"): codes and record Ids as the screen
 * sends them (c/shoreshEngine notes.js), worded there when shown. The server never acts on them;
 * it only keeps notes of the right size and shape, and keeps none otherwise, so nothing it can't
 * read is stored. The week itself is saved either way.
 */
public with sharing class GeneratedEngineNotes {
  @TestVisible
  private static final Integer VERSION = 1;

  /**
   * The notes to keep, or null for none: blank, longer than the field holds, not JSON, another
   * version, or not the shape notes.js makes (an open list of rows of exactly 4 or 6 pieces of text and a blank list of rows of 2,
   * as readNotes reads them).
   */
  public static String kept(String text) {
    if (String.isBlank(text) || text.length() > maxLength()) {
      return null;
    }
    try {
      Object parsed = JSON.deserializeUntyped(text);
      if (!(parsed instanceof Map<String, Object>)) {
        return null;
      }
      Map<String, Object> notes = (Map<String, Object>) parsed;
      Object v = notes.get('v');
      if (
        !(v instanceof Integer) ||
        (Integer) v != VERSION ||
        !rowsOfText(notes.get('open'), new Set<Integer>{ 4, 6 }) ||
        !rowsOfText(notes.get('blank'), new Set<Integer>{ 2 })
      ) {
        return null;
      }
      return text;
    } catch (JSONException e) {
      return null;
    }
  }

  /**
   * Hand edits on the Generated draft (SlotSaves.saveOnGenerated), then the engine's notes they
   * carry (afterHandEdits), under the draft's lock.
   */
  public static SlotEdits.Result saveHandEdits(
    GeneratedWeek.HandEdits request
  ) {
    if (request == null) {
      throw GeneratedFrames.unreadable();
    }
    SlotEdits.Result result = SlotSaves.saveOnGenerated(
      request.scheduleId,
      request.edits == null ? new List<SlotEdits.Edit>() : request.edits,
      request.revision
    );
    afterHandEdits(request.scheduleId, request.engineNotes, result.revision);
    return result;
  }

  /**
   * After hand edits on the draft (locked by the save): the notes without the reasons of the cells
   * they changed (null: kept as they are). Kept only when nobody else saved the week since the
   * screen read it (revision: the answer's, given only then); else they are notes on a week the
   * screen hasn't seen, and the stored ones stay.
   */
  private static void afterHandEdits(
    Id scheduleId,
    String engineNotes,
    String revision
  ) {
    if (engineNotes == null || String.isEmpty(revision)) {
      return;
    }
    Database.update(
      new Schedule__c(Id = scheduleId, EngineNotes__c = kept(engineNotes)),
      AccessLevel.USER_MODE
    );
  }

  /** How many characters the field holds (its own length, so the two never differ). */
  @TestVisible
  private static Integer maxLength() {
    return Schedule__c.EngineNotes__c.getDescribe().getLength();
  }

  /** A list of rows, each a list of pieces of text, as many as one of sizes. */
  private static Boolean rowsOfText(Object value, Set<Integer> sizes) {
    if (!(value instanceof List<Object>)) {
      return false;
    }
    for (Object row : (List<Object>) value) {
      if (!(row instanceof List<Object>)) {
        return false;
      }
      List<Object> pieces = (List<Object>) row;
      if (!sizes.contains(pieces.size())) {
        return false;
      }
      for (Object piece : pieces) {
        if (!(piece instanceof String)) {
          return false;
        }
      }
    }
    return true;
  }
}
