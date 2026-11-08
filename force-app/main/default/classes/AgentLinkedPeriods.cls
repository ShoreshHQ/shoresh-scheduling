/**
 * The periods a person's AI names on a linked choice (docs/protocol/api.md API-1.132, API-1.133),
 * as the linked choices editor offers them: where the set sits, and any it has already. A time
 * block two programs share there is asked about, never picked. Read in user mode: the person's
 * own access.
 */
public with sharing class AgentLinkedPeriods {
  private AgentLinkedChoiceRefs refs;
  // Its own periods: one of them settles a name two programs share.
  public Set<String> held = new Set<String>();

  public AgentLinkedPeriods(AgentLinkedChoiceRefs refs) {
    this.refs = refs;
  }

  /** Where the set sits, as "Monday|<block>". */
  public Set<String> placed() {
    Set<String> keys = new Set<String>();
    for (LinkedChoicePlaces.Cell cell : refs.places().cells) {
      keys.add(cell.weekday + '|' + cell.blockId);
    }
    return keys;
  }

  /** A linked choice's own periods, as "Monday|<block>". */
  public static Set<String> heldBy(LinkedChoice__c choice) {
    Set<String> keys = new Set<String>();
    if (choice != null) {
      for (LinkedChoiceTime__c row : choice.Times__r) {
        keys.add(row.Weekday__c + '|' + row.TimeBlock__c);
      }
    }
    return keys;
  }

  /**
   * The periods named ({day, time, program}), each one of those offered (a key of "Monday|<block>").
   * A name two programs' time blocks share at that place is asked about (program), never picked.
   */
  public List<LinkedChoiceSaves.Period> of(
    List<Object> asked,
    Set<String> offered
  ) {
    List<LinkedChoiceSaves.Period> result = new List<LinkedChoiceSaves.Period>();
    if (asked.isEmpty()) {
      return result;
    }
    Map<Id, TimeBlock__c> blocks = new Map<Id, TimeBlock__c>(
      [
        SELECT Id, Name, Program__r.Name
        FROM TimeBlock__c
        WHERE Program__r.Season__c = :refs.season.Id
        WITH USER_MODE
      ]
    );
    for (Object each : asked) {
      result.add(periodOf(each, offered, blocks));
    }
    return result;
  }

  private LinkedChoiceSaves.Period periodOf(
    Object asked,
    Set<String> offered,
    Map<Id, TimeBlock__c> blocks
  ) {
    if (!(asked instanceof Map<String, Object>)) {
      throw new ShoreshException(
        'A period says its day and time, like {"day": "Monday", "time": "Period 2"}.'
      );
    }
    Map<String, Object> period = (Map<String, Object>) asked;
    String weekday = AgentSpecialDay.weekdayOf(AgentFields.text(period, 'day'));
    String blockName = AgentFields.text(period, 'time');
    String program = AgentFields.text(period, 'program');
    List<Id> found = new List<Id>();
    List<String> programs = new List<String>();
    for (TimeBlock__c block : blocks.values()) {
      if (
        isNamed(block, blockName, program) &&
        offered.contains(weekday + '|' + block.Id)
      ) {
        found.add(block.Id);
        programs.add(block.Program__r.Name);
      }
    }
    settle(found, programs, weekday);
    programs.sort();
    String words = DayWords.sayWeekday(weekday) + ' ' + blockName;
    refuseUnlessOne(found, programs, words);
    LinkedChoiceSaves.Period result = new LinkedChoiceSaves.Period();
    result.weekday = weekday;
    result.blockId = found[0];
    return result;
  }

  /** A name two programs share, where only one of them is held: that one. */
  private void settle(List<Id> found, List<String> programs, String weekday) {
    List<Integer> own = new List<Integer>();
    for (Integer i = 0; i < found.size(); i++) {
      if (held.contains(weekday + '|' + found[i])) {
        own.add(i);
      }
    }
    if (found.size() > 1 && own.size() == 1) {
      Id one = found[own[0]];
      found.clear();
      found.add(one);
      programs.clear();
    }
  }

  private void refuseUnlessOne(
    List<Id> found,
    List<String> programs,
    String words
  ) {
    if (found.isEmpty()) {
      throw new ShoreshException(
        refs.electiveSet.Name +
          ' isn\'t at ' +
          words +
          ' on any schedule.' +
          missing() +
          ' Nothing was changed.'
      );
    }
    if (found.size() > 1) {
      throw new ShoreshException(
        String.join(programs, ' and ') +
          ' both have ' +
          words +
          ', so Shoresh can\'t tell which you mean (program says whose).' +
          ' Nothing was changed.'
      );
    }
  }

  /** " Not every schedule could be read…", when that's so. */
  private String missing() {
    return refs.places().complete
      ? ''
      : ' Not every schedule could be read, so some places ' +
        refs.electiveSet.Name +
        ' sits may be missing.';
  }

  private static Boolean isNamed(
    TimeBlock__c block,
    String blockName,
    String program
  ) {
    return IncomingBatch.fold(block.Name) == IncomingBatch.fold(blockName) &&
      (String.isBlank(program) ||
      IncomingBatch.fold(block.Program__r.Name) == IncomingBatch.fold(program));
  }
}
