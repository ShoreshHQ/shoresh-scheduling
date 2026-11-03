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
    new Location__c(Season__c = season.Id, Name = name, GroupsThatFit__c = name == 'Dining hall' ? 4 : 2)
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
System.debug('E2E seeded ' + season.Id);
