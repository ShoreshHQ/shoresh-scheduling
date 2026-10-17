/**
 * Made-up camps for the engine's tests, written in plain words and turned into what the engine
 * gets: the season's records (bare names, passed through nsRecord so the namespaced run sends
 * them prefixed) and the week's days in Manual Build's DayView shape. Synthetic data only.
 */
import { nsRecord } from "shoresh-jest/namespace";

export const MONDAY = "2026-07-06";

/** "2026-07-06" plus n days. */
export function dateAt(n) {
  const d = new Date(Date.UTC(2026, 6, 6 + n));
  return d.toISOString().slice(0, 10);
}

const pad = (n) => String(n).padStart(2, "0");

/** Block i: 45 minutes from 08:00 + i hours; 12:00 and later is afternoon. */
export function block(i, over = {}) {
  const hour = 8 + i;
  return {
    id: `b${i}`,
    name: `Period ${i + 1}`,
    startTime: `${pad(hour)}:00`,
    endTime: `${pad(hour)}:45`,
    partOfDay: hour >= 12 ? "Afternoon" : "Morning",
    ...over
  };
}

export function group(id, over = {}) {
  return {
    id,
    name: `Bunk ${id}`,
    division: "div1",
    availability: "AllDay",
    ...over
  };
}

/** An activity: once to five times a week, one group at a time, unless told otherwise. */
export function activity(id, over = {}) {
  return {
    id,
    name: id,
    min: 0,
    max: 5,
    span: 1,
    atOnce: 1,
    location: null,
    sameDivision: false,
    priority: "High",
    early: null,
    eligible: [],
    ...over
  };
}

/**
 * spec: { groups, days (count or dates), blocks, activities, locations: [{ id, name, fit }],
 *   fixed: [{ id, name, block, length, location, groups? }], cells: [{ day, group, block, act }]
 *   (activities already in the grid), away: { groupId: [day indexes] } (not in that day's grid),
 *   locks, mode, option, programId, weekId, otherPrograms, weekExceptions }
 */
export function camp(spec) {
  const groups = spec.groups || [group("g1")];
  const blocks = spec.blocks || [block(0)];
  const dates =
    typeof spec.days === "number" || spec.days === undefined
      ? Array.from({ length: spec.days || 1 }, (_, i) => dateAt(i))
      : spec.days;
  const activities = spec.activities || [];
  const sortOf = (list, x) => list.indexOf(x) + 1;

  const groupRecords = groups.map((g) => ({
    Id: g.id,
    Name: g.name,
    Division__c: g.division,
    Availability__c: g.availability,
    SortOrder__c: sortOf(groups, g)
  }));
  const blockRecords = blocks.map((b) => ({
    Id: b.id,
    Name: b.name,
    PartOfDay__c: b.partOfDay,
    SortOrder__c: sortOf(blocks, b)
  }));
  const activityRecords = activities.map((a) => ({
    Id: a.id,
    Name: a.name,
    Location__c: a.location,
    Length__c: a.span,
    TimesPerWeekMin__c: a.min,
    TimesPerWeekMax__c: a.max == null ? null : a.max,
    NoWeeklyMax__c: a.max == null,
    GroupsAtOnce__c: a.atOnce == null ? null : a.atOnce,
    NoGroupLimit__c: a.atOnce == null,
    SameDivisionOnly__c: a.sameDivision,
    Priority__c: a.priority,
    EarlyWeekCount__c: a.early ? a.early.count : null,
    EarlyWeekByDay__c: a.early ? a.early.day : null,
    SortOrder__c: sortOf(activities, a)
  }));
  const eligibilityRecords = [];
  for (const a of activities) {
    a.eligible.forEach((target, i) => {
      const isGroup = groups.some((g) => g.id === target);
      eligibilityRecords.push({
        Id: `${a.id}-e${i}`,
        Activity__c: a.id,
        Group__c: isGroup ? target : null,
        Division__c: isGroup ? null : target
      });
    });
  }
  const locationRecords = (spec.locations || []).map((l) => ({
    Id: l.id,
    Name: l.name || l.id,
    GroupsThatFit__c: l.fit,
    SortOrder__c: 1
  }));
  const fixedRecords = (spec.fixed || []).map((f) => ({
    Id: f.id,
    Name: f.name || f.id,
    Location__c: f.location || null
  }));

  const days = dates.map((date, d) => {
    const inGrid = groups.filter(
      (g) => !(spec.away && (spec.away[g.id] || []).includes(d))
    );
    const items = [];
    const itemNo = (item) => {
      let i = items.findIndex((x) => x.kind === item.kind && x.id === item.id);
      if (i < 0) {
        items.push(item);
        i = items.length - 1;
      }
      return String(i + 1);
    };
    const rows = inGrid.map((g) => {
      const row = blocks.map(() => "");
      for (const f of spec.fixed || []) {
        if (f.groups && !f.groups.includes(g.id)) {
          continue;
        }
        const first = blocks.findIndex((b) => b.id === f.block);
        row[first] = itemNo({ kind: "F", id: f.id, name: f.name || f.id });
        for (let i = 1; i < (f.length || 1); i++) {
          row[first + i] = "^";
        }
      }
      for (const c of spec.cells || []) {
        if (c.group !== g.id || c.day !== d) {
          continue;
        }
        const a = activities.find((x) => x.id === c.act);
        const first = blocks.findIndex((b) => b.id === c.block);
        row[first] = itemNo({
          kind: c.kind || "A",
          id: c.act,
          name: a ? a.name : c.act
        });
        for (let i = 1; i < (c.length || (a ? a.span : 1)); i++) {
          row[first + i] = "^";
        }
      }
      return row.join(",");
    });
    return {
      dateValue: date,
      blocks: blocks.map((b) => ({
        id: b.id,
        name: b.name,
        startTime: b.startTime,
        endTime: b.endTime,
        kind: null,
        gone: false
      })),
      groups: inGrid.map((g) => ({ id: g.id, name: g.name })),
      items,
      rows
    };
  });

  return {
    programId: spec.programId || "prog1",
    weekId: spec.weekId || "week1",
    option: spec.option || 1,
    mode: spec.mode || "full",
    days,
    groups: nsRecord(groupRecords),
    timeBlocks: nsRecord(blockRecords),
    activities: nsRecord(activityRecords),
    eligibilities: nsRecord(eligibilityRecords),
    locations: nsRecord(locationRecords),
    fixedActivities: nsRecord(fixedRecords),
    recurringActivities: [],
    weekExceptions: nsRecord(spec.weekExceptions || []),
    locks: spec.locks || [],
    otherPrograms: spec.otherPrograms || []
  };
}

/** What a day's cells hold: grid[d][groupId][b] = { kind, id, head } or null. */
export function cellsOf(days) {
  return days.map((day) => {
    const byGroup = {};
    day.groups.forEach((g, gi) => {
      let carry = null;
      byGroup[g.id] = String(day.rows[gi] || "")
        .split(",")
        .map((token) => {
          if (token === "^") {
            return carry ? { ...carry, head: false } : null;
          }
          if (!token) {
            carry = null;
            return null;
          }
          const item = day.items[Number(token) - 1];
          carry = { kind: item.kind, id: item.id || item.name, head: true };
          return carry;
        });
    });
    return byGroup;
  });
}

/** The activity placed in a cell, or null. */
export function at(result, d, groupId, blockIndex) {
  const cell = cellsOf(result.days)[d][groupId][blockIndex];
  return cell ? cell.id : null;
}
