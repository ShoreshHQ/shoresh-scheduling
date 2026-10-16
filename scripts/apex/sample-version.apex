// Builds a made-up week in the test org so the schedule page has a version to show
// (slice 4a; nothing in Shoresh creates versions until the spreadsheet import, slice 4b).
// Synthetic data only: an invented camp, "Sample Camp (made up)", kept apart from any camp
// set up by hand. Running it again adds another version to the same invented week.
// Run with scripts/make-sample-version.sh.

final String CAMP_NAME = 'Sample Camp (made up)';
final Date MONDAY = Date.newInstance(2027, 6, 28);

List<Camp__c> camps = [SELECT Id FROM Camp__c WHERE Name = :CAMP_NAME LIMIT 1];
if (camps.isEmpty()) {
  camps.add(new Camp__c(Name = CAMP_NAME, TimeZone__c = 'America/New_York'));
  insert camps;
}
Camp__c camp = camps[0];
List<Season__c> seasons = [SELECT Id FROM Season__c WHERE Camp__c = :camp.Id ORDER BY CreatedDate LIMIT 1];
Id seasonId;
if (seasons.isEmpty()) {
  Season__c season = new Season__c(
    Camp__c = camp.Id,
    Name = 'Sample summer',
    StartDate__c = MONDAY,
    EndDate__c = MONDAY.addDays(4),
    Status__c = 'Planning'
  );
  insert season;
  seasonId = season.Id;
  Program__c program = new Program__c(
    Season__c = seasonId,
    Name = 'Main',
    SortOrder__c = 1,
    Monday__c = true,
    Tuesday__c = true,
    Wednesday__c = true,
    Thursday__c = true,
    Friday__c = true
  );
  insert program;

  // Time blocks: [name, start hour, start minute], 45 minutes each.
  List<List<Object>> blockSpecs = new List<List<Object>>{
    new List<Object>{ 'Period 1', 9, 0 },
    new List<Object>{ 'Period 2', 9, 50 },
    new List<Object>{ 'Period 3', 10, 40 },
    new List<Object>{ 'Lunch', 11, 30 },
    new List<Object>{ 'Period 4', 12, 20 },
    new List<Object>{ 'Period 5', 13, 10 },
    new List<Object>{ 'Period 6', 14, 0 }
  };
  List<TimeBlock__c> blocks = new List<TimeBlock__c>();
  for (Integer i = 0; i < blockSpecs.size(); i++) {
    Time starts = Time.newInstance((Integer) blockSpecs[i][1], (Integer) blockSpecs[i][2], 0, 0);
    blocks.add(
      new TimeBlock__c(
        Program__c = program.Id,
        Name = (String) blockSpecs[i][0],
        StartTime__c = starts,
        EndTime__c = starts.addMinutes(45),
        PartOfDay__c = starts.hour() < 12 ? 'Morning' : 'Afternoon',
        SortOrder__c = i + 1
      )
    );
  }
  insert blocks;

  Division__c juniors = new Division__c(Program__c = program.Id, Name = 'Juniors', SortOrder__c = 1);
  Division__c seniors = new Division__c(Program__c = program.Id, Name = 'Seniors', SortOrder__c = 2);
  insert new List<Division__c>{ juniors, seniors };
  List<Group__c> groups = new List<Group__c>();
  for (Integer i = 1; i <= 6; i++) {
    groups.add(
      new Group__c(
        Division__c = i <= 3 ? juniors.Id : seniors.Id,
        Name = 'Bunk ' + i,
        Availability__c = 'AllDay',
        SortOrder__c = i
      )
    );
  }
  insert groups;

  Map<String, Location__c> places = new Map<String, Location__c>();
  for (String name : new List<String>{ 'Pool', 'Art room', 'Field', 'Gym', 'Lake', 'Dining hall', 'Library' }) {
    places.put(name, new Location__c(Season__c = seasonId, Name = name, GroupsThatFit__c = (name == 'Dining hall' || name == 'Library') ? 6 : 3));
  }
  insert places.values();

  List<Activity__c> activities = new List<Activity__c>();
  for (List<String> spec : new List<List<String>>{
    new List<String>{ 'Swim', 'Pool' },
    new List<String>{ 'Art', 'Art room' },
    new List<String>{ 'Soccer', 'Field' },
    new List<String>{ 'Gym games', 'Gym' },
    new List<String>{ 'Boating', 'Lake' }
  }) {
    activities.add(
      new Activity__c(
        Season__c = seasonId,
        Name = spec[0],
        Location__c = places.get(spec[1]).Id,
        Length__c = spec[0] == 'Boating' ? 2 : 1,
        TimesPerWeekMin__c = 1,
        TimesPerWeekMax__c = 3,
        Priority__c = 'Low',
        GroupsAtOnce__c = 3
      )
    );
  }
  insert activities;

  insert new FixedActivity__c(
    Program__c = program.Id,
    Name = 'Lunch',
    TimeBlock__c = blocks[3].Id,
    Length__c = 1,
    Location__c = places.get('Dining hall').Id
  );
  RecurringActivity__c meeting = new RecurringActivity__c(
    Program__c = program.Id,
    Name = 'Morning meeting',
    TimeBlock__c = blocks[0].Id,
    Length__c = 1,
    Location__c = places.get('Dining hall').Id,
    Monday__c = true
  );
  RecurringActivity__c library = new RecurringActivity__c(
    Program__c = program.Id,
    Name = 'Library time',
    TimeBlock__c = blocks[4].Id,
    Length__c = 1,
    Location__c = places.get('Library').Id,
    Wednesday__c = true
  );
  insert new List<RecurringActivity__c>{ meeting, library };
  insert new Coverage__c(Season__c = seasonId, RecurringActivity__c = library.Id, Division__c = juniors.Id);
} else {
  seasonId = seasons[0].Id;
}
// The week (again, if it was deleted since).
if ([SELECT COUNT() FROM Week__c WHERE Season__c = :seasonId] == 0) {
  insert new Week__c(
    Season__c = seasonId,
    Name = 'Week 1',
    StartDate__c = MONDAY,
    EndDate__c = MONDAY.addDays(4),
    SortOrder__c = 1
  );
}

// ---------- the version: one grid per day ----------

Program__c program = [SELECT Id FROM Program__c WHERE Season__c = :seasonId ORDER BY SortOrder__c LIMIT 1];
Week__c week = [SELECT Id, StartDate__c FROM Week__c WHERE Season__c = :seasonId ORDER BY StartDate__c LIMIT 1];
SetTimePlan plan = SetTimePlanReader.read(new Set<Id>{ seasonId }).get(seasonId);
SetTimePlan.ProgramPlan programPlan;
for (SetTimePlan.Item item : plan.items) {
  if (item.program.program.Id == program.Id) {
    programPlan = item.program;
  }
}
List<TimeBlock__c> blocks = programPlan.blocks;
List<Group__c> groups = programPlan.groups;
List<Activity__c> activities = [SELECT Id, Name, Length__c FROM Activity__c WHERE Season__c = :seasonId ORDER BY Name];

Schedule__c version = new Schedule__c(
  Program__c = program.Id,
  Week__c = week.Id,
  Name = 'Imported from sample-week.xlsx (made up)',
  Status__c = 'Version',
  Origin__c = 'Imported',
  VersionReason__c = 'Imported'
);
insert version;

List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
for (Integer d = 0; d < 5; d++) {
  String weekday = SetTimePlan.WEEKDAYS[d];
  ScheduleGrid grid = new ScheduleGrid();
  for (TimeBlock__c block : blocks) {
    grid.blocks.add(
      new ScheduleGrid.Block(block.Id, block.Name)
        .at(String.valueOf(block.StartTime__c).left(5), String.valueOf(block.EndTime__c).left(5))
    );
  }
  Map<String, Integer> itemNumber = new Map<String, Integer>();
  // cells[group][block]
  List<List<String>> cells = new List<List<String>>();
  for (Group__c grp : groups) {
    List<String> row = new List<String>();
    for (TimeBlock__c block : blocks) {
      row.add('');
    }
    cells.add(row);
  }

  // Fixed and recurring activities, where they fall this day and week (slice 3b's plan).
  for (SetTimePlan.Item item : plan.items) {
    if (!item.runDays().contains(weekday) || !item.weekIds.contains(week.Id)) {
      continue;
    }
    String key = (item.term == 'FixedActivity' ? 'F' : 'R') + '|' + item.record.Id + '|' + item.name;
    if (!itemNumber.containsKey(key)) {
      grid.items.add(new ScheduleGrid.Item(key.substringBefore('|'), item.record.Id, item.name));
      itemNumber.put(key, grid.items.size());
    }
    List<Integer> span = item.span();
    for (Integer b : span) {
      for (Group__c grp : item.groupsIn(b)) {
        Integer g = groups.indexOf(grp);
        cells[g][b] = b == span[0] ? String.valueOf(itemNumber.get(key)) : '^';
      }
    }
  }

  // Things the import notes but cannot set up yet: [kind, name, day, first block, length, first group, last group].
  for (List<Object> note : new List<List<Object>>{
    new List<Object>{ 'E', 'Chugim', 1, 6, 1, 0, 5 },
    new List<Object>{ 'T', 'Zoo trip', 3, 5, 2, 3, 5 },
    new List<Object>{ 'D', 'Field day', 4, 0, 3, 0, 5 },
    new List<Object>{ 'S', 'Color war', 4, 4, 2, 0, 5 }
  }) {
    if ((Integer) note[2] != d) {
      continue;
    }
    grid.items.add(new ScheduleGrid.Item((String) note[0], '', (String) note[1]));
    String position = String.valueOf(grid.items.size());
    for (Integer g = (Integer) note[5]; g <= (Integer) note[6]; g++) {
      for (Integer b = (Integer) note[3]; b < (Integer) note[3] + (Integer) note[4]; b++) {
        cells[g][b] = b == (Integer) note[3] ? position : '^';
      }
    }
  }

  // Activities in the open cells, in a fixed rotation; Boating takes two blocks when both are free.
  for (Integer g = 0; g < groups.size(); g++) {
    for (Integer b = 0; b < blocks.size(); b++) {
      // One cell left open on purpose: Bunk 6, last block, Monday.
      if (cells[g][b] != '' || (d == 0 && g == 5 && b == blocks.size() - 1)) {
        continue;
      }
      Activity__c activity = activities[Math.mod(g + b + 2 * d, activities.size())];
      Boolean twoBlocks = activity.Length__c == 2 && b + 1 < blocks.size() && cells[g][b + 1] == '';
      if (activity.Length__c == 2 && !twoBlocks) {
        activity = activities[Math.mod(g + b + 2 * d + 1, activities.size())];
      }
      String key = 'A|' + activity.Id;
      if (!itemNumber.containsKey(key)) {
        grid.items.add(new ScheduleGrid.Item('A', activity.Id, activity.Name));
        itemNumber.put(key, grid.items.size());
      }
      cells[g][b] = String.valueOf(itemNumber.get(key));
      if (twoBlocks) {
        cells[g][b + 1] = '^';
        b++;
      }
    }
  }

  for (Integer g = 0; g < groups.size(); g++) {
    grid.groups.add(new ScheduleGrid.GroupRef(groups[g].Id, groups[g].Name));
    grid.rows.add(cells[g]);
  }
  saves.add(new ScheduleDaySaves.DaySave(week.StartDate__c.addDays(d), grid, null));
}
ScheduleDaySaves.write(version.Id, saves);
System.debug('SAMPLE_VERSION ' + version.Id + ' in Sample Camp (made up), Sample summer, Week 1');
