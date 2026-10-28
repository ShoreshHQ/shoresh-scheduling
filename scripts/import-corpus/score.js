// Scores "Import last year" against the made-up camps in camps.js (docs/import/corpus.md): each
// camp's files go through the engine as the screen sends them, with no remembered answers, and
// what it would ask and save is compared with the camp's true answer.
//
// The engine is passed in ({ engine, XLSX, terms }), so Jest and the node script share this file.
import { campFiles, hm } from "./camps";
import { variedCampFiles } from "./level2";
import { hardCampFiles } from "./level3";

export const QUESTION_KINDS = [
  "similar",
  "ampm",
  "whichGroup",
  "split",
  "cross",
  "week",
  "kind",
  "program",
  "move",
  "block",
  "days",
  "division",
  "fixed",
  "recurring",
  "activity",
  "elective",
  "list",
  "layout"
];
export const WRONG_KINDS = [
  "programs",
  "weeks",
  "days",
  "blocks",
  "specialDays",
  "divisions",
  "groups",
  "fixed",
  "recurring",
  "activities",
  "cells"
];

const EMPTY_SEASON = {
  season: { Id: "a00000000000001AAA", Name: "Summer" },
  weeks: [],
  weekExceptions: [],
  programs: [],
  activities: [],
  locations: [],
  locationTypes: [],
  schedules: [],
  labels: [],
  electives: { sets: [], offerings: [], linkedChoices: [] }
};

function readFiles(camp, { engine, XLSX }) {
  const writers = { 2: variedCampFiles, 3: hardCampFiles };
  const files = camp.files || (writers[camp.level] || campFiles)(camp);
  return files.map((f) =>
    f.csv !== undefined
      ? engine.csvFile(f.name, f.csv)
      : engine.workbookFile(XLSX, f.name, f.data)
  );
}

/** Each question's kind, by its id, as questionCards builds the cards. */
function kindsById(proposal) {
  const kinds = new Map();
  const add = (list, kind) =>
    list.forEach((x) => kinds.has(x.id) || kinds.set(x.id, kind(x)));
  add(proposal.reading.pairs, () => "similar");
  add(proposal.reading.timeAsks, () => "ampm");
  add(proposal.reading.groupAsks, () => "whichGroup");
  add(proposal.reading.splitAsks || [], () => "split");
  add(proposal.reading.disagreements, () => "cross");
  add(proposal.asks, (ask) => ask.type);
  return kinds;
}

/** How many of `want` and `got` (lists of keys) do not match: missing plus extra. */
function mismatches(want, got) {
  const wantSet = new Set(want);
  const gotSet = new Set(got);
  return (
    [...wantSet].filter((k) => !gotSet.has(k)).length +
    [...gotSet].filter((k) => !wantSet.has(k)).length
  );
}

/**
 * The groups as the camp really has them: where the file shows divisions whose bunks always move
 * together (the "divisions travel together" camps), each such division is one group (rule 8).
 */
function trueGroups(camp) {
  const asOne = camp.oneGroupPerDivision && camp.divisionsInFile;
  if (!asOne) {
    return camp.groups.map((g, gi) => ({ ...g, gi }));
  }
  return camp.divisions.map((d) => ({
    name: d.name,
    division: null,
    gi: camp.groups.findIndex((g) => g.division === d.name)
  }));
}

/** A level-1 camp's true answer, from its one repeating week (camps.js). */
function ordinaryTruth(camp) {
  const cells = new Map();
  const groups = trueGroups(camp);
  const asOne = groups.length !== camp.groups.length;
  groups.forEach((g) =>
    camp.days.forEach((day, d) =>
      camp.blocks.forEach((block, b) =>
        cells.set(`|${g.name}|${day}|${hm(block.start)}`, camp.cell(g.gi, d, b))
      )
    )
  );
  const startOf = (name) => hm(camp.blocks.find((b) => b.fixed === name).start);
  return {
    weeks: [{ label: "", cells }],
    days: camp.days,
    blocks: camp.blocks.map((b) => `${hm(b.start)}-${hm(b.end)}`),
    divisions: asOne ? [] : camp.divisions.map((d) => d.name),
    groups: groups.map(({ name, division }) => ({ name, division })),
    fixed: camp.fixed.map((f) => `${f}|${startOf(f)}`),
    recurring: camp.recurring || [],
    activities: camp.activities,
    divisionsInFile: camp.divisionsInFile && !asOne
  };
}

/** The camp's true answer: its own (level 2, Greg's camp) or built from its week (level 1). */
export function truthOf(camp) {
  return camp.truth || ordinaryTruth(camp);
}

/** What the engine read, cell by cell: "week|group|day|start" -> activity. */
function readCells(proposal) {
  const cells = new Map();
  for (const p of proposal.usable) {
    const blocks = proposal.timetables[p.timetable].blocks;
    for (let i = 0; i < p.span; i++) {
      const block = blocks[p.blockIndex + i];
      if (block && block.start !== null) {
        cells.set(
          `${p.week || ""}|${p.group}|${p.day}|${hm(block.start)}`,
          p.text
        );
      }
    }
  }
  return cells;
}

/** Week by week: { label, found, cells, wrong }; extra cells in weeks the camp has not, as "?". */
function weekReads(truth, got) {
  const gotWeeks = new Set([...got.keys()].map((k) => k.split("|")[0]));
  const known = new Set(truth.weeks.map((w) => w.label));
  const weeks = truth.weeks.map((w) => {
    let wrong = 0;
    for (const [key, name] of w.cells) {
      if (got.get(key) !== name) wrong++;
    }
    for (const key of got.keys()) {
      if (key.startsWith(`${w.label}|`) && !w.cells.has(key)) wrong++;
    }
    return {
      label: w.label,
      found: gotWeeks.has(w.label),
      cells: w.cells.size,
      wrong
    };
  });
  const extra = [...got.keys()].filter(
    (k) => !known.has(k.split("|")[0])
  ).length;
  return { weeks, extra, gotWeeks: [...gotWeeks] };
}

function wrongReads(truth, proposal, plan) {
  // DIV-1.1: a group in no division is held by a division record that is not a division.
  const divisions = plan.divisions.filter((d) => !d.noDivision);
  const divisionName = new Map(divisions.map((d) => [d.key, d.name]));
  const blockStart = new Map(plan.timeBlocks.map((b) => [b.key, b.start]));
  const program = plan.programs.length === 1 ? plan.programs[0] : null;
  const named = truth.divisionsInFile;
  // Level 5: cells only the director can explain are not compared, nor the names only they hold.
  const gotCells = readCells(proposal);
  for (const key of truth.unknownCells || []) gotCells.delete(key);
  const ignored = new Set(truth.ignoreNames || []);
  const read = weekReads(truth, gotCells);
  const wrong = {
    programs: Math.abs(plan.programs.length - 1),
    weeks: mismatches(
      truth.weeks.map((w) => w.label),
      read.gotWeeks
    ),
    days: program ? mismatches(truth.days, program.days) : truth.days.length,
    blocks: mismatches(
      truth.blocks,
      plan.timeBlocks.map((b) => `${b.start}-${b.end}`)
    ),
    // A week's day with its own blocks comes in as a special day (INGEST-4.3).
    specialDays: mismatches(
      truth.specialDays || [],
      proposal.timetables.flatMap((t) =>
        (t.ownDays || []).map((o) => `${o.week}|${o.day}`)
      )
    ),
    divisions: named
      ? mismatches(
          truth.divisions,
          divisions.map((d) => d.name)
        )
      : 0,
    groups: mismatches(
      truth.groups.map((g) => `${named ? g.division : ""}|${g.name}`),
      plan.groups.map(
        (g) => `${named ? divisionName.get(g.divisionKey) || "" : ""}|${g.name}`
      )
    ),
    fixed: mismatches(
      truth.fixed,
      plan.fixedActivities.map((f) => `${f.name}|${blockStart.get(f.blockKey)}`)
    ),
    recurring: mismatches(
      truth.recurring,
      plan.recurringActivities.map((a) => a.name)
    ),
    activities: mismatches(
      truth.activities,
      plan.activities.map((a) => a.name).filter((n) => !ignored.has(n))
    ),
    cells: read.weeks.reduce((n, w) => n + w.wrong, read.extra)
  };
  return { wrong, weeks: read.weeks };
}

/**
 * One camp through the engine, as the screen does with no remembered answers:
 * { camp, questions: { kind: n }, wrong: { kind: n }, perfect, error }.
 */
export function scoreCamp(camp, deps) {
  const questions = {};
  try {
    const files = readFiles(camp, deps);
    const proposal = deps.engine.buildProposal({
      files,
      existing: EMPTY_SEASON,
      terms: deps.terms,
      answers: {},
      layouts: {}
    });
    const kinds = kindsById(proposal);
    for (const card of deps.engine.questionCards(proposal, deps.terms, {})) {
      if (card.answer === null) {
        const kind = kinds.get(card.id) || "other";
        questions[kind] = (questions[kind] || 0) + 1;
      }
    }
    // A file with a page whose layout is unsure is marked on the screen for the director to pick
    // its layout (INGEST-2.6): one question per file, as the screen's fileRows shows it.
    const unsure = new Set(
      proposal.reading.pages.filter((p) => !p.confident).map((p) => p.file)
    );
    if (unsure.size) questions.layout = unsure.size;
    const plan = deps.engine.planFor(proposal, EMPTY_SEASON, "season");
    const { wrong, weeks } = wrongReads(truthOf(camp), proposal, plan);
    const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    return {
      camp,
      questions,
      wrong,
      weeks,
      proposal: deps.keepProposal ? proposal : undefined,
      plan: deps.keepProposal ? plan : undefined,
      perfect: total(questions) === 0 && total(wrong) === 0
    };
  } catch (error) {
    return {
      camp,
      questions,
      wrong: {},
      weeks: [],
      perfect: false,
      error: String(error)
    };
  }
}

/** Totals over the corpus: { camps, perfect, errors, questions: {kind: n}, wrong: {kind: n} }. */
export function summarise(results) {
  const sum = (key) => {
    const out = {};
    for (const r of results) {
      for (const [k, v] of Object.entries(r[key])) {
        if (v) out[k] = (out[k] || 0) + v;
      }
    }
    return out;
  };
  return {
    camps: results.length,
    perfect: results.filter((r) => r.perfect).length,
    errors: results.filter((r) => r.error).length,
    campsAsked: results.filter((r) => Object.keys(r.questions).length).length,
    campsWrong: results.filter((r) => Object.values(r.wrong).some((v) => v > 0))
      .length,
    questions: sum("questions"),
    wrong: sum("wrong")
  };
}

function pad(text, width) {
  return String(text).padEnd(width);
}

/** The plain summary: one line per layout, then the totals kind by kind. */
export function summaryTable(results) {
  const lines = [];
  const groups = new Map();
  for (const r of results) {
    const key = `${r.camp.layout} ${r.camp.format} ${r.camp.split}`;
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  lines.push(
    `${pad("Layout", 34)}${pad("Camps", 7)}${pad("Perfect", 9)}${pad("Questions", 11)}Wrong reads`
  );
  for (const [key, list] of [...groups].sort()) {
    const s = summarise(list);
    lines.push(
      `${pad(key, 34)}${pad(s.camps, 7)}${pad(s.perfect, 9)}${pad(total(s.questions), 11)}${total(s.wrong)}`
    );
  }
  const s = summarise(results);
  lines.push(
    `${pad("All", 34)}${pad(s.camps, 7)}${pad(s.perfect, 9)}${pad(total(s.questions), 11)}${total(s.wrong)}`,
    "",
    `Camps read perfectly: ${s.perfect} of ${s.camps}; asked anything: ${s.campsAsked}; any wrong read: ${s.campsWrong}; engine errors: ${s.errors}`,
    "",
    "Questions by kind (total, per camp):"
  );
  for (const kind of Object.keys(s.questions).sort()) {
    lines.push(
      `  ${pad(kind, 12)}${pad(s.questions[kind], 8)}${(s.questions[kind] / s.camps).toFixed(2)}`
    );
  }
  lines.push("", "Wrong reads by kind (total, camps affected):");
  for (const kind of WRONG_KINDS) {
    const camps = results.filter((r) => r.wrong[kind] > 0).length;
    lines.push(`  ${pad(kind, 12)}${pad(s.wrong[kind] || 0, 8)}${camps}`);
  }
  return lines.join("\n");
}

function weekLine(label, list) {
  const exact = list.filter((r) => r.wrong.weeks === 0).length;
  const none = list.filter((r) => r.weeks.every((w) => !w.found)).length;
  const cells = list.reduce((n, r) => n + (r.wrong.cells || 0), 0);
  const perfect = list.filter((r) => r.perfect).length;
  return `${pad(label, 34)}${pad(list.length, 7)}${pad(exact, 13)}${pad(none, 12)}${pad(perfect, 9)}${cells}`;
}

/**
 * Level 2: how the weeks were read. Per layout and per kind of difference: camps whose weeks were
 * found exactly, camps where none of the weeks was found (read as one undated week, or not at
 * all), and wrong cells; then wrong cells by week number.
 */
export function weekTable(results) {
  const lines = [
    `${pad("Layout", 34)}${pad("Camps", 7)}${pad("Weeks exact", 13)}${pad("No weeks", 12)}${pad("Perfect", 9)}Wrong cells`
  ];
  const byKey = (keyOf) => {
    const groups = new Map();
    for (const r of results) {
      for (const key of keyOf(r)) {
        groups.set(key, [...(groups.get(key) || []), r]);
      }
    }
    return [...groups].sort();
  };
  for (const [key, list] of byKey((r) => [
    `${r.camp.layout} ${r.camp.format} ${r.camp.split}`
  ])) {
    lines.push(weekLine(key, list));
  }
  lines.push(weekLine("All", results), "", "By what differs between weeks:");
  for (const [key, list] of byKey((r) => r.camp.variations || [])) {
    lines.push(weekLine(`  ${key}`, list));
  }
  lines.push("", "Wrong cells by week (wrong of cells):");
  const byWeek = new Map();
  for (const r of results) {
    for (const w of r.weeks) {
      const [wrong, cells] = byWeek.get(w.label) || [0, 0];
      byWeek.set(w.label, [wrong + w.wrong, cells + w.cells]);
    }
  }
  for (const [label, [wrong, cells]] of byWeek) {
    lines.push(`  ${pad(label || "(one week)", 12)}${wrong} of ${cells}`);
  }
  return lines.join("\n");
}

/**
 * Level 3: one line per trait (a camp has two or three, so it counts under each): camps, read
 * perfectly, questions, and wrong reads by kind.
 */
export function traitTable(results) {
  const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const lines = [
    `${pad("Trait", 12)}${pad("Camps", 7)}${pad("Perfect", 9)}${pad("Questions", 11)}Wrong reads`
  ];
  const traits = [...new Set(results.flatMap((r) => r.camp.variations || []))];
  for (const trait of traits.sort()) {
    const s = summarise(
      results.filter((r) => r.camp.variations.includes(trait))
    );
    lines.push(
      `${pad(trait, 12)}${pad(s.camps, 7)}${pad(s.perfect, 9)}${pad(total(s.questions), 11)}${shownKinds(s.wrong)}`
    );
  }
  return lines.join("\n");
}

function shownKinds(o) {
  const parts = Object.entries(o).map(([k, v]) => `${k} ${v}`);
  return parts.length ? parts.join(", ") : "0";
}
