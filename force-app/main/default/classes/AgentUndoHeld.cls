/**
 * What a change through an agent or the command line leaves for undo_last_agent_change
 * (docs/protocol/api.md API-1.14, API-1.148), answered with it and held by the connector for the
 * rest of the conversation, never saved in Salesforce, as the screen holds its Undo only while
 * its page is open: the schedule (a week's draft, or a special day's or event's plan), the
 * change's label, its kind and what its kind needs (seen: the revision just after it; version and
 * version_name: the version the screen's own action kept). Kinds: "edit" (a hand edit: the
 * connector holds its runs back, as the editor's history does), "build" (Rebuild or Start over:
 * the screen's Undo with the version its save kept), "none" (the screen has no Undo for it),
 * "kept" and "lock" (the screen's history goes on past it), "undone" (Undo's own answer).
 */
public with sharing class AgentUndoHeld {
  // What the action now running leaves for its Undo; answered with it when done.
  private static Map<String, Object> held;

  /** A change's entry: its schedule, kind and label; the caller adds what its kind needs. */
  public static Map<String, Object> entry(
    Id schedule,
    String kind,
    String label
  ) {
    return new Map<String, Object>{
      'schedule' => schedule,
      'kind' => kind,
      'label' => label
    };
  }

  /** What this change leaves for its Undo. */
  public static void hold(Map<String, Object> entry) {
    held = entry;
  }

  /** A new request: nothing held yet. */
  public static void forget() {
    held = null;
  }

  /** The answer's body: its sentence (and season), with what Undo needs when it was done. */
  public static Map<String, Object> answered(
    Map<String, String> said,
    Integer status
  ) {
    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      JSON.serialize(said)
    );
    if (status == 200 && held != null) {
      body.put('undo', held);
    }
    return body;
  }

  /** What this conversation holds for a schedule (by its draft, or a special plan's item). */
  public static Map<String, Object> heldAt(Map<String, Object> body, Id at) {
    Object byScheduled = body.get('held');
    if (!(byScheduled instanceof Map<String, Object>)) {
      return null;
    }
    Object mine = ((Map<String, Object>) byScheduled).get(at);
    return mine instanceof Map<String, Object>
      ? (Map<String, Object>) mine
      : null;
  }

  /** What kind of change is held ("edit", "build", "none"), or null when none is. */
  public static String kindOf(Map<String, Object> change) {
    return change == null ? null : (String) change.get('kind');
  }

  /** The runs back (and a rainy day's marks as they were) held for a hand edit; refused unread. */
  public static SlotEdits.Edit editOf(Map<String, Object> change) {
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = AgentCells.runsOf(change.get('runs'));
    edit.rain = rainOf(change.get('rain'));
    if (edit.runs.isEmpty() && edit.rain == null) {
      throw new ShoreshException(
        'That change could not be read. Download Shoresh\'s connector again from Settings in Shoresh.'
      );
    }
    return edit;
  }

  /** A rainy day's marks as they were, as the screen sends them (SlotEdits.RainDay); null if none. */
  private static List<SlotEdits.RainDay> rainOf(Object sent) {
    if (!(sent instanceof List<Object>)) {
      return null;
    }
    try {
      return (List<SlotEdits.RainDay>) JSON.deserialize(
        JSON.serialize(sent),
        List<SlotEdits.RainDay>.class
      );
    } catch (Exception e) {
      return null;
    }
  }
}
