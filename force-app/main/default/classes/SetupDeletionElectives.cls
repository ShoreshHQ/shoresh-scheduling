/**
 * The Electives screen's items for SetupDeletions (plan §6.2, repo ADR 0018 choice 19): an
 * elective set, "deleted|ElectiveSet||<name>", and an offering, named by its activity within its
 * set, "deleted|Offering|<set>|<activity>". One query, in user mode.
 *
 * A linked choice (electives slice E9) is remembered by what it links, not its name (a name can
 * be changed, and two may share one): "deleted|LinkedChoice|<set>|<activity>|<weekdays>|<time
 * blocks>", weekdays Monday to Friday and time blocks by start, each joined with "+", as Import
 * last year names one a double period would make again (c/shoreshImportEngine electives.js).
 */
public with sharing class SetupDeletionElectives {
  public class Found {
    public String kind;
    public String scope = '';
    public String name;
    public Id campId;
  }

  public static Boolean handles(Schema.SObjectType type) {
    return type == ElectiveSet__c.SObjectType ||
      type == Offering__c.SObjectType ||
      type == LinkedChoice__c.SObjectType;
  }

  /**
   * The set or offering as remembered; for anything else, or one that can't be read, a Found
   * with no camp (SetupDeletions remembers nothing for it).
   */
  public static Found of(Id recordId) {
    Found found = new Found();
    if (!handles(recordId.getSObjectType())) {
      return found;
    }
    if (recordId.getSObjectType() == ElectiveSet__c.SObjectType) {
      for (ElectiveSet__c row : [
        SELECT Name, Season__r.Camp__c
        FROM ElectiveSet__c
        WHERE Id = :recordId
        WITH USER_MODE
      ]) {
        found.kind = 'ElectiveSet';
        found.name = row.Name;
        found.campId = row.Season__r.Camp__c;
        return found;
      }
      return found;
    }
    if (recordId.getSObjectType() == LinkedChoice__c.SObjectType) {
      return linkedChoice(recordId, found);
    }
    for (Offering__c row : [
      SELECT
        Activity__r.Name,
        ElectiveSet__r.Name,
        ElectiveSet__r.Season__r.Camp__c
      FROM Offering__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      found.kind = 'Offering';
      found.name = row.Activity__r.Name;
      found.scope = row.ElectiveSet__r.Name;
      found.campId = row.ElectiveSet__r.Season__r.Camp__c;
      return found;
    }
    return found;
  }

  private static final List<String> WEEKDAYS = new List<String>{
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday'
  };

  private static Found linkedChoice(Id recordId, Found found) {
    for (LinkedChoice__c row : [
      SELECT
        Offering__r.Activity__r.Name,
        ElectiveSet__r.Name,
        ElectiveSet__r.Season__r.Camp__c,
        (
          SELECT Weekday__c, TimeBlock__r.Name, TimeBlock__r.StartTime__c
          FROM Times__r
        )
      FROM LinkedChoice__c
      WHERE Id = :recordId
      WITH USER_MODE
    ]) {
      Set<String> days = new Set<String>();
      // Time blocks by start ("09:00:00.000Z" sorts as the day goes), each once.
      Map<String, String> blockByStart = new Map<String, String>();
      for (LinkedChoiceTime__c period : row.Times__r) {
        days.add(period.Weekday__c);
        blockByStart.put(
          String.valueOf(period.TimeBlock__r.StartTime__c) +
            '|' +
            period.TimeBlock__r.Name,
          period.TimeBlock__r.Name
        );
      }
      List<String> starts = new List<String>(blockByStart.keySet());
      starts.sort();
      List<String> blocks = new List<String>();
      for (String start : starts) {
        if (!blocks.contains(blockByStart.get(start))) {
          blocks.add(blockByStart.get(start));
        }
      }
      List<String> weekdays = new List<String>();
      for (String day : WEEKDAYS) {
        if (days.contains(day)) {
          weekdays.add(day);
        }
      }
      found.kind = 'LinkedChoice';
      found.scope = row.ElectiveSet__r.Name;
      found.name =
        row.Offering__r.Activity__r.Name +
        '|' +
        String.join(weekdays, '+') +
        '|' +
        String.join(blocks, '+');
      found.campId = row.ElectiveSet__r.Season__r.Camp__c;
    }
    return found;
  }
}
