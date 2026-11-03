// The end-to-end check's own made-up camp (scripts/e2e-connect.js): "E2E Pinecrest (made up)",
// kept apart from every other camp in the test org. Synthetic only: no real campers or staff.
// Refuses if the camp is already there (run e2e-pinecrest-cleanup.apex first).
final String CAMP_NAME = 'E2E Pinecrest (made up)';
final Date MONDAY = Date.newInstance(2027, 7, 5);

if ([SELECT COUNT() FROM Camp__c WHERE Name = :CAMP_NAME] > 0) {
  throw new IllegalArgumentException(CAMP_NAME + ' is already there.');
}
Camp__c camp = new Camp__c(Name = CAMP_NAME, TimeZone__c = 'America/New_York');
insert camp;
Season__c season = new Season__c(
  Camp__c = camp.Id,
  Name = 'E2E Pinecrest Summer 2027',
  StartDate__c = MONDAY,
  EndDate__c = MONDAY.addDays(11),
  Status__c = 'Planning'
);
insert season;
Program__c program = new Program__c(
  Season__c = season.Id,
  Name = 'Main',
  SortOrder__c = 1,
  Monday__c = true,
  Tuesday__c = true,
  Wednesday__c = true,
  Thursday__c = true,
  Friday__c = true
);
insert program;

List<TimeBlock__c> blocks = new List<TimeBlock__c>();
List<String> names = new List<String>{ 'Period 1', 'Period 2', 'Lunch', 'Period 3', 'Period 4' };
for (Integer i = 0; i < names.size(); i++) {
  Time starts = Time.newInstance(9, 0, 0, 0).addMinutes(60 * i);
  blocks.add(
    new TimeBlock__c(
      Program__c = program.Id,
      Name = names[i],
      StartTime__c = starts,
      EndTime__c = starts.addMinutes(50),
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
for (Integer i = 1; i <= 4; i++) {
  groups.add(
    new Group__c(
      Division__c = i <= 2 ? juniors.Id : seniors.Id,
      Name = 'Bunk ' + i,
      Availability__c = 'AllDay',
      SortOrder__c = i
    )
  );
}
insert groups;

Map<String, Location__c> places = new Map<String, Location__c>();
for (String name : new List<String>{ 'Pool', 'Field', 'Art room', 'Dining hall' }) {
  places.put(
    name,
    new Location__c(Season__c = season.Id, Name = name, GroupsThatFit__c = name == 'Dining hall' ? 6 : 2)
  );
}
insert places.values();
List<Activity__c> activities = new List<Activity__c>();
for (List<String> spec : new List<List<String>>{
  new List<String>{ 'Swim', 'Pool' },
  new List<String>{ 'Soccer', 'Field' },
  new List<String>{ 'Art', 'Art room' }
}) {
  activities.add(
    new Activity__c(
      Season__c = season.Id,
      Name = spec[0],
      Location__c = places.get(spec[1]).Id,
      Length__c = 1,
      TimesPerWeekMin__c = 1,
      TimesPerWeekMax__c = 5,
      Priority__c = 'Low',
      GroupsAtOnce__c = 2
    )
  );
}
insert activities;
insert new FixedActivity__c(
  Program__c = program.Id,
  Name = 'Lunch',
  TimeBlock__c = blocks[2].Id,
  Length__c = 1,
  Location__c = places.get('Dining hall').Id
);
insert new List<Week__c>{
  new Week__c(Season__c = season.Id, Name = 'Week 1', StartDate__c = MONDAY, EndDate__c = MONDAY.addDays(4), SortOrder__c = 1),
  new Week__c(Season__c = season.Id, Name = 'Week 2', StartDate__c = MONDAY.addDays(7), EndDate__c = MONDAY.addDays(11), SortOrder__c = 2)
};

// Electives: a "Chugim" set (Swim, 2 seats; Art, no limit) in Week 2's Manual Build, Monday
// Period 1 for Bunk 1 and Bunk 2, and its run as the Elective seats screen's own first Bring in
// choices leaves it (API-6.4: the first bring-in is the screen's); campers come in through the AI.
ElectiveSet__c chugim = new ElectiveSet__c(Season__c = season.Id, Name = 'Chugim');
insert chugim;
Map<String, Activity__c> byName = new Map<String, Activity__c>();
for (Activity__c a : activities) {
  byName.put(a.Name, a);
}
insert new List<Offering__c>{
  new Offering__c(ElectiveSet__c = chugim.Id, Activity__c = byName.get('Swim').Id, Seats__c = 2),
  new Offering__c(ElectiveSet__c = chugim.Id, Activity__c = byName.get('Art').Id, NoSeatLimit__c = true)
};
Week__c week2 = [SELECT Id FROM Week__c WHERE Season__c = :season.Id AND Name = 'Week 2'];
Schedule__c manual = new Schedule__c(
  Program__c = program.Id,
  Week__c = week2.Id,
  Name = 'Week 2',
  Status__c = 'Draft',
  Origin__c = 'Manual'
);
insert manual;
ScheduleGrid grid = new ScheduleGrid();
grid.blocks.add(new ScheduleGrid.Block(blocks[0].Id, 'Period 1').at('09:00', '09:50'));
grid.groups.add(new ScheduleGrid.GroupRef(groups[0].Id, 'Bunk 1'));
grid.groups.add(new ScheduleGrid.GroupRef(groups[1].Id, 'Bunk 2'));
grid.items.add(new ScheduleGrid.Item('E', chugim.Id, 'Chugim'));
grid.rows.add(new List<String>{ '1' });
grid.rows.add(new List<String>{ '1' });
ScheduleDaySaves.write(
  manual.Id,
  new List<ScheduleDaySaves.DaySave>{ new ScheduleDaySaves.DaySave(MONDAY.addDays(7), grid, null) }
);
insert new ElectiveRun__c(
  Season__c = season.Id,
  Name = 'Chugim · Week 2',
  ElectiveSet__c = chugim.Id,
  Week__c = week2.Id,
  Schedule__c = manual.Id,
  Status__c = 'Committed',
  Revision__c = 1
);
System.debug('E2E seeded ' + season.Id);
