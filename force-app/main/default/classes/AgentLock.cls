/**
 * lock: Generated Schedule's Lock on a cell, a day, a group or a group's day, as the person,
 * through an agent or the command line (docs/protocol/api.md API-1.37). Web address
 * /v1/lock_cells, POST {season, week, program, day, group, time, seen}: day, group and time name one
 * cell; a day alone, a group alone, or a group and a day, the screen's Lock menu shortcuts; seen
 * is the week as read_week_checks read it, and someone else's save since is a conflict (SeenSaves). It is
 * the menu's own server action (GeneratedScheduleController.setLocks), so a lock covers what the
 * screen's covers; answered as the screen says it ("Locked Bunk 1 · Monday · Period 2."), refused
 * in its words. Unlock is AgentUnlock, the same action the other way.
 */
@RestResource(urlMapping='/v1/lock_cells')
global with sharing class AgentLock implements AgentRequest.Change {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'day',
    'group',
    'time',
    'seen'
  };

  // GeneratedWeek.LOCK or GeneratedWeek.UNLOCK.
  private String action;

  public AgentLock() {
    this(GeneratedWeek.LOCK);
  }

  public AgentLock(String action) {
    this.action = action;
  }

  @HttpPost
  global static void post() {
    AgentRequest.answer(new AgentLock());
  }

  public Set<String> fields() {
    return FIELDS;
  }

  public String run(Map<String, Object> body) {
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    AgentSchedules.refuseLocks(week);
    String seen = seenOf(body);
    AgentLockScope scope = new AgentLockScope(action, body, week);
    GeneratedWeek.LockChange change = scope.change;
    String place = scope.place;
    Boolean locks = change.locks();
    GeneratedWeek.Locked result;
    try {
      result = GeneratedScheduleController.setLocks(
        week.draft.Id,
        new List<GeneratedWeek.LockChange>{ change },
        seen
      );
    } catch (Exception e) {
      throw new ShoreshException(
        place +
          ' wasn\'t ' +
          (locks ? 'locked' : 'unlocked') +
          '. ' +
          ScreenErrors.words(e)
      );
    }
    if (result.conflict) {
      throw new AgentWeeks.ConflictException(result.message);
    }
    if (seen.equals(result.revision)) {
      return nothingSaid(locks, place);
    }
    String said = (locks ? 'Locked ' : 'Unlocked ') + place;
    Map<String, Object> undo = undoOf(week.draft.Id, change, said);
    undo.put('seen', result.revision);
    AgentUndoHeld.hold(undo);
    return said + '.';
  }

  /** The screen's menu never offers a change that would do nothing (locks.js lockChoices). */
  private static String nothingSaid(Boolean locks, String place) {
    return locks
      ? 'Nothing in ' +
        place +
        ' to lock: it is locked already, or holds only Open cells or fixed or recurring activities (lock an Open cell on its own).'
      : 'Nothing in ' + place + ' is locked.';
  }

  /**
   * The screen's Undo goes on past a Lock (its history is kept), leaving each cell the choice
   * reached as chosen (shoreshWeekEditor lockChosen): the connector holds which (API-1.14), from
   * the choice (and the week as the Lock left it, seen, which the caller adds).
   */
  private static Map<String, Object> undoOf(
    Id draftId,
    GeneratedWeek.LockChange change,
    String said
  ) {
    Map<String, Object> undo = AgentUndoHeld.entry(draftId, 'lock', said);
    undo.put('action', change.action);
    undo.put(
      'dateValue',
      change.dateValue == null ? null : String.valueOf(change.dateValue)
    );
    undo.put('groupId', change.groupId);
    undo.put('blockId', change.blockId);
    return undo;
  }

  /** The week as the AI read it (its ticket): never the week read here in its place. */
  private static String seenOf(Map<String, Object> body) {
    String seen = AgentFields.text(body, 'seen');
    if (String.isBlank(seen)) {
      throw new ShoreshException(AgentSchedules.SAY_SEEN);
    }
    return seen;
  }
}
