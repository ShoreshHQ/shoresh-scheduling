/** Synthetic camp data for tests. No real campers, families, or staff. */
@IsTest
public class ShoreshTestData {
  public static Camp__c camp(String name) {
    Camp__c camp = new Camp__c(Name = name, TimeZone__c = 'America/New_York');
    Database.insert(camp, AccessLevel.SYSTEM_MODE);
    return camp;
  }

  /** Season of 29 June to 7 August 2026 (Mondays to Fridays), six weeks. */
  public static Season__c season(Id campId, String name) {
    Season__c season = new Season__c(
      Name = name,
      Camp__c = campId,
      StartDate__c = Date.newInstance(2026, 6, 29),
      EndDate__c = Date.newInstance(2026, 8, 7),
      Status__c = 'Active'
    );
    Database.insert(season, AccessLevel.SYSTEM_MODE);
    return season;
  }

  public static List<Week__c> weeks(Id seasonId, Integer count) {
    List<Week__c> weeks = new List<Week__c>();
    Date monday = Date.newInstance(2026, 6, 29);
    for (Integer i = 0; i < count; i++) {
      weeks.add(
        new Week__c(
          Season__c = seasonId,
          Name = 'Week ' + (i + 1),
          StartDate__c = monday.addDays(7 * i),
          EndDate__c = monday.addDays(7 * i + 4),
          SortOrder__c = i + 1
        )
      );
    }
    Database.insert(weeks, AccessLevel.SYSTEM_MODE);
    return weeks;
  }

  public static Program__c program(Id seasonId, String name) {
    Program__c program = new Program__c(
      Season__c = seasonId,
      Name = name,
      Friday__c = false,
      SortOrder__c = 1
    );
    Database.insert(program, AccessLevel.SYSTEM_MODE);
    return program;
  }

  public static Division__c division(Id programId, String name) {
    Division__c division = new Division__c(
      Program__c = programId,
      Name = name,
      SortOrder__c = 1
    );
    Database.insert(division, AccessLevel.SYSTEM_MODE);
    return division;
  }

  public static Group__c groupIn(Id divisionId, String name) {
    Group__c grp = new Group__c(
      Division__c = divisionId,
      Name = name,
      Availability__c = 'MorningOnly',
      SortOrder__c = 2
    );
    Database.insert(grp, AccessLevel.SYSTEM_MODE);
    return grp;
  }

  public static TimeBlock__c timeBlock(
    Id programId,
    String name,
    Integer startHour
  ) {
    TimeBlock__c block = new TimeBlock__c(
      Program__c = programId,
      Name = name,
      StartTime__c = Time.newInstance(startHour, 0, 0, 0),
      EndTime__c = Time.newInstance(startHour, 45, 0, 0),
      PartOfDay__c = startHour < 12 ? 'Morning' : 'Afternoon',
      EventsOnly__c = startHour == 12,
      SortOrder__c = startHour
    );
    Database.insert(block, AccessLevel.SYSTEM_MODE);
    return block;
  }

  /** A fully set-up season: 6 weeks, a program with blocks, a division, two groups, one exception. */
  public static Season__c fullSeason(Id campId) {
    Season__c season = season(campId, 'Summer 2026');
    List<Week__c> weeks = weeks(season.Id, 6);
    Program__c program = program(season.Id, 'Main');
    timeBlock(program.Id, 'Period 1', 9);
    timeBlock(program.Id, 'Lunch', 12);
    Division__c division = division(program.Id, 'Juniors');
    Group__c first = groupIn(division.Id, 'Group A');
    groupIn(division.Id, 'Group B');
    Database.insert(
      new WeekException__c(Week__c = weeks[2].Id, Group__c = first.Id),
      AccessLevel.SYSTEM_MODE
    );
    return season;
  }

  /** A Standard User with the Shoresh Scheduler permission set. */
  public static User scheduler() {
    return standardUser(true);
  }

  /** A Standard User with no Shoresh permissions at all. */
  public static User outsider() {
    return standardUser(false);
  }

  private static User standardUser(Boolean withPermissionSet) {
    Profile standard = [
      SELECT Id
      FROM Profile
      WHERE Name = 'Standard User'
      LIMIT 1
    ];
    String unique = String.valueOf(Crypto.getRandomInteger()).replace('-', '');
    User user = new User(
      Alias = 'sched',
      Email = 'scheduler' + unique + '@example.com',
      Username = 'scheduler' + unique + '@example.com.shoresh',
      LastName = 'Scheduler',
      ProfileId = standard.Id,
      TimeZoneSidKey = 'America/New_York',
      LocaleSidKey = 'en_US',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US'
    );
    // Setup records go in their own context so tests can also insert camp records.
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Database.insert(user, AccessLevel.SYSTEM_MODE);
      if (withPermissionSet) {
        PermissionSet ps = [
          SELECT Id
          FROM PermissionSet
          WHERE Name = 'Shoresh_Scheduler'
          LIMIT 1
        ];
        Database.insert(
          new PermissionSetAssignment(
            AssigneeId = user.Id,
            PermissionSetId = ps.Id
          ),
          AccessLevel.SYSTEM_MODE
        );
      }
    }
    return user;
  }
}
