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
import { mergesFrom, readWithoutAsking, similarPairs } from "./names";
import { baseName, distinctName, filesToPages, sharedPrefix } from "./sheets";
import {
  buildTimetables,
  cellAt,
  collectGroups,
  crossCheck
} from "./structure";
import { WEEKDAYS, looseKey } from "./text";
import { withoutWeek } from "./weekLabels";
import { identifyGroups } from "./identity";
import { groupDivisionName } from "./noDivision";
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
  const placed = programs.flatMap((p) =>
    (p.divisions || []).flatMap((d) =>
      (d.groups || []).map((g) => ({
        name: g.Name,
        // DIV-1.1: a holding record's name is never the group's division.
        division: groupDivisionName(d.division)
      }))
    )
  );
  return {
    activityLike: [...new Set(activityLike)],
    groups: [...new Set(placed.map((g) => g.name))],
    placed
  };
}

/** Each name once: how often it is used, and in which files (INGEST-2.15). */
function counted(entries) {
  const counts = new Map();
  entries.forEach(({ name, file }) => {
    const c = counts.get(name) || { name, count: 0, files: new Set() };
    c.count++;
    c.files.add(file);
    counts.set(name, c);
  });
  return [...counts.values()];
}

/**
 * Pages that name their group (or activity) after their file get the part of the file name that
 * tells it apart from the other such files ("Camp 2026 - Bunk 1" -> "Bunk 1").
 */
function nameFromFiles(pages, found, maxWeek) {
  const named = pages.filter(
    (p, i) => found[i].layout === "byGroup" || found[i].daysAcross
  );
  // Files for several weeks ("Week 2 - Bunk 1") name the same group: the week is not its name.
  const base = (page) =>
    withoutWeek(baseName(page.file), { bareDates: true, maxWeek });
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

/** The season's number of weeks, or 0 when it has none yet. */
function seasonWeekCount(existing) {
  return ((existing && existing.weeks) || []).length;
}

/**
 * INGEST-2.8: a page whose layout is unsure takes the layout its file's other pages surely have,
 * when they all have the same one (a by-activity file where one day's blocks do not call the full
 * roll). A file with no sure page, or sure pages that differ, stays unsure and is asked.
 */
function sameLayoutPerFile(pages, detected) {
  const sure = new Map();
  pages.forEach((page, i) => {
    const d = detected[i];
    if (d.confident) {
      const ways = sure.get(page.file) || new Set();
      ways.add(`${d.layout}|${d.daysAcross}`);
      sure.set(page.file, ways);
    }
  });
  return detected.map((d, i) => {
    const ways = sure.get(pages[i].file);
    if (d.confident || !ways || ways.size !== 1) {
      return d;
    }
    const [layout, daysAcross] = [...ways][0].split("|");
    if (String(d.daysAcross) !== daysAcross) {
      return d;
    }
    return { ...d, layout, confident: true };
  });
}

function readPages(pages, keys, existing, layouts) {
  const known = {
    groups: new Set(campNames(existing).groups.map(looseKey))
  };
  const detected = sameLayoutPerFile(
    pages,
    pages.map((page) => detectLayout(page, known))
  );
  const found = detected.map((d, i) => ({
    ...d,
    layout: LAYOUTS.includes(layouts[keys[i]]) ? layouts[keys[i]] : d.layout
  }));
  const named = nameFromFiles(pages, found, seasonWeekCount(existing));
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
  return {
    info,
    placements: placesInBrackets(placements, existing),
    noted,
    pages: named
  };
}

/**
 * INGEST-2.21 (Greg, 2026-10-28, level-5 decision 2): "Art (Barn)" is Art at the Barn when the
 * bracket names a place more than one activity is at in the files, or one the camp has;
 * otherwise the bracket is part of the name ("Art (Barn)" is one activity). "@" always names a
 * place ("Art @ Barn").
 */
function placesInBrackets(placements, existing) {
  const campPlaces = new Set(
    ((existing && existing.locations) || []).map((l) => looseKey(l.Name))
  );
  const namesAt = new Map();
  for (const p of placements.filter((x) => x.place)) {
    const key = looseKey(p.place);
    namesAt.set(key, new Set([...(namesAt.get(key) || []), looseKey(p.text)]));
  }
  const isPlace = (place) =>
    campPlaces.has(looseKey(place)) || namesAt.get(looseKey(place)).size > 1;
  return placements.map((p) => {
    if (!p.bracket || isPlace(p.place)) {
      return p;
    }
    return {
      ...p,
      text: `${p.text} (${p.place})`,
      place: null,
      bracket: false
    };
  });
}

/** INGEST-2.20: each name written with emoji, once: a note of what was read. */
function emojiNotes(placements) {
  const seen = new Map();
  for (const p of placements.filter((x) => x.emoji)) {
    seen.set(`${p.emoji}|${p.text}`, {
      type: "emoji",
      emoji: p.emoji,
      name: p.text
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A division only one group has, spelled like another division ("Junoirs" beside Juniors):
 * asked as a similar name (names-and-divisions.md, rule 4), never a silent division of one.
 * Counts are groups, not cells.
 */
function divisionPairs(noted, campPlaced) {
  const groupsOf = new Map();
  noted
    .filter((g) => g.division && !g.weakDivision)
    .forEach((g) =>
      groupsOf.set(
        g.division,
        new Set([...(groupsOf.get(g.division) || []), g.name])
      )
    );
  const counts = [...groupsOf].map(([name, set]) => ({
    name,
    count: set.size
  }));
  const campDivisions = [
    ...new Set(campPlaced.map((g) => g.division).filter(Boolean))
  ];
  return similarPairs("division", counts, campDivisions).filter(
    (p) => Math.min(p.aCount, p.existing ? p.aCount : p.bCount) === 1
  );
}

/** Which names the answers leave out: both spellings of a pair answered "leave it out". */
function leftOutByPairs(pairs, answers) {
  const names = {
    activity: new Set(),
    group: new Set(),
    division: new Set()
  };
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
      group: rename(merges.group, p.group),
      division: p.division && rename(merges.division, p.division)
    }))
    .filter(
      (p) =>
        !leftOut.activity.has(p.text) &&
        !leftOut.group.has(p.group) &&
        !leftOut.division.has(p.division)
    );
  const groups = noted
    .map((g) => ({
      ...g,
      name: rename(merges.group, g.name),
      division: g.division && rename(merges.division, g.division)
    }))
    .filter(
      (g) => !leftOut.group.has(g.name) && !leftOut.division.has(g.division)
    );
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

/** The time blocks a run's rows are, in order: the rows of its own page, never another day's. */
function blockKeysIn(p, blockAt) {
  const keys = [];
  for (let r = p.row; r <= p.endRow; r++) {
    const key = blockAt.get(`${p.page}|${r}`);
    if (key !== undefined) {
      keys.push(key);
    }
  }
  return keys;
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

/** The answers rules 2 and 3 give: each pair read as its common name. */
function answersFor(readAsNames) {
  return Object.fromEntries(readAsNames.map((r) => [r.pair.id, r.answer]));
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
  const { pages, unread, colours } = filesToPages(files, {
    maxWeek: seasonWeekCount(input.existing)
  });
  const keys = pageKeys(pages);
  const read = readPages(pages, keys, input.existing, input.layouts || {});
  const camp = campNames(input.existing);
  const pairs = [
    ...similarPairs(
      "activity",
      counted(read.placements.map((p) => ({ name: p.text, file: p.file }))),
      camp.activityLike
    ),
    ...similarPairs(
      "group",
      counted(read.noted.map((g) => ({ name: g.name, file: g.file }))),
      camp.groups
    ),
    ...divisionPairs(read.noted, camp.placed)
  ];
  // Rules 2 and 3 (names-and-divisions.md): a spelling or ending slip is read as the common
  // name and said in the notes; a remembered answer about the pair still wins.
  const { asked, read: readAsNames } = readWithoutAsking(
    pairs,
    read.placements
  );
  const settled = { ...answersFor(readAsNames), ...answers };
  const merges = {
    activity: mergesFrom(
      pairs.filter((p) => p.kind === "activity"),
      settled
    ),
    group: mergesFrom(
      pairs.filter((p) => p.kind === "group"),
      settled
    ),
    division: mergesFrom(
      pairs.filter((p) => p.kind === "division"),
      settled
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
    earlyEnds,
    asks: timeAsks,
    notes: weekDayNotes
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
      span: blockRowsIn(p, blockAt),
      blockKeys: blockKeysIn(p, blockAt),
      // INGEST-4.13: a day ending early, its last block running to the end of the day.
      ...(earlyEnds.has(cellAt(p))
        ? {
            span: earlyEnds.get(cellAt(p)).keys.length,
            blockKeys: earlyEnds.get(cellAt(p)).keys,
            text: earlyEnds.get(cellAt(p)).text,
            // The blocks it starts before its usual one (the day's last): CORE-3.7.
            early: earlyEnds.get(cellAt(p)).keys.length - 1
          }
        : {})
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
    { campGroups: camp.placed, answers }
  );
  return {
    pages: read.info,
    unread,
    colours,
    pairs: asked,
    disagreements,
    timetables,
    placements: together.placements,
    groups: together.groups,
    notes: [
      ...readAsNames.map(({ pair, kind, from, to, rule, answer }) => ({
        type: "readAs",
        kind,
        from,
        to,
        rule,
        // review.md INGEST-5.2: "Keep apart" answers the pair "different".
        id: pair.id,
        same: answer,
        answer: answers[pair.id] || answer
      })),
      ...together.notes,
      ...weekDayNotes,
      ...emojiNotes(together.placements)
    ],
    groupAsks: identified.asks,
    splitAsks: together.asks,
    timeAsks,
    identities: identified.rules
  };
}
