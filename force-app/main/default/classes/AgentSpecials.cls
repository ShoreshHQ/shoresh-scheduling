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
    String kind = AgentFields.text(body, 'kind').toLowerCase();
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
    String dayOrEvent =
      labels.singularInSentence('SpecialDay') +
      ' or ' +
      labels.singularInSentence('SpecialEvent');
    Integer at = AgentFields.onlyOne(
      names,
      asked,
      CampWordRules.withArticle(dayOrEvent)
    );
    if (at < 0) {
      throw new ShoreshException(
        (String.isBlank(asked)
            ? 'Say which ' + dayOrEvent + ' (special).'
            : 'There is no ' +
              dayOrEvent +
              ' called "' +
              asked.left(80) +
              '" in ' +
              season.Name +
              '.') +
          ' ' +
          AgentWeeks.namesSaid(
            labels.pluralInSentence('SpecialDay') +
              ' and ' +
              labels.pluralInSentence('SpecialEvent'),
            names
          )
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

  /**
   * A change to the plan its page has no Undo for (a frame change, an import): the page's Undo
   * starts over, as the connector's does (API-1.14).
   */
  public static void undoNone(Found found, String change) {
    AgentUndoHeld.hold(AgentUndoHeld.entry(found.owner.itemId, 'none', change));
  }

  /** The plan's revision as the agent reads it and sends it back as seen. */
  public static String revisionOf(SpecialPlans.Plan plan) {
    return plan.revision == null ? NEVER_SAVED : String.valueOf(plan.revision);
  }

  /**
   * The plan's revision from the seen sent (read_special_schedule's; null for "none", never
   * saved), handed to the page's own save, which holds the plan and compares (SpecialPlans).
   * Refused, with "Nothing was <done>.", when left out or unreadable.
   */
  public static Integer seenOf(Map<String, Object> body, String done) {
    String seen = AgentFields.text(body, 'seen');
    if (seen == NEVER_SAVED) {
      return null;
    }
    if (String.isBlank(seen) || !seen.isNumeric()) {
      throw new ShoreshException(
        'Nothing was ' + done + '. Send seen as read_special_schedule said it.'
      );
    }
    return Integer.valueOf(seen);
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

  /**
   * The time block by its name ("Relays") or its start ("09:50"); refused in the camp's words
   * (words) when none reads so.
   */
  public static Integer blockIn(
    ScheduleGrid grid,
    String asked,
    CampLabels words
  ) {
    List<String> names = new List<String>();
    List<String> starts = new List<String>();
    for (ScheduleGrid.Block block : grid.blocks) {
      names.add(block.name);
      starts.add(block.startTime == null ? '' : block.startTime.left(5));
    }
    String aBlock = words.withArticle('TimeBlock');
    Integer found = AgentFields.onlyOne(names, asked, aBlock);
    if (found < 0) {
      found = AgentFields.onlyOne(starts, asked, aBlock);
    }
    if (found < 0) {
      throw new ShoreshException(
        'There is no ' +
          words.singularInSentence('TimeBlock') +
          ' called "' +
          asked.left(80) +
          '" in this schedule. ' +
          AgentWeeks.namesSaid(words.pluralInSentence('TimeBlock'), names)
      );
    }
    return found;
  }

  /** An event's station (one of its columns) by its name, refused in the camp's words. */
  public static Integer stationIn(
    ScheduleGrid grid,
    String asked,
    CampLabels words
  ) {
    List<String> names = new List<String>();
    for (ScheduleGrid.GroupRef each : grid.groups) {
      names.add(each.name);
    }
    Integer found = AgentFields.onlyOne(
      names,
      asked,
      words.withArticle('Station')
    );
    if (found < 0) {
      throw new ShoreshException(
        'There is no ' +
          words.singularInSentence('Station') +
          ' called "' +
          asked.left(80) +
          '" in this schedule. ' +
          AgentWeeks.namesSaid(words.pluralInSentence('Station'), names)
      );
    }
    return found;
  }
}
