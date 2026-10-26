/**
 * Synthetic camp and saves for Generated Schedule's tests (GeneratedScheduleTest,
 * GeneratedRefusalsTest). The camp is SetTimeTestData's: Group A and Group B (Juniors), Group C
 * (Seniors); Period 1, Period 2, Lunch; Main runs Monday to Thursday; Group A is away in Week 3;
 * plus Flagpole (fixed) in Period 1 for everyone and Rest (recurring) at Monday's Lunch for the
 * Seniors. The tests place cells as the engine would; the engine itself runs in the browser.
 */
@IsTest
public class GeneratedTestData {
  public static final Date MONDAY = Date.newInstance(2026, 6, 29);
  public static final Integer GROUP_A = 0;
  public static final Integer GROUP_B = 1;
  public static final Integer GROUP_C = 2;
  public static final Integer PERIOD_1 = 0;
  public static final Integer PERIOD_2 = 1;
  public static final Integer LUNCH = 2;
  public static final String UNREADABLE = 'That change could not be read. Reload the page and try again.';

  // The camp's records by name, from camp().
  public static Map<String, Id> ids;

  public static Map<String, Id> camp() {
    // The clash check runs once, at the end, as a screen save does (SetTimeGuard), not after
    // every insert: the setup fits in one test's queries alongside a generated week.
    SetTimeGuard.defer();
    try {
      ids = SetTimeTestData.camp();
      FixedActivity__c flagpole = SetTimeTestData.fixed(
        ids,
        'Flagpole',
        'Period 1'
      );
      Database.insert(flagpole, AccessLevel.SYSTEM_MODE);
      ids.put('Flagpole', flagpole.Id);
      RecurringActivity__c rest = SetTimeTestData.recurring(
        ids,
        'Rest',
        'Lunch'
      );
      Database.insert(rest, AccessLevel.SYSTEM_MODE);
      Database.insert(
        new Coverage__c(
          RecurringActivity__c = rest.Id,
          Division__c = ids.get('Seniors'),
          Season__c = ids.get('Season')
        ),
        AccessLevel.SYSTEM_MODE
      );
      ids.put('Rest', rest.Id);
      SetTimeGuard.checkPending();
    } finally {
      SetTimeGuard.resume();
    }
    return ids;
  }

  /** The first Generate of Week 1: Gym games in every group's Period 2. */
  public static Id generated() {
    return save(
        filled(request(inputs(), GeneratedSaves.GENERATE, 1), 'Gym games')
      )
      .scheduleId;
  }

  /** Week 1 of Main, as the screen reads it. */
  public static GeneratedInputs.Inputs inputs() {
    return GeneratedScheduleController.getInputs(
      ids.get('Main'),
      ids.get('Week 1')
    );
  }

  /** The week as read, sent back unchanged (Fill the open cells finding nothing to fill). */
  public static GeneratedWeek.Save request(
    GeneratedInputs.Inputs read,
    String action,
    Integer option
  ) {
    GeneratedWeek.Save save = new GeneratedWeek.Save();
    save.programId = ids.get('Main');
    save.weekId = ids.get('Week 1');
    save.scheduleId = read.scheduleId;
    save.revision = read.revision;
    save.action = action;
    save.option = option;
    save.days = new List<GeneratedWeek.Day>();
    for (ScheduleViews.DayView view : read.days) {
      save.days.add(dayOf(view));
    }
    return save;
  }

  private static GeneratedWeek.Day dayOf(ScheduleViews.DayView view) {
    GeneratedWeek.Day day = new GeneratedWeek.Day();
    day.dateValue = view.dateValue;
    day.blockIds = new List<String>();
    for (ScheduleViews.Ref block : view.blocks) {
      day.blockIds.add(block.id);
    }
    day.groupIds = new List<String>();
    for (ScheduleViews.Ref grp : view.groups) {
      day.groupIds.add(grp.id);
    }
    day.items = new List<GeneratedWeek.Item>();
    for (ScheduleViews.Ref ref : view.items) {
      day.items.add(item(ref.kind, ref.id, ref.name));
    }
    day.rows = new List<String>(view.rows);
    return day;
  }

  public static GeneratedWeek.Item item(String kind, String id, String name) {
    GeneratedWeek.Item item = new GeneratedWeek.Item();
    item.kind = kind;
    item.id = id;
    item.name = name;
    return item;
  }

  /** A cell: a group and a time block, by position. */
  public static List<Integer> at(Integer g, Integer b) {
    return new List<Integer>{ g, b };
  }

  /** Puts something in one cell of a day (one block long), as the engine would. */
  public static void put(
    GeneratedWeek.Day day,
    List<Integer> cell,
    GeneratedWeek.Item placed
  ) {
    Integer position = day.items.size() + 1;
    for (Integer i = day.items.size() - 1; i >= 0; i--) {
      position = sameItem(day.items[i], placed) ? i + 1 : position;
    }
    if (position > day.items.size()) {
      day.items.add(placed);
    }
    setCell(day, cell, String.valueOf(position));
  }

  private static Boolean sameItem(GeneratedWeek.Item a, GeneratedWeek.Item b) {
    return a.kind == b.kind && a.id == b.id;
  }

  /** Puts one of the camp's activities in a cell. */
  public static void put(
    GeneratedWeek.Day day,
    List<Integer> cell,
    String activity
  ) {
    put(day, cell, item('A', ids.get(activity), activity));
  }

  public static void setCell(
    GeneratedWeek.Day day,
    List<Integer> cell,
    String token
  ) {
    List<String> cells = day.rows[cell[0]].split(',', -1);
    cells[cell[1]] = token;
    day.rows[cell[0]] = String.join(cells, ',');
  }

  /** The activity in every group's Period 2, every day: what a generated week holds here. */
  public static GeneratedWeek.Save filled(
    GeneratedWeek.Save save,
    String activity
  ) {
    for (GeneratedWeek.Day day : save.days) {
      for (Integer g = 0; g < day.groupIds.size(); g++) {
        put(day, at(g, PERIOD_2), activity);
      }
    }
    return save;
  }

  /**
   * Every activity taken out of every day, as Start over sends the week (the screen's
   * clearedDays): fixed and recurring activities, specials and electives stay.
   */
  public static GeneratedWeek.Save cleared(GeneratedWeek.Save save) {
    for (GeneratedWeek.Day day : save.days) {
      List<GeneratedWeek.Item> items = new List<GeneratedWeek.Item>();
      Map<String, String> numbers = new Map<String, String>();
      for (Integer g = 0; g < day.rows.size(); g++) {
        List<String> tokens = day.rows[g].split(',', -1);
        Boolean dropped = false;
        for (Integer b = 0; b < tokens.size(); b++) {
          String token = tokens[b];
          if (token == ScheduleGrid.CARRIES_ON) {
            tokens[b] = dropped ? '' : token;
            continue;
          }
          GeneratedWeek.Item placed = String.isBlank(token)
            ? null
            : day.items[Integer.valueOf(token) - 1];
          dropped = placed == null || placed.kind == 'A';
          if (dropped) {
            tokens[b] = '';
            continue;
          }
          if (!numbers.containsKey(token)) {
            items.add(placed);
            numbers.put(token, String.valueOf(items.size()));
          }
          tokens[b] = numbers.get(token);
        }
        day.rows[g] = String.join(tokens, ',');
      }
      day.items = items;
    }
    return save;
  }

  /** Hand edits on a Generated draft from a screen that read it at revision; no engine notes. */
  public static SlotEdits.Result handEdits(
    Id scheduleId,
    List<SlotEdits.Edit> edits,
    String revision
  ) {
    GeneratedWeek.HandEdits request = new GeneratedWeek.HandEdits();
    request.scheduleId = scheduleId;
    request.edits = edits;
    request.revision = revision;
    return GeneratedScheduleController.saveSlots(request);
  }

  public static GeneratedWeek.Result save(GeneratedWeek.Save request) {
    return GeneratedScheduleController.saveWeek(request);
  }

  /** The sentence a save is refused with; fails the test if it is saved. */
  public static String refusal(GeneratedWeek.Save request) {
    try {
      save(request);
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    Assert.fail('Expected the save to be refused');
    return null;
  }

  /** What a group's cells hold on a day of a saved schedule ('' Open, 'A:<Id>', '^A:<Id>'). */
  public static List<String> slots(Id scheduleId, List<Integer> dayAndGroup) {
    return SlotIds.ofRow(
      ScheduleDays.read(scheduleId)[dayAndGroup[0]].grid,
      dayAndGroup[1]
    );
  }

  public static String a(String name) {
    return 'A:' + ids.get(name);
  }

  public static Integer generatedDrafts() {
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE
        Program__c = :ids.get('Main')
        AND Week__c = :ids.get('Week 1')
        AND Status__c = 'Draft'
        AND Origin__c = 'Generated'
      WITH SYSTEM_MODE
    ];
  }

  public static Integer versions() {
    return [
      SELECT COUNT()
      FROM Schedule__c
      WHERE Status__c = 'Version'
      WITH SYSTEM_MODE
    ];
  }
}
