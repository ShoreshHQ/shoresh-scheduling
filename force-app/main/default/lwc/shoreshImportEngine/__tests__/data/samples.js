// Made-up camp data for the import tests (not a test itself). Everything is invented.
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import { csvFile, workbookFile } from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";

// docs/samples/import, found from the tests folder each test file names (findSamplesFrom).
let SAMPLES = "";

export function findSamplesFrom(testsFolder) {
  SAMPLES = join(
    testsFolder,
    "..",
    "..",
    "..",
    "..",
    "..",
    "..",
    "docs",
    "samples",
    "import"
  );
}

export function sample(name) {
  const path = join(SAMPLES, name);
  return name.endsWith(".csv")
    ? csvFile(name, readFileSync(path, "utf8"))
    : workbookFile(XLSX, name, readFileSync(path));
}

export function samples(filter) {
  return readdirSync(SAMPLES)
    .filter((f) => f.includes(filter))
    .sort()
    .map(sample);
}

export const terms = buildTerms([]);

/** A CSV file from rows of cells. */
export function csv(name, rows) {
  return csvFile(name, rows.map((r) => r.join(",")).join("\n"));
}

export const BLOCKS = [
  "Period 1 9:00-9:45",
  "Period 2 9:50-10:35",
  "Lunch 11:30-12:15",
  "Period 3 1:00-1:45"
];
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const EVERY_DAY = [...DAYS, "Saturday", "Sunday"];

/**
 * One by-group CSV per group: cell(group, day, block) -> text. groups: [names].
 */
export function byGroupFiles(groups, cell, blocks = BLOCKS) {
  return groups.map((g, gi) =>
    csv(`Camp - ${g}.csv`, [
      ["Time", ...DAYS],
      ...blocks.map((b, bi) => [
        b,
        ...DAYS.map((_, d) => cell(gi, d, bi) || "")
      ])
    ])
  );
}

/** An existing season setup in the shape SeasonSetupReader returns. */
export function existingSetup({
  programs = [],
  activities = [],
  locations = [],
  weeks = [],
  electives = { sets: [], offerings: [], linkedChoices: [] }
} = {}) {
  return {
    season: { Id: "a00000000000001AAA", Name: "Summer" },
    weeks,
    weekExceptions: [],
    programs,
    activities,
    locations,
    locationTypes: [],
    schedules: [],
    labels: [],
    electives
  };
}

const MS = 60000;
export function program(
  id,
  name,
  { blocks = [], divisions = [], fixed = [], recurring = [], days = DAYS } = {}
) {
  const record = { Id: id, Name: name };
  EVERY_DAY.forEach((d) => {
    record[`${d}__c`] = days.includes(d);
  });
  return {
    program: record,
    timeBlocks: blocks.map(([bid, bname, start, end], i) => ({
      Id: bid,
      Name: bname,
      StartTime__c: start * MS,
      EndTime__c: end * MS,
      SortOrder__c: i + 1
    })),
    divisions: divisions.map(([did, dname, groups]) => ({
      division: { Id: did, Name: dname, SortOrder__c: 1 },
      groups: groups.map(([gid, gname], i) => ({
        Id: gid,
        Name: gname,
        SortOrder__c: i + 1
      }))
    })),
    fixedActivities: fixed,
    recurringActivities: recurring
  };
}
