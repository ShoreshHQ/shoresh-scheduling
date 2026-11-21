/** Synthetic camp data for tests. No real campers, families, or staff. */
@IsTest
public class ShoreshTestData {
  /**
   * What the last fullSeason made, by name ('Season', 'Main', 'Week 1' to 'Week 6', 'Period 1',
   * 'Lunch', 'Juniors', 'Group A', 'Group B'), so builders on top of it need not read them back.
   */
  public static Map<String, Id> lastSeasonIds;

  /** Saves week exceptions on their own, with failures as the screens show them. */
  public static void saveWeekExceptions(
    List<WeekException__c> toAdd,
    List<Id> toRemove
  ) {
    try {
      WeekExceptions.save(toAdd, toRemove);
    } catch (Exception e) {
      throw ScreenErrors.of(e);
    }
  }

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
      SortOrder__c = startHour
    );
    Database.insert(block, AccessLevel.SYSTEM_MODE);
    return block;
  }

  /** A fully set-up season: 6 weeks, a program with blocks, a division, two groups, one exception. */
  public static Season__c fullSeason(Id campId) {
    // The clash check runs once, at the end, as a screen save does, not after every insert.
    SetTimeGuard.defer();
    try {
      Season__c season = season(campId, 'Summer 2026');
      Map<String, Id> made = new Map<String, Id>{ 'Season' => season.Id };
      List<Week__c> weeks = weeks(season.Id, 6);
      for (Week__c week : weeks) {
        made.put(week.Name, week.Id);
      }
      Program__c program = program(season.Id, 'Main');
      made.put('Main', program.Id);
      made.put('Period 1', timeBlock(program.Id, 'Period 1', 9).Id);
      made.put('Lunch', timeBlock(program.Id, 'Lunch', 12).Id);
      Division__c division = division(program.Id, 'Juniors');
      made.put('Juniors', division.Id);
      Group__c first = groupIn(division.Id, 'Group A');
      made.put('Group A', first.Id);
      made.put('Group B', groupIn(division.Id, 'Group B').Id);
      Database.insert(
        new WeekException__c(Week__c = weeks[2].Id, Group__c = first.Id),
        AccessLevel.SYSTEM_MODE
      );
      SetTimeGuard.checkPending();
      lastSeasonIds = made;
      return season;
    } finally {
      SetTimeGuard.resume();
    }
  }

  /**
   * Places and activities for a season made by fullSeason: a "Field" location type; Pool (fits 1),
   * Field A (fits 2, a Field), and Gym (fits 3); Swim at the Pool, open only to Group A; Soccer on
   * Field A, outdoors, with Gym games as its rain plan; Gym games in the Gym, open to the Juniors
   * division.
   */
  public static Map<String, Id> placesAndActivities(Id seasonId) {
    Map<String, Id> ids = new Map<String, Id>();
    LocationType__c field = new LocationType__c(
      Season__c = seasonId,
      Name = 'Field',
      SortOrder__c = 1
    );
    Database.insert(field, AccessLevel.SYSTEM_MODE);
    ids.put('Field', field.Id);
    List<Location__c> locations = new List<Location__c>{
      new Location__c(
        Season__c = seasonId,
        Name = 'Pool',
        GroupsThatFit__c = 1
      ),
      new Location__c(
        Season__c = seasonId,
        Name = 'Field A',
        GroupsThatFit__c = 2,
        LocationType__c = field.Id
      ),
      new Location__c(Season__c = seasonId, Name = 'Gym', GroupsThatFit__c = 3)
    };
    Database.insert(locations, AccessLevel.SYSTEM_MODE);
    for (Location__c location : locations) {
      ids.put(location.Name, location.Id);
    }
    List<Activity__c> activities = new List<Activity__c>{
      activity(seasonId, 'Swim', ids.get('Pool')),
      activity(seasonId, 'Soccer', ids.get('Field A')),
      activity(seasonId, 'Gym games', ids.get('Gym'))
    };
    activities[1].Outdoor__c = true;
    Database.insert(activities, AccessLevel.SYSTEM_MODE);
    for (Activity__c activity : activities) {
      ids.put(activity.Name, activity.Id);
    }
    Database.update(
      new Activity__c(
        Id = ids.get('Soccer'),
        RainPlan__c = ids.get('Gym games')
      ),
      AccessLevel.SYSTEM_MODE
    );
    // Group A and its division: as fullSeason made them, or read once.
    Group__c groupAWithDivision;
    if (lastSeasonIds != null && lastSeasonIds.get('Season') == seasonId) {
      groupAWithDivision = new Group__c(
        Id = lastSeasonIds.get('Group A'),
        Division__c = lastSeasonIds.get('Juniors')
      );
    } else {
      groupAWithDivision = [
        SELECT Id, Division__c
        FROM Group__c
        WHERE Name = 'Group A' AND Division__r.Program__r.Season__c = :seasonId
        WITH SYSTEM_MODE
      ];
    }
    Group__c groupA = groupAWithDivision;
    Database.insert(
      new List<ActivityEligibility__c>{
        new ActivityEligibility__c(
          Activity__c = ids.get('Swim'),
          Group__c = groupA.Id
        ),
        new ActivityEligibility__c(
          Activity__c = ids.get('Gym games'),
          Division__c = groupAWithDivision.Division__c
        )
      },
      AccessLevel.SYSTEM_MODE
    );
    return ids;
  }

  public static Activity__c activity(Id seasonId, String name, Id locationId) {
    return new Activity__c(
      Season__c = seasonId,
      Name = name,
      Location__c = locationId,
      Length__c = 1,
      TimesPerWeekMin__c = 1,
      TimesPerWeekMax__c = 2,
      Priority__c = 'Low',
      GroupsAtOnce__c = 1
    );
  }

  /**
   * A version saved by hand (Origin Manual), whose days a test may write as it likes. A version as an
   * import makes one (version) is kept as it came in: its days can't be written after it (ImportedWeekGuard).
   */
  public static Schedule__c savedVersion(Id programId, Id weekId, String name) {
    Schedule__c schedule = new Schedule__c(
      Program__c = programId,
      Week__c = weekId,
      Name = name,
      Status__c = 'Version',
      Origin__c = 'Manual',
      VersionReason__c = 'SavedByHand'
    );
    Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    return schedule;
  }

  /** A saved version of a program's week, as an import makes one. */
  public static Schedule__c version(Id programId, Id weekId, String name) {
    Schedule__c schedule = new Schedule__c(
      Program__c = programId,
      Week__c = weekId,
      Name = name,
      Status__c = 'Version',
      Origin__c = 'Imported',
      VersionReason__c = 'Imported'
    );
    Database.insert(schedule, AccessLevel.SYSTEM_MODE);
    return schedule;
  }

  /**
   * A day's grid for the given blocks and groups: Swim (an activity, two blocks long) for the
   * first group, Flagpole (a fixed activity) for the second, an elective not set up yet, and
   * the rest empty. Ids are the records given, or made-up text where none is needed.
   */
  public static ScheduleGrid grid(
    List<TimeBlock__c> blocks,
    List<Group__c> groups,
    Map<String, Id> itemIds
  ) {
    ScheduleGrid grid = new ScheduleGrid();
    for (TimeBlock__c block : blocks) {
      grid.blocks.add(
        new ScheduleGrid.Block(block.Id, block.Name).at('09:00', '09:45')
      );
    }
    grid.items.add(new ScheduleGrid.Item('A', itemIds.get('Swim'), 'Swim'));
    grid.items.add(
      new ScheduleGrid.Item('F', itemIds.get('Flagpole'), 'Flagpole')
    );
    grid.items.add(new ScheduleGrid.Item('E', '', 'Chugim'));
    for (Integer g = 0; g < groups.size(); g++) {
      grid.groups.add(new ScheduleGrid.GroupRef(groups[g].Id, groups[g].Name));
      List<String> row = new List<String>();
      for (Integer b = 0; b < blocks.size(); b++) {
        row.add(cell(g, b));
      }
      grid.rows.add(row);
    }
    return grid;
  }

  private static String cell(Integer g, Integer b) {
    if (g == 0) {
      return b == 0 ? '1' : (b == 1 ? '^' : '');
    }
    if (g == 1) {
      return b == 0 ? '2' : (b == 1 ? '3' : '');
    }
    return '';
  }

  /** A Standard User with the Shoresh Scheduler permission set. */
  public static User scheduler() {
    return userWith('Shoresh_Scheduler');
  }

  /** A Standard User with no Shoresh permissions at all. */
  public static User outsider() {
    return userWith(null);
  }

  /** A Standard User with only the named Shoresh permission set (an API access piece). */
  public static User userWith(String permissionSetName) {
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
      if (permissionSetName != null) {
        PermissionSet ps = [
          SELECT Id
          FROM PermissionSet
          WHERE Name = :permissionSetName
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

  /**
   * The name the namespaced package will report for a field (getPopulatedFieldsAsMap() keys,
   * an import's log): custom fields get ShoreshSchema's prefix, standard ones don't. Set
   * ShoreshSchema.simulatedPrefix = 'shoresh__' first to build what the namespaced org will see.
   */
  public static String packagedName(Schema.SObjectField field) {
    Schema.DescribeFieldResult described = field.getDescribe();
    return described.isCustom()
      ? ShoreshSchema.prefix() + described.getLocalName()
      : described.getLocalName();
  }
}
