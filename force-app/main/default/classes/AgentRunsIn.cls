/**
 * The weeks a setup record runs in (its "Runs in" ticks, API-1.53) and who a recurring activity
 * covers (API-1.54), as Camp Setup's tables have them, read and changed through
 * read_setup_record / change_setup_record. Each is a list of names, said in the table's order;
 * a change carries the list the AI read (seen), compared under a lock on the row, and goes in the
 * table's own row save as its week ticks and who it covers.
 */
public with sharing class AgentRunsIn {
  public static final String RUNS_IN = 'runs_in';
  public static final String COVERS = 'covers';

  // The kinds with "Runs in" ticks (RunsIn).
  private static final Set<String> TICKED = new Set<String>{
    'Group',
    'Activity',
    'Location',
    'FixedActivity',
    'RecurringActivity'
  };

  /** The lists a kind has, by plain name: runs_in, and covers for a recurring activity. */
  public static List<String> namesOf(String term) {
    List<String> result = new List<String>();
    if (TICKED.contains(term)) {
      result.add(RUNS_IN);
    }
    if (term == 'RecurringActivity') {
      result.add(COVERS);
    }
    return result;
  }

  /** Takes the lists out of the fields asked (the rest are the row's own fields). */
  public static Map<String, Object> takeOut(
    Map<String, Object> given,
    String term
  ) {
    Map<String, Object> result = new Map<String, Object>();
    for (String key : namesOf(term)) {
      if (given.containsKey(key)) {
        result.put(key, given.remove(key));
      }
    }
    return result;
  }

  /** What the lists hold now, by plain name, as read_setup_record says them. */
  public static Map<String, String> now(AgentSetupRecords.Found found) {
    Map<String, String> result = new Map<String, String>();
    for (String key : namesOf(found.term)) {
      result.put(
        key,
        key == RUNS_IN
          ? JSON.serialize(AgentRunsInWeeks.weeksRunIn(found))
          : AgentActivityWho.said(coverNames(found.id))
      );
    }
    return result;
  }

  /**
   * Readies the lists asked as the row save's week ticks and who it covers, once each still
   * holds what was seen (compared with the row locked); answers the words of the change.
   */
  public static List<String> ready(
    Map<String, Object> asked,
    Object seenAsked,
    AgentSetupFields.Put put
  ) {
    AgentSetupRecords.Found found = put.found;
    Map<String, Object> seen = AgentSetupFields.given(seenAsked);
    refuseUnseen(asked.keySet(), seen);
    // Read the names asked first: one that doesn't read is refused before anything is locked.
    List<Id> weeks = asked.containsKey(RUNS_IN)
      ? AgentRunsInWeeks.weekIdsOf(asked.get(RUNS_IN), found)
      : null;
    List<Id> who = asked.containsKey(COVERS)
      ? AgentActivityWho.idsOf(asked.get(COVERS), found)
      : null;
    lock(found.id);
    refuseIfChangedSince(asked.keySet(), seen, found);
    List<String> said = new List<String>();
    if (weeks != null) {
      AgentRunsInWeeks.tick(weeks, found, put.extras);
      said.add(
        'runs in ' +
        listed(
          weeks,
          asked.get(RUNS_IN),
          'no ' + found.labels.pluralInSentence('Week')
        )
      );
    }
    if (who != null) {
      cover(who, found, put.extras);
      said.add(
        'covers ' + listed(who, asked.get(COVERS), AgentActivityWho.EVERYONE)
      );
    }
    return said;
  }

  /** Each list changed needs what was seen in it: Shoresh never reads it in its place. */
  private static void refuseUnseen(Set<String> keys, Map<String, Object> seen) {
    List<String> missing = new List<String>();
    for (String key : keys) {
      if (!seen.containsKey(key)) {
        missing.add(key);
      }
    }
    if (!missing.isEmpty()) {
      missing.sort();
      throw new ShoreshException(
        'Say what each field held when you read it (seen: ' +
          String.join(missing, ', ') +
          '), as read_setup_record gives it, so a change someone made since isn\'t overwritten.'
      );
    }
  }

  /** The names asked, or what an empty list means. */
  private static String listed(List<Id> ids, Object asked, String none) {
    return ids.isEmpty()
      ? none
      : String.join(AgentActivityWho.namesIn(asked), ', ');
  }

  /** The row save's who it covers. */
  private static void cover(
    List<Id> who,
    AgentSetupRecords.Found found,
    ScreenSaves.Extras extras
  ) {
    SetTimeWho.Who entry = new SetTimeWho.Who();
    entry.target = found.id;
    entry.targets = who;
    extras.who = new List<SetTimeWho.Who>{ entry };
    // Compared already by name, under the lock: what it covers now is what was seen.
    extras.seenWho = RowSeen.whoNow(
      found.id.getSObjectType().newSObject(found.id)
    );
  }

  /** Each list compared with what it holds now, in any order, names with their capitals. */
  private static void refuseIfChangedSince(
    Set<String> keys,
    Map<String, Object> seen,
    AgentSetupRecords.Found found
  ) {
    Map<String, String> now = now(found);
    for (String key : keys) {
      List<String> said = AgentActivityWho.namesIn(seen.get(key));
      Boolean same = key == RUNS_IN
        ? sorted(said).equals(sorted(AgentRunsInWeeks.weeksRunIn(found)))
        : AgentActivityWho.said(said).equals(now.get(key));
      if (!same) {
        throw new AgentWeeks.ConflictException(
          'Someone else changed "' +
            found.name +
            '" since, so nothing was saved. Read it again in Shoresh.'
        );
      }
    }
  }

  private static String sorted(List<String> names) {
    List<String> result = new List<String>();
    for (String name : names) {
      result.add(name.normalizeSpace());
    }
    result.sort();
    return JSON.serialize(result);
  }

  /** Holds the row until the request ends, so no one changes it between compare and save. */
  private static void lock(Id recordId) {
    List<SObject> held = Database.queryWithBinds(
      'SELECT Id FROM ' +
        ShoreshSchema.queryName(recordId.getSObjectType()) +
        ' WHERE Id = :recordId FOR UPDATE',
      new Map<String, Object>{ 'recordId' => recordId },
      AccessLevel.USER_MODE
    );
    if (held.isEmpty()) {
      throw new ShoreshException(
        'That was not found, or you do not have access to it.'
      );
    }
  }

  /** The divisions' and groups' names a recurring activity covers now. */
  private static List<String> coverNames(Id recurringId) {
    List<String> names = new List<String>();
    for (Coverage__c row : [
      SELECT Division__r.Name, Group__r.Name
      FROM Coverage__c
      WHERE RecurringActivity__c = :recurringId
      WITH USER_MODE
    ]) {
      names.add(
        row.Division__r != null ? row.Division__r.Name : row.Group__r.Name
      );
    }
    return names;
  }
}
