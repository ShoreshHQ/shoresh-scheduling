/**
 * A request as the ask-first ticket reads it (docs/protocol/api.md API-1.106): its fields in name
 * order, and the fields of every map inside them too (a seat's), so the order they come in never
 * changes the ticket.
 */
public with sharing class AgentRequestInOrder {
  /** The request's fields in name order, so their order (or theirs inside) never changes the ticket. */
  public static String of(String body) {
    Object parsed = JSON.deserializeUntyped(body);
    if (!(parsed instanceof Map<String, Object>)) {
      return body;
    }
    Map<String, Object> given = (Map<String, Object>) parsed;
    List<String> keys = new List<String>(given.keySet());
    keys.sort();
    List<String> parts = new List<String>();
    for (String key : keys) {
      parts.add(key + '=' + inOrder(given.get(key)));
    }
    return String.join(parts, '\n');
  }

  /** A field's value with every map in it in name order too (a seat's fields, say). */
  private static String inOrder(Object value) {
    if (value instanceof List<Object>) {
      List<String> each = new List<String>();
      for (Object item : (List<Object>) value) {
        each.add(inOrder(item));
      }
      return '[' + String.join(each, ',') + ']';
    }
    if (!(value instanceof Map<String, Object>)) {
      return JSON.serialize(value);
    }
    Map<String, Object> given = (Map<String, Object>) value;
    List<String> keys = new List<String>(given.keySet());
    keys.sort();
    List<String> parts = new List<String>();
    for (String key : keys) {
      parts.add(JSON.serialize(key) + ':' + inOrder(given.get(key)));
    }
    return '{' + String.join(parts, ',') + '}';
  }
}
