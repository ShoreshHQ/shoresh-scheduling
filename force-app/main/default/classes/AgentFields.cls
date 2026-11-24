/**
 * The fields a person's own action through an agent or the command line sends (AgentRequest), read
 * by their plain names (API-1.5): a field Shoresh doesn't know, or a value that isn't text, is
 * refused in plain words.
 */
public with sharing class AgentFields {
  /** The body sent, a JSON object of fields by their plain names; anything else is refused. */
  public static Map<String, Object> sent() {
    Object parsed;
    try {
      Blob sent = RestContext.request.requestBody;
      parsed = sent == null ? null : JSON.deserializeUntyped(sent.toString());
    } catch (JSONException e) {
      parsed = null;
    }
    if (!(parsed instanceof Map<String, Object>)) {
      throw new ShoreshException(
        'Send what to do by name, like {"season": "Summer 2026"}.'
      );
    }
    return (Map<String, Object>) parsed;
  }

  /** The web address's fields (a read's), as text; a field Shoresh doesn't know is refused. */
  public static Map<String, Object> query(Set<String> fields) {
    Map<String, Object> asked = new Map<String, Object>();
    Map<String, String> params = RestContext.request.params;
    requireKnown(params.keySet(), fields);
    for (String name : params.keySet()) {
      asked.put(name, params.get(name));
    }
    return asked;
  }

  /** A field Shoresh doesn't know is refused, naming the ones it does. */
  public static void requireKnown(Set<String> given, Set<String> fields) {
    for (String name : given) {
      if (fields.contains(name)) {
        continue;
      }
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

  /** A list field as sent (none when left out); a value that isn't a list is refused. */
  public static List<Object> listOf(Map<String, Object> body, String field) {
    Object value = body.get(field);
    if (value == null) {
      return new List<Object>();
    }
    if (value instanceof List<Object>) {
      return (List<Object>) value;
    }
    throw new ShoreshException('The ' + field + ' is a list.');
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

  /** Whether two or more of the names read as asked (as camps type names). */
  public static Boolean twoReadAs(List<String> names, String asked) {
    Integer alike = 0;
    for (String name : names) {
      if (IncomingBatch.fold(name) == IncomingBatch.fold(asked)) {
        alike++;
      }
    }
    return alike > 1;
  }

  /**
   * Where the one name that reads as asked is (as camps type names), or -1 when none does. Two
   * that read the same are refused, naming both: Shoresh never picks one silently. aWhat: what
   * they are, with its article, in the camp's words ("a group", "an Edah": CORE-1.0).
   */
  public static Integer onlyOne(
    List<String> names,
    String asked,
    String aWhat
  ) {
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
            '" are both ' +
            aWhat +
            ' called that on that day, so Shoresh can\'t tell which you mean. Nothing was changed.'
        );
      }
      found = i;
    }
    return found;
  }
}
