/**
 * lock: Generated Schedule's Lock on a cell, a day, a group or a group's day, as the person,
 * through an agent or the command line (docs/protocol/api.md API-1.37). Web address
 * /v1/lock_cells, POST {season, week, program, day, group, time}: day, group and time name one
 * cell; a day alone, a group alone, or a group and a day, the screen's Lock menu shortcuts. It is
 * the menu's own server action (GeneratedScheduleController.setLocks), so a lock covers what the
 * screen's covers; answered as the screen says it ("Locked Bunk 1 · Monday · Period 2."), refused
 * in its words. Unlock is AgentUnlock, the same action the other way.
 */
@RestResource(urlMapping='/v1/lock_cells')
global with sharing class AgentLock implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'schedule',
    'day',
    'group',
    'time'
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
    AgentWeeks.answer(new AgentLock());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentSchedules.eitherOf(body);
    AgentSchedules.refuseLocks(week);
    AgentLockScope scope = new AgentLockScope(action, body, week);
    List<ScheduleDays.DayGrid> days = scope.days;
    GeneratedWeek.LockChange change = scope.change;
    String place = scope.place;
    Boolean locks = change.locks();
    GeneratedWeek.Locked result;
    try {
      result = GeneratedScheduleController.setLocks(
        week.draft.Id,
        new List<GeneratedWeek.LockChange>{ change },
        GeneratedDrafts.revisionOf(days)
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
    if (result.revision == GeneratedDrafts.revisionOf(days)) {
      // The screen's menu never offers a change that would do nothing (locks.js lockChoices).
      return locks
        ? 'Nothing in ' +
          place +
          ' to lock: it is locked already, or holds only Open cells or fixed or recurring activities (lock an Open cell on its own).'
        : 'Nothing in ' + place + ' is locked.';
    }
    return (locks ? 'Locked ' : 'Unlocked ') + place + '.';
  }
}
