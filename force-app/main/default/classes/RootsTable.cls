/**
 * What Roots' table draws that the season's setup does not already hold (repo ADR 0020): which
 * weeks have a schedule, a glimpse of one day of Generated Schedule's and Manual Build's drafts,
 * the elective seats of the latest run, and the saved versions. Everything else on the table
 * (weeks, programs, divisions, groups, time blocks, places, camp words, activities, fixed and
 * recurring activities, special events, electives) is drawn from the setup the page has already
 * read, so the whole table costs this one request (RootsGlimpses draws the drafts, RootsSeats the
 * seats). A fixed number of queries, whatever the size of the camp. Runs in user mode; names on
 * the glimpses are the ones the schedule saved, so the request reads no camp words.
 */
public with sharing class RootsTable {
  public static final String DRAFT = 'Draft';
  private static final String PUBLISHED = 'Published';
  private static final String VERSION = 'Version';
  // Tests stand in a day of the season for today.
  @TestVisible
  private static Date todayForTest;

  public class Table {
    /** The week today falls in, or null outside the season. */
    @AuraEnabled
    public Id thisWeekId;
    /** The week the schedule cards show: this week, else the first with a draft, else the first. */
    @AuraEnabled
    public Id shownWeekId;
    /** Weeks with a draft or a published schedule in any program. */
    @AuraEnabled
    public List<Id> builtWeekIds = new List<Id>();
    @AuraEnabled
    public Glimpse generated;
    @AuraEnabled
    public Glimpse manual;
    @AuraEnabled
    public List<Seat> seats = new List<Seat>();
    @AuraEnabled
    public Version latestVersion;
  }

  /** The first day of a draft, its first groups across and its time blocks down. */
  public class Glimpse {
    @AuraEnabled
    public List<String> groups = new List<String>();
    @AuraEnabled
    public List<Row> rows = new List<Row>();
  }

  /** One time block: its start ("09:00"), and what each group has, or the one fixed activity. */
  public class Row {
    @AuraEnabled
    public String startTime;
    /** The fixed activity every group has in this block, or null. */
    @AuraEnabled
    public String fixed;
    @AuraEnabled
    public List<Cell> cells = new List<Cell>();
  }

  public class Cell {
    /** What is placed ('' when nothing is). */
    @AuraEnabled
    public String name = '';
    @AuraEnabled
    public Boolean locked = false;
  }

  /** An offering of the latest elective run: its seats (null without a limit) and those taken. */
  public class Seat {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Integer seats;
    @AuraEnabled
    public Integer taken = 0;
    @AuraEnabled
    public Integer minimum;
  }

  public class Version {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Id weekId;
    @AuraEnabled
    public Datetime savedAt;
    @AuraEnabled
    public Boolean published = false;
  }

  public static Table read(Id seasonId) {
    Table result = new Table();
    List<Week__c> weeks = [
      SELECT Id, StartDate__c, EndDate__c
      FROM Week__c
      WHERE Season__c = :seasonId
      WITH USER_MODE
      ORDER BY StartDate__c, SortOrder__c, Id
    ];
    if (weeks.isEmpty()) {
      return result;
    }
    result.thisWeekId = thisWeek(weeks);
    List<Schedule__c> schedules = [
      SELECT Id, Week__c, Status__c, Origin__c
      FROM Schedule__c
      WHERE Week__r.Season__c = :seasonId AND Status__c IN (:DRAFT, :PUBLISHED)
      WITH USER_MODE
      ORDER BY Program__r.SortOrder__c, Program__r.Name, CreatedDate, Id
    ];
    Set<Id> built = new Set<Id>();
    Set<Id> withDraft = new Set<Id>();
    for (Schedule__c schedule : schedules) {
      built.add(schedule.Week__c);
      if (schedule.Status__c == DRAFT) {
        withDraft.add(schedule.Week__c);
      }
    }
    result.builtWeekIds = inOrder(weeks, built);
    List<Id> drafted = inOrder(weeks, withDraft);
    // This week, else the first week with a draft, else the first week.
    result.shownWeekId = result.thisWeekId != null
      ? result.thisWeekId
      : (drafted.isEmpty() ? weeks[0].Id : drafted[0]);
    RootsGlimpses.read(result, schedules);
    readVersions(result, seasonId);
    RootsSeats.read(result, seasonId);
    return result;
  }

  /** The week today falls in, or null. */
  private static Id thisWeek(List<Week__c> weeks) {
    Date today = todayForTest != null ? todayForTest : Date.today();
    for (Week__c week : weeks) {
      if (week.StartDate__c <= today && today <= week.EndDate__c) {
        return week.Id;
      }
    }
    return null;
  }

  /** The weeks in the set, in the season's order. */
  private static List<Id> inOrder(List<Week__c> weeks, Set<Id> chosen) {
    List<Id> result = new List<Id>();
    for (Week__c week : weeks) {
      if (chosen.contains(week.Id)) {
        result.add(week.Id);
      }
    }
    return result;
  }

  private static void readVersions(Table result, Id seasonId) {
    List<Schedule__c> latest = [
      SELECT Name, Week__c, Status__c, CreatedDate
      FROM Schedule__c
      WHERE
        Week__r.Season__c = :seasonId
        AND Status__c IN (:VERSION, :PUBLISHED)
      WITH USER_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
    if (!latest.isEmpty()) {
      Version version = new Version();
      version.name = latest[0].Name;
      version.weekId = latest[0].Week__c;
      version.savedAt = latest[0].CreatedDate;
      version.published = latest[0].Status__c == PUBLISHED;
      result.latestVersion = version;
    }
  }
}
