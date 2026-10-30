/**
 * The fields a person's own action through an agent or the command line sends (AgentWeeks), read
 * by their plain names (API-1.5): a field Shoresh doesn't know, or a value that isn't text, is
 * refused in plain words.
 */
public with sharing class AgentFields {
  /** The body's fields by their plain names; a field Shoresh doesn't know is refused. */
  public static Map<String, Object> body(Set<String> fields) {
    Object parsed;
    try {
      Blob sent = RestContext.request.requestBody;
      parsed = sent == null ? null : JSON.deserializeUntyped(sent.toString());
    } catch (JSONException e) {
      parsed = null;
    }
    if (!(parsed instanceof Map<String, Object>)) {
      throw new ShoreshException('Send JSON like {"season": "Summer 2026"}.');
    }
    Map<String, Object> given = (Map<String, Object>) parsed;
    for (String name : given.keySet()) {
      if (!fields.contains(name)) {
        List<String> known = new List<String>(fields);
        known.sort();
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            name.left(40) +
            '". The fields are: ' +
            String.join(known, ', ') +
            '.'
        );
      }
    }
    return given;
  }

  /** A field as text ('' when left out); a value that isn't text is refused. */
  public static String text(Map<String, Object> body, String field) {
    Object value = body.get(field);
    if (value == null) {
      return '';
    }
    if (!(value instanceof String)) {
      throw new ShoreshException(
        'The ' + field + ' is text, like "' + field + '": "Week 2".'
      );
    }
    return ((String) value).normalizeSpace();
  }

  /**
   * Where the one name that reads as asked is (as camps type names), or -1 when none does. Two
   * that read the same are refused, naming both: Shoresh never picks one silently.
   */
  public static Integer onlyOne(List<String> names, String asked, String what) {
    Integer found = -1;
    if (String.isBlank(asked)) {
      return found;
    }
    for (Integer i = 0; i < names.size(); i++) {
      if (IncomingBatch.fold(names[i]) != IncomingBatch.fold(asked)) {
        continue;
      }
      if (found >= 0) {
        throw new ShoreshException(
          '"' +
            names[found] +
            '" and "' +
            names[i] +
            '" are both a ' +
            what +
            ' called that on that day, so Shoresh can\'t tell which you mean. Rename one in Shoresh, then ask again.'
        );
      }
      found = i;
    }
    return found;
  }
}
