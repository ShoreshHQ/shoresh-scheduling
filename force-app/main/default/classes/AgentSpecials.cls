/**
 * What the doors to a special day's or event's own schedule share (docs/protocol/api.md API-1.76
 * to API-1.78): the item found by name in the season, as the Special events screen lists it, its
 * plan as saved, a cell named as the screen names it, and the plan's revision as the `seen` the
 * changes carry ("none" for a plan never saved).
 */
public with sharing class AgentSpecials {
  public static final String NEVER_SAVED = 'none';
  public static final String OPEN_WORD = 'Open';

  /** The special day or event a request names, with its plan as saved now. */
  public class Found {
    public SpecialSchedule.Owner owner;
    public SpecialPlans.Plan plan;
    public ScheduleGrid grid;
    public CampLabels labels;
  }

  /** The item named (special, kind) in the season named; refused naming what there is. */
  public static Found find(Map<String, Object> body) {
    Season__c season = AgentChangeCampWords.seasonOf(
      AgentFields.text(body, 'season')
    );
    CampLabels labels = CampLabels.forCamp(season.Camp__c);
    String asked = AgentFields.text(body, 'special');
    String kind = IncomingBatch.fold(AgentFields.text(body, 'kind'));
    List<SObject> rows = new List<SObject>();
    if (kind != 'special event') {
      rows.addAll(
        [
          SELECT Id, Name
          FROM SpecialDay__c
          WHERE Season__c = :season.Id
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ]
      );
    }
    if (kind != 'special day') {
      rows.addAll(
        [
          SELECT Id, Name
          FROM SpecialEvent__c
          WHERE Season__c = :season.Id
          WITH USER_MODE
          ORDER BY SortOrder__c, Name
        ]
      );
    }
    List<String> names = new List<String>();
    for (SObject row : rows) {
      names.add((String) row.get('Name'));
    }
    Integer at = AgentFields.onlyOne(names, asked, 'special day or event');
    if (at < 0) {
      throw new ShoreshException(
        (String.isBlank(asked)
            ? 'Say which special day or event (special).'
            : 'There is no special day or event called "' +
              asked.left(80) +
              '" in ' +
              season.Name +
              '.') +
          ' ' +
          AgentWeeks.namesSaid('special days and events', names)
      );
    }
    Found found = new Found();
    found.labels = labels;
    found.owner = SpecialSchedule.ownerOf(rows[at].Id);
    found.plan = SpecialPlans.read(rows[at].Id);
    found.grid = found.plan.grid == null
      ? SpecialSchedule.emptyGrid(found.owner, null)
      : found.plan.grid;
    return found;
  }

  /** The plan's revision as the agent reads it and sends it back as seen. */
  public static String revisionOf(SpecialPlans.Plan plan) {
    return plan.revision == null ? NEVER_SAVED : String.valueOf(plan.revision);
  }

  /** What a slot holds, by the name the grid shows ("Open" when nothing). */
  public static String nameOf(ScheduleGrid grid, String slot) {
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

  /** The time block by its name ("Relays") or its start ("09:50"); -1 when none reads so. */
  public static Integer blockIn(ScheduleGrid grid, String asked) {
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
    if (found < 0) {
      throw new ShoreshException(
        'There is no time called "' +
          asked.left(80) +
          '" in this schedule. ' +
          AgentWeeks.namesSaid('times', names)
      );
    }
    return found;
  }

  /** The column (a group, or an event's station) by its name. */
  public static Integer columnIn(ScheduleGrid grid, String asked) {
    List<String> names = new List<String>();
    for (ScheduleGrid.GroupRef each : grid.groups) {
      names.add(each.name);
    }
    Integer found = AgentFields.onlyOne(names, asked, 'column');
    if (found < 0) {
      throw new ShoreshException(
        'There is no column called "' +
          asked.left(80) +
          '" in this schedule. ' +
          AgentWeeks.namesSaid('columns', names)
      );
    }
    return found;
  }
}
