/**
 * One day of a schedule (or one part of a day), in Shoresh's compact grid format (repo
 * docs/adr/0005; version 2 adds locks, docs/adr/0010 §27). Stored in ScheduleDay__c.Grid__c as
 * JSON with four lists, and a fifth for locks:
 *
 *   "b": time blocks, in the order of the day: [id, name, start "HH:mm", end "HH:mm"]
 *   "g": groups, in order: [id, name]
 *   "i": what is placed: [kind, id, name]. Kinds: A activity, F fixed activity, R recurring
 *        activity; and, for things not set up in Shoresh yet (no id): E elective, D special
 *        day, S special event, T trip.
 *   "r": one row per group (same order as "g"), its cells separated by commas, one per time
 *        block (same order as "b"). A cell is empty (nothing placed), a number (an item in
 *        "i", counting from 1), or ^ (the item in the cell above carries on into this block).
 *   "l": version 2 only, when a cell is locked (ScheduleGridLocks): one row per group, like "r",
 *        each cell '1' (locked) or empty.
 *
 * Names are copied as they were when the day was saved, so a saved version keeps saying what it
 * said after the setup changes. Written with a fixed key order, so the same day always gives the
 * same text.
 */
public with sharing class ScheduleGrid {
  public static final Integer FORMAT_VERSION = 1;
  public static final String CARRIES_ON = '^';

  public List<Block> blocks = new List<Block>();
  public List<GroupRef> groups = new List<GroupRef>();
  public List<Item> items = new List<Item>();
  // rows[group][block]: '' (nothing), '1'.. (an item), or '^' (carries on from above).
  public List<List<String>> rows = new List<List<String>>();
  // locks[group][block]: '1' (locked) or ''; empty when nothing is locked (ScheduleGridLocks).
  public List<List<String>> locks = new List<List<String>>();

  public class Block {
    public String id;
    public String name;
    public String startTime;
    public String endTime;

    public Block(String id, String name) {
      this.id = id;
      this.name = name;
    }

    /** Its clock times, "HH:mm". */
    public Block at(String startTime, String endTime) {
      this.startTime = startTime;
      this.endTime = endTime;
      return this;
    }
  }

  public class GroupRef {
    public String id;
    public String name;

    public GroupRef(String id, String name) {
      this.id = id;
      this.name = name;
    }
  }

  public class Item {
    public String kind;
    public String id;
    public String name;

    public Item(String kind, String id, String name) {
      this.kind = kind;
      this.id = id;
      this.name = name;
    }
  }

  /** The groups' record Ids, in order. */
  public List<String> groupIds() {
    List<String> ids = new List<String>();
    for (GroupRef grp : groups) {
      ids.add(grp.id);
    }
    return ids;
  }

  /** The time blocks' record Ids, in order. */
  public List<String> blockIds() {
    List<String> ids = new List<String>();
    for (Block block : blocks) {
      ids.add(block.id);
    }
    return ids;
  }

  /** Drops items no cell uses and numbers the rest again, in the same order. */
  public void dropUnusedItems() {
    Set<String> used = new Set<String>();
    for (List<String> row : rows) {
      used.addAll(row);
    }
    Map<String, String> renumbered = new Map<String, String>();
    List<Item> kept = new List<Item>();
    for (Integer i = 0; i < items.size(); i++) {
      if (used.contains(String.valueOf(i + 1))) {
        kept.add(items[i]);
        renumbered.put(String.valueOf(i + 1), String.valueOf(kept.size()));
      }
    }
    items = kept;
    for (List<String> row : rows) {
      for (Integer b = 0; b < row.size(); b++) {
        if (renumbered.containsKey(row[b])) {
          row[b] = renumbered.get(row[b]);
        }
      }
    }
  }

  /** The grid as stored text. Refuses a grid that breaks the format. */
  public String toText() {
    ScheduleGridRules.check(this);
    JSONGenerator out = JSON.createGenerator(false);
    out.writeStartObject();
    out.writeFieldName('b');
    out.writeStartArray();
    for (Block block : blocks) {
      writeStrings(
        out,
        new List<String>{ block.id, block.name, block.startTime, block.endTime }
      );
    }
    out.writeEndArray();
    out.writeFieldName('g');
    out.writeStartArray();
    for (GroupRef grp : groups) {
      writeStrings(out, new List<String>{ grp.id, grp.name });
    }
    out.writeEndArray();
    out.writeFieldName('i');
    out.writeStartArray();
    for (Item item : items) {
      writeStrings(out, new List<String>{ item.kind, item.id, item.name });
    }
    out.writeEndArray();
    out.writeFieldName('r');
    out.writeStartArray();
    for (List<String> row : rows) {
      out.writeString(String.join(row, ','));
    }
    out.writeEndArray();
    ScheduleGridLocks.write(out, this);
    out.writeEndObject();
    return out.getAsString();
  }

  private static void writeStrings(JSONGenerator out, List<String> values) {
    out.writeStartArray();
    for (String value : values) {
      out.writeString(value == null ? '' : value);
    }
    out.writeEndArray();
  }

  /** Reads stored text. Throws ScheduleGridRules.GridException if it cannot be read. */
  public static ScheduleGrid fromText(String text) {
    Map<String, Object> raw;
    try {
      raw = (Map<String, Object>) JSON.deserializeUntyped(text);
    } catch (Exception e) {
      throw new ScheduleGridRules.GridException('it is not in the grid format');
    }
    ScheduleGrid grid = new ScheduleGrid();
    for (List<String> b : tuples(raw, 'b', 4)) {
      grid.blocks.add(new Block(b[0], b[1]).at(b[2], b[3]));
    }
    for (List<String> g : tuples(raw, 'g', 2)) {
      grid.groups.add(new GroupRef(g[0], g[1]));
    }
    for (List<String> i : tuples(raw, 'i', 3)) {
      grid.items.add(new Item(i[0], i[1], i[2]));
    }
    for (Object row : listAt(raw, 'r')) {
      grid.rows.add(String.valueOf(row).split(',', -1));
    }
    ScheduleGridLocks.read(raw.get('l'), grid);
    ScheduleGridRules.check(grid);
    return grid;
  }

  private static List<Object> listAt(Map<String, Object> raw, String key) {
    Object value = raw == null ? null : raw.get(key);
    if (!(value instanceof List<Object>)) {
      throw new ScheduleGridRules.GridException(
        'its ' + key + ' list is missing'
      );
    }
    return (List<Object>) value;
  }

  private static List<List<String>> tuples(
    Map<String, Object> raw,
    String key,
    Integer size
  ) {
    List<List<String>> result = new List<List<String>>();
    for (Object entry : listAt(raw, key)) {
      List<Object> values = entry instanceof List<Object>
        ? (List<Object>) entry
        : null;
      if (values == null || values.size() != size) {
        throw new ScheduleGridRules.GridException(
          'an entry in its ' + key + ' list is the wrong shape'
        );
      }
      List<String> strings = new List<String>();
      for (Object value : values) {
        strings.add(value == null ? '' : String.valueOf(value));
      }
      result.add(strings);
    }
    return result;
  }
}
