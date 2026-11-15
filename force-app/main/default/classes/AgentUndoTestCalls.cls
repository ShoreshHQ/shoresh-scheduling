/**
 * For tests: undo_last_agent_change as the connector sends it (API-1.14). The connector holds,
 * for the conversation, what each change's answer left for its Undo (AgentUndoHeld) and, for a
 * hand edit, works the runs back out as the editor's history does (moves.js inverse, locks.js
 * stampLocks: the cells' locks as they are now, then as they were before the edit). These build
 * the same from what a test sent and what Shoresh answered.
 */
@IsTest
public class AgentUndoTestCalls {
  /** What the last answer left for Undo, or null when it left nothing. */
  public static Map<String, Object> undoIn(RestResponse response) {
    Map<String, Object> answer = (Map<String, Object>) JSON.deserializeUntyped(
      response.responseBody.toString()
    );
    return (Map<String, Object>) answer.get('undo');
  }

  /** held as the connector sends it: by the schedule. */
  public static Map<String, Object> held(Map<String, Object> entry) {
    return new Map<String, Object>{ (String) entry.get('schedule') => entry };
  }

  /**
   * A Generated Schedule hand edit's Undo as the connector holds it: undo (its answer's) with the
   * runs sent made the other way, last first, each with the locks its cells have now and the
   * locks they had before it (the run's locksBefore).
   */
  public static Map<String, Object> editHeld(
    Map<String, Object> undo,
    List<Object> sent
  ) {
    Map<String, Object> entry = manualHeld(undo, sent);
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(
      Id.valueOf((String) undo.get('schedule'))
    );
    List<Object> runs = (List<Object>) entry.get('runs');
    for (Integer i = 0; i < runs.size(); i++) {
      Map<String, Object> run = (Map<String, Object>) runs[i];
      Map<String, Object> was = (Map<String, Object>) sent[sent.size() - 1 - i];
      run.put(
        'locksAfter',
        locksOr((List<Object>) was.get('locksBefore'), run)
      );
      run.put('locksBefore', locksNow(days, run));
    }
    return entry;
  }

  /**
   * A hand edit's Undo without locks (Manual Build, a special day's or event's own schedule):
   * undo with the runs sent made the other way, last first.
   */
  public static Map<String, Object> manualHeld(
    Map<String, Object> undo,
    List<Object> sent
  ) {
    Map<String, Object> entry = new Map<String, Object>(undo);
    List<Object> runs = new List<Object>();
    for (Integer i = sent.size() - 1; i >= 0; i--) {
      Map<String, Object> run = new Map<String, Object>(
        (Map<String, Object>) sent[i]
      );
      Object before = run.get('before');
      run.put('before', run.get('after'));
      run.put('after', before);
      run.remove('locksBefore');
      runs.add(run);
    }
    entry.put('runs', runs);
    return entry;
  }

  /** The run's locks as it named them before the edit, or none locked. */
  private static List<Object> locksOr(
    List<Object> named,
    Map<String, Object> run
  ) {
    if (named != null) {
      return named;
    }
    List<Object> none = new List<Object>();
    for (Object cell : (List<Object>) run.get('after')) {
      none.add('');
    }
    return none;
  }

  /** Each of the run's cells: locked now or not, as the screen marks it. */
  private static List<Object> locksNow(
    List<ScheduleDays.DayGrid> days,
    Map<String, Object> run
  ) {
    ScheduleGrid grid = gridOn(days, String.valueOf(run.get('day')));
    Integer g = SlotIds.indexOf(
      grid.groupIds(),
      String.valueOf(run.get('groupId'))
    );
    List<Object> marks = new List<Object>();
    for (Object blockId : (List<Object>) run.get('blockIds')) {
      Integer b = blockAt(grid, String.valueOf(blockId));
      marks.add(
        ScheduleGridLocks.isLocked(grid, g, b) ? ScheduleGridLocks.LOCKED : ''
      );
    }
    return marks;
  }

  /** The grid of the day with that date. */
  private static ScheduleGrid gridOn(
    List<ScheduleDays.DayGrid> days,
    String dateValue
  ) {
    for (ScheduleDays.DayGrid day : days) {
      if (String.valueOf(day.day) == dateValue) {
        return day.grid;
      }
    }
    return null;
  }

  /** The time block with that Id. */
  private static Integer blockAt(ScheduleGrid grid, String blockId) {
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      if (grid.blocks[b].id == blockId) {
        return b;
      }
    }
    return -1;
  }
}
