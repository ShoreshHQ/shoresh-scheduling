/**
 * change_special_schedule_frame: a special day's or event's own time blocks, an event's stations,
 * or Clear, as its screen changes them, through an agent or the command line
 * (docs/protocol/api.md API-1.78). Web address /v1/change_special_schedule_frame, POST {season,
 * special, kind, action, target, name, start_time, end_time, direction, seen}. It is the screen's
 * own change (SpecialScheduleController.changeFrame) at the revision the agent read (seen),
 * compared under the item's lock: saved since is refused (409), nothing changed.
 */
@RestResource(urlMapping='/v1/change_special_schedule_frame')
global with sharing class AgentSpecialFrame implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'special',
    'kind',
    'action',
    'target',
    'name',
    'start_time',
    'end_time',
    'direction',
    'seen'
  };
  // The plain action names, and the screen's.
  private static final Map<String, String> ACTIONS = new Map<String, String>{
    'add_time_block' => 'addBlock',
    'change_time_block' => 'changeBlock',
    'move_time_block' => 'moveBlock',
    'remove_time_block' => 'removeBlock',
    'add_station' => 'addStation',
    'rename_station' => 'renameStation',
    'move_station' => 'moveStation',
    'remove_station' => 'removeStation',
    'clear' => 'clear'
  };
  private static final Map<String, Integer> DIRECTIONS = new Map<String, Integer>{
    'earlier' => -1,
    'later' => 1,
    'left' => -1,
    'right' => 1
  };

  @HttpPost
  global static void post() {
    AgentWeeks.answer(new AgentSpecialFrame());
  }

  public String run() {
    Map<String, Object> body = AgentFields.body(FIELDS);
    String asked = AgentFields.text(body, 'action').toLowerCase();
    String seen = AgentFields.text(body, 'seen');
    if (!ACTIONS.containsKey(asked) || String.isBlank(seen)) {
      throw new ShoreshException(
        'Nothing was changed. Say the action (one of ' +
          String.join(new List<String>(ACTIONS.keySet()), ', ') +
          ') and seen, as read_special_schedule said it.'
      );
    }
    AgentSpecials.Found found = AgentSpecials.find(body);
    SpecialScheduleFrame.Change change = new SpecialScheduleFrame.Change();
    change.action = ACTIONS.get(asked);
    change.name = AgentFields.text(body, 'name');
    String target = AgentFields.text(body, 'target');
    aimed(body, found.grid, change);
    SpecialSchedule.PlanView view = changed(found, change, seen);
    return 'Done: ' +
      asked.replace('_', ' ') +
      (String.isBlank(target) ? '' : ' "' + target + '"') +
      ' in "' +
      found.owner.name +
      '". seen is now ' +
      (view.revision == null
        ? AgentSpecials.NEVER_SAVED
        : String.valueOf(view.revision)) +
      '.';
  }

  /** What the change is aimed at (a time block or station, by name), its times and its step. */
  private static void aimed(
    Map<String, Object> body,
    ScheduleGrid grid,
    SpecialScheduleFrame.Change change
  ) {
    String asked = AgentFields.text(body, 'action').toLowerCase();
    String target = AgentFields.text(body, 'target');
    if (asked == 'add_time_block') {
      timesOf(body, change, null);
    } else if (asked.endsWith('time_block')) {
      ScheduleGrid.Block block = grid.blocks[
        AgentSpecials.blockIn(grid, target)
      ];
      change.targetId = block.id;
      timesOf(body, change, block);
    } else if (asked.endsWith('station') && asked != 'add_station') {
      change.targetId = grid.groups[AgentSpecials.columnIn(grid, target)].id;
    }
    if (asked.startsWith('move')) {
      change.direction = DIRECTIONS.get(
        AgentFields.text(body, 'direction').toLowerCase()
      );
    }
  }

  /** The screen's change at the revision seen; saved since is a conflict. */
  private static SpecialSchedule.PlanView changed(
    AgentSpecials.Found found,
    SpecialScheduleFrame.Change change,
    String seen
  ) {
    Integer revision = null;
    if (seen != AgentSpecials.NEVER_SAVED) {
      if (!seen.isNumeric()) {
        throw new ShoreshException(
          'Nothing was changed. Send seen as read_special_schedule said it.'
        );
      }
      revision = Integer.valueOf(seen);
    }
    try {
      return SpecialScheduleController.changeFrame(
        found.owner.itemId,
        revision,
        change
      );
    } catch (Exception e) {
      String words = ScreenErrors.words(e);
      if (
        words.startsWith('Someone else changed') ||
        words.startsWith('That was changed by someone else')
      ) {
        throw new AgentWeeks.ConflictException(
          'Changed by someone else since you read it. Nothing was changed. Read it again with read_special_schedule.'
        );
      }
      throw new ShoreshException('Nothing was changed. ' + words);
    }
  }

  /**
   * A time block's name and times as the screen sends them ("HH:mm"); left out, they stay as the
   * block has them (a name made of its times is made again from the new ones).
   */
  private static void timesOf(
    Map<String, Object> body,
    SpecialScheduleFrame.Change change,
    ScheduleGrid.Block block
  ) {
    change.startTime = clock(body, 'start_time', block?.startTime);
    change.endTime = clock(body, 'end_time', block?.endTime);
    if (
      block != null &&
      String.isBlank(change.name) &&
      block.name != SpecialPlanClock.rangeName(block.startTime, block.endTime)
    ) {
      change.name = block.name;
    }
  }

  private static String clock(
    Map<String, Object> body,
    String key,
    String kept
  ) {
    String asked = AgentFields.text(body, key);
    if (String.isBlank(asked)) {
      return kept;
    }
    return String.valueOf(AgentSetupTimes.timeOf(key, asked)).left(5);
  }
}
