// Greg's swap test (2026-10-27): after "Import last year", a director removes one activity
// (Sports) and adds one (Adventure Baseball) with exactly the same settings and groups. The next
// Generate should give the same week with Sports' cells now Adventure Baseball and nothing else
// moved: an activity identical in all but its name is the same input (wiki decision: same inputs,
// same output).
//
// The whole pipeline runs in memory: Greg's camp (scripts/import-corpus/fixtures/plant-camp.xlsx)
// through the import engine, with the questions answered as the camp's truth says
// (scripts/import-corpus/plant-camp.js), the import plan saved as records the way ImportItemWrites
// saves them, the week's grid and imported version as GeneratedInputs reads them, and
// generateWeek run the way Generated Schedule runs it.
import { readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import * as importEngine from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";
import { FIELD } from "c/shoreshSchema";
import { generateWeek, MODE } from "c/shoreshEngine";
import { plantCamp } from "../../../../../../scripts/import-corpus/plant-camp";

const CORPUS = "../../../../../../scripts/import-corpus";

// One season week for the import's version to land in (Monday to Friday, synthetic dates).
const WEEK_ID = "a0W000000000001AAA";
const SEASON = {
  season: { Id: "a00000000000001AAA", Name: "Summer" },
  weeks: [
    {
      Id: WEEK_ID,
      Name: "Week 1",
      [FIELD.Week.StartDate]: "2026-07-06",
      [FIELD.Week.EndDate]: "2026-07-10"
    }
  ],
  weekExceptions: [],
  programs: [],
  activities: [],
  locations: [],
  locationTypes: [],
  schedules: [],
  labels: [],
  electives: { sets: [], offerings: [], linkedChoices: [] }
};

// The truth's answers (plant-camp.js): "Lunch2" is Lunch 2, "Swim Returning" is Swim Return.
// CIT is its own division (Greg, 2026-10-27); the division card can't say so yet (corpus.test.js
// counts that question), so CIT's division is added when the plan is saved, below.
const ANSWERS = {
  "similar|activity|lunch2|lunch2|Lunch 2|Lunch2": "a",
  "similar|activity|swimreturn|swimreturning|Swim Return|Swim Returning": "a"
};
const CIT_DIVISION = "D|P0|CIT";

function importPlan() {
  const bytes = readFileSync(
    join(__dirname, CORPUS, "fixtures/plant-camp.xlsx")
  );
  const camp = plantCamp(bytes);
  const files = camp.files.map((f) =>
    importEngine.workbookFile(XLSX, f.name, f.data)
  );
  const terms = buildTerms([]);
  const proposal = importEngine.buildProposal({
    files,
    existing: SEASON,
    terms,
    answers: ANSWERS,
    layouts: {}
  });
  return importEngine.planFor(proposal, SEASON, SEASON.season.Id);
}

/** Salesforce-like Ids handed out in save order, as the server does. */
function idMaker() {
  let n = 0;
  return (prefix) => `${prefix}${String(++n).padStart(12, "0")}AAA`;
}

/** The plan saved as records (ImportItemWrites), and the imported version's days as DayViews. */
function saveImport(plan) {
  const nextId = idMaker();
  const ids = new Map();
  const idOf = (key) => (key == null ? null : ids.get(key) || null);
  const give = (key, prefix) => {
    ids.set(key, nextId(prefix));
    return ids.get(key);
  };
  const divisions = [...plan.divisions, { key: CIT_DIVISION, name: "CIT" }];
  divisions.forEach((d) => give(d.key, "a0D"));
  const A = FIELD.Activity;
  const records = {
    timeBlocks: plan.timeBlocks.map((b) => ({
      Id: give(b.key, "a0T"),
      Name: b.name,
      [FIELD.TimeBlock.PartOfDay]: b.partOfDay,
      [FIELD.TimeBlock.SortOrder]: b.sortOrder
    })),
    groups: plan.groups.map((g) => ({
      Id: give(g.key, "a0G"),
      Name: g.name,
      [FIELD.Group.Division]: idOf(g.divisionKey || CIT_DIVISION),
      [FIELD.Group.Availability]: "AllDay",
      [FIELD.Group.SortOrder]: g.sortOrder
    })),
    locations: plan.locations.map((l) => ({
      Id: give(l.key, "a0L"),
      Name: l.name,
      [FIELD.Location.GroupsThatFit]: l.groupsThatFit
    })),
    activities: plan.activities.map((a) => ({
      Id: give(a.key, "a0A"),
      Name: a.name,
      [A.Location]: idOf(a.locationKey),
      [A.Length]: a.length,
      [A.TimesPerWeekMin]: a.min,
      [A.TimesPerWeekMax]: a.max,
      [A.NoWeeklyMax]: false,
      [A.GroupsAtOnce]: a.groupsAtOnce,
      [A.NoGroupLimit]: false,
      [A.SortOrder]: a.sortOrder
    })),
    fixedActivities: plan.fixedActivities.map((f) => ({
      Id: give(f.key, "a0F"),
      Name: f.name,
      [FIELD.FixedActivity.Location]: idOf(f.locationKey)
    })),
    recurringActivities: plan.recurringActivities.map((r) => ({
      Id: give(r.key, "a0R"),
      Name: r.name,
      [FIELD.RecurringActivity.Location]: idOf(r.locationKey)
    }))
  };
  const E = FIELD.ActivityEligibility;
  records.eligibilities = [];
  for (const a of plan.activities) {
    for (const target of a.who) {
      // The CIT group's division is the one added above.
      const key = target || CIT_DIVISION;
      const isGroup = key.startsWith("G|");
      records.eligibilities.push({
        Id: nextId("a0E"),
        [E.Activity]: idOf(a.key),
        [E.Group]: isGroup ? idOf(key) : null,
        [E.Division]: isGroup ? null : idOf(key)
      });
    }
  }
  const version = plan.versions.find((v) => v.weekId === WEEK_ID);
  const days = version.days.map(({ date, grid }) => ({
    dateValue: date,
    blocks: grid.b.map(([key, name, start, end]) => ({
      id: idOf(key),
      name,
      startTime: start,
      endTime: end,
      kind: null,
      gone: false
    })),
    groups: grid.g.map(([key, name]) => ({ id: idOf(key), name })),
    items: grid.i.map(([kind, key, name]) => ({ kind, id: idOf(key), name })),
    rows: grid.r
  }));
  return { records, imported: { name: version.name, days } };
}

/** BlankWeek: the week's grid with only its fixed and recurring activities in place. */
function blankWeek(days) {
  return days.map((day) => {
    const keep = day.items.map(
      (item) => item.kind === "F" || item.kind === "R"
    );
    return {
      ...day,
      rows: day.rows.map((row) =>
        row
          .split(",")
          .reduce((out, token, i) => {
            const carry = token === "^" && out.length && out[i - 1] !== "";
            const kept = token && token !== "^" && keep[Number(token) - 1];
            out.push(kept ? token : carry ? "^" : "");
            return out;
          }, [])
          .join(",")
      )
    };
  });
}

/** Generated Schedule's input for the week (GeneratedInputs + engineInput), a full build. */
function inputOf(records, imported) {
  return {
    programId: "a0P000000000001AAA",
    weekId: WEEK_ID,
    option: 1,
    mode: MODE.FULL,
    days: blankWeek(imported.days),
    ...records,
    weekExceptions: [],
    locks: [],
    otherPrograms: [],
    terms: buildTerms([]),
    replacedDates: [],
    electiveOfferings: [],
    firstDay: 1,
    imported: imported.days,
    importedName: imported.name
  };
}

/** Each cell as "date|group|block" -> what is there, by name ("" for Open). */
function cellsByName(result) {
  const cells = new Map();
  for (const day of result.days) {
    day.groups.forEach((g, gi) => {
      let carry = "";
      String(day.rows[gi] || "")
        .split(",")
        .forEach((token, b) => {
          if (token !== "^") {
            carry = token ? day.items[Number(token) - 1].name : "";
          }
          cells.set(`${day.dateValue}|${g.name}|${day.blocks[b].name}`, carry);
        });
    });
  }
  return cells;
}

/**
 * Build B: Sports deleted, Adventure Baseball added as Camp Setup adds an activity (a new record:
 * a new, later Id and no sort order) with Sports' settings and eligibility. at: its location
 * ({ name, fit } or null for Sports' own); keepPlace: Sports' place in the list, for the control.
 */
function swapped(
  records,
  {
    at = null,
    keepPlace = false,
    from = "Sports",
    to = "Adventure Baseball"
  } = {}
) {
  const A = FIELD.Activity;
  const E = FIELD.ActivityEligibility;
  const sports = records.activities.find((a) => a.Name === from);
  const sortOrder = keepPlace ? sports[A.SortOrder] : null;
  const newId = "a0A999999999999AAA";
  const locations = [...records.locations];
  let locationId = sports[A.Location];
  if (at) {
    locationId = "a0L999999999999AAA";
    locations.push({
      Id: locationId,
      Name: at.name,
      [FIELD.Location.GroupsThatFit]: at.fit
    });
  }
  return {
    ...records,
    locations,
    activities: [
      ...records.activities.filter((a) => a !== sports),
      {
        ...sports,
        Id: newId,
        Name: to,
        [A.Location]: locationId,
        [A.SortOrder]: sortOrder
      }
    ],
    eligibilities: records.eligibilities.map((e) => {
      return e[E.Activity] === sports.Id
        ? { ...e, Id: `${e.Id}x`, [E.Activity]: newId }
        : e;
    })
  };
}

/** The cells that moved between A and B, with Sports read as Adventure Baseball. */
function moves(a, b, from = "Sports", to = "Adventure Baseball") {
  const out = [];
  for (const [key, was] of a) {
    const want = was === from ? to : was;
    const got = b.get(key);
    if (got !== want) {
      out.push(`${key}: A had ${was || "Open"}, B has ${got || "Open"}`);
    }
  }
  return out;
}

function explain(label, aResult, bResult, moved) {
  if (!moved.length) {
    return;
  }

  console.log(
    [
      `${label}: ${moved.length} cells moved beyond the swap`,
      `A floor: ${JSON.stringify(aResult.floor)}`,
      `B floor: ${JSON.stringify(bResult.floor)}`,
      ...moved.slice(0, 25)
    ].join("\n")
  );
}

describe("Swapping one activity for an identical one after the import (Greg's camp)", () => {
  const plan = importPlan();
  const { records, imported } = saveImport(plan);
  const a = generateWeek(inputOf(records, imported));
  const aCells = a.ok ? cellsByName(a) : new Map();
  const run = (b) => generateWeek(inputOf(b, imported));
  // Rebuild of week A after the setup change (Greg 2026-10-27, protocol section 10): the week as
  // it is is kept, and only what the change forces moves.
  const rebuild = (b) =>
    generateWeek({ ...inputOf(b, imported), mode: MODE.KEEP, days: a.days });

  it("builds week A from the imported camp", () => {
    expect(a.ok).toBe(true);
    expect(
      [...aCells.values()].filter((n) => n === "Sports").length
    ).toBeGreaterThan(0);
  });

  // Control: Adventure Baseball takes Sports' place in the activity list too. Only its name and
  // Id differ from Sports.
  it("control: same place in the list, same location", () => {
    const b = run(swapped(records, { keepPlace: true }));
    const moved = moves(aCells, cellsByName(b));
    explain("control", a, b, moved);
    expect(moved).toEqual([]);
  });

  // Rule 9.10 (docs/engine/protocol.md): name, Id and place in the list never change the week.
  // As a director does it: Sports deleted, a new activity added at the end of the list.
  // GEN-9.10
  it.each([
    ["(a) the same location", null],
    ["(b) a new location that fits as many groups", { name: "Diamond", fit: 2 }]
  ])("puts Adventure Baseball exactly where Sports was, at %s", (label, at) => {
    const b = run(swapped(records, { at }));
    const moved = moves(aCells, cellsByName(b));
    explain(label, a, b, moved);
    expect(moved).toEqual([]);
  });

  // Rebuild (rules 10.1-10.3): with setup unchanged nothing moves; with Sports swapped (a, b),
  // Adventure Baseball lands exactly where Sports was, as on a fresh build.
  // GEN-10.1
  it("a Rebuild with setup unchanged keeps week A exactly", () => {
    const b = rebuild(records);
    expect(moves(aCells, cellsByName(b), "-", "-")).toEqual([]);
    expect(b.keep.changed).toBe(0);
  });
  // GEN-9.10, GEN-10.3
  it.each([
    ["(a) the same location", null],
    ["(b) a new location that fits as many groups", { name: "Diamond", fit: 2 }]
  ])(
    "a Rebuild puts Adventure Baseball exactly where Sports was, at %s",
    (label, at) => {
      const b = rebuild(swapped(records, { at }));
      expect(moves(aCells, cellsByName(b))).toEqual([]);
    }
  );

  // Twins: an activity with the same settings as others (Drama as Arts and Crafts, Clay and Music;
  // Gaga Field as Big Playground; Gaga Pit, at 2 at once, is no twin). A fresh build breaks the
  // tie between twins by name (rule 9.10), so a renamed twin could trade places with the others;
  // a Rebuild keeps the week (rules 10.1-10.3), so the replacement lands exactly where it was.
  // GEN-9.10, GEN-10.3
  it.each([
    ["Drama", "Adventure Baseball"],
    ["Gaga Field", "Aaa"]
  ])("puts %s's replacement %s exactly where it was (a twin)", (from, to) => {
    const b = rebuild(swapped(records, { from, to }));
    const moved = moves(aCells, cellsByName(b), from, to);
    explain(`twin ${from} -> ${to}`, a, b, moved);
    expect(moved).toEqual([]);
  });

  // (c) The new location fits fewer groups than Sports ran at once (2): a change is allowed only
  // where Adventure Baseball can't have the cells Sports had (two groups at once there in A), or
  // where a group that lost one of those sessions gets it back so it still has its weekly minimum
  // of Adventure Baseball (rule 10.5: one cell per session lost, the Rebuild's own list). Each
  // change must be in the build's Why notes (a dot, an Open cell's reason, a search move, or the
  // Rebuild's list of what it emptied and moved, rule 10.7).
  //
  // A fresh build cascades (a session lost at a crowded time is needed elsewhere, and so on);
  // Rebuild keeps the week and moves only what the change forces (Greg 2026-10-27, section 10).
  // GEN-10.6
  it("(c) a smaller location: only forced changes, each with a reason", () => {
    const b = rebuild(
      swapped(records, { at: { name: "Small field", fit: 1 } })
    );
    const bCells = cellsByName(b);
    const moved = moves(aCells, bCells);
    explain("(c) smaller location", a, b, moved);
    expect(b.ok).toBe(true);
    // Where Sports had two groups at once.
    const byTime = new Map();
    for (const [key, name] of aCells) {
      if (name === "Sports") {
        const [date, , block] = key.split("|");
        const t = `${date}|${block}`;
        byTime.set(t, (byTime.get(t) || 0) + 1);
      }
    }
    const crowded = new Set(
      [...byTime].filter(([, n]) => n > 1).map(([t]) => t)
    );
    // The cells the build says something about, by the same names as the cells.
    const names = new Map();
    for (const day of b.days) {
      day.groups.forEach((g) => names.set(g.id, g.name));
      day.blocks.forEach((x) => names.set(x.id, x.name));
    }
    const said = new Set(
      [
        ...(b.flags || []),
        ...(b.openCells || []),
        ...(b.moved || []),
        ...(b.keep ? [...b.keep.emptied, ...b.keep.moved] : [])
      ].map((c) => `${c.date}|${names.get(c.groupId)}|${names.get(c.blockId)}`)
    );
    const cellOf = (line) => line.split(": ")[0];
    const forMinimum = new Set(
      b.keep.moved
        .filter((m) => names.get(m.shortGroupId) && m.to === m.shortActivityId)
        .map((m) => `${m.date}|${names.get(m.groupId)}|${names.get(m.blockId)}`)
    );
    const unforced = moved.filter((line) => {
      const [date, , block] = cellOf(line).split("|");
      return (
        !crowded.has(`${date}|${block}`) &&
        !(forMinimum.has(cellOf(line)) && line.endsWith("Adventure Baseball"))
      );
    });
    // No more minimum moves than sessions lost at crowded times.
    const lost = moved.filter((line) => {
      const [date, , block] = cellOf(line).split("|");
      return crowded.has(`${date}|${block}`);
    });
    expect(b.keep.moved.length).toBeLessThanOrEqual(lost.length);
    const unexplained = moved.filter((line) => !said.has(cellOf(line)));
    expect({ unforced, unexplained }).toEqual({
      unforced: [],
      unexplained: []
    });
  });
});
