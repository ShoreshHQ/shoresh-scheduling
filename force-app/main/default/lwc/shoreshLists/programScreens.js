/*
 * The lists of what a program holds (slice 4c part B): its days, units, bunks, time blocks,
 * fixed and recurring activities. Each row names its program in a Program column; a camp with
 * one program can leave it out. Columns as in screens.js; required means the heading must be in
 * the file, requiredValue that a cell can't be blank (the item can't be without it).
 */
import { WEEKDAYS, clock } from "c/shoreshImportEngine";

const MS_PER_MINUTE = 60000;

/** Every program's records of one kind, each told which program (and unit) it is in. */
function inPrograms(setup, pick) {
  return (setup.programs || []).flatMap((entry) =>
    pick(entry).map((record) => ({
      ...record,
      _programId: entry.program.Id,
      _programName: entry.program.Name
    }))
  );
}

function blockName(setup, id) {
  for (const entry of setup.programs || []) {
    const found = (entry.timeBlocks || []).find((b) => b.Id === id);
    if (found) {
      return found.Name;
    }
  }
  return null;
}

function nameOf(list, id) {
  const found = (list || []).find((r) => r.Id === id);
  return found ? found.Name : null;
}

function minutes(ms) {
  return ms === null || ms === undefined
    ? null
    : Math.round(ms / MS_PER_MINUTE);
}

function programColumn(t) {
  return {
    key: "program",
    heading: t.s("Program"),
    words: ["program", "cohort", "cohort_name"],
    type: "text",
    scope: true,
    fromRecord: (r) => r._programName
  };
}

function nameColumn(heading, words) {
  return {
    key: "name",
    heading,
    words: ["name", ...words],
    type: "text",
    required: true,
    fromRecord: (r) => r.Name,
    write: (v) => ({ Name: v })
  };
}

function daysColumn(words) {
  return {
    key: "days",
    heading: "Runs on",
    words: ["runs on", "days", ...words],
    type: "days",
    required: true,
    requiredValue: true,
    fromRecord: (r) => WEEKDAYS.filter((d) => r[`${d}__c`]),
    write: (v) => {
      const fields = {};
      WEEKDAYS.forEach((d) => {
        fields[`${d}__c`] = v.includes(d);
      });
      return fields;
    }
  };
}

function lengthColumn(t) {
  return {
    key: "length",
    heading: t.s("Length"),
    words: ["length", "length (blocks)", "blocks", "how long"],
    type: "whole",
    min: 1,
    requiredValue: true,
    newValue: 1,
    fromRecord: (r) => r.Length__c,
    write: (v) => ({ Length__c: v })
  };
}

function blockColumn(t) {
  return {
    key: "timeBlock",
    heading: t.s("TimeBlock"),
    words: ["time block", "block", "period", "when", "time_block_name"],
    type: "ref",
    ref: "timeBlock",
    required: true,
    requiredValue: true,
    refField: "TimeBlock__c",
    fromRecord: (r, setup) => blockName(setup, r.TimeBlock__c)
  };
}

function locationColumn(t) {
  return {
    key: "location",
    heading: t.s("Location"),
    words: ["location", "place", "where", "room"],
    type: "ref",
    ref: "location",
    refField: "Location__c",
    fromRecord: (r, setup) => nameOf(setup.locations, r.Location__c)
  };
}

export function programsScreen(t) {
  return {
    key: "programs",
    kind: "Program",
    term: "Program",
    columns: [
      nameColumn(t.s("Program"), ["program", "program name", "cohort"]),
      daysColumn(["days of operation", "operating days", "day", "day_label"])
    ],
    records: (setup) => (setup.programs || []).map((entry) => entry.program)
  };
}

export function divisionsScreen(t) {
  return {
    key: "divisions",
    kind: "Division",
    term: "Division",
    scope: "program",
    columns: [
      programColumn(t),
      nameColumn(t.s("Division"), ["division", "unit", "age division", "tier"])
    ],
    records: (setup) =>
      inPrograms(setup, (entry) =>
        (entry.divisions || []).map((d) => d.division)
      )
  };
}

export function groupsScreen(t) {
  return {
    key: "groups",
    kind: "Group",
    term: "Group",
    scope: "program",
    columns: [
      programColumn(t),
      {
        key: "division",
        heading: t.s("Division"),
        words: ["division", "unit", "age division", "tier_name", "tier"],
        type: "ref",
        ref: "division",
        required: true,
        requiredValue: true,
        refField: "Division__c",
        fromRecord: (r) => r._divisionName,
        // The screen's groups carry their division under the program's entry.
        fromId: (r) => r._divisionId
      },
      nameColumn(t.s("Group"), ["group", "bunk", "cabin", "group name"]),
      {
        key: "availability",
        heading: t.s("Availability"),
        words: ["availability", "available"],
        type: "choice",
        options: [
          { value: "AllDay", label: "All day", words: ["all"] },
          { value: "MorningOnly", label: "Morning only", words: ["morning"] },
          {
            value: "AfternoonOnly",
            label: "Afternoon only",
            words: ["afternoon"]
          }
        ],
        requiredValue: true,
        newValue: "AllDay",
        fromRecord: (r) => r.Availability__c || "AllDay",
        write: (v) => ({ Availability__c: v })
      }
    ],
    records: (setup) =>
      inPrograms(setup, (entry) =>
        (entry.divisions || []).flatMap((d) =>
          (d.groups || []).map((g) => ({
            ...g,
            _divisionId: d.division.Id,
            _divisionName: d.division.Name
          }))
        )
      )
  };
}

function timeColumn(key, heading, words, field) {
  return {
    key,
    heading,
    words,
    type: "time",
    required: true,
    requiredValue: true,
    fromRecord: (r) => minutes(r[field]),
    write: (v) => ({ [field]: clock(v) })
  };
}

export function timeBlocksScreen(t) {
  return {
    key: "timeBlocks",
    kind: "TimeBlock",
    term: "TimeBlock",
    scope: "program",
    columns: [
      programColumn(t),
      nameColumn(t.s("TimeBlock"), ["time block", "block", "period"]),
      timeColumn(
        "start",
        "Start",
        ["start time", "start_time", "from", "begins"],
        "StartTime__c"
      ),
      timeColumn(
        "end",
        "End",
        ["end time", "end_time", "to", "ends"],
        "EndTime__c"
      ),
      {
        key: "partOfDay",
        heading: "Part of day",
        words: ["part of day", "part_of_day", "morning or afternoon"],
        type: "choice",
        options: [
          { value: "Morning", label: "Morning", words: ["am"] },
          { value: "Afternoon", label: "Afternoon", words: ["pm"] }
        ],
        requiredValue: true,
        // Not written: from its start, as a block added by hand would be told.
        newValue: (values) => {
          return typeof values.start === "number" && values.start >= 12 * 60
            ? "Afternoon"
            : "Morning";
        },
        fromRecord: (r) => r.PartOfDay__c,
        write: (v) => ({ PartOfDay__c: v })
      }
    ],
    records: (setup) => inPrograms(setup, (entry) => entry.timeBlocks || [])
  };
}

export function fixedScreen(t) {
  return {
    key: "fixedActivities",
    kind: "FixedActivity",
    term: "FixedActivity",
    scope: "program",
    columns: [
      programColumn(t),
      nameColumn(t.s("FixedActivity"), ["fixed activity", "event"]),
      blockColumn(t),
      lengthColumn(t),
      locationColumn(t)
    ],
    records: (setup) =>
      inPrograms(setup, (entry) => entry.fixedActivities || [])
  };
}

export function recurringScreen(t) {
  return {
    key: "recurringActivities",
    kind: "RecurringActivity",
    term: "RecurringActivity",
    scope: "program",
    columns: [
      programColumn(t),
      nameColumn(t.s("RecurringActivity"), ["recurring activity"]),
      blockColumn(t),
      lengthColumn(t),
      locationColumn(t),
      daysColumn(["day_label"]),
      {
        key: "who",
        heading: "Who",
        words: ["who", "covers", "for", "tier_names"],
        type: "list",
        fromRecord: (r) =>
          (r.Coverages__r || [])
            .map((row) => row.Division__c || row.Group__c)
            .sort()
      }
    ],
    records: (setup) =>
      inPrograms(setup, (entry) => entry.recurringActivities || [])
  };
}
