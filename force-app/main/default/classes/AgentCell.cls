/**
 * cell: change one cell of a program's Generated Schedule week, as the person, through an agent
 * or the command line (docs/protocol/api.md API-1.11 to API-1.13). Web address /v1/schedule_cell, POST
 * {season, week, program, group, day, time, was, activity}. The change is the screen's own hand
 * edit (GeneratedEngineNotes.saveHandEdits: the same save, conflicts and locking), made only when
 * the cell still holds what the agent says it saw (was), so someone else's change is never
 * replaced unseen; a locked cell is refused in the screen's words. A version marked "Through an
 * agent" is kept first, so the person sees it and Undo brings the week back (AgentUndo).
 */
@RestResource(urlMapping='/v1/schedule_cell')
global with sharing class AgentCell implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'week',
    'program',
    'group',
    'day',
    'time',
    'was',
    'activity'
  };
  private static final String OPEN_WORD = 'Open';

  private Map<String, Object> body;
  // The cell asked for: its day, the day's grid, group and block positions, the group's row of
  // slots, and its name as the screen says it ("Group A · Monday · Period 2").
  private Date day;
  private ScheduleGrid grid;
  private Integer g;
  private Integer b;
  private List<String> row;
  private String place;

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentCell());
  }

  public String run() {
    body = AgentFields.body(FIELDS);
    AgentWeeks.Week week = AgentWeeks.weekOf(body);
    List<ScheduleDays.DayGrid> days = ScheduleDays.read(week.draft.Id);
    find(days, week.name);
    checkCanChange();
    String target = slotOf(week.draft);
    String change = target == SlotIds.OPEN
      ? 'Cleared ' + place
      : 'Placed ' + AgentFields.text(body, 'activity') + ' · ' + place;
    Id versionId = AgentWeeks.keepBefore(week.draft, days, change);

    GeneratedWeek.HandEdits request = new GeneratedWeek.HandEdits();
    request.scheduleId = week.draft.Id;
    request.revision = GeneratedDrafts.revisionOf(days);
    request.edits = new List<SlotEdits.Edit>{ editOf(target) };
    // The cell's Open reason goes, as the screen drops it before saving a hand edit.
    request.engineNotes = GeneratedEngineNotes.withoutCell(
      week.draft.EngineNotes__c,
      new List<String>{
        String.valueOf(day),
        grid.groups[g].id,
        grid.blocks[b].id
      }
    );
    SlotEdits.Result result = GeneratedEngineNotes.saveHandEdits(request);
    if (!result.conflicts.isEmpty()) {
      throw new AgentWeeks.ConflictException(
        'Changed by someone else: ' + place + '. Nothing was changed.'
      );
    }
    AgentWeeks.changed(versionId, week.draft.Id);
    return change + '.';
  }

  /** The cell asked for (day, group, time) in the week's days, and what it holds now. */
  private void find(List<ScheduleDays.DayGrid> days, String weekName) {
    ScheduleDays.DayGrid found = AgentWeeks.dayOf(
      days,
      AgentFields.text(body, 'day'),
      weekName
    );
    day = found.day;
    grid = found.grid;
    g = groupIn(grid);
    b = blockIn(grid);
    place = String.join(
      new List<String>{
        grid.groups[g].name,
        AgentWeeks.dayName(day),
        grid.blocks[b].name
      },
      ' · '
    );
    row = SlotIds.ofRow(grid, g);
  }

  /**
   * Refused unless the cell still holds what the agent saw (someone else's change is a conflict,
   * never replaced unseen), isn't locked, and is a placement of its own.
   */
  private void checkCanChange() {
    String now = row[b];
    String nowName = nameOf(grid, now);
    if (!sameName(AgentFields.text(body, 'was'), nowName)) {
      throw new AgentWeeks.ConflictException(
        'Changed by someone else: ' +
          place +
          ' holds ' +
          nowName +
          ' now. Nothing was changed.'
      );
    }
    if (ScheduleGridLocks.isLocked(grid, g, b)) {
      // The screen's own refusal (shoreshWeekEditor refuseLocked); unlocking is the person's.
      throw new ShoreshException(place + ' is locked.');
    }
    Boolean carriesOn =
      b + 1 < row.size() &&
      now != SlotIds.OPEN &&
      row[b + 1] == ScheduleGrid.CARRIES_ON + now;
    if (SlotIds.isCarryOn(now) || carriesOn) {
      throw new ShoreshException(
        place +
          ' is part of a longer ' +
          nowName +
          '. Change it on Generated Schedule.'
      );
    }
  }

  private Integer groupIn(ScheduleGrid grid) {
    String asked = AgentFields.text(body, 'group');
    List<String> names = new List<String>();
    for (ScheduleGrid.GroupRef each : grid.groups) {
      names.add(each.name);
    }
    Integer found = AgentFields.onlyOne(names, asked, 'group');
    if (found >= 0) {
      return found;
    }
    throw new ShoreshException(
      String.isBlank(asked)
        ? 'Say which group (group).'
        : 'There is no group called "' +
          asked.left(80) +
          '" on that day. ' +
          AgentWeeks.namesSaid('groups', names)
    );
  }

  /** The time block by its name ("Period 2") or its start ("09:00"). */
  private Integer blockIn(ScheduleGrid grid) {
    String asked = AgentFields.text(body, 'time');
    List<String> names = new List<String>();
    List<String> starts = new List<String>();
    for (ScheduleGrid.Block block : grid.blocks) {
      names.add(block.name);
      starts.add(block.startTime == null ? '' : block.startTime.left(5));
    }
    Integer found = AgentFields.onlyOne(names, asked, 'time');
    if (found < 0) {
      found = AgentFields.onlyOne(starts, asked, 'time');
    }
    if (found >= 0) {
      return found;
    }
    throw new ShoreshException(
      String.isBlank(asked)
        ? 'Say which time (time), like Period 2.'
        : 'There is no time called "' +
          asked.left(80) +
          '" on that day. ' +
          AgentWeeks.namesSaid('times', names)
    );
  }

  /** What a slot holds, by the name the grid shows ("Open" when nothing). */
  private static String nameOf(ScheduleGrid grid, String slot) {
    String owner = SlotIds.owner(slot);
    if (owner == SlotIds.OPEN) {
      return OPEN_WORD;
    }
    for (ScheduleGrid.Item item : grid.items) {
      if (SlotIds.of(item) == owner) {
        return item.name;
      }
    }
    return owner;
  }

  private static Boolean sameName(String was, String nowName) {
    String said = String.isBlank(was) ? OPEN_WORD : was;
    return IncomingBatch.fold(said) == IncomingBatch.fold(nowName);
  }

  /** The activity asked for, as a slot: Open, or one of the season's activities. */
  private String slotOf(Schedule__c draft) {
    String asked = AgentFields.text(body, 'activity');
    if (String.isBlank(asked) || sameName(asked, OPEN_WORD)) {
      return SlotIds.OPEN;
    }
    Id seasonId = draft.Program__r.Season__c;
    List<String> names = new List<String>();
    for (Activity__c activity : [
      SELECT Id, Name
      FROM Activity__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY Name
    ]) {
      if (IncomingBatch.fold(activity.Name) == IncomingBatch.fold(asked)) {
        return 'A:' + activity.Id;
      }
      names.add(activity.Name);
    }
    throw new ShoreshException(
      'There is no activity called "' +
        asked.left(80) +
        '" in this season. ' +
        AgentWeeks.namesSaid('activities', names)
    );
  }

  /** The one-cell run the screen sends for the same edit (what it held, what it should hold). */
  private SlotEdits.Edit editOf(String target) {
    SlotEdits.Run run = new SlotEdits.Run();
    run.day = day;
    run.groupId = grid.groups[g].id;
    run.firstBlockId = grid.blocks[b].id;
    run.blockIds = new List<String>{ grid.blocks[b].id };
    run.before = new List<String>{ row[b] };
    run.after = new List<String>{ target };
    run.locksBefore = new List<String>{ '' };
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = new List<SlotEdits.Run>{ run };
    return edit;
  }
}
