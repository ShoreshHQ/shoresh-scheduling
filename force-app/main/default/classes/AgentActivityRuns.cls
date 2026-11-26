/**
 * When an activity can run, as its details panel's grid has it (ADR 0031 piece A; API-1.51): each
 * program's days by its time blocks, every box ticked unless the director unticked it. An AI says
 * it as "whenever" (nothing unticked) or a list of the boxes it can't run, each as the panel reads
 * it out: "Lunch, Monday" ("Lunch, Day 1" in a numbered-days season), with " (Main)" after it when
 * the season has several programs. A list so a name with a comma stays one box.
 */
public with sharing class AgentActivityRuns {
  public static final String WHENEVER = 'whenever';
  // A Monday: DAYS[i] is this date plus i days' weekday.
  private static final Date A_MONDAY = Date.newInstance(2026, 6, 29);
  private static final List<Schema.SObjectField> DAYS = new List<Schema.SObjectField>{
    Program__c.Monday__c,
    Program__c.Tuesday__c,
    Program__c.Wednesday__c,
    Program__c.Thursday__c,
    Program__c.Friday__c,
    Program__c.Saturday__c,
    Program__c.Sunday__c
  };

  // Each box of the season's grids by its key ("<time block Id>|Monday"): its words.
  private Map<String, String> wordsByKey = new Map<String, String>();
  // Each way a box may be named, folded: its key (the weekday itself as well as Day 3).
  private Map<String, String> keyByWords = new Map<String, String>();

  /** The boxes of the season's grids (days are said as DayWords is set to say them). */
  public AgentActivityRuns(Id seasonId) {
    List<Program__c> programs = [
      SELECT
        Id,
        Name,
        Monday__c,
        Tuesday__c,
        Wednesday__c,
        Thursday__c,
        Friday__c,
        Saturday__c,
        Sunday__c,
        (SELECT Id, Name FROM TimeBlocks__r ORDER BY SortOrder__c, Name)
      FROM Program__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c, Name
    ];
    for (Program__c program : programs) {
      String ofProgram = programs.size() > 1 ? ' (' + program.Name + ')' : '';
      for (TimeBlock__c block : program.TimeBlocks__r) {
        for (Integer i = 0; i < DAYS.size(); i++) {
          if (program.get(DAYS[i]) != true) {
            continue;
          }
          String weekday = WeekCalendar.weekdayName(A_MONDAY.addDays(i));
          String key = ActivityOffTimes.key(block.Id, weekday);
          String words =
            block.Name +
            ', ' +
            DayWords.sayWeekday(weekday) +
            ofProgram;
          wordsByKey.put(key, words);
          keyByWords.put(IncomingBatch.fold(words), key);
          keyByWords.put(
            IncomingBatch.fold(block.Name + ', ' + weekday + ofProgram),
            key
          );
        }
      }
    }
  }

  /** The boxes as said: whenever, or the ones it can't run, a list A to Z. */
  public String said(List<String> keys) {
    List<String> names = new List<String>();
    for (String key : keys) {
      if (wordsByKey.containsKey(key)) {
        names.add(wordsByKey.get(key));
      }
    }
    if (names.isEmpty()) {
      return WHENEVER;
    }
    names.sort();
    return JSON.serialize(names);
  }

  /**
   * The boxes named (a list, or whenever or blank for none), as the save takes them. A box not in
   * the season's grids is refused, naming them.
   */
  public List<String> keysOf(Object asked) {
    List<String> keys = new List<String>();
    for (String name : AgentActivityWho.namesIn(asked)) {
      String folded = IncomingBatch.fold(name);
      if (String.isBlank(name) || folded == WHENEVER || folded == '(blank)') {
        continue;
      }
      if (!keyByWords.containsKey(folded)) {
        List<String> offered = wordsByKey.values();
        offered.sort();
        throw new ShoreshException(
          'When it runs has no box "' +
            name.left(80) +
            '". Say "whenever", or the times it can\'t run, each like "' +
            (offered.isEmpty() ? 'Period 1, Monday' : offered[0]) +
            '".'
        );
      }
      keys.add(keyByWords.get(folded));
    }
    return keys;
  }

  /** What was seen, said as the read says it (in any order, any case). */
  public String asShown(Object seen) {
    try {
      return said(keysOf(seen));
    } catch (ShoreshException e) {
      // Not a box there now: it can't be what the activity holds now.
      return String.valueOf(seen);
    }
  }
}
