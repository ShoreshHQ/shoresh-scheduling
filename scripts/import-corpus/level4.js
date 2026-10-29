// Level 4, "very hard" (docs/import/corpus.md): made-up camps that put together what level 3 left
// out, each with two of the shapes below (some bring a third) and one or two of level 3's untidy
// traits (double, trip, halfDay, gaps, spelling, notes):
//
// - programs:  two programs in one file: a second program (Teen Travel, Leadership) with its own
//              divisions and groups on its own time blocks every day.
// - overnight: an overnight camp's evening: Dinner and Cabin Time every night (fixed), and between
//              them an Evening Program the whole camp does together, a different one each night
//              (Campfire, Talent Show): an all-camp moment, so recurring (classification rule 3).
// - weekend:   an overnight camp that runs all seven days, Saturday and Sunday on the same blocks
//              as the other days (ADR 0022: a weekend day is a day like any other).
// - weeks:     two to four weeks in the files, each rotating differently (as level 2).
// - special:   in one week (never the first), one mid-week day whose afternoon has its own, fewer
//              and longer, blocks: that week's own day, a special day (INGEST-4.3).
//
// The true answer follows the settled rules only. Greg's level-4 decisions (2026-10-28): a special
// day in a camp of two programs covers both (decisionCamps, INGEST-4.11); decisions 1 and 2
// (2026-10-29, "treat it like a special day"): a weekend day on its own times every week, and a
// one-week file's mid-week day answered "Every week", are one special day on that day of every
// week (everyWeekCamps, INGEST-4.12). Greg (2026-10-29): the week's last day ending early is the
// regular day, Dismissal holding the rest of it (earlyEndCamps, INGEST-4.13).
// Deterministic: the same seed always gives the same camp.
import {
  ACTIVITIES,
  CAMP_KINDS,
  CAMP_WORDS,
  DIVISION_SETS,
  LABEL_STYLES,
  LAYOUT_CHOICES,
  OPENINGS,
  TIME_STYLES,
  WEEKS,
  blocksFor,
  filesOf,
  hm,
  labelCells,
  labelHeadings,
  randomFrom,
  sheet,
  stacked
} from "./camps";

/** How many camps the full level-4 corpus has. */
export const LEVEL4_SIZE = 320;

export const SHAPES = ["programs", "overnight", "weekend", "weeks", "special"];
const MESSES = ["double", "trip", "halfDay", "gaps", "spelling", "notes"];
const ALL_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
const SECOND_PROGRAMS = ["Teen Travel", "Leadership", "Teen Adventure"];
const SECOND_DIVISIONS = [
  ["Teens", "CITs"],
  ["Rangers", "Voyagers"],
  ["Navigators", "Trekkers"]
];
const EVENINGS = [
  "Campfire",
  "Talent Show",
  "Movie Night",
  "Scavenger Hunt",
  "Square Dance",
  "Song Session",
  "Stargazing",
  "Capture the Flag"
];
const TRIP = "Field Trip";
const NOTE_ABOVE = [
  "Updated June 2 - subject to change",
  "DRAFT v3",
  "Questions? Ask the head counselor"
];
const NOTES_BELOW = [
  ["Rain plan: indoor activities in the gym"],
  ["* Bring a water bottle and sunscreen every day"],
  ["Rain plan: movie in the dining hall", "* Closed-toe shoes for Woodshop"]
];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const isFree = (block) => !block.fixed && !block.evening;

/** Which shapes and messes a camp has (implied shapes added: weekend needs overnight). */
function traitsOf(r, layout, forced) {
  let shapes = r.shuffle(SHAPES).slice(0, 2);
  // The 320 keep the camps they had: a special day in a camp of two programs is decisionCamps'.
  if (forced) {
    shapes = forced;
  } else if (shapes.includes("special") && shapes.includes("programs")) {
    shapes = shapes.map((s) => (s === "special" ? "weeks" : s));
  }
  if (shapes.includes("weekend")) shapes.push("overnight");
  if (shapes.includes("special")) shapes.push("weeks");
  shapes = SHAPES.filter((s) => shapes.includes(s));
  const messes = r
    .shuffle(
      MESSES.filter(
        (t) =>
          // Overnight campers do not go home after Lunch.
          (t !== "halfDay" || !shapes.includes("overnight")) &&
          (t !== "spelling" || layout !== "byActivity")
      )
    )
    .slice(0, r.int(1, 2));
  return { shapes, messes };
}

function namedGroups(divisions, style, from) {
  let n = from;
  return divisions.map((d) => ({
    name: d.name,
    groups: Array.from({ length: d.size }, (_, i) => {
      n++;
      return style === "divisionNumber"
        ? `${d.name} ${i + 1}`
        : `${style} ${n}`;
    })
  }));
}

/** Blocks with the day's start not before 8:30 and no period block the same as `other`'s. */
function otherBlocks(r, other) {
  const taken = new Set(other.map((b) => `${b.start}-${b.end}`));
  for (let i = 0; i < 50; i++) {
    const blocks = blocksFor(r, null);
    if (blocks.every((b) => b.fixed || !taken.has(`${b.start}-${b.end}`))) {
      return blocks;
    }
  }
  return null;
}

/** Dinner, the Evening Program and Cabin Time, after the latest program's day. */
function eveningTail(programs) {
  const last = Math.max(...programs.map((p) => p.blocks.at(-1).end));
  const dinner = last <= 17 * 60 + 30 ? 18 * 60 : 18 * 60 + 30;
  return [
    { name: "Dinner", start: dinner, end: dinner + 45, fixed: "Dinner" },
    {
      name: "Evening Program",
      start: dinner + 60,
      end: dinner + 120,
      fixed: null,
      evening: true
    },
    {
      name: "Cabin Time",
      start: dinner + 135,
      end: dinner + 180,
      fixed: "Cabin Time"
    }
  ];
}

/** The free afternoon blocks of a day: after Lunch, before the next set block. */
function afternoonOf(blocks) {
  const lunch = blocks.findIndex((b) => b.fixed === "Lunch");
  const out = [];
  for (let b = lunch + 1; b < blocks.length && isFree(blocks[b]); b++) {
    out.push(b);
  }
  return out;
}

/** The afternoon cut into one block fewer, each longer (as level 2's odd Friday). */
function recutAfternoon(blocks) {
  const after = afternoonOf(blocks);
  if (after.length < 2) return null;
  const start = blocks[after[0]].start;
  const end = blocks[after.at(-1)].end;
  const count = after.length - 1;
  const length = Math.floor((end - start) / count / 5) * 5;
  const word = blocks[after[0]].name.split(" ")[0];
  const recut = Array.from({ length: count }, (_, i) => ({
    name: `${word} ${String.fromCharCode(65 + i)}`,
    start: start + i * length,
    end: start + (i + 1) * length,
    fixed: null
  }));
  return [
    ...blocks.slice(0, after[0]),
    ...recut,
    ...blocks.slice(after.at(-1) + 1)
  ];
}

function firstProgram(r, shapes, style) {
  const opening = r.chance(0.6) ? r.pick(OPENINGS) : null;
  let blocks = blocksFor(r, opening);
  // Trips and special days need an afternoon of two blocks at least.
  for (let i = 0; i < 50 && afternoonOf(blocks).length < 2; i++) {
    blocks = blocksFor(r, opening);
  }
  const set = r.pick(DIVISION_SETS);
  const min = shapes.includes("programs") ? 2 : 1;
  const big = r.chance(0.2);
  const count = r.int(min, Math.min(5, set.length));
  const divisions = set.slice(0, count).map((name) => ({
    name,
    size: big ? r.int(5, Math.floor(30 / count)) : r.int(2, 5)
  }));
  return {
    name: "Main Camp",
    blocks,
    divisions: namedGroups(divisions, style, 0)
  };
}

function secondProgram(r, first, style) {
  const blocks = otherBlocks(r, first.blocks);
  if (!blocks) return null;
  const from = first.divisions.reduce((n, d) => n + d.groups.length, 0);
  const divisions = r
    .pick(SECOND_DIVISIONS)
    .map((name) => ({ name, size: r.int(2, 3) }));
  return {
    name: r.pick(SECOND_PROGRAMS),
    blocks,
    divisions: namedGroups(divisions, style, from)
  };
}

/** A program's rotation: its activities and, per week, a coprime step and a shift. */
function rotationOf(r, program, weekCount) {
  const periods = program.blocks.filter(isFree).length;
  const list = r
    .shuffle(ACTIVITIES)
    .slice(0, Math.max(periods + 1, r.int(6, 12)));
  const steps = list
    .map((_, i) => i)
    .filter((s) => s > 0 && gcd(s, list.length) === 1);
  return {
    list,
    weeks: Array.from({ length: weekCount }, () => ({
      step: r.pick(steps),
      shift: r.int(0, list.length - 1)
    }))
  };
}

/** One level-4 camp and its true answer (camp.truth, as the scorer reads it). */
export function veryHardCamp(
  seed,
  forced = null,
  prefix = "L4",
  own = null,
  early = null
) {
  const r = randomFrom(seed * 32452843 + 11);
  const [layout, format, split] = LAYOUT_CHOICES[seed % LAYOUT_CHOICES.length];
  const traits = traitsOf(r, layout, forced);
  const shapes = traits.shapes;
  // An early-end camp keeps to that one shape.
  const messes = early ? [] : traits.messes;
  const has = (t) => shapes.includes(t) || messes.includes(t);
  const style = r.pick(["Bunk", "Cabin", "Group", "divisionNumber"]);
  const programs = [firstProgram(r, shapes, style)];
  if (has("programs")) {
    const second = secondProgram(r, programs[0], style);
    if (second) programs.push(second);
  }
  if (has("overnight")) {
    const tail = eveningTail(programs);
    for (const p of programs) p.blocks = [...p.blocks, ...tail];
  }
  for (const p of programs) {
    p.groups = p.divisions.flatMap((d) =>
      d.groups.map((g) => ({ name: g, division: d.name }))
    );
  }
  let days = has("weekend") ? ALL_DAYS : r.pick(WEEKS);
  if (early) {
    // Every day ends with Dismissal; a Sunday to Saturday camp ends its week on Saturday.
    const b = programs[0].blocks;
    const at = b.at(-1).end + 5;
    b.push({ name: "Dismissal", start: at, end: at + 20, fixed: "Dismissal" });
    if (early.week) days = ALL_DAYS;
  }
  const weekCount = has("weeks") ? r.int(2, 4) : 1;
  const weeks = Array.from({ length: weekCount }, (_, w) =>
    weekCount > 1 ? `Week ${w + 1}` : ""
  );
  const evenings = r.shuffle(EVENINGS);
  programs.forEach((p) => {
    p.rotation = rotationOf(r, p, weekCount);
  });
  const camp = {
    id: `${prefix}-${String(seed).padStart(3, "0")}`,
    level: 4,
    name: `${r.pick(CAMP_WORDS[0])} ${r.pick(CAMP_WORDS[1])} ${has("overnight") ? "Camp" : r.pick(CAMP_KINDS)}`,
    layout,
    format,
    split,
    timeStyle: r.pick(TIME_STYLES),
    labelStyle: r.pick(LABEL_STYLES),
    shortDays: r.chance(0.3),
    style,
    days,
    weeks,
    programs,
    variations: [...shapes, ...messes]
  };
  // The special day: program 1, a mid-week day of a week after the first.
  camp.special = null;
  if (has("special")) {
    const blocks = recutAfternoon(programs[0].blocks);
    if (blocks) {
      camp.special = {
        w: r.int(1, weekCount - 1),
        d: r.int(1, days.length - 2),
        blocks
      };
    }
  }
  // INGEST-4.12: program 1's Saturday (weekend) or a mid-week day (one week) on its own blocks
  // every week, the same cells every week.
  camp.own = null;
  if (own) {
    const blocks = recutAfternoon(programs[0].blocks);
    const d =
      own === "weekend" ? days.indexOf("Saturday") : r.int(1, days.length - 2);
    if (blocks) camp.own = { d, blocks };
    if (blocks && own === "midweek") {
      camp.answers = {
        [`everyWeek|${days[d]}`]: "every",
        "week|the file's week": "Week 1"
      };
      camp.seasonWeeks = 3;
    }
  }
  camp.early = null;
  if (early) {
    const blocks = programs[0].blocks;
    const from = afternoonOf(blocks).at(-1);
    camp.early = { ...early, d: days.length - 1, from };
    if (early.style === "own") {
      // Dismissal on its own, shorter, block where the last period starts: no rows after it.
      const start = blocks[from].start;
      camp.early.blocks = [
        ...blocks.slice(0, from),
        {
          name: "Dismissal",
          start,
          end: start + 20,
          fixed: "Dismissal",
          early: true
        }
      ];
    }
  }
  fillGrid(r, camp, evenings);
  if (camp.early && camp.early.style !== "own") {
    // Dismissal in the last period, the rest of the day blank (merged down in Excel).
    const { d, from } = camp.early;
    const n = programs[0].blocks.length - from;
    camp.weeks.forEach((_, w) =>
      programs[0].groups.forEach((_g, g) => {
        const cells = camp.grid.get(gkey(0, w, g, d));
        cells.fill(null, from);
        cells[from] = "Dismissal";
        if (camp.early.style === "merged")
          camp.runs.set(`0|${w}|${g}|${d}|${from}`, n);
      })
    );
  }
  applyMesses(r, camp, messes);
  if (camp.early && camp.early.say) {
    const at = hm(programs[0].blocks[camp.early.from].start);
    camp.weeks.forEach((_, w) =>
      programs[0].groups.forEach((_g, g) => {
        camp.written.get(gkey(0, w, g, camp.early.d))[camp.early.from] =
          `Dismissal at ${at}`;
      })
    );
  }
  camp.truth = truthOf(camp);
  return camp;
}

export function veryHardCamps(count) {
  return Array.from({ length: count }, (_, i) => veryHardCamp(i + 1));
}

/** How many camps Greg's level-4 decisions add. */
export const DECISIONS_SIZE = 80;

/**
 * Greg's level-4 decision 3 (2026-10-28): a special day in a camp of two programs covers both
 * programs. Camps of two programs, one of them with a week's mid-week special day (INGEST-4.11).
 */
export function decisionCamps(count) {
  return Array.from({ length: count }, (_, i) =>
    veryHardCamp(i + 1, ["programs", "special"], "L4D")
  );
}

/** How many camps Greg's level-4 decisions 1 and 2 add. */
export const EVERY_WEEK_SIZE = 16;

/**
 * Greg's level-4 decisions 1 and 2 (2026-10-29): a weekend day on its own times every week, in
 * files of two to four weeks; a one-week file's mid-week day on its own times, answered "Every
 * week". Half each, every layout.
 */
export function everyWeekCamps(count) {
  return Array.from({ length: count }, (_, i) =>
    i % 2
      ? veryHardCamp(i + 1, [], "L4E", "midweek")
      : veryHardCamp(i + 1, ["weekend", "weeks"], "L4E", "weekend")
  );
}

/** How many camps Greg's early-end decision adds. */
export const EARLY_END_SIZE = 12;

/**
 * Greg (2026-10-29): the week's last day ends early. Dismissal merged down to the day's end, or
 * written in the last period with the rest blank ("Dismissal at 2:00" in some), or on a shorter
 * block of its own; a third of them a Sunday to Saturday camp.
 */
export function earlyEndCamps(count) {
  const styles = ["merged", "blank", "own"];
  return Array.from({ length: count }, (_, i) =>
    veryHardCamp(i + 1, [], "L4X", null, {
      style: styles[i % 3],
      say: i % 3 === 1 && i % 2 === 0,
      week: i % 4 === 3
    })
  );
}

// ---------- the grid ----------

/** The blocks program p has on week w's day d. */
export function blocksOn(camp, p, w, d) {
  const s = camp.special;
  if (s && p === 0 && s.w === w && s.d === d) return s.blocks;
  if (camp.own && p === 0 && camp.own.d === d) return camp.own.blocks;
  const e = camp.early;
  if (e && e.blocks && p === 0 && e.d === d) return e.blocks;
  return camp.programs[p].blocks;
}

const isSpecial = (camp, p, w, d) =>
  (camp.special && p === 0 && camp.special.w === w && camp.special.d === d) ||
  (camp.own && p === 0 && camp.own.d === d);

const gkey = (p, w, g, d) => `${p}|${w}|${g}|${d}`;

function fillGrid(r, camp, evenings) {
  camp.grid = new Map();
  camp.runs = new Map();
  camp.programs.forEach((program, p) => {
    const { list, weeks } = program.rotation;
    camp.weeks.forEach((_, w) =>
      program.groups.forEach((_g, g) =>
        camp.days.forEach((_d, d) => {
          const blocks = blocksOn(camp, p, w, d);
          let period = 0;
          camp.grid.set(
            gkey(p, w, g, d),
            blocks.map((block) => {
              if (block.fixed) return block.fixed;
              if (block.evening) return evenings[d % evenings.length];
              // A day of its own every week has the same cells every week (INGEST-4.12).
              const { step, shift } = weeks[isSpecial(camp, p, w, d) ? 0 : w];
              return list[(g * step + period++ + d * 2 + shift) % list.length];
            })
          );
        })
      )
    );
  });
}

/** Every (program, week, group, day) of the camp, the special day left out. */
function ordinaryDays(camp) {
  const out = [];
  camp.programs.forEach((program, p) =>
    camp.weeks.forEach((_, w) =>
      program.groups.forEach((_g, g) =>
        camp.days.forEach((_d, d) => {
          if (!isSpecial(camp, p, w, d)) out.push([p, w, g, d]);
        })
      )
    )
  );
  return out;
}

function slipOf(r, name) {
  const ways = [name.toLowerCase(), name.toUpperCase()];
  if (name.includes(" ")) ways.push(name.replace(/ /g, ""));
  return r.pick(ways.filter((w) => w !== name));
}

function applyMesses(r, camp, messes) {
  const { grid, runs } = camp;
  const taken = new Set();
  const ckey = (p, w, g, d, b) => `${p}|${w}|${g}|${d}|${b}`;
  const first = camp.programs[0];
  const free = (p, b) => isFree(camp.programs[p].blocks[b]);
  const all = ordinaryDays(camp);
  if (messes.includes("halfDay") && first.divisions.length > 1) {
    const youngest = first.divisions[0].name;
    camp.halfDay = youngest;
    first.groups.forEach((group, g) => {
      if (group.division !== youngest) return;
      camp.weeks.forEach((_, w) =>
        camp.days.forEach((_d, d) => {
          const blocks = blocksOn(camp, 0, w, d);
          const cells = grid.get(gkey(0, w, g, d));
          afternoonOf(blocks).forEach((b) => {
            cells[b] = null;
            taken.add(ckey(0, w, g, d, b));
          });
        })
      );
    });
  }
  if (messes.includes("trip")) {
    const divisions = first.divisions.filter((x) => x.name !== camp.halfDay);
    const division = r.pick(divisions).name;
    const w = r.int(0, camp.weeks.length - 1);
    let d = r.int(1, camp.days.length - 1);
    if (isSpecial(camp, 0, w, d)) d = d === 1 ? 2 : d - 1;
    const after = afternoonOf(first.blocks);
    first.groups.forEach((group, g) => {
      if (group.division !== division) return;
      const cells = grid.get(gkey(0, w, g, d));
      after.forEach((b) => {
        cells[b] = TRIP;
        taken.add(ckey(0, w, g, d, b));
      });
      if (after.length > 1) runs.set(ckey(0, w, g, d, after[0]), after.length);
    });
    camp.trip = { division, week: camp.weeks[w], day: camp.days[d] };
  }
  const somewhere = (fn, count) => {
    for (let i = 0, tries = 0; i < count && tries < 80; tries++) {
      const [p, w, g, d] = r.pick(all);
      const b = r.int(0, camp.programs[p].blocks.length - 1);
      if (fn(p, w, g, d, b)) i++;
    }
  };
  if (messes.includes("double")) {
    somewhere(
      (p, w, g, d, b) => {
        const blocks = camp.programs[p].blocks;
        if (b + 1 >= blocks.length || !free(p, b) || !free(p, b + 1))
          return false;
        if (
          taken.has(ckey(p, w, g, d, b)) ||
          taken.has(ckey(p, w, g, d, b + 1))
        )
          return false;
        const cells = grid.get(gkey(p, w, g, d));
        if (!cells[b]) return false;
        cells[b + 1] = cells[b];
        runs.set(ckey(p, w, g, d, b), 2);
        taken.add(ckey(p, w, g, d, b));
        taken.add(ckey(p, w, g, d, b + 1));
        return true;
      },
      r.int(1, 4)
    );
  }
  if (messes.includes("gaps")) {
    somewhere(
      (p, w, g, d, b) => {
        if (!free(p, b) || taken.has(ckey(p, w, g, d, b))) return false;
        grid.get(gkey(p, w, g, d))[b] = null;
        taken.add(ckey(p, w, g, d, b));
        return true;
      },
      r.int(1, 3)
    );
  }
  camp.written = new Map([...grid].map(([k, v]) => [k, [...v]]));
  if (messes.includes("spelling")) {
    somewhere(
      (p, w, g, d, b) => {
        const name = grid.get(gkey(p, w, g, d))[b];
        if (!free(p, b) || taken.has(ckey(p, w, g, d, b)) || !name)
          return false;
        camp.written.get(gkey(p, w, g, d))[b] = slipOf(r, name);
        taken.add(ckey(p, w, g, d, b));
        return true;
      },
      r.int(1, 2)
    );
  }
  camp.notes = messes.includes("notes")
    ? { above: r.pick(NOTE_ABOVE), below: r.pick(NOTES_BELOW) }
    : null;
}

// ---------- the true answer ----------

function truthOf(camp) {
  const blocks = new Set();
  const specialDays = new Set();
  const fixed = new Set();
  const recurring = new Set();
  const activities = new Set();
  const weeks = camp.weeks.map((label, w) => {
    const cells = new Map();
    camp.programs.forEach((program, p) =>
      program.groups.forEach((group, g) =>
        camp.days.forEach((day, d) => {
          const dayBlocks = blocksOn(camp, p, w, d);
          const own = isSpecial(camp, p, w, d);
          if (own) specialDays.add(`${label}|${day}`);
          const names = camp.grid.get(gkey(p, w, g, d));
          dayBlocks.forEach((block, b) => {
            // The program's blocks; a special day's own blocks are its own (INGEST-4.3).
            // An early end's Dismissal block is not one (INGEST-4.13).
            if (!own && !block.early)
              blocks.add(`${hm(block.start)}-${hm(block.end)}`);
            const name = names[b];
            if (!name) return;
            cells.set(`${label}|${group.name}|${day}|${hm(block.start)}`, name);
            // Dismissal earlier on the early day: still the one fixed Dismissal, starting
            // earlier that day (INGEST-4.13, CORE-3.7).
            if (
              camp.early &&
              name === "Dismissal" &&
              (block.early || !block.fixed)
            )
              return;
            if (block.fixed) fixed.add(`${name}|${hm(block.start)}`);
            else if (block.evening) recurring.add(name);
            else if (name !== TRIP) activities.add(name);
          });
          // The early day's Dismissal holds the rest of the regular day (INGEST-4.13).
          if (camp.early && p === 0 && d === camp.early.d) {
            program.blocks
              .slice(camp.early.from)
              .forEach((block) =>
                cells.set(
                  `${label}|${group.name}|${day}|${hm(block.start)}`,
                  "Dismissal"
                )
              );
          }
        })
      )
    );
    return { label, cells };
  });
  const divisions = camp.programs.flatMap((p) =>
    p.divisions.map((d) => d.name)
  );
  // A special day replaces its day for the whole camp (ADR 0014; INGEST-4.11): every group in it.
  const specialDayGroups = [...specialDays].flatMap((at) =>
    camp.programs.flatMap((p) => p.groups.map((g) => `${at}|${g.name}`))
  );
  // INGEST-4.12: the season weeks its one special day is on.
  const seasonLabels = Array.from(
    { length: Math.max(camp.weeks.length, camp.seasonWeeks || 0) },
    (_, i) => camp.weeks[i] || `Week ${i + 1}`
  );
  const specialDayOn = camp.own
    ? seasonLabels.map((w) => `${w}|${camp.days[camp.own.d]}`)
    : null;
  return {
    weeks,
    seasonWeeks: camp.seasonWeeks,
    specialDayOn,
    programs: camp.programs.length,
    specialDayGroups,
    days: camp.days,
    blocks: [...blocks],
    specialDays: [...specialDays],
    divisions,
    groups: camp.programs.flatMap((p) => p.groups),
    fixed: [...fixed],
    recurring: [...recurring],
    activities: [...activities],
    divisionsInFile:
      divisions.length > 1 &&
      (camp.layout !== "byActivity" || camp.style === "divisionNumber"),
    availability: halfDayAvailability(camp)
  };
}

/**
 * INGEST-2.9: "group|MorningOnly" for each half-day group, when on every day all it has is before
 * noon and the week has blocks from noon (as level 3; a Lunch at noon or later keeps it all day;
 * a special day with no afternoon of its own does not).
 */
function halfDayAvailability(camp) {
  if (!camp.halfDay) return [];
  const noon = 12 * 60;
  const lined =
    camp.programs[0].blocks.some((b) => b.start >= noon) &&
    camp.weeks.every((_, w) =>
      camp.days.every((_d, d) => {
        const blocks = blocksOn(camp, 0, w, d);
        const pm = new Set(afternoonOf(blocks));
        return blocks.every((b, i) => pm.has(i) || b.start < noon);
      })
    );
  return lined
    ? camp.programs[0].groups
        .filter((g) => g.division === camp.halfDay)
        .map((g) => `${g.name}|MorningOnly`)
    : [];
}

// ---------- writing the files as a director would ----------

function dayText(camp, d) {
  const day = camp.days[d];
  return camp.shortDays ? day.slice(0, 3) : day;
}

/** What a page is for, as its title and name say it: program, week, day (each only if several). */
function partsOf(camp, p, w, d) {
  return [
    ...(camp.programs.length > 1 ? [camp.programs[p].name] : []),
    ...(camp.weeks.length > 1 ? [camp.weeks[w]] : []),
    ...(d === null ? [] : [dayText(camp, d)])
  ];
}

const ckey = (p, w, g, d, b) => `${p}|${w}|${g}|${d}|${b}`;

function coveredBy(camp, p, w, g, d, b) {
  for (let s = b - 1; s >= 0; s--) {
    const n = camp.runs.get(ckey(p, w, g, d, s));
    if (n) return s + n > b;
  }
  return false;
}

function cellText(camp, p, w, g, d, b) {
  if (camp.format === "xlsx" && coveredBy(camp, p, w, g, d, b)) return "";
  return camp.written.get(gkey(p, w, g, d))[b] || "";
}

/** Excel merges of the runs on one page: rowOf(d, b) and colOf(g, d) place a cell, or null. */
function runMerges(camp, p, w, rowOf, colOf) {
  if (camp.format !== "xlsx") return [];
  const merges = [];
  for (const [k, n] of camp.runs) {
    const [pp, ww, g, d, b] = k.split("|").map(Number);
    if (pp !== p || ww !== w) continue;
    const c = colOf(g, d);
    const row = c === null ? null : rowOf(d, b);
    if (row === null) continue;
    // To the row of the run's last block: a by-group page's rows between (another day's own
    // blocks) are covered too, as a director's merge would.
    merges.push({ s: { r: row, c }, e: { r: rowOf(d, b + n - 1), c } });
  }
  return merges;
}

function withNotes(camp, page) {
  if (!camp.notes) return page;
  const [title, ...rest] = page.rows;
  const shift = (m) => ({
    s: { r: m.s.r + 1, c: m.s.c },
    e: { r: m.e.r + 1, c: m.e.c }
  });
  return {
    ...page,
    rows: [
      title,
      [camp.notes.above],
      ...rest,
      [],
      ...camp.notes.below.map((n) => [n])
    ],
    merges: page.merges.map(shift)
  };
}

function allCampPage(camp, p, w, d, title) {
  const program = camp.programs[p];
  const blocks = blocksOn(camp, p, w, d);
  const lead = labelHeadings(camp).length;
  const rows = [[title]];
  const merges = [];
  if (program.divisions.length > 1) {
    const row = labelHeadings(camp).map(() => "");
    for (const division of program.divisions) {
      merges.push({
        s: { r: 1, c: row.length },
        e: { r: 1, c: row.length + division.groups.length - 1 }
      });
      row.push(division.name, ...division.groups.slice(1).map(() => ""));
    }
    rows.push(row);
  }
  rows.push([...labelHeadings(camp), ...program.groups.map((g) => g.name)]);
  const first = rows.length;
  blocks.forEach((block, b) => {
    rows.push([
      ...labelCells(camp, block),
      ...program.groups.map((_, g) => cellText(camp, p, w, g, d, b))
    ]);
  });
  merges.push(
    ...runMerges(
      camp,
      p,
      w,
      (day, b) => (day === d ? first + b : null),
      (g, day) => (day === d ? lead + g : null)
    )
  );
  return withNotes(camp, { rows, merges });
}

function byActivityPage(camp, p, w, d, title) {
  const program = camp.programs[p];
  const blocks = blocksOn(camp, p, w, d);
  const cells = (g) => camp.grid.get(gkey(p, w, g, d));
  const fixed = blocks.filter((b) => b.fixed).map((b) => b.fixed);
  const names = new Set();
  program.groups.forEach((_, g) =>
    blocks.forEach((block, b) => {
      const n = cells(g)[b];
      if (n && !block.fixed && !fixed.includes(n)) names.add(n);
    })
  );
  const columns = [...fixed, ...[...names].sort()];
  const rows = [[title], [...labelHeadings(camp), ...columns]];
  blocks.forEach((block, b) => {
    const doing = (name) =>
      program.groups
        .filter((_, g) => cells(g)[b] === name)
        .map((g) => g.name)
        .join(", ");
    rows.push([...labelCells(camp, block), ...columns.map(doing)]);
  });
  return withNotes(camp, { rows, merges: [] });
}

/** A group's week, days across; rows are every block any of its days has (blank where none). */
function byGroupPage(camp, p, w, g) {
  const program = camp.programs[p];
  const group = program.groups[g];
  const title =
    program.divisions.length > 1
      ? `${group.division} - ${group.name}`
      : group.name;
  const all = new Map();
  camp.days.forEach((_, d) =>
    blocksOn(camp, p, w, d).forEach((b) => all.set(`${b.start}-${b.end}`, b))
  );
  const ordered = [...all.values()].sort((a, b) => a.start - b.start);
  const lead = labelHeadings(camp).length;
  const rows = [
    [title],
    [...labelHeadings(camp), ...camp.days.map((_, d) => dayText(camp, d))]
  ];
  for (const block of ordered) {
    rows.push([
      ...labelCells(camp, block),
      ...camp.days.map((_, d) => {
        const b = blocksOn(camp, p, w, d).indexOf(block);
        return b < 0 ? "" : cellText(camp, p, w, g, d, b);
      })
    ]);
  }
  const merges = runMerges(
    camp,
    p,
    w,
    (d, b) => 2 + ordered.indexOf(blocksOn(camp, p, w, d)[b]),
    (gg, d) => (gg === g ? lead + d : null)
  );
  return { title, group: group.name, ...withNotes(camp, { rows, merges }) };
}

function untitled(page) {
  const up = (m) => ({
    s: { r: m.s.r - 1, c: m.s.c },
    e: { r: m.e.r - 1, c: m.e.c }
  });
  return sheet(page.title, page.rows.slice(1), page.merges.map(up));
}

function pagesOf(camp) {
  const base = camp.name;
  const several = camp.weeks.length > 1;
  if (camp.layout === "byGroup") {
    const pages = [];
    camp.weeks.forEach((label, w) =>
      camp.programs.forEach((program, p) =>
        program.groups.forEach((_, g) =>
          pages.push({ label, page: byGroupPage(camp, p, w, g) })
        )
      )
    );
    if (camp.split === "sheetPerGroup") {
      return [
        {
          file: `${base} 2026.xlsx`,
          sheets: pages.map(({ label, page }) =>
            several
              ? sheet(`${label} - ${page.group}`, page.rows, page.merges)
              : untitled(page)
          )
        }
      ];
    }
    return pages.map(({ label, page }) => ({
      file: `${base} 2026 - ${several ? `${label} - ` : ""}${page.group}.csv`,
      sheets: [sheet(page.title, page.rows)]
    }));
  }
  const pageOf = camp.layout === "allCamp" ? allCampPage : byActivityPage;
  const pages = [];
  camp.programs.forEach((_, p) =>
    camp.weeks.forEach((_w, w) =>
      camp.days.forEach((_d, d) => {
        const parts = partsOf(camp, p, w, d);
        pages.push({
          parts,
          ...pageOf(camp, p, w, d, [base, ...parts].join(" - "))
        });
      })
    )
  );
  if (camp.split === "sheetPerDay") {
    return [
      {
        file: `${base} 2026.xlsx`,
        sheets: pages.map((pg) =>
          sheet(pg.parts.join(" - "), pg.rows, pg.merges)
        )
      }
    ];
  }
  if (camp.split === "filePerDay") {
    return pages.map((pg) => ({
      file: `${base} 2026 - ${pg.parts.join(" - ")}.csv`,
      sheets: [sheet(pg.parts.join(" - "), pg.rows)]
    }));
  }
  const one = stacked(pages);
  return [
    {
      file: `${base} 2026.${camp.format}`,
      sheets: [sheet("Schedule", one.rows, one.merges)]
    }
  ];
}

/** The camp's files as a director would upload them (as campFiles in camps.js). */
export function veryHardCampFiles(camp) {
  return filesOf(pagesOf(camp));
}
