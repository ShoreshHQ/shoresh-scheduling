/**
 * read_special_schedule: a special day's or event's own schedule as its screen shows it, through
 * an agent or the command line (docs/protocol/api.md API-1.76). Web address
 * /v1/read_special_schedule, GET ?season=&special=&kind=. Each time block with its times, and
 * each column's cell (a group, or an event's station), and the plan's revision as seen.
 */
@RestResource(urlMapping='/v1/read_special_schedule')
global with sharing class AgentReadSpecialSchedule implements AgentWeeks.Action {
  private static final Set<String> FIELDS = new Set<String>{
    'season',
    'special',
    'kind'
  };

  @HttpGet
  global static void get() {
    AgentWeeks.answer(new AgentReadSpecialSchedule());
  }

  public String run() {
    Map<String, Object> asked = new Map<String, Object>();
    for (String key : RestContext.request.params.keySet()) {
      if (!FIELDS.contains(key)) {
        throw new ShoreshException(
          'Shoresh doesn\'t know the field "' +
            key.left(40) +
            '". The fields are: kind, season, special.'
        );
      }
      asked.put(key, RestContext.request.params.get(key));
    }
    AgentSpecials.Found found = AgentSpecials.find(asked);
    ScheduleGrid grid = found.grid;
    List<String> columns = new List<String>();
    for (ScheduleGrid.GroupRef column : grid.groups) {
      columns.add(column.name);
    }
    List<String> blocks = new List<String>();
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      blocks.add(blockSaid(grid, b));
    }
    String term = found.labels.singularInSentence(found.owner.term);
    return '"' +
      found.owner.name +
      '" (' +
      term +
      '). Columns: ' +
      (columns.isEmpty() ? 'none yet' : String.join(columns, ', ')) +
      '. Times: ' +
      (blocks.isEmpty() ? 'none yet' : String.join(blocks, ' | ')) +
      '. seen: ' +
      AgentSpecials.revisionOf(found.plan) +
      ' (send it with change_special_schedule_frame).';
  }

  /** 'Relays (09:50-11:20): Blue Swim; Gold Open'. */
  private static String blockSaid(ScheduleGrid grid, Integer b) {
    ScheduleGrid.Block block = grid.blocks[b];
    List<String> cells = new List<String>();
    for (Integer g = 0; g < grid.groups.size(); g++) {
      String slot = SlotIds.ofRow(grid, g)[b];
      cells.add(
        grid.groups[g].name +
          ' ' +
          (SlotIds.isCarryOn(slot) ? '(continues) ' : '') +
          AgentSpecials.nameOf(grid, slot)
      );
    }
    return block.name +
      ' (' +
      block.startTime +
      '-' +
      block.endTime +
      ')' +
      (cells.isEmpty() ? '' : ': ' + String.join(cells, '; '));
  }
}
