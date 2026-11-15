/**
 * CORE-3.9 for an AI (docs/protocol/api.md API-1.147): a fixed activity added or changed over a
 * recurring activity asks what Camp Setup's Fixed activities table asks, and on the yes sends the
 * same pieces. A faithful port of the screen's own working (lwc/shoreshProgram/fixedOver.js), read
 * from the records the screen reads (SeasonSetupReader's programs, the season's weeks and week-off
 * marks), so the same setup gives the same question and the same pieces. Change both together.
 */
public with sharing class AgentFixedOver {
  private static final Map<String, String> AWAY = new Map<String, String>{
    'MorningOnly' => 'Afternoon',
    'AfternoonOnly' => 'Morning'
  };
  private static final List<Schema.SObjectField> WHERE_IT_SITS = new List<Schema.SObjectField>{
    FixedActivity__c.TimeBlock__c,
    FixedActivity__c.Length__c,
    FixedActivity__c.EarlyDay__c,
    FixedActivity__c.EarlyBlocks__c
  };

  /** The screen's question, its one line, and the pieces each recurring activity keeps. */
  public class Ask {
    public String heading;
    public String line;
    public List<SetTimeAround.Piece> around = new List<SetTimeAround.Piece>();

    /** What the person is asked: the screen's question and its line. */
    public String words() {
      return heading + ' ' + line;
    }
  }

  // One recurring activity the fixed activity lands on.
  private class Landing {
    public RecurringActivity__c item;
    public List<Integer> at = new List<Integer>();
    public List<String> days = new List<String>();
    public List<Integer[]> pieces = new List<Integer[]>();
  }

  /**
   * As fixedOver: null when the record isn't a fixed activity, lands on no recurring activity, or
   * one sits only in its blocks and can't go around it (the save then refuses, as on screen).
   */
  public static Ask of(
    SObject record,
    ScreenSaves.Extras extras,
    AgentSetupRecords.Found found
  ) {
    if (
      !(record instanceof FixedActivity__c) || !movesOrComesBack(record, extras)
    ) {
      return null;
    }
    SeasonSetupReader.ProgramSetup entry = entryOf(
      found.seasonId,
      found.programId
    );
    if (entry == null) {
      return null;
    }
    FixedActivity__c saved = null;
    for (FixedActivity__c each : entry.fixedActivities) {
      if (record.Id != null && each.Id == record.Id) {
        saved = each;
      }
    }
    List<TimeBlock__c> blocks = entry.timeBlocks;
    Integer start = indexOf(
      blocks,
      (Id) valueOf(record, saved, FixedActivity__c.TimeBlock__c)
    );
    if (start < 0) {
      return null;
    }
    FixedAt fixed = new FixedAt();
    fixed.start = start;
    fixed.length = wholeOr(
      valueOf(record, saved, FixedActivity__c.Length__c),
      1
    );
    fixed.earlyDay = (String) valueOf(
      record,
      saved,
      FixedActivity__c.EarlyDay__c
    );
    fixed.earlyBlocks = wholeOr(
      valueOf(record, saved, FixedActivity__c.EarlyBlocks__c),
      0
    );
    fixed.program = entry.program;

    Id seasonId = found.seasonId;
    List<Id> weeks = new List<Id>();
    for (Week__c week : [
      SELECT Id
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY StartDate__c, SortOrder__c, Id
    ]) {
      weeks.add(week.Id);
    }
    List<WeekException__c> marks = [
      SELECT Id, Week__c, FixedActivity__c, RecurringActivity__c
      FROM WeekException__c
      WHERE Week__r.Season__c = :seasonId
      WITH USER_MODE
    ];
    Set<Id> fixedWeeks = weeksOf(weeks, fixedOff(record, extras, marks));

    List<Landing> clashing = new List<Landing>();
    for (RecurringActivity__c item : entry.recurringActivities) {
      Integer first = indexOf(blocks, item.TimeBlock__c);
      if (first < 0) {
        continue;
      }
      Set<Id> off = new Set<Id>();
      for (WeekException__c mark : marks) {
        if (mark.RecurringActivity__c == item.Id) {
          off.add(mark.Week__c);
        }
      }
      if (!overlap(fixedWeeks, weeksOf(weeks, off))) {
        continue;
      }
      List<String> days = new List<String>();
      for (String day : SetTimePlan.WEEKDAYS) {
        if (
          item.get(
            SetTimePlan.dayField(RecurringActivity__c.SObjectType, day)
          ) == true && fixed.runs(day)
        ) {
          days.add(day);
        }
      }
      Integer span = Math.min(
        first + wholeOr(item.Length__c, 1),
        blocks.size()
      );
      Landing landing = new Landing();
      landing.item = item;
      for (Integer b = first; b < span; b++) {
        if (heldAt(fixed, days, b) && coversSomeoneAt(entry, item, blocks[b])) {
          landing.at.add(b);
          continue;
        }
        Integer[] last = landing.pieces.isEmpty()
          ? null
          : landing.pieces[landing.pieces.size() - 1];
        // [first block, length, end]
        if (last != null && last[2] == b) {
          last[1] = last[1] + 1;
          last[2] = last[2] + 1;
        } else {
          landing.pieces.add(new List<Integer>{ b, 1, b + 1 });
        }
      }
      if (landing.at.isEmpty()) {
        continue;
      }
      if (landing.pieces.isEmpty()) {
        return null;
      }
      for (String day : days) {
        for (Integer b : landing.at) {
          if (fixed.holds(day, b)) {
            landing.days.add(day);
            break;
          }
        }
      }
      clashing.add(landing);
    }
    if (clashing.isEmpty()) {
      return null;
    }
    return asked(
      clashing,
      blocks,
      (String) valueOf(record, saved, FixedActivity__c.Name),
      found.labels
    );
  }

  /** The question, its line and the pieces, in the screen's words. */
  private static Ask asked(
    List<Landing> clashing,
    List<TimeBlock__c> blocks,
    String fixedName,
    CampLabels labels
  ) {
    List<String> itemNames = new List<String>();
    Set<Integer> atSet = new Set<Integer>();
    Set<String> daySet = new Set<String>();
    for (Landing landing : clashing) {
      itemNames.add(quoted(landing.item.Name));
      atSet.addAll(landing.at);
      daySet.addAll(landing.days);
    }
    List<Integer> atBlocks = new List<Integer>(atSet);
    atBlocks.sort();
    List<String> blockNameList = new List<String>();
    for (Integer b : atBlocks) {
      blockNameList.add(blocks[b].Name);
    }
    List<String> onDayList = new List<String>();
    for (String day : SetTimePlan.WEEKDAYS) {
      if (daySet.contains(day)) {
        onDayList.add(day);
      }
    }
    String names = nameList(itemNames);
    String blockNames = nameList(blockNameList);
    String name = quoted(fixedName);
    Boolean one = clashing.size() == 1;
    Ask result = new Ask();
    result.heading =
      'What ' +
      (one ? 'is ' : 'are ') +
      names +
      ' at ' +
      blockNames +
      ' on ' +
      dayList(onDayList) +
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
    for (Landing landing : clashing) {
      for (Integer[] run : landing.pieces) {
        SetTimeAround.Piece piece = new SetTimeAround.Piece();
        piece.target = landing.item.Id;
        piece.timeBlock = blocks[run[0]].Id;
        piece.length = run[1];
        // As the AI was shown it: the save refuses if someone changed it since.
        piece.seenName = landing.item.Name;
        piece.seenTimeBlock = landing.item.TimeBlock__c;
        piece.seenLength = wholeOr(landing.item.Length__c, 1);
        result.around.add(piece);
      }
    }
    return result;
  }

  // The fixed activity as it would be saved: where it sits, and its program's days.
  private class FixedAt {
    public Integer start;
    public Integer length;
    public String earlyDay;
    public Integer earlyBlocks;
    public Program__c program;

    public Boolean runs(String day) {
      return program.get(SetTimePlan.dayField(Program__c.SObjectType, day)) ==
        true;
    }

    public Boolean holds(String day, Integer b) {
      Integer fromBlock = day == earlyDay
        ? Math.max(0, start - earlyBlocks)
        : start;
      return runs(day) && b >= fromBlock && b < start + length;
    }
  }

  /** A new fixed activity, or one whose blocks change or that comes back on in a week. */
  private static Boolean movesOrComesBack(
    SObject record,
    ScreenSaves.Extras extras
  ) {
    if (record.Id == null) {
      return true;
    }
    for (Schema.SObjectField field : WHERE_IT_SITS) {
      if (record.isSet(field)) {
        return true;
      }
    }
    return extras != null &&
      extras.weeksBackOn != null &&
      !extras.weeksBackOn.isEmpty();
  }

  /** The program's entry as Camp Setup reads it. */
  private static SeasonSetupReader.ProgramSetup entryOf(
    Id seasonId,
    Id programId
  ) {
    for (
      SeasonSetupReader.ProgramSetup each : SeasonSetupReader.readPrograms(
        seasonId
      )
    ) {
      if (each.program.Id == programId) {
        return each;
      }
    }
    return null;
  }

  /** The value being saved, else the one saved. */
  private static Object valueOf(
    SObject record,
    FixedActivity__c saved,
    Schema.SObjectField field
  ) {
    if (record.isSet(field)) {
      return record.get(field);
    }
    return saved == null ? null : saved.get(field);
  }

  /** The weeks the fixed activity is off: its marks not ticked back on, and those ticked off. */
  private static Set<Id> fixedOff(
    SObject record,
    ScreenSaves.Extras extras,
    List<WeekException__c> marks
  ) {
    Set<Id> backOn = new Set<Id>();
    if (extras != null && extras.weeksBackOn != null) {
      backOn.addAll(extras.weeksBackOn);
    }
    Set<Id> off = new Set<Id>();
    if (record.Id != null) {
      for (WeekException__c mark : marks) {
        if (mark.FixedActivity__c == record.Id && !backOn.contains(mark.Id)) {
          off.add(mark.Week__c);
        }
      }
    }
    if (extras != null && extras.weeksOff != null) {
      for (RunsIn.WeekOff weekOff : extras.weeksOff) {
        off.add(weekOff.week);
      }
    }
    return off;
  }

  /** The weeks a row runs in: every week but its week-off marks. Null when the season has none. */
  private static Set<Id> weeksOf(List<Id> weeks, Set<Id> off) {
    if (weeks.isEmpty()) {
      return null;
    }
    Set<Id> result = new Set<Id>(weeks);
    result.removeAll(off);
    return result;
  }

  private static Boolean overlap(Set<Id> a, Set<Id> b) {
    if (a == null || b == null) {
      return true;
    }
    for (Id week : a) {
      if (b.contains(week)) {
        return true;
      }
    }
    return false;
  }

  /** Whether the fixed activity holds block b on any of these days. */
  private static Boolean heldAt(FixedAt fixed, List<String> days, Integer b) {
    for (String day : days) {
      if (fixed.holds(day, b)) {
        return true;
      }
    }
    return false;
  }

  /** As c/shoreshSetupRules coversSomeoneAt: a group it covers is at camp in that block. */
  private static Boolean coversSomeoneAt(
    SeasonSetupReader.ProgramSetup entry,
    RecurringActivity__c item,
    TimeBlock__c block
  ) {
    Set<Id> named = new Set<Id>();
    for (Coverage__c row : item.Coverages__r) {
      named.add(row.Division__c != null ? row.Division__c : row.Group__c);
    }
    for (SeasonSetupReader.DivisionSetup division : entry.divisions) {
      for (Group__c grp : division.groups) {
        if (
          !named.isEmpty() &&
          !named.contains(grp.Id) &&
          !named.contains(division.division.Id)
        ) {
          continue;
        }
        String away = AWAY.get(grp.Availability__c);
        if (away == null || block.PartOfDay__c != away) {
          return true;
        }
      }
    }
    return false;
  }

  private static Integer indexOf(List<TimeBlock__c> blocks, Id blockId) {
    for (Integer i = 0; i < blocks.size(); i++) {
      if (blockId != null && blocks[i].Id == blockId) {
        return i;
      }
    }
    return -1;
  }

  /** A whole number, or the default for none or 0 (the screen's "|| 1"). */
  private static Integer wholeOr(Object value, Integer otherwise) {
    Integer whole = value == null ? 0 : ((Decimal) value).intValue();
    return whole == 0 ? otherwise : whole;
  }

  // As the import's question writes them (shoreshImportEngine questions.js).
  private static String quoted(String name) {
    return '“' + name + '”';
  }

  /** As shoreshImportEngine nameList: "A, B, and C", or "A, B, C, D, and 2 more". */
  @TestVisible
  private static String nameList(List<String> names) {
    Integer max = 4;
    if (names.size() <= max) {
      return names.size() <= 2
        ? String.join(names, ' and ')
        : String.join(slice(names, 0, names.size() - 1), ', ') +
          ', and ' +
          names[names.size() - 1];
    }
    return String.join(slice(names, 0, max), ', ') +
      ', and ' +
      (names.size() - max) +
      ' more';
  }

  /** As shoreshImportEngine dayList: "every day", "Monday to Friday", "Monday and Wednesday". */
  @TestVisible
  private static String dayList(List<String> days) {
    Integer first = WeekCalendar.firstDayOf(new Set<String>(days), 0);
    List<String> ordered = new List<String>();
    for (Integer i = 0; i < 7; i++) {
      String day = SetTimePlan.WEEKDAYS[Math.mod(first + i, 7)];
      if (days.contains(day)) {
        ordered.add(day);
      }
    }
    if (ordered.size() == 7) {
      return 'every day';
    }
    Boolean inARow = true;
    for (Integer i = 0; i < ordered.size(); i++) {
      inARow &=
        SetTimePlan.WEEKDAYS[
          Math.mod(SetTimePlan.WEEKDAYS.indexOf(ordered[0]) + i, 7)
        ] == ordered[i];
    }
    if (ordered.size() >= 5 && inARow) {
      return ordered[0] + ' to ' + ordered[ordered.size() - 1];
    }
    if (ordered.size() <= 2) {
      return String.join(ordered, ' and ');
    }
    return String.join(slice(ordered, 0, ordered.size() - 1), ', ') +
      ', and ' +
      ordered[ordered.size() - 1];
  }

  private static List<String> slice(
    List<String> all,
    Integer fromIndex,
    Integer toIndex
  ) {
    List<String> result = new List<String>();
    for (Integer i = fromIndex; i < toIndex; i++) {
      result.add(all[i]);
    }
    return result;
  }
}
