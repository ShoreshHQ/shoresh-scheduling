/** Undo's reading of what an import changed: each entry by how Undo puts it back. */
public with sharing class ImportUndoEntries {
  // Entries put back on their own, by the key that marks them: who lists a list import replaced
  // (slice 4c), weeks off a workbook removed and camp words it set back (part D), and what a
  // second import removed (INGEST-5.8). Everything else is a record's values.
  private static final List<String> OWN_KINDS = new List<String>{
    'who',
    'weekOn',
    'wordOff',
    'removed'
  };

  /** What the import changed, by how Undo puts it back ("changes" for records' values). */
  public static Map<String, List<Object>> sorted(Import__c done) {
    Map<String, List<Object>> byKind = new Map<String, List<Object>>{
      'changes' => new List<Object>()
    };
    for (String kind : OWN_KINDS) {
      byKind.put(kind, new List<Object>());
    }
    for (
      Object entry : (List<Object>) JSON.deserializeUntyped(done.Changed__c)
    ) {
      // Anything that isn't an entry is the refusal.
      Map<String, Object> values = entryOf(entry);
      String kind = 'changes';
      for (String own : OWN_KINDS) {
        if (values.containsKey(own)) {
          kind = own;
          break;
        }
      }
      byKind.get(kind).add(entry);
    }
    return byKind;
  }

  /** One entry of what an import changed; anything that isn't one is the refusal. */
  private static Map<String, Object> entryOf(Object entry) {
    if (!(entry instanceof Map<String, Object>)) {
      throw ImportFields.unreadableLog();
    }
    return (Map<String, Object>) entry;
  }
}
