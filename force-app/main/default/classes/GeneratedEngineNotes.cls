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
   * version, or not the shape notes.js makes (an open and a blank list of rows of text).
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
        !rowsOfText(notes.get('open'), 4, 6) ||
        !rowsOfText(notes.get('blank'), 2, 2)
      ) {
        return null;
      }
      return text;
    } catch (JSONException e) {
      return null;
    }
  }

  /** How many characters the field holds (its own length, so the two never differ). */
  @TestVisible
  private static Integer maxLength() {
    return Schedule__c.EngineNotes__c.getDescribe().getLength();
  }

  /** A list of rows, each a list of shortest to longest pieces of text. */
  private static Boolean rowsOfText(
    Object value,
    Integer shortest,
    Integer longest
  ) {
    if (!(value instanceof List<Object>)) {
      return false;
    }
    for (Object row : (List<Object>) value) {
      if (!(row instanceof List<Object>)) {
        return false;
      }
      List<Object> pieces = (List<Object>) row;
      if (pieces.size() < shortest || pieces.size() > longest) {
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
