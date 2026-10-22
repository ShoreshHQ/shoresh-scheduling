/**
 * The season's special days and special events, as the Special events screen shows them (ADR 0014
 * choice 11): each item, its plan in brief (its time blocks, how many rows, what is in each time
 * block) and the days it is on. Four queries for any number of items, in user mode; someone who
 * may not read special days and events gets none rather than a refusal of the whole season.
 */
public with sharing class SpecialItems {
  public class Setup {
    @AuraEnabled
    public List<SpecialDay__c> specialDays = new List<SpecialDay__c>();
    @AuraEnabled
    public List<SpecialEvent__c> specialEvents = new List<SpecialEvent__c>();
    /** One per item, special days first, in the lists' order. */
    @AuraEnabled
    public List<Brief> briefs = new List<Brief>();
  }

  /** One item's plan in brief and the days it is on. */
  public class Brief {
    @AuraEnabled
    public Id itemId;
    /** Whether a plan is saved. */
    @AuraEnabled
    public Boolean planned = false;
    /** Its rows: a special day's groups, an event's stations or teams. */
    @AuraEnabled
    public Integer rows = 0;
    @AuraEnabled
    public List<Period> periods = new List<Period>();
    /** Why the plan can't be read, or null. */
    @AuraEnabled
    public String problem;
    /** The days it is on, in week order. */
    @AuraEnabled
    public List<OnDay> days = new List<OnDay>();
  }

  /** One of the plan's own time blocks, and the names of what is in it, each once. */
  public class Period {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String startTime;
    @AuraEnabled
    public String endTime;
    @AuraEnabled
    public List<String> items = new List<String>();
  }

  public class OnDay {
    @AuraEnabled
    public Id weekId;
    @AuraEnabled
    public String day;
  }

  public static Setup forSeason(Id seasonId) {
    Setup result = new Setup();
    if (!canRead()) {
      return result;
    }
    result.specialDays = [
      SELECT Id, Name, Notes__c, SortOrder__c
      FROM SpecialDay__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
    result.specialEvents = [
      SELECT Id, Name, Location__c, Notes__c, SortOrder__c
      FROM SpecialEvent__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY SortOrder__c NULLS LAST, Name, Id
    ];
    List<Id> order = new List<Id>();
    for (SpecialDay__c day : result.specialDays) {
      order.add(day.Id);
    }
    for (SpecialEvent__c event : result.specialEvents) {
      order.add(event.Id);
    }
    if (order.isEmpty()) {
      return result;
    }
    Map<Id, Brief> briefs = new Map<Id, Brief>();
    for (Id itemId : order) {
      Brief brief = new Brief();
      brief.itemId = itemId;
      briefs.put(itemId, brief);
      result.briefs.add(brief);
    }
    for (SpecialDates.Placement placed : SpecialDates.forSeason(seasonId)) {
      Brief brief = briefs.get(placed.itemId);
      if (brief != null) {
        OnDay onDay = new OnDay();
        onDay.weekId = placed.weekId;
        onDay.day = placed.day;
        brief.days.add(onDay);
      }
    }
    Map<Id, SpecialPlans.Plan> plans = SpecialPlans.readAll(briefs.keySet());
    for (Id itemId : order) {
      fill(briefs.get(itemId), plans.get(itemId));
    }
    return result;
  }

  private static Boolean canRead() {
    return Schema.sObjectType.SpecialDay__c.isAccessible() &&
      Schema.sObjectType.SpecialEvent__c.isAccessible() &&
      Schema.sObjectType.SpecialDate__c.isAccessible() &&
      Schema.sObjectType.PlanPart__c.isAccessible();
  }

  private static void fill(Brief brief, SpecialPlans.Plan plan) {
    if (plan == null) {
      return;
    }
    if (plan.problem != null) {
      brief.problem = plan.problem;
      brief.planned = true;
      return;
    }
    ScheduleGrid grid = plan.grid;
    if (grid == null) {
      return;
    }
    brief.planned = true;
    brief.rows = grid.groups.size();
    for (Integer b = 0; b < grid.blocks.size(); b++) {
      ScheduleGrid.Block block = grid.blocks[b];
      Period period = new Period();
      period.name = block.name;
      period.startTime = block.startTime;
      period.endTime = block.endTime;
      Set<String> seen = new Set<String>();
      for (List<String> row : grid.rows) {
        String name = nameIn(grid, row, b);
        if (name != null && seen.add(name)) {
          period.items.add(name);
        }
      }
      brief.periods.add(period);
    }
  }

  /** What a row holds in a time block: its item, or the item above carrying on into it. */
  private static String nameIn(ScheduleGrid grid, List<String> row, Integer b) {
    Integer at = b;
    while (at > 0 && row[at] == ScheduleGrid.CARRIES_ON) {
      at--;
    }
    String cell = row[at];
    if (String.isBlank(cell) || cell == ScheduleGrid.CARRIES_ON) {
      return null;
    }
    return grid.items[Integer.valueOf(cell) - 1].name;
  }
}
