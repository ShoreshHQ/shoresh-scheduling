// Level 2, "somewhat ordinary" (docs/import/corpus.md): made-up camps whose schedule differs from
// week to week, with the true answer week by week. Clean data otherwise, Monday to Friday only.
// Deterministic: the same seed always gives the same camp.
//
// Every week rotates differently. On top of that a camp may have: one week whose Friday afternoon
// has different (fewer, longer) blocks; a second session with a different set of groups; and
// activities that appear only in some weeks.
import {
  ACTIVITIES,
  CAMP_KINDS,
  CAMP_WORDS,
  DIVISION_SETS,
  GROUP_STYLES,
  LABEL_STYLES,
  OPENINGS,
  TIME_STYLES,
  blocksFor,
  filesOf,
  groupNames,
  hm,
  labelCells,
  labelHeadings,
  randomFrom,
  sheet,
  stacked
} from "./camps";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const LAYOUT_CHOICES = [
  // [layout, format, how the pages are split]
  ["allCamp", "xlsx", "sheetPerWeek"],
  ["allCamp", "xlsx", "filePerWeek"],
  ["allCamp", "csv", "filePerWeek"],
  ["allCamp", "xlsx", "weeksStacked"],
  ["allCamp", "csv", "weekColumn"],
  ["byGroup", "xlsx", "sheetPerGroupWeek"],
  ["byGroup", "xlsx", "filePerWeek"],
  ["byActivity", "xlsx", "filePerWeek"]
];

/** How many camps the full level-2 corpus has. */
export const LEVEL2_SIZE = 320;

/** Friday's afternoon cut into fewer, longer blocks (the morning and lunch as every day). */
function recutAfternoon(blocks) {
  const lunch = blocks.findIndex((b) => b.fixed === "Lunch");
  const after = blocks.slice(lunch + 1);
  if (after.length < 2) return null;
  const start = after[0].start;
  const end = after[after.length - 1].end;
  const count = after.length - 1;
  const length = Math.floor((end - start) / count / 5) * 5;
  const word = after[0].name.split(" ")[0];
  const recut = Array.from({ length: count }, (_, i) => ({
    name: `${word} ${String.fromCharCode(65 + i)}`,
    start: start + i * length,
    end: start + (i + 1) * length,
    fixed: null
  }));
  return [...blocks.slice(0, lunch + 1), ...recut];
}

/** The camp's divisions, and (for a second session) the divisions it runs then. */
function sessionsOf(r, set, style) {
  const count = r.int(1, Math.min(5, set.length));
  const big = r.chance(0.2);
  const sizes = set.slice(0, count + 1).map((name) => ({
    name,
    size: big ? r.int(5, Math.floor(30 / count)) : r.int(2, 5)
  }));
  const all = groupNames(r, sizes, style);
  const first = all.slice(0, count);
  if (!r.chance(0.35)) return { first, second: null };
  // A second session adds a division when the set has one more, or drops the last one.
  if (all.length > count) return { first, second: all };
  if (count > 1) return { first, second: first.slice(0, -1) };
  return { first, second: null };
}

/** Week by week, which activity list each week rotates through. */
function activityLists(r, base, pool, weekCount) {
  const lists = Array.from({ length: weekCount }, () => [...base]);
  if (!r.chance(0.5)) return lists;
  for (const special of pool.slice(0, r.int(1, 2))) {
    const from = r.int(0, weekCount - 1);
    const to = r.int(from, weekCount - 1);
    const replaced = r.int(0, base.length - 1);
    for (let w = from; w <= to; w++) lists[w][replaced] = special;
  }
  return lists;
}

function flatGroups(divisions) {
  return divisions.flatMap((d) =>
    d.groups.map((g) => ({ name: g, division: d.name }))
  );
}

/** One week: { label, days, blocksOn: [blocks per day], divisions, groups, cell(g, d, b) }. */
function weekOf(spec) {
  const { label, divisions, list, blocksOn, step } = spec;
  const groups = flatGroups(divisions);
  const cell = (g, d, b) => {
    const blocks = blocksOn[d];
    const block = blocks[b];
    if (block.fixed) return block.fixed;
    const p = blocks.slice(0, b).filter((x) => !x.fixed).length;
    return list[(g * step + p + d * 2 + spec.shift) % list.length];
  };
  return { label, days: DAYS, blocksOn, divisions, groups, cell };
}

function campWeeks(r, plan) {
  const { blocks, sessions, lists, weekCount, oddFriday, sessionFrom } = plan;
  return Array.from({ length: weekCount }, (_, w) =>
    weekOf({
      label: `Week ${w + 1}`,
      divisions:
        sessions.second && w >= sessionFrom ? sessions.second : sessions.first,
      list: lists[w],
      blocksOn: DAYS.map((_, d) =>
        w === oddFriday && d === 4 ? recutAfternoon(blocks) : blocks
      ),
      step: r.int(1, lists[w].length - 1),
      shift: r.int(0, lists[w].length - 1)
    })
  );
}

/** One level-2 camp and its true answer (camp.truth, as the scorer reads it). */
export function variedCamp(seed) {
  const r = randomFrom(seed * 104729 + 31);
  const [layout, format, split] = LAYOUT_CHOICES[seed % LAYOUT_CHOICES.length];
  const set = r.pick(DIVISION_SETS);
  const style = r.pick(GROUP_STYLES.filter((x) => x !== "animal"));
  const sessions = sessionsOf(r, set, style);
  const blocks = blocksFor(r, r.chance(0.6) ? r.pick(OPENINGS) : null);
  const weekCount = r.pick([2, 3, 4, 4, 4, 5, 6]);
  const periods = blocks.filter((b) => !b.fixed).length;
  const shuffled = r.shuffle(ACTIVITIES);
  const base = shuffled.slice(0, Math.max(periods + 1, r.int(6, 12)));
  const oddFriday =
    r.chance(0.4) && recutAfternoon(blocks) ? r.int(1, weekCount - 1) : -1;
  const plan = {
    blocks,
    sessions,
    weekCount,
    oddFriday,
    sessionFrom: r.int(1, weekCount - 1),
    lists: activityLists(r, base, shuffled.slice(base.length), weekCount)
  };
  const camp = {
    id: `L2-${String(seed).padStart(3, "0")}`,
    level: 2,
    name: `${r.pick(CAMP_WORDS[0])} ${r.pick(CAMP_WORDS[1])} ${r.pick(CAMP_KINDS)}`,
    layout,
    format,
    split,
    timeStyle: r.pick(TIME_STYLES),
    labelStyle: r.pick(LABEL_STYLES),
    shortDays: r.chance(0.3),
    weeks: campWeeks(r, plan),
    variations: [
      "rotation",
      ...(oddFriday >= 0 ? ["oddFriday"] : []),
      ...(sessions.second ? ["session"] : []),
      ...(plan.lists.some((l) => l.join() !== base.join())
        ? ["weekActivities"]
        : [])
    ]
  };
  camp.truth = truthOf(camp, style);
  return camp;
}

export function variedCamps(count) {
  return Array.from({ length: count }, (_, i) => variedCamp(i + 1));
}

// ---------- the true answer ----------

function eachCell(week, visit) {
  week.groups.forEach((g, gi) =>
    week.days.forEach((day, d) =>
      week.blocksOn[d].forEach((block, b) =>
        visit(g, day, block, week.cell(gi, d, b))
      )
    )
  );
}

function truthOf(camp, style) {
  const blocks = new Set();
  const groups = new Map();
  const divisions = new Set();
  const activities = new Set();
  const fixed = new Set();
  const weeks = camp.weeks.map((week) => {
    const cells = new Map();
    week.divisions.forEach((d) => divisions.add(d.name));
    eachCell(week, (g, day, block, name) => {
      cells.set(`${week.label}|${g.name}|${day}|${hm(block.start)}`, name);
      blocks.add(`${hm(block.start)}-${hm(block.end)}`);
      groups.set(`${g.division}|${g.name}`, g);
      if (block.fixed) fixed.add(`${name}|${hm(block.start)}`);
      else activities.add(name);
    });
    return { label: week.label, cells };
  });
  return {
    weeks,
    days: DAYS,
    blocks: [...blocks],
    divisions: [...divisions],
    groups: [...groups.values()],
    fixed: [...fixed],
    recurring: [],
    activities: [...activities],
    divisionsInFile:
      divisions.size > 1 &&
      (camp.layout !== "byActivity" || style === "divisionNumber")
  };
}

// ---------- writing the files as a director would ----------

function dayText(camp, day) {
  return camp.shortDays ? day.slice(0, 3) : day;
}

function divisionRow(camp, week, lead) {
  const row = lead.map(() => "");
  const merges = [];
  for (const division of week.divisions) {
    merges.push({
      s: { r: 1, c: row.length },
      e: { r: 1, c: row.length + division.groups.length - 1 }
    });
    row.push(division.name, ...division.groups.slice(1).map(() => ""));
  }
  return { row, merges };
}

function allCampPage(camp, week, d, title) {
  const lead = labelHeadings(camp);
  const rows = [[title]];
  let merges = [];
  if (week.divisions.length > 1) {
    const divs = divisionRow(camp, week, lead);
    rows.push(divs.row);
    merges = divs.merges;
  }
  rows.push([...lead, ...week.groups.map((g) => g.name)]);
  const head = rows.length - 1;
  week.blocksOn[d].forEach((block, b) => {
    rows.push([
      ...labelCells(camp, block),
      ...week.groups.map((_, g) => week.cell(g, d, b))
    ]);
  });
  return { rows, merges, head };
}

function byActivityPage(camp, week, d, title) {
  const blocks = week.blocksOn[d];
  const names = new Set();
  week.groups.forEach((_, g) =>
    blocks.forEach((_b, b) => names.add(week.cell(g, d, b)))
  );
  const fixed = blocks.filter((b) => b.fixed).map((b) => b.fixed);
  const others = [...names].filter((n) => !fixed.includes(n)).sort();
  const rows = [[title], [...labelHeadings(camp), ...fixed, ...others]];
  const head = 1;
  blocks.forEach((block, b) => {
    const doing = (name) =>
      week.groups
        .filter((_, g) => week.cell(g, d, b) === name)
        .map((g) => g.name)
        .join(", ");
    rows.push([
      ...labelCells(camp, block),
      ...fixed.map(doing),
      ...others.map(doing)
    ]);
  });
  return { rows, merges: [], head };
}

/** A group's week, days across; rows are every block any day has (blank where a day has none). */
function byGroupRows(camp, week, g) {
  const rows = [
    [...labelHeadings(camp), ...week.days.map((day) => dayText(camp, day))]
  ];
  const all = new Map();
  week.blocksOn.forEach((blocks) =>
    blocks.forEach((b) => all.set(`${b.start}-${b.end}`, b))
  );
  const ordered = [...all.values()].sort((a, b) => a.start - b.start);
  for (const block of ordered) {
    rows.push([
      ...labelCells(camp, block),
      ...week.days.map((_, d) => {
        const b = week.blocksOn[d].indexOf(block);
        return b < 0 ? "" : week.cell(g, d, b);
      })
    ]);
  }
  return rows;
}

function groupTitle(week, group) {
  return week.divisions.length > 1
    ? `${group.division} - ${group.name}`
    : group.name;
}

/** A leading "Week" column, the week written on every block row of the page. */
function withWeekColumn(page, label) {
  const lead = (row, i) => {
    if (i === 0) return row;
    if (i < page.head) return ["", ...row];
    return [i === page.head ? "Week" : label, ...row];
  };
  return { rows: page.rows.map(lead), merges: [] };
}

function dayPages(camp, week, titleOf) {
  const pageOf = camp.layout === "byActivity" ? byActivityPage : allCampPage;
  return week.days.map((day, d) =>
    pageOf(camp, week, d, titleOf(dayText(camp, day)))
  );
}

function byGroupFiles(camp) {
  const base = camp.name;
  // The sheet is named for the group (31 characters at most); the division is in its heading.
  const sheetsOf = (week, named) =>
    week.groups.map((g, gi) =>
      sheet(named(g.name), [
        [groupTitle(week, g)],
        ...byGroupRows(camp, week, gi)
      ])
    );
  if (camp.split === "sheetPerGroupWeek") {
    return [
      {
        file: `${base} 2026.xlsx`,
        sheets: camp.weeks.flatMap((week) =>
          sheetsOf(week, (t) => `${week.label} - ${t}`)
        )
      }
    ];
  }
  return camp.weeks.map((week) => ({
    file: `${base} 2026 - ${week.label}.xlsx`,
    sheets: sheetsOf(week, (t) => t)
  }));
}

function dayFiles(camp) {
  const base = camp.name;
  const title = (rest) => `${base} - ${rest}`;
  if (camp.split === "sheetPerWeek") {
    const sheets = camp.weeks.map((week) => {
      const one = stacked(dayPages(camp, week, title));
      return sheet(week.label, one.rows, one.merges);
    });
    return [{ file: `${base} 2026.xlsx`, sheets }];
  }
  if (camp.split === "weeksStacked" || camp.split === "weekColumn") {
    const pages = camp.weeks.flatMap((week) =>
      camp.split === "weeksStacked"
        ? dayPages(camp, week, (day) => title(`${week.label} - ${day}`))
        : dayPages(camp, week, title).map((p) => withWeekColumn(p, week.label))
    );
    const one = stacked(pages);
    return [
      {
        file: `${base} 2026.${camp.format}`,
        sheets: [sheet("Schedule", one.rows, one.merges)]
      }
    ];
  }
  return camp.weeks.map((week) => {
    const file = `${base} 2026 - ${week.label}.${camp.format}`;
    const pages = dayPages(camp, week, title);
    if (camp.format === "csv") {
      return { file, sheets: [sheet(week.label, stacked(pages).rows)] };
    }
    return {
      file,
      sheets: pages.map((p, d) =>
        sheet(dayText(camp, week.days[d]), p.rows, p.merges)
      )
    };
  });
}

/** The camp's files as a director would upload them (as campFiles in camps.js). */
export function variedCampFiles(camp) {
  const pages = camp.layout === "byGroup" ? byGroupFiles(camp) : dayFiles(camp);
  return filesOf(pages);
}
