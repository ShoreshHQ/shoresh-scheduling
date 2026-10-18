/**
 * Made-up camps for Generated Schedule's tests, as GeneratedScheduleController.getInputs sends
 * them (records with bare field names, passed through nsRecord so the namespaced run sends them
 * prefixed; days in Manual Build's DayView shape). Synthetic data only.
 */
import { nsRecord } from "shoresh-jest/namespace";

export const PROGRAM = "a0P000000000001AAA";
export const WEEK = "a0K000000000001AAA";
export const WEEK_2 = "a0K000000000002AAA";
export const SCHEDULE = "a0S000000000001AAA";
export const FLAGPOLE = "a0F000000000001AAA";

const pad = (n, width = 3) => String(n).padStart(width, "0");
const id = (prefix, n) => `${prefix}000000000${pad(n)}AAA`;

/** "2026-06-29" plus n days. */
export function dateAt(n) {
  return new Date(Date.UTC(2026, 5, 29 + n)).toISOString().slice(0, 10);
}

/**
 * spec: { bunks: [{ name, availability }], days, blocks: [{ name, start, end, part }],
 * activities: [{ name, min, max, atOnce, length, early }], flagpole (Flagpole fixed in the
 * first block for everyone), scheduleId, option, notPlaced }.
 */
export function camp(spec) {
  const bunks = spec.bunks.map((b, i) => ({ ...b, id: id("a0G", i + 1) }));
  const blocks = spec.blocks.map((b, i) => ({ ...b, id: id("a0B", i + 1) }));
  const activities = spec.activities.map((a, i) => ({
    ...a,
    id: id("a0A", i + 1)
  }));
  const flagpole = spec.flagpole !== false;
  const days = Array.from({ length: spec.days }, (_, d) => ({
    dateValue: dateAt(d),
    problem: null,
    blocks: blocks.map((b) => ({
      id: b.id,
      name: b.name,
      startTime: b.start,
      endTime: b.end,
      gone: false
    })),
    groups: bunks.map((b) => ({ id: b.id, name: b.name, gone: false })),
    items: flagpole
      ? [{ id: FLAGPOLE, name: "Flagpole", kind: "F", gone: false }]
      : [],
    rows: bunks.map(() =>
      blocks.map((block, i) => (flagpole && i === 0 ? "1" : "")).join(",")
    )
  }));
  return nsRecord({
    scheduleId: spec.scheduleId || null,
    revision: spec.scheduleId ? "2026-06-29:1" : "",
    option: spec.option || null,
    days,
    notPlaced: spec.notPlaced || [],
    groups: bunks.map((b, i) => ({
      Id: b.id,
      Name: b.name,
      Division__c: b.division || "a0D000000000001AAA",
      Availability__c: b.availability || "AllDay",
      SortOrder__c: i + 1
    })),
    timeBlocks: blocks.map((b, i) => ({
      Id: b.id,
      Name: b.name,
      PartOfDay__c: b.part || "Morning",
      SortOrder__c: i + 1
    })),
    activities: activities.map((a, i) => ({
      Id: a.id,
      Name: a.name,
      Length__c: a.length || 1,
      TimesPerWeekMin__c: a.min || 0,
      TimesPerWeekMax__c: a.max === undefined ? 5 : a.max,
      GroupsAtOnce__c: a.atOnce || 1,
      Priority__c: a.priority || "Low",
      EarlyWeekCount__c: a.early ? a.early.count : null,
      EarlyWeekByDay__c: a.early ? a.early.day : null,
      SortOrder__c: i + 1
    })),
    eligibilities: [],
    locations: [],
    fixedActivities: flagpole
      ? [{ Id: FLAGPOLE, Name: "Flagpole", Location__c: null }]
      : [],
    recurringActivities: [],
    weekExceptions: []
  });
}

/** Two bunks (Bunk 2 mornings only), two days, Flagpole first, then two morning periods and one afternoon. */
export const SMALL = {
  bunks: [{ name: "Bunk 1" }, { name: "Bunk 2", availability: "MorningOnly" }],
  days: 2,
  blocks: [
    { name: "Flag", start: "08:30", end: "09:00" },
    { name: "Period 1", start: "09:00", end: "10:00" },
    { name: "Period 2", start: "10:00", end: "11:00" },
    { name: "Period 3", start: "13:00", end: "14:00", part: "Afternoon" }
  ],
  activities: [
    { name: "Swim", min: 2, max: 2, atOnce: 2 },
    { name: "Art", min: 0, max: 2, atOnce: 2 },
    { name: "Soccer", min: 0, max: 5, atOnce: 2 }
  ]
};

/** Twelve bunks, five days, eight periods, more owed than fits: a week built in many pieces. */
export const BIG = {
  bunks: Array.from({ length: 12 }, (_, i) => ({ name: `Bunk ${i + 1}` })),
  days: 5,
  blocks: Array.from({ length: 8 }, (_, i) => ({
    name: `Period ${i + 1}`,
    start: `${String(8 + i).padStart(2, "0")}:00`,
    end: `${String(8 + i).padStart(2, "0")}:45`
  })),
  activities: Array.from({ length: 10 }, (_, i) => ({
    name: `Activity ${i + 1}`,
    min: 4,
    max: 4,
    atOnce: 1,
    priority: i % 2 ? "Low" : "High"
  }))
};
