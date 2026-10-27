/*
 * Reading the files: pages, their layouts, every placement, the similar names (merged only as
 * answered), the time blocks of each timetable, and cells that files covering the same week
 * disagree about (kept as answered).
 */
import {
  detectLayout,
  LAYOUTS,
  pageDay,
  pageName,
  pageWeek,
  readPage
} from "./layouts";
import { mergesFrom, similarPairs } from "./names";
import { baseName, distinctName, filesToPages, sharedPrefix } from "./sheets";
import { buildTimetables, collectGroups, crossCheck } from "./structure";
import { WEEKDAYS, looseKey, withoutWeek } from "./text";
import { identifyGroups } from "./identity";
import { oneGroupDivisions } from "./together";

export { LEAVE_OUT } from "./reading-constants";
import { LEAVE_OUT } from "./reading-constants";

function pageKeys(pages) {
  const seen = new Map();
  return pages.map((page) => {
    const base = `${page.file}|${page.sheet}`;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return `${base}|${n}`;
  });
}

function campNames(existing) {
  const programs = (existing && existing.programs) || [];
  const activityLike = [
    ...((existing && existing.activities) || []),
    ...programs.flatMap((p) => p.fixedActivities || []),
    ...programs.flatMap((p) => p.recurringActivities || [])
  ].map((r) => r.Name);
  const groups = programs.flatMap((p) =>
    (p.divisions || []).flatMap((d) => (d.groups || []).map((g) => g.Name))
  );
  return {
    activityLike: [...new Set(activityLike)],
    groups: [...new Set(groups)]
  };
}

function counted(names) {
  const counts = new Map();
  names.forEach((n) => counts.set(n, (counts.get(n) || 0) + 1));
  return [...counts].map(([name, count]) => ({ name, count }));
}

/**
 * Pages that name their group (or activity) after their file get the part of the file name that
 * tells it apart from the other such files ("Camp 2026 - Bunk 1" -> "Bunk 1").
 */
function nameFromFiles(pages, found) {
  const named = pages.filter(
    (p, i) => found[i].layout === "byGroup" || found[i].daysAcross
  );
  // Files for several weeks ("Week 2 - Bunk 1") name the same group: the week is not its name.
  const base = (page) => withoutWeek(baseName(page.file));
  const prefix = sharedPrefix([...new Set(named.map(base))]);
  return pages.map((page) => {
    if (!named.includes(page)) {
      return page;
    }
    const file = distinctName(base(page), prefix) || page.names.file;
    // With nothing shared between file names, the whole name is used, camp name and all: a
    // division read from it is only a hint.
    return {
      ...page,
      names: { ...page.names, file, fileIsWholeName: !prefix }
    };
  });
}

function readPages(pages, keys, existing, layouts) {
  const known = {
    groups: new Set(campNames(existing).groups.map(looseKey))
  };
  const detected = pages.map((page) => detectLayout(page, known));
  const found = detected.map((d, i) => ({
    ...d,
    layout: LAYOUTS.includes(layouts[keys[i]]) ? layouts[keys[i]] : d.layout
  }));
  const named = nameFromFiles(pages, found);
  const placements = [];
  const noted = [];
  const info = named.map((page, i) => {
    const read = readPage(page, i, found[i]);
    placements.push(...read.placements);
    noted.push(...read.groups);
    return {
      key: keys[i],
      file: page.file,
      sheet: page.sheet,
      layout: found[i].layout,
      detected: detected[i].layout,
      confident:
        detected[i].confident && found[i].layout === detected[i].layout,
      daysAcross: detected[i].daysAcross,
      day: pageDay(page),
      week: pageWeek(page),
      name: pageName(page),
      noDay: read.noDay,
      placements: read.placements.length
    };
  });
  return { info, placements, noted, pages: named };
}

/** Which names the answers leave out: both spellings of a pair answered "leave it out". */
function leftOutByPairs(pairs, answers) {
  const names = { activity: new Set(), group: new Set() };
  for (const pair of pairs) {
    if (answers[pair.id] === LEAVE_OUT) {
      names[pair.kind].add(pair.a);
      if (!pair.existing) {
        names[pair.kind].add(pair.b);
      }
    }
  }
  return names;
}

function applyNames(placements, noted, merges, leftOut) {
  const rename = (map, name) => map.get(name) || name;
  const kept = placements
    .map((p) => ({
      ...p,
      text: rename(merges.activity, p.text),
      group: rename(merges.group, p.group)
    }))
    .filter(
      (p) => !leftOut.activity.has(p.text) && !leftOut.group.has(p.group)
    );
  const groups = noted
    .map((g) => ({ ...g, name: rename(merges.group, g.name) }))
    .filter((g) => !leftOut.group.has(g.name));
  return { kept, groups };
}

function blockRowsIn(p, blockAt) {
  let count = 0;
  for (let r = p.row; r <= p.endRow; r++) {
    if (blockAt.has(`${p.page}|${r}`)) {
      count++;
    }
  }
  return Math.max(count, 1);
}

/** Each cell answered: the text chosen, or nothing if left out. One placement per cell. */
function settleCells(byCell, answers, disagreements) {
  const asked = new Map(disagreements.map((d) => [d.cell, d.id]));
  const result = [];
  for (const [cell, list] of byCell) {
    const answer = asked.has(cell) ? answers[asked.get(cell)] : undefined;
    if (answer === LEAVE_OUT) {
      continue;
    }
    const chosen = answer ? list.filter((p) => p.text === answer) : list;
    const seenTexts = new Set();
    for (const p of chosen.length ? chosen : list) {
      if (!seenTexts.has(p.text)) {
        seenTexts.add(p.text);
        result.push(p);
      }
    }
  }
  return result;
}

/** Files by name; two of the same name by what is in them, so the order never depends on how they were chosen. */
function byNameThenContent(a, b) {
  const content = (f) =>
    JSON.stringify((f.sheets || []).map((sheet) => [sheet.name, sheet.rows]));
  return a.name.localeCompare(b.name) || content(a).localeCompare(content(b));
}

/**
 * Everything the files say, with the director's answers so far applied.
 * input: { files, existing (SeasonSetupReader shape, or null), answers, layouts }.
 */
export function readImport(input) {
  const answers = input.answers || {};
  // The same files give the same result whatever order they were chosen in (by name, then
  // their own sheet order).
  const files = [...(input.files || [])].sort(byNameThenContent);
  const { pages, unread } = filesToPages(files);
  const keys = pageKeys(pages);
  const read = readPages(pages, keys, input.existing, input.layouts || {});
  const camp = campNames(input.existing);
  const pairs = [
    ...similarPairs(
      "activity",
      counted(read.placements.map((p) => p.text)),
      camp.activityLike
    ),
    ...similarPairs(
      "group",
      counted(read.noted.map((g) => g.name)),
      camp.groups
    )
  ];
  const merges = {
    activity: mergesFrom(
      pairs.filter((p) => p.kind === "activity"),
      answers
    ),
    group: mergesFrom(
      pairs.filter((p) => p.kind === "group"),
      answers
    )
  };
  const named = applyNames(
    read.placements,
    read.noted,
    merges,
    leftOutByPairs(pairs, answers)
  );
  // A group is its division and its name (Bunk 1 in Juniors is not Bunk 1 in Seniors).
  // Timetables first (they do not depend on which group is which), then each group's
  // identity: its division and name, and its schedule when two programs share both.
  const {
    timetables,
    blockAt,
    timetableOfPage,
    asks: timeAsks
  } = buildTimetables(read.pages, named.kept, answers);
  const identified = identifyGroups(named.kept, named.groups, {
    existing: input.existing,
    answers,
    timetableOfPage
  });
  const placed = identified.kept
    .filter((p) => WEEKDAYS.includes(p.day))
    .map((p) => ({
      ...p,
      blockKey: blockAt.get(`${p.page}|${p.row}`),
      timetable: timetableOfPage.get(p.page),
      span: blockRowsIn(p, blockAt)
    }));
  const blockName = (p) => {
    const t = timetables[p.timetable];
    const block = t.blocks.find((b) => b.key === p.blockKey);
    return block ? block.name : p.block;
  };
  const { disagreements, byCell } = crossCheck(placed, blockName);
  // Rule 8: a division whose bunks always do the same thing is one group.
  const together = oneGroupDivisions(
    settleCells(byCell, answers, disagreements),
    collectGroups(identified.groups, timetableOfPage),
    { campGroups: camp.groups, answers }
  );
  return {
    pages: read.info,
    unread,
    pairs,
    disagreements,
    timetables,
    ...together,
    groupAsks: identified.asks,
    timeAsks,
    identities: identified.rules
  };
}
