/**
 * For AgentFixedOver (API-1.147): the Fixed activities table's question and line, in fixedOver.js's
 * words (names and blocks as shoreshImportEngine nameList says them, days as its dayList), and the
 * pieces its yes sends (SetTimeAround).
 */
public with sharing class AgentFixedOverWords {
  private static final Integer MOST_NAMES = 4;

  /** The question, its line and the pieces. */
  public static AgentFixedOver.Ask of(
    List<AgentFixedOverLandings.Landing> clashing,
    AgentFixedOverPlan plan,
    CampLabels labels
  ) {
    List<String> itemNames = new List<String>();
    Set<Integer> atSet = new Set<Integer>();
    Set<String> daySet = new Set<String>();
    for (AgentFixedOverLandings.Landing landing : clashing) {
      itemNames.add(quoted(landing.item.Name));
      atSet.addAll(landing.at);
      daySet.addAll(landing.days);
    }
    String names = nameList(itemNames);
    String blockNames = nameList(blockNamesOf(atSet, plan.blocks));
    String name = quoted(plan.fixedName);
    Boolean one = clashing.size() == 1;
    AgentFixedOver.Ask result = new AgentFixedOver.Ask();
    result.heading =
      'What ' +
      (one ? 'is ' : 'are ') +
      names +
      ' at ' +
      blockNames +
      ' on ' +
      dayList(daySet) +
      ', where ' +
      name +
      ' is?';
    result.line =
      names +
      (one ? ' keeps its' : ' keep their') +
      ' other ' +
      labels.pluralInSentence('TimeBlock') +
      ' every day ' +
      (one ? 'it runs' : 'they run') +
      '; ' +
      name +
      ' keeps ' +
      blockNames +
      '.';
    result.around = aroundOf(clashing, plan.blocks);
    return result;
  }

  /** The blocks shared, in the order of the day, by name. */
  private static List<String> blockNamesOf(
    Set<Integer> atSet,
    List<TimeBlock__c> blocks
  ) {
    List<Integer> atBlocks = new List<Integer>(atSet);
    atBlocks.sort();
    List<String> result = new List<String>();
    for (Integer b : atBlocks) {
      result.add(blocks[b].Name);
    }
    return result;
  }

  /** Each run each recurring activity keeps, as the AI was shown it (refused if changed since). */
  private static List<SetTimeAround.Piece> aroundOf(
    List<AgentFixedOverLandings.Landing> clashing,
    List<TimeBlock__c> blocks
  ) {
    List<SetTimeAround.Piece> result = new List<SetTimeAround.Piece>();
    for (AgentFixedOverLandings.Landing landing : clashing) {
      for (Integer[] run : landing.pieces) {
        SetTimeAround.Piece piece = new SetTimeAround.Piece();
        piece.target = landing.item.Id;
        piece.timeBlock = blocks[run[0]].Id;
        piece.length = run[1];
        piece.seenName = landing.item.Name;
        piece.seenTimeBlock = landing.item.TimeBlock__c;
        piece.seenLength = AgentFixedOverPlan.wholeOr(
          landing.item.Length__c,
          1
        );
        result.add(piece);
      }
    }
    return result;
  }

  // As the import's question writes them (shoreshImportEngine questions.js).
  private static String quoted(String name) {
    return '“' + name + '”';
  }

  /** As shoreshImportEngine nameList: "A, B, and C", or "A, B, C, D, and 2 more". */
  @TestVisible
  private static String nameList(List<String> names) {
    if (names.size() > MOST_NAMES) {
      return String.join(slice(names, MOST_NAMES), ', ') +
        ', and ' +
        (names.size() - MOST_NAMES) +
        ' more';
    }
    return andList(names);
  }

  /** "A and B", or "A, B, and C". */
  private static String andList(List<String> names) {
    if (names.size() <= 2) {
      return String.join(names, ' and ');
    }
    return String.join(slice(names, names.size() - 1), ', ') +
      ', and ' +
      names[names.size() - 1];
  }

  /** As shoreshImportEngine dayList: "every day", "Monday to Friday", "Monday and Wednesday". */
  @TestVisible
  private static String dayList(Set<String> days) {
    List<String> ordered = weekOrder(days);
    if (ordered.size() == 7) {
      return 'every day';
    }
    if (ordered.size() >= 5 && inARow(ordered)) {
      return ordered[0] + ' to ' + ordered[ordered.size() - 1];
    }
    return andList(ordered);
  }

  /** The days in the order a week of them runs: Sunday first for Sunday to Thursday. */
  private static List<String> weekOrder(Set<String> days) {
    Integer first = WeekCalendar.firstDayOf(days, 0);
    List<String> result = new List<String>();
    for (Integer i = 0; i < 7; i++) {
      String day = SetTimePlan.WEEKDAYS[Math.mod(first + i, 7)];
      if (days.contains(day)) {
        result.add(day);
      }
    }
    return result;
  }

  /** Whether the days follow one another with none missed. */
  private static Boolean inARow(List<String> ordered) {
    Integer first = SetTimePlan.WEEKDAYS.indexOf(ordered[0]);
    for (Integer i = 0; i < ordered.size(); i++) {
      if (SetTimePlan.WEEKDAYS[Math.mod(first + i, 7)] != ordered[i]) {
        return false;
      }
    }
    return true;
  }

  /** The first count of the names. */
  private static List<String> slice(List<String> all, Integer count) {
    List<String> result = new List<String>();
    for (Integer i = 0; i < count; i++) {
      result.add(all[i]);
    }
    return result;
  }
}
