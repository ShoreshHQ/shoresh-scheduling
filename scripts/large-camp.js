#!/usr/bin/env node
/**
 * A large made-up camp in the test org (shoresh-test), to see Shoresh at full size: "Large Camp
 * (made up)", 600 campers in 45 bunks (three divisions of 15), 8 weeks of six days, and "Chugim"
 * (24 offerings of 12 seats) in Periods 4, 5 and 6 every day for every bunk. Each week has a
 * Manual Build draft and a committed elective run with all 600 campers' choices (three ranked
 * each), so a week's Assign places 600 x 18 = 10,800 seats and the season holds 86,400.
 * Synthetic only: no real campers, families or staff.
 *
 *   node scripts/large-camp.js seed     makes it (refuses if it is already there)
 *   node scripts/large-camp.js clean    takes it out again, out of the Recycle Bin too
 *
 * Not run in CI. Each step is one anonymous Apex run, each well under Salesforce's limits. It
 * refuses to start while a CI Scratch-org job is queued or running (they share the one org).
 */
const { spawnSync, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ORG = "shoresh-test";
const CAMP = "Large Camp (made up)";
const SEASON = "Large Camp Summer 2027";
const WEEKS = 8;
const BUNKS = 45;
const CAMPERS = 600;
const OFFERINGS = 24;
// Monday 28 June 2027; each week Monday to Saturday.
const FIRST_MONDAY = "2027, 6, 28";

function ciUsingTheOrg() {
  for (const status of ["in_progress", "queued"]) {
    const runs = JSON.parse(
      execFileSync("gh", [
        "run",
        "list",
        "--repo",
        "ShoreshHQ/shoresh-scheduling",
        "--status",
        status,
        "--json",
        "databaseId"
      ])
    );
    for (const { databaseId } of runs) {
      const { jobs } = JSON.parse(
        execFileSync("gh", [
          "run",
          "view",
          String(databaseId),
          "--repo",
          "ShoreshHQ/shoresh-scheduling",
          "--json",
          "jobs"
        ])
      );
      if (
        jobs.some((j) => /Scratch org/.test(j.name) && j.status !== "completed")
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Runs one piece of anonymous Apex; its System.debug lines starting "LARGE " come back. */
function apex(label, body) {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "large-camp-")),
    "step.apex"
  );
  fs.writeFileSync(file, body);
  const out = spawnSync(
    "sf",
    ["apex", "run", "--file", file, "--target-org", ORG, "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const said = JSON.parse(out.stdout || "{}");
  if (!said.result?.success) {
    throw new Error(
      `${label} failed: ${said.result?.compileProblem || said.result?.exceptionMessage || said.message || "no answer"}`
    );
  }
  const lines = (said.result.logs || "")
    .split("\n")
    .filter((l) => l.includes("|DEBUG|LARGE "))
    .map((l) => l.slice(l.indexOf("LARGE ") + 6));
  console.log(`${label}: done${lines.length ? ` (${lines.join("; ")})` : ""}`);
  return lines;
}

const SEASON_ID = `[SELECT Id FROM Season__c WHERE Name = '${SEASON}' AND Camp__r.Name = '${CAMP}' LIMIT 1].Id`;

const SETUP = `
if ([SELECT COUNT() FROM Camp__c WHERE Name = '${CAMP}'] > 0) {
  throw new IllegalArgumentException('${CAMP} is already there. Run: node scripts/large-camp.js clean');
}
Date monday = Date.newInstance(${FIRST_MONDAY});
Camp__c camp = new Camp__c(Name = '${CAMP}', TimeZone__c = 'America/New_York');
insert camp;
Season__c season = new Season__c(Camp__c = camp.Id, Name = '${SEASON}', StartDate__c = monday,
  EndDate__c = monday.addDays(7 * ${WEEKS} - 2), Status__c = 'Planning');
insert season;
Program__c program = new Program__c(Season__c = season.Id, Name = 'Main', SortOrder__c = 1,
  Monday__c = true, Tuesday__c = true, Wednesday__c = true, Thursday__c = true, Friday__c = true,
  Saturday__c = true);
insert program;
List<String> names = new List<String>{ 'Period 1', 'Period 2', 'Period 3', 'Lunch', 'Period 4', 'Period 5', 'Period 6' };
List<TimeBlock__c> blocks = new List<TimeBlock__c>();
for (Integer i = 0; i < names.size(); i++) {
  Time starts = Time.newInstance(9, 0, 0, 0).addMinutes(60 * i);
  blocks.add(new TimeBlock__c(Program__c = program.Id, Name = names[i], StartTime__c = starts,
    EndTime__c = starts.addMinutes(50), PartOfDay__c = starts.hour() < 12 ? 'Morning' : 'Afternoon',
    SortOrder__c = i + 1));
}
insert blocks;
List<Division__c> divisions = new List<Division__c>{
  new Division__c(Program__c = program.Id, Name = 'Juniors', SortOrder__c = 1),
  new Division__c(Program__c = program.Id, Name = 'Middlers', SortOrder__c = 2),
  new Division__c(Program__c = program.Id, Name = 'Seniors', SortOrder__c = 3)
};
insert divisions;
List<Group__c> groups = new List<Group__c>();
for (Integer i = 1; i <= ${BUNKS}; i++) {
  groups.add(new Group__c(Division__c = divisions[(i - 1) / ${BUNKS / 3}].Id, Name = 'Bunk ' + i,
    Availability__c = 'AllDay', SortOrder__c = i));
}
insert groups;
List<Week__c> weeks = new List<Week__c>();
for (Integer w = 0; w < ${WEEKS}; w++) {
  weeks.add(new Week__c(Season__c = season.Id, Name = 'Week ' + (w + 1),
    StartDate__c = monday.addDays(7 * w), EndDate__c = monday.addDays(7 * w + 5), SortOrder__c = w + 1));
}
insert weeks;
List<Activity__c> activities = new List<Activity__c>();
for (Integer i = 1; i <= ${OFFERINGS}; i++) {
  activities.add(new Activity__c(Season__c = season.Id, Name = 'Chug ' + i, Length__c = 1,
    TimesPerWeekMin__c = 0, TimesPerWeekMax__c = 18, Priority__c = 'Low', GroupsAtOnce__c = ${BUNKS}));
}
insert activities;
ElectiveSet__c chugim = new ElectiveSet__c(Season__c = season.Id, Name = 'Chugim');
insert chugim;
List<Offering__c> offerings = new List<Offering__c>();
for (Activity__c a : activities) {
  offerings.add(new Offering__c(ElectiveSet__c = chugim.Id, Activity__c = a.Id, Seats__c = 12));
}
insert offerings;
System.debug('LARGE season ' + season.Id);
`;

const CAMPERS_STEP = `
Id seasonId = ${SEASON_ID};
List<Camper__c> made = new List<Camper__c>();
for (Integer i = 1; i <= ${CAMPERS}; i++) {
  made.add(new Camper__c(Season__c = seasonId, Name = 'Synthetic Camper ' + String.valueOf(i).leftPad(3, '0'),
    CamperNumber__c = 'LRG-' + String.valueOf(i).leftPad(4, '0')));
}
insert made;
System.debug('LARGE campers ' + made.size());
`;

/** Week w (1-based): its draft with Chugim in Periods 4-6 every day, and its run with every camper's choices. */
const weekStep = (w) => `
Id seasonId = ${SEASON_ID};
Week__c week = [SELECT Id, Name, StartDate__c FROM Week__c WHERE Season__c = :seasonId AND Name = 'Week ${w}'];
Program__c program = [SELECT Id FROM Program__c WHERE Season__c = :seasonId];
List<TimeBlock__c> blocks = [SELECT Id, Name, StartTime__c, EndTime__c FROM TimeBlock__c WHERE Program__c = :program.Id ORDER BY SortOrder__c];
List<Group__c> groups = [SELECT Id, Name FROM Group__c WHERE Division__r.Program__c = :program.Id ORDER BY SortOrder__c];
ElectiveSet__c chugim = [SELECT Id, Name FROM ElectiveSet__c WHERE Season__c = :seasonId];
List<Activity__c> activities = [SELECT Id, Name FROM Activity__c WHERE Season__c = :seasonId ORDER BY Name];
Schedule__c draft = new Schedule__c(Program__c = program.Id, Week__c = week.Id, Name = week.Name,
  Status__c = 'Draft', Origin__c = 'Manual');
insert draft;
ScheduleGrid grid = new ScheduleGrid();
for (TimeBlock__c b : blocks) {
  grid.blocks.add(new ScheduleGrid.Block(b.Id, b.Name)
    .at(String.valueOf(b.StartTime__c).left(5), String.valueOf(b.EndTime__c).left(5)));
}
for (Group__c g : groups) {
  grid.groups.add(new ScheduleGrid.GroupRef(g.Id, g.Name));
  grid.rows.add(new List<String>{ '', '', '', '', '1', '1', '1' });
}
grid.items.add(new ScheduleGrid.Item('E', chugim.Id, chugim.Name));
List<ScheduleDaySaves.DaySave> days = new List<ScheduleDaySaves.DaySave>();
for (Integer d = 0; d < 6; d++) {
  days.add(new ScheduleDaySaves.DaySave(week.StartDate__c.addDays(d), grid, null));
}
ScheduleDaySaves.write(draft.Id, days);
ElectiveRun__c run = new ElectiveRun__c(Season__c = seasonId, Name = 'Chugim · ' + week.Name,
  ElectiveSet__c = chugim.Id, Week__c = week.Id, Schedule__c = draft.Id, Status__c = 'Committed', Revision__c = 1);
insert run;
List<Preference__c> prefs = new List<Preference__c>();
Integer i = 0;
for (Camper__c c : [SELECT Id FROM Camper__c WHERE Season__c = :seasonId ORDER BY CamperNumber__c]) {
  List<String> picks = new List<String>();
  Set<Integer> taken = new Set<Integer>();
  for (Integer step : new List<Integer>{ 1, 7, 11 }) {
    Integer k = Math.mod(i * step + ${w} * 5 + step, ${OFFERINGS});
    while (taken.contains(k)) { k = Math.mod(k + 1, ${OFFERINGS}); }
    taken.add(k);
    picks.add('{"n":"' + activities[k].Name + '","a":"' + activities[k].Id + '","r":' + (picks.size() + 1) + ',"k":"ranked"}');
  }
  prefs.add(new Preference__c(ElectiveRun__c = run.Id, Camper__c = c.Id,
    Group__c = groups[Math.mod(i, groups.size())].Id, Choices__c = '[' + String.join(picks, ',') + ']'));
  i++;
}
insert prefs;
System.debug('LARGE ' + week.Name + ' run ' + run.Id + ', ' + prefs.size() + ' campers');
`;

// Seats, choices, runs, campers, then the rest: each run a bounded number of rows, deleted and
// emptied from the Recycle Bin (both count toward the 10,000 rows of one run).
const cleanStep = (what, soql, n) => `
List<SObject> rows = Database.query('${soql} LIMIT ${n}');
if (!rows.isEmpty()) {
  delete rows;
  Database.emptyRecycleBin(rows);
}
System.debug('LARGE ${what} ' + rows.size());
`;

function clean() {
  // The season, reached through each row's own path (path ends in a dot).
  const inSeason = (path) =>
    `${path}Season__r.Name = \\'${SEASON}\\' AND ${path}Season__r.Camp__r.Name = \\'${CAMP}\\'`;
  const steps = [
    ["seats", `SELECT Id FROM Assignment__c WHERE ${inSeason("ElectiveRun__r.")}`],
    [
      "choices",
      `SELECT Id FROM Preference__c WHERE ${inSeason("ElectiveRun__r.")}`
    ],
    [
      "schedule days",
      `SELECT Id FROM ScheduleDay__c WHERE ${inSeason("Schedule__r.Program__r.")}`
    ],
    // One at a time: a run's emptied seats still count toward Salesforce's cascade limit for a
    // while, so a season deleted with all its runs is refused (DELETE_OPERATION_TOO_LARGE).
    [
      "elective runs",
      `SELECT Id FROM ElectiveRun__c WHERE ${inSeason("")}`,
      1
    ],
    // The same for the offerings the seats pointed at.
    [
      "offerings",
      `SELECT Id FROM Offering__c WHERE ${inSeason("ElectiveSet__r.")}`,
      1
    ]
  ];
  for (const [what, soql, n] of steps) {
    for (;;) {
      const [line] = apex(`clean ${what}`, cleanStep(what, soql, n ?? 4000));
      if (Number(line.split(" ").pop()) === 0) break;
    }
  }
  apex(
    "clean the camp",
    `
List<Camp__c> camps = [SELECT Id FROM Camp__c WHERE Name = '${CAMP}'];
List<Season__c> seasons = [SELECT Id FROM Season__c WHERE Camp__c IN :camps];
delete seasons;
delete camps;
List<SObject> gone = new List<SObject>();
gone.addAll((List<SObject>) seasons);
gone.addAll((List<SObject>) camps);
if (!gone.isEmpty()) Database.emptyRecycleBin(gone);
System.debug('LARGE camps ' + camps.size());
`
  );
}

function seed() {
  apex("camp, season, bunks, weeks, Chugim", SETUP);
  apex("600 campers", CAMPERS_STEP);
  for (let w = 1; w <= WEEKS; w++) apex(`Week ${w}`, weekStep(w));
}

const command = process.argv[2];
if (!["seed", "clean"].includes(command)) {
  console.error("Usage: node scripts/large-camp.js seed|clean");
  process.exit(1);
}
if (ciUsingTheOrg()) {
  console.error("A CI run is using the test org. Try again once it is done.");
  process.exit(1);
}
(command === "seed" ? seed : clean)();
