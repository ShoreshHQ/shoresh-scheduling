// A made-up camp with two programs that share unit and bunk names, for the round-trip and
// workbook tests.
const MS = 60000;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const at = (h, m = 0) => (h * 60 + m) * MS;

function program(id, name, runs, parts) {
  const record = { Id: id, Name: name };
  DAYS.forEach((d) => {
    record[`${d}__c`] = runs.includes(d);
  });
  return { program: record, ...parts };
}

export function camp() {
  const block = (id, name, h, m, h2, m2, part) => ({
    Id: id,
    Name: name,
    StartTime__c: at(h, m),
    EndTime__c: at(h2, m2),
    PartOfDay__c: part
  });
  return {
    season: { Id: "s1", Camp__c: "c1" },
    labels: [
      {
        term: "Group",
        modelSingular: "Group",
        singular: "Bunk",
        plural: "Bunks",
        isCustom: true
      },
      {
        term: "Division",
        modelSingular: "Division",
        singular: "Unit",
        plural: "Units",
        isCustom: true
      }
    ],
    weeks: [
      {
        Id: "w1",
        Name: "Week 1",
        StartDate__c: "2027-06-28",
        EndDate__c: "2027-07-02"
      },
      {
        Id: "w2",
        Name: "Week 2",
        StartDate__c: "2027-07-05",
        EndDate__c: "2027-07-09"
      }
    ],
    // A week off of every kind of item (the Runs in sheet and screens read each kind's field).
    weekExceptions: [
      { Id: "x1", Week__c: "w2", Activity__c: "a2" },
      { Id: "x2", Week__c: "w1", Group__c: "g2" },
      { Id: "x3", Week__c: "w2", Location__c: "l2" },
      { Id: "x4", Week__c: "w1", FixedActivity__c: "f2" },
      { Id: "x5", Week__c: "w2", RecurringActivity__c: "r1" }
    ],
    locationTypes: [
      { Id: "lt1", Name: "Waterfront" },
      { Id: "lt2", Name: "Unused type" }
    ],
    locations: [
      {
        Id: "l1",
        Name: "Pool",
        GroupsThatFit__c: 2,
        LocationType__c: "lt1",
        Notes__c: "=Shallow end"
      },
      { Id: "l2", Name: "Gym", GroupsThatFit__c: 1 }
    ],
    activities: [
      {
        Id: "a1",
        Name: "Swim",
        Location__c: "l1",
        Length__c: 2,
        TimesPerWeekMin__c: 2,
        TimesPerWeekMax__c: 3,
        NoWeeklyMax__c: false,
        Priority__c: "High",
        Outdoor__c: true,
        RainPlan__c: "a2",
        GroupsAtOnce__c: 2,
        NoGroupLimit__c: false,
        SameDivisionOnly__c: true,
        EarlyWeekCount__c: 1,
        EarlyWeekByDay__c: "Wednesday",
        Notes__c: "+Bring towels",
        Eligibilities__r: [{ Division__c: "d1" }, { Group__c: "g3" }]
      },
      {
        Id: "a2",
        Name: "Board games",
        Length__c: 1,
        TimesPerWeekMin__c: 0,
        NoWeeklyMax__c: true,
        Priority__c: "Low",
        Outdoor__c: false,
        NoGroupLimit__c: true,
        Eligibilities__r: []
      }
    ],
    programs: [
      program("p1", "Main", DAYS, {
        timeBlocks: [
          block("tb1", "Period 1", 9, 0, 9, 45, "Morning"),
          block("tb2", "Lunch", 12, 0, 12, 45, "Afternoon")
        ],
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [
              { Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" },
              { Id: "g2", Name: "Bunk 2", Availability__c: "MorningOnly" }
            ]
          },
          {
            division: { Id: "d2", Name: "Seniors" },
            groups: [{ Id: "g3", Name: "Bunk 3", Availability__c: "AllDay" }]
          }
        ],
        fixedActivities: [
          {
            Id: "f1",
            Name: "Lunch",
            TimeBlock__c: "tb2",
            Length__c: 1,
            Location__c: "l2"
          }
        ],
        recurringActivities: [
          {
            Id: "r1",
            Name: "Meeting",
            TimeBlock__c: "tb1",
            Length__c: 1,
            Monday__c: true,
            Wednesday__c: true,
            Coverages__r: [{ Division__c: "d2" }, { Group__c: "g1" }]
          }
        ]
      }),
      program("p2", "Teens", ["Monday", "Tuesday"], {
        timeBlocks: [block("tb3", "Period 1", 10, 0, 10, 50, "Morning")],
        divisions: [
          {
            division: { Id: "d3", Name: "Juniors" },
            groups: [
              { Id: "g4", Name: "Bunk 1", Availability__c: "AfternoonOnly" }
            ]
          }
        ],
        fixedActivities: [
          { Id: "f2", Name: "Lunch", TimeBlock__c: "tb3", Length__c: 1 }
        ],
        recurringActivities: []
      })
    ]
  };
}
