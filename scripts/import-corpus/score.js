// Scores "Import last year" against the made-up camps in camps.js (docs/import/corpus.md): each
// camp's files go through the engine as the screen sends them, with no remembered answers, and
// what it would ask and save is compared with the camp's true answer.
//
// The engine is passed in ({ engine, XLSX, terms }), so Jest and the node script share this file.
import { campFiles } from "./camps";

export const QUESTION_KINDS = [
  "similar",
  "ampm",
  "whichGroup",
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
  "list"
];
export const WRONG_KINDS = [
  "programs",
  "days",
  "blocks",
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
  return campFiles(camp).map((f) =>
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

const hm = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** What the camp's week shows, cell by cell: "group|day|start" -> activity. */
function trueCells(camp) {
  const cells = new Map();
  camp.groups.forEach((g, gi) =>
    camp.days.forEach((day, d) =>
      camp.blocks.forEach((block, b) =>
        cells.set(`${g.name}|${day}|${hm(block.start)}`, camp.cell(gi, d, b))
      )
    )
  );
  return cells;
}

function readCells(proposal) {
  const cells = new Map();
  for (const p of proposal.usable) {
    const blocks = proposal.timetables[p.timetable].blocks;
    for (let i = 0; i < p.span; i++) {
      const block = blocks[p.blockIndex + i];
      if (block && block.start !== null) {
        cells.set(`${p.group}|${p.day}|${hm(block.start)}`, p.text);
      }
    }
  }
  return cells;
}

function wrongCells(camp, proposal) {
  const want = trueCells(camp);
  const got = readCells(proposal);
  let wrong = 0;
  for (const [key, name] of want) {
    if (got.get(key) !== name) wrong++;
  }
  for (const key of got.keys()) {
    if (!want.has(key)) wrong++;
  }
  return wrong;
}

function wrongReads(camp, proposal, plan) {
  const divisionName = new Map(plan.divisions.map((d) => [d.key, d.name]));
  const blockStart = new Map(plan.timeBlocks.map((b) => [b.key, b.start]));
  const startOf = (name) => {
    const block = camp.blocks.find((b) => b.fixed === name);
    return hm(block.start);
  };
  const program = plan.programs.length === 1 ? plan.programs[0] : null;
  const named = camp.divisionsInFile;
  return {
    programs: Math.abs(plan.programs.length - 1),
    days: program ? mismatches(camp.days, program.days) : camp.days.length,
    blocks: mismatches(
      camp.blocks.map((b) => `${hm(b.start)}-${hm(b.end)}`),
      plan.timeBlocks.map((b) => `${b.start}-${b.end}`)
    ),
    divisions: named
      ? mismatches(
          camp.divisions.map((d) => d.name),
          plan.divisions.map((d) => d.name)
        )
      : 0,
    groups: mismatches(
      camp.groups.map((g) => `${named ? g.division : ""}|${g.name}`),
      plan.groups.map(
        (g) => `${named ? divisionName.get(g.divisionKey) : ""}|${g.name}`
      )
    ),
    fixed: mismatches(
      camp.fixed.map((f) => `${f}|${startOf(f)}`),
      plan.fixedActivities.map((f) => `${f.name}|${blockStart.get(f.blockKey)}`)
    ),
    recurring: plan.recurringActivities.length,
    activities: mismatches(
      camp.activities,
      plan.activities.map((a) => a.name)
    ),
    cells: wrongCells(camp, proposal)
  };
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
    const plan = deps.engine.planFor(proposal, EMPTY_SEASON, "season");
    const wrong = wrongReads(camp, proposal, plan);
    const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    return {
      camp,
      questions,
      wrong,
      perfect: total(questions) === 0 && total(wrong) === 0
    };
  } catch (error) {
    return { camp, questions, wrong: {}, perfect: false, error: String(error) };
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
