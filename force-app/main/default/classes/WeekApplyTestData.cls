/**
 * Apply to other weeks' tests (WeekApplyTest, WeekApplyKeepTest): SetTimeTestData's synthetic camp
 * (Group A and Group B, Juniors; Group C, Seniors; Period 1, Period 2, Lunch; Main runs Monday to
 * Thursday, so Monday is Day 1), drafts started and their cells written directly, so each test's
 * queries are the apply's.
 */
@IsTest
public class WeekApplyTestData {
  public static final Date W1 = Date.newInstance(2026, 6, 29);
  public static final Date W2 = W1 + 7;

  public static Map<String, Id> ids;

  /** The camp, its season's days numbered. */
  public static void camp() {
    SetTimeGuard.defer();
    try {
      ids = SetTimeTestData.camp();
      SetTimeGuard.checkPending();
    } finally {
      SetTimeGuard.resume();
    }
    Database.update(
      new Season__c(Id = ids.get('Season'), NumberedDays__c = true),
      AccessLevel.SYSTEM_MODE
    );
    DayWords.forgetSeasons();
    SlotRunsTestData.useBlocks(
      new List<Id>{ ids.get('Period 1'), ids.get('Period 2'), ids.get('Lunch') }
    );
  }

  public static Id manualDraft(String week) {
    return ManualDrafts.startWith(setupOf(week)).draftId;
  }

  public static Id generatedDraft(String week) {
    GeneratedSetup setup = setupOf(week);
    return GeneratedDrafts.startBlank(setup, setup.blankWeek());
  }

  private static GeneratedSetup setupOf(String week) {
    return new GeneratedSetup(ids.get('Main'), ids.get(week));
  }

  /** cell: the activity (or null to leave it), group, time block and 'lock' to lock it: written directly. */
  public static void put(Id draftId, Date day, List<String> cell) {
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == day) {
        List<Integer> at = positions(read.grid, cell[1], cell[2]);
        if (cell[0] != null) {
          read.grid.rows[at[0]][at[1]] = tokenFor(read.grid, cell[0]);
        }
        if (cell.size() > 3) {
          ScheduleGridLocks.lock(read.grid, at);
        }
        ScheduleDaySaves.write(
          draftId,
          new List<ScheduleDaySaves.DaySave>{
            new ScheduleDaySaves.DaySave(read.day, read.grid, read.revision)
          }
        );
      }
    }
  }

  /** The activity's place in the day's list of items, added if it isn't there. */
  private static String tokenFor(ScheduleGrid grid, String activity) {
    String wanted = 'A:' + ids.get(activity);
    for (Integer i = 0; i < grid.items.size(); i++) {
      if (SlotIds.of(grid.items[i]) == wanted) {
        return String.valueOf(i + 1);
      }
    }
    grid.items.add(new ScheduleGrid.Item('A', ids.get(activity), activity));
    return String.valueOf(grid.items.size());
  }

  private static List<Integer> positions(
    ScheduleGrid grid,
    String groupName,
    String block
  ) {
    return new List<Integer>{
      SlotIds.indexOf(grid.groupIds(), ids.get(groupName)),
      SlotIds.indexOf(grid.blockIds(), ids.get(block))
    };
  }

  /** What a cell (group, time block) holds now ('' Open, else 'A:<Id>'); null: no such day. */
  public static String slot(Id draftId, Date day, List<String> cell) {
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == day) {
        List<Integer> at = positions(read.grid, cell[0], cell[1]);
        return SlotIds.ofRow(read.grid, at[0])[at[1]];
      }
    }
    return null;
  }

  public static Boolean isLocked(Id draftId, Date day, List<String> cell) {
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == day) {
        List<Integer> at = positions(read.grid, cell[0], cell[1]);
        return ScheduleGridLocks.isLocked(read.grid, at[0], at[1]);
      }
    }
    return false;
  }

  /** Marks a cell switched to its rain plan, as a rainy day leaves it (RainMarks). */
  public static void rainOn(Id draftId, Date day, List<String> cell) {
    for (ScheduleDays.DayGrid read : ScheduleDays.read(draftId)) {
      if (read.day == day) {
        ScheduleDaySaves.DaySave save = new ScheduleDaySaves.DaySave(
          read.day,
          read.grid,
          read.revision
        );
        save.rain = new List<String>{
          ids.get(cell[1]) +
          '|' +
          ids.get(cell[2]) +
          '|' +
          ids.get(cell[0]) +
          '|' +
          RainMarks.SWITCHED
        };
        ScheduleDaySaves.write(
          draftId,
          new List<ScheduleDaySaves.DaySave>{ save }
        );
      }
    }
  }

  public static String a(String activity) {
    return 'A:' + ids.get(activity);
  }

  /** The preview, then the apply, as the screen makes them. */
  public static WeekApply.Outcome applied(Id sourceId, String week) {
    WeekApply.Outcome preview = WeekApplyController.previewApply(
      sourceId,
      ids.get(week),
      ScheduleDays.stamp(ScheduleDays.read(sourceId))
    );
    return WeekApplyController.applyToWeek(
      sourceId,
      ids.get(week),
      preview.seen
    );
  }

  public static List<Schedule__c> drafts(String week, String origin) {
    Id weekId = ids.get(week);
    return [
      SELECT Id
      FROM Schedule__c
      WHERE Week__c = :weekId AND Status__c = 'Draft' AND Origin__c = :origin
      WITH SYSTEM_MODE
    ];
  }
}
