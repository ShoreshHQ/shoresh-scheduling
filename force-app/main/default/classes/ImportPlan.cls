/**
 * The setup an import sends to be saved (slice 4b), read from the screen's JSON: lists of
 * records to add or change, in the order they depend on each other. A record is an entry of
 * plain values; new records point at each other by key, existing ones by Id.
 */
public with sharing class ImportPlan {
  public Id seasonId { get; private set; }
  private Map<String, Object> raw;

  public ImportPlan(String text) {
    try {
      raw = (Map<String, Object>) JSON.deserializeUntyped(text);
      seasonId = (Id) (String) raw.get('seasonId');
    } catch (Exception e) {
      throw new ShoreshException(
        'The import could not be read. Start it again.'
      );
    }
  }

  /** A list of plain values ("forget": question keys). */
  public List<String> texts(String listName) {
    List<String> result = new List<String>();
    Object value = raw.get(listName);
    if (value instanceof List<Object>) {
      for (Object item : (List<Object>) value) {
        result.add(String.valueOf(item));
      }
    }
    return result;
  }

  public String text(String name) {
    Object value = raw.get(name);
    return value == null ? null : String.valueOf(value);
  }

  /** The entries of one list ("programs", "timeBlocks", ...); none when it is missing. */
  public List<Entry> entries(String listName) {
    List<Entry> result = new List<Entry>();
    Object value = raw.get(listName);
    if (value instanceof List<Object>) {
      for (Object item : (List<Object>) value) {
        result.add(new Entry((Map<String, Object>) item));
      }
    }
    return result;
  }

  /** One record to add (no id) or change (an id). */
  public class Entry {
    private Map<String, Object> values;

    public Entry(Map<String, Object> values) {
      this.values = values == null ? new Map<String, Object>() : values;
    }

    public Boolean isNew() {
      return values.get('id') == null;
    }

    public Id id() {
      return (Id) (String) values.get('id');
    }

    public String key() {
      return text('key');
    }

    public Boolean has(String name) {
      return values.get(name) != null;
    }

    public String text(String name) {
      Object value = values.get(name);
      return value == null ? null : String.valueOf(value);
    }

    public Integer whole(String name) {
      Object value = values.get(name);
      return value == null ? null : Integer.valueOf(value);
    }

    /** A list inside an entry, as given (a version's days). */
    public List<Object> objects(String name) {
      Object value = values.get(name);
      return value instanceof List<Object>
        ? (List<Object>) value
        : new List<Object>();
    }

    /** A map inside an entry, as given (a list record's fields); empty when missing. */
    public Map<String, Object> valuesOf(String name) {
      Object value = values.get(name);
      return value instanceof Map<String, Object>
        ? (Map<String, Object>) value
        : new Map<String, Object>();
    }

    public List<String> texts(String name) {
      List<String> result = new List<String>();
      Object value = values.get(name);
      if (value instanceof List<Object>) {
        for (Object item : (List<Object>) value) {
          result.add(String.valueOf(item));
        }
      }
      return result;
    }

    /** "HH:mm" as a time. */
    public Time clock(String name) {
      List<String> parts = text(name).split(':');
      return Time.newInstance(
        Integer.valueOf(parts[0]),
        Integer.valueOf(parts[1]),
        0,
        0
      );
    }
  }
}
