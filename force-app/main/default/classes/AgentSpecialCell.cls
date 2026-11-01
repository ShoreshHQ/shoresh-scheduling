/**
 * change_special_schedule_cell: one cell of a special day's or event's own schedule changed, as
 * typing in it on its screen does, through an agent or the command line (docs/protocol/api.md
 * API-1.77). Web address /v1/change_special_schedule_cell, POST {season, special, kind, column,
 * time, was, activity}. It is the screen's own save (SpecialScheduleController.saveCells), the run
 * made only while the cell holds what the agent saw (was), compared under the item's lock; only
 * the season's activities can be typed in, as on the screen.
 */
@RestResource(urlMapping='/v1/change_special_schedule_cell')
global with sharing class AgentSpecialCell implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'special',
    'kind',
    'column',
    'time',
    'was',
    'activity'
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentSpecialCell());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    AgentSpecials.Found found = AgentSpecials.find(body);
    ScheduleGrid grid = found.grid;
    Integer g = AgentSpecials.columnIn(grid, AgentFields.text(body, 'column'));
    Integer b = AgentSpecials.blockIn(grid, AgentFields.text(body, 'time'));
    String place = grid.groups[g].name + ' · ' + grid.blocks[b].name;
    List<String> row = SlotIds.ofRow(grid, g);
    String now = row[b];
    String nowName = AgentSpecials.nameOf(grid, now);
    checkWas(AgentFields.text(body, 'was'), nowName, place);
    if (isLonger(row, b)) {
      throw new ShoreshException(
        place +
          ' is part of a longer ' +
          nowName +
          '. Change it on the Special events screen.'
      );
    }
    String target = slotOf(found.owner.seasonId, body);
    SlotEdits.Run run = new SlotEdits.Run();
    run.day = SpecialSchedule.PLAN_DAY;
    run.groupId = grid.groups[g].id;
    run.firstBlockId = grid.blocks[b].id;
    run.blockIds = new List<String>{ grid.blocks[b].id };
    run.before = new List<String>{ now };
    run.after = new List<String>{ target };
    SlotEdits.Edit edit = new SlotEdits.Edit();
    edit.runs = new List<SlotEdits.Run>{ run };
    SlotEdits.Result result;
    try {
      result = SpecialScheduleController.saveCells(
        found.owner.itemId,
        new List<SlotEdits.Edit>{ edit }
      );
    } catch (Exception e) {
      throw new ShoreshException(
        'Nothing was changed. ' + ScreenErrors.words(e)
      );
    }
    if (!result.conflicts.isEmpty()) {
      throw changed(place, 'something else');
    }
    return (target == SlotIds.OPEN
        ? 'Cleared ' + place
        : 'Placed ' + AgentFields.text(body, 'activity') + ' · ' + place) +
      '. To undo it, change the cell back (was: ' +
      nowName +
      ').';
  }

  /** Refused unless the cell holds what the agent saw (was; blank is Open). */
  private static void checkWas(String was, String nowName, String place) {
    String said = String.isBlank(was) ? AgentSpecials.OPEN_WORD : was;
    if (IncomingBatch.fold(said) != IncomingBatch.fold(nowName)) {
      throw changed(place, nowName);
    }
  }

  /** Whether the cell is part of a longer placement (one cell can't say it: the screen changes it). */
  private static Boolean isLonger(List<String> row, Integer b) {
    String now = row[b];
    Boolean carriesOn =
      b + 1 < row.size() &&
      now != SlotIds.OPEN &&
      row[b + 1] == ScheduleGrid.CARRIES_ON + now;
    return SlotIds.isCarryOn(now) || carriesOn;
  }

  /** Open, or one of the season's activities (the only things the screen's cells take). */
  private static String slotOf(Id seasonId, Map<String, Object> body) {
    String asked = AgentFields.text(body, 'activity');
    if (
      String.isBlank(asked) ||
      IncomingBatch.fold(asked) == IncomingBatch.fold(AgentSpecials.OPEN_WORD)
    ) {
      return SlotIds.OPEN;
    }
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

  private static AgentWeeks.ConflictException changed(
    String place,
    String nowName
  ) {
    return new AgentWeeks.ConflictException(
      'Changed by someone else: ' +
        place +
        ' holds ' +
        nowName +
        ' now. Nothing was changed.'
    );
  }
}
