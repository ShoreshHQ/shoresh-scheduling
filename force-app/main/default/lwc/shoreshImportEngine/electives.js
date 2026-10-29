/*
 * Electives in last year's file (electives slice E9; wiki plan shoresh-sf-electives-plan §6.1;
 * repo ADR 0006 choice 23 and ADR 0018 choices 45 to 50). Adapted from Shoresh desktop (Apache-2.0,
 * see NOTICE): ADR 2026-10-11-import-electives-keep-their-shape (D1, D3, the precedence, re-import),
 * Director Guide §6 "Double-period electives", and electron/ops/materializeImportedVersion.js
 * writeSpanBundles (T219).
 *
 * - An elective word printed in a cell (Chugim, Bechirot, Electives, or the camp's own word) is an
 *   elective set, without a question: shown as "Read as electives: ..." with one escape, "Not
 *   electives", answered per set and remembered.
 * - A list cell ("Hiking, Fishing, Kayaking") is a set of those choices, proposed, only under the
 *   desktop's strict rule (a comma, semicolon or spaced slash; three parts or more; none empty,
 *   none with "&" or "and", none longer than four words). Anything else list-like is one question:
 *   one activity, or a choice of several.
 * - A name the camp already has as an activity, fixed or recurring activity stays what it is; a set
 *   the camp has of that name is used, and only offerings it doesn't have are added, proposed.
 * - A set or offering the director deleted stays deleted (Greg, decision 45), with Bring back.
 * - The same set held in back-to-back periods by a group is a double period: each choice the import
 *   adds is linked across them (a linked choice per choice and day), unless the groups holding it
 *   that day hold it across different periods, which is said instead.
 */
import { FIELD } from "c/shoreshSchema";
import { notedKindByWords } from "./classify";
import { deletedAs } from "./deleted";
import { foldName } from "./names";
import { LEAVE_OUT } from "./reading";
import { blocksOf } from "./reading-constants";
import { WEEKDAYS, shortClock } from "./text";

export const ELECTIVES = "elective";
export const NOT_ELECTIVES = "not";
export const ONE_ACTIVITY = "one";
export const SEVERAL = "several";

const MAX_NAME = 80;
const MAX_WORDS = 4;
// Passing time between two periods (ADR 0006 choice 2: a row of ten minutes or less is not a
// block), so 9:45 then 9:50 is still back to back; lunch or anything else between is not.
const PASSING_MINUTES = 10;
const SHORT_DAYS = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun"
};

function byText(a, b) {
  return a.localeCompare(b);
}

/**
 * The camp words term electives are called by: Elective once the camp has its own word for it
 * (wiki decision 66: "Chugim"), else the camp's word for elective sets as before decision 66, so
 * a camp that only renamed Elective set reads (and names its sets) as it did.
 */
function electiveTerm(t) {
  return t.s("Elective") === "Elective" && t.s("ElectiveSet") !== "Elective set"
    ? "ElectiveSet"
    : "Elective";
}

/** "electives", or the camp's word inside a sentence ("chugim"). */
export function electiveWord(t) {
  return t.pIn(electiveTerm(t));
}

/**
 * A cell that lists several names: { parts, strict } (strict: read as a choice of them without a
 * question), or null when it is not list-like at all.
 */
export function listShape(text) {
  const value = String(text || "");
  const delimiter =
    [";", ",", " / "].find((d) => value.includes(d)) ||
    (/\S\/\S/.test(value) ? "/" : null);
  if (!delimiter) {
    return null;
  }
  const raw = value.split(delimiter).map((part) => part.trim());
  const parts = raw.filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const strict =
    delimiter !== "/" &&
    raw.length >= 3 &&
    raw.every(
      (part) =>
        part &&
        !/&|\band\b/i.test(part) &&
        part.split(/\s+/).length <= MAX_WORDS
    );
  return { parts, strict };
}

function limited(name) {
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name;
}

/**
 * A list cell's set is named after its own choices, sorted and once each (desktop D2: "Electives
 * (Arts, Crafts, Games)"), so the same list in any order or cell is one set.
 */
export function listSetName(parts, t) {
  const seen = new Set();
  const sorted = [...parts]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .filter((p) => !seen.has(foldName(p)) && seen.add(foldName(p)));
  const word = t.p(electiveTerm(t));
  return limited(`${word} (${sorted.join(", ")})`);
}

/** What a cell's name is as an elective: { setName, choices } or { ask, parts }, else null. */
function readingOf(text, t) {
  if (notedKindByWords(text, t) === "E") {
    return { setName: limited(text), choices: [] };
  }
  const shape = listShape(text);
  if (!shape) {
    return null;
  }
  return shape.strict
    ? { setName: listSetName(shape.parts, t), choices: shape.parts }
    : { ask: true, parts: shape.parts };
}

/** The name is set up in the camp as an activity, or as a fixed or recurring activity where it is. */
function campHas(text, cells, ctx) {
  if (ctx.camp.activities.has(text)) {
    return true;
  }
  const programs = new Set(
    cells
      .map((p) => ctx.timetables[p.timetable])
      .filter((t) => t && t.program)
      .map((t) => t.program.id)
  );
  return [...programs].some(
    (id) =>
      ctx.camp.fixed.has(`${id}|${text}`) ||
      ctx.camp.recurring.has(`${id}|${text}`)
  );
}

/** The season's elective sets (SeasonSetupReader electives), by folded name. */
function campSets(existing) {
  const electives = (existing && existing.electives) || {};
  const activityName = new Map(
    ((existing && existing.activities) || []).map((a) => [a.Id, a.Name])
  );
  const sets = new Map();
  (electives.sets || []).forEach((s) =>
    sets.set(foldName(s.Name), {
      id: s.Id,
      name: s.Name,
      offered: new Map(),
      linkedCount: new Map(),
      maxSort: 0
    })
  );
  const byId = new Map([...sets.values()].map((s) => [s.id, s]));
  (electives.offerings || []).forEach((o) => {
    const set = byId.get(o[FIELD.Offering.ElectiveSet]);
    const name = activityName.get(o[FIELD.Offering.Activity]);
    if (set && name) {
      set.offered.set(foldName(name), o.Id);
    }
  });
  (electives.linkedChoices || []).forEach((c) => {
    const set = byId.get(c[FIELD.LinkedChoice.ElectiveSet]);
    if (set) {
      set.maxSort = Math.max(set.maxSort, c[FIELD.LinkedChoice.SortOrder] || 0);
    }
  });
  return sets;
}

/**
 * Which names in the files are electives, before anything else is decided: { texts: Map(text ->
 * { set } | { held } | { leftOut } | { deleted }), sets, asks, deleted }. A name not in texts goes
 * the usual way (fixed, recurring, activity), an elective word included once it is "Not
 * electives".
 */
export function readElectives(usable, ctx) {
  const t = ctx.terms;
  const answers = ctx.answers || {};
  const asks = [];
  const deleted = [];
  const texts = new Map();
  const found = new Map();
  const named = new Set(usable.map((p) => foldName(p.text)));
  for (const text of [...new Set(usable.map((p) => p.text))].sort(byText)) {
    const cells = usable.filter((p) => p.text === text);
    let reading = readingOf(text, t);
    if (!reading || campHas(text, cells, ctx)) {
      continue;
    }
    if (reading.ask) {
      const id = `list|${text}`;
      // INGEST-2.18 (Greg, 2026-10-28, level-5 decision 4): two activities the files name on
      // their own elsewhere ("Swim/Art") are asked as half the period each, or the group split.
      const twoActivities =
        reading.parts.length === 2 &&
        reading.parts.every((part) => named.has(foldName(part)));
      const where = cells[0];
      asks.push({
        id,
        type: "list",
        name: text,
        parts: reading.parts,
        twoActivities,
        group: where.group,
        day: where.day
      });
      const answer = answers[id];
      if (answer === ONE_ACTIVITY) {
        continue;
      }
      if (answer !== SEVERAL) {
        // Until it is answered it is neither: nothing else is asked about it.
        texts.set(
          text,
          answer === LEAVE_OUT ? { leftOut: true } : { held: true }
        );
        continue;
      }
      reading = {
        setName: listSetName(reading.parts, t),
        choices: reading.parts
      };
    }
    const key = foldName(reading.setName);
    if (!found.has(key)) {
      found.set(key, {
        name: reading.setName,
        texts: [],
        cells: [],
        choices: []
      });
    }
    const entry = found.get(key);
    entry.texts.push(text);
    entry.cells.push(...cells);
    reading.choices.forEach((choice) => {
      if (!entry.choices.some((c) => foldName(c) === foldName(choice))) {
        entry.choices.push(choice);
      }
    });
  }
  const camp = campSets(ctx.existing);
  const sets = [];
  for (const entry of [...found.values()].sort((a, b) =>
    byText(a.name, b.name)
  )) {
    const id = `elective|${entry.name}`;
    const have = camp.get(foldName(entry.name));
    const gone = have
      ? null
      : deletedAs(ctx.deletions, "ElectiveSet", "", entry.name);
    if (gone) {
      deleted.push({
        key: gone,
        kind: "ElectiveSet",
        name: entry.name,
        program: ""
      });
      entry.texts.forEach((text) => texts.set(text, { deleted: true }));
      continue;
    }
    if (answers[id] === NOT_ELECTIVES) {
      // The usual way: what its cells show it to be.
      asks.push({
        id,
        type: "elective",
        set: { ...entry, offerings: [], linked: [] }
      });
      continue;
    }
    const set = {
      ...entry,
      choices: [...entry.choices].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      ),
      ask: id,
      key: have ? have.id : `ES|${entry.name}`,
      id: have ? have.id : null,
      isNew: !have,
      camp: have || null,
      offerings: [],
      linked: [],
      unlinked: []
    };
    sets.push(set);
    asks.push({ id, type: "elective", set });
    entry.texts.forEach((text) => texts.set(text, { set }));
  }
  return { texts, sets, asks, deleted };
}

// ---------- offerings, their activities, linked choices ----------

function blockStart(b) {
  return b.change ? b.change.start : b.start;
}

function blockEnd(b) {
  return b.change ? b.change.end : b.end;
}

function usableBlock(b) {
  return b && !b.leftOut && !b.untimed;
}

/** Block i begins when block i - 1 ends, or within passing time of it. */
function continues(t, i) {
  const before = t.blocks[i - 1];
  const block = t.blocks[i];
  if (!usableBlock(before) || !usableBlock(block)) {
    return false;
  }
  const gap = blockStart(block) - blockEnd(before);
  return gap >= 0 && gap <= PASSING_MINUTES;
}

/**
 * Each day's double periods of one set (desktop writeSpanBundles): every group's runs of
 * back-to-back periods holding it, in each week; a span is linked only when every group's run
 * touching it is it, since two linked choices of one choice sharing a period can't both be taken
 * as a set. Returns { spans: [{ timetable, day, blocks: [index] }], unlinked: [{ timetable, day }] }.
 */
function doublePeriods(set, timetables) {
  const held = new Map();
  for (const p of set.cells) {
    const t = timetables[p.timetable];
    for (const b of blocksOf(p)) {
      if (!usableBlock(t.blocks[b])) {
        continue;
      }
      const key = `${p.timetable}|${p.day}|${p.week}|${p.group}`;
      if (!held.has(key)) {
        held.set(key, new Set());
      }
      held.get(key).add(b);
    }
  }
  const runsByDay = new Map();
  for (const [key, indexes] of held) {
    const [timetable, day] = key.split("|");
    const t = timetables[Number(timetable)];
    const sorted = [...indexes].sort((a, b) => a - b);
    const dayKey = `${timetable}|${day}`;
    const runs = runsByDay.get(dayKey) || [];
    let run = [sorted[0]];
    for (let i = 1; i <= sorted.length; i++) {
      if (
        i < sorted.length &&
        sorted[i] === run[run.length - 1] + 1 &&
        continues(t, sorted[i])
      ) {
        run.push(sorted[i]);
        continue;
      }
      runs.push(run);
      if (i < sorted.length) {
        run = [sorted[i]];
      }
    }
    runsByDay.set(dayKey, runs);
  }
  const spans = [];
  const unlinked = [];
  for (const [dayKey, runs] of [...runsByDay].sort((a, b) =>
    byText(a[0], b[0])
  )) {
    const multi = [
      ...new Map(
        runs.filter((r) => r.length > 1).map((r) => [r.join(","), r])
      ).values()
    ];
    if (multi.length === 0) {
      continue;
    }
    const [timetable, day] = dayKey.split("|");
    const consistent = multi.every((span) =>
      runs.every(
        (r) =>
          !r.some((b) => span.includes(b)) || r.join(",") === span.join(",")
      )
    );
    if (consistent) {
      multi.forEach((blocks) =>
        spans.push({ timetable: Number(timetable), day, blocks })
      );
    } else {
      unlinked.push({ timetable: Number(timetable), day });
    }
  }
  const order = (x) =>
    `${String(x.timetable).padStart(3, "0")}|${WEEKDAYS.indexOf(x.day)}|${String((x.blocks || [0])[0]).padStart(3, "0")}`;
  spans.sort((a, b) => byText(order(a), order(b)));
  unlinked.sort((a, b) => byText(order(a), order(b)));
  return { spans, unlinked };
}

function blockKeyOf(t, index) {
  const block = t.blocks[index];
  return block.id || `B|${t.key}|${block.fileKey}`;
}

/** How a deleted linked choice is remembered (Apex SetupDeletionElectives): by what it links. */
export function linkedChoiceName(activity, days, blockNames) {
  return `${activity}|${days.join("+")}|${blockNames.join("+")}`;
}

/**
 * The offerings, the activities they need, and the linked choices, once the usual kinds are
 * decided. ctx: { timetables, groups, deletions, existing, keyOf, divisionOf, activities (the
 * import's own new activities), activityRecord (items.js) }. Fills each set's offerings, linked
 * and unlinked, and returns { activities, deleted }.
 */
export function electiveRecords(electives, ctx) {
  const campActivities = new Map(
    ((ctx.existing && ctx.existing.activities) || []).map((a) => [
      foldName(a.Name),
      a
    ])
  );
  const added = new Map(ctx.activities.map((a) => [foldName(a.name), a]));
  const deleted = [];
  const choiceCells = new Map();
  for (const set of electives.sets) {
    for (const choice of set.choices) {
      const fold = foldName(choice);
      const camp = campActivities.get(fold);
      const own = added.get(fold);
      if (camp && set.camp && set.camp.offered.has(fold)) {
        continue;
      }
      const activityName = camp ? camp.Name : own ? own.name : choice;
      if (!camp && !own) {
        // Deleted on Activities before: not added again for a choice (ADR 0018 choice 19).
        const gone = deletedAs(ctx.deletions, "Activity", "", choice);
        if (gone) {
          deleted.push({
            key: gone,
            kind: "Activity",
            name: choice,
            program: ""
          });
          continue;
        }
      }
      const goneOffering = deletedAs(
        ctx.deletions,
        "Offering",
        set.name,
        activityName
      );
      if (goneOffering) {
        deleted.push({
          key: goneOffering,
          kind: "Offering",
          name: activityName,
          program: set.name
        });
        continue;
      }
      if (!camp && !own) {
        if (!choiceCells.has(fold)) {
          choiceCells.set(fold, { name: choice, cells: [] });
        }
        choiceCells.get(fold).cells.push(...set.cells);
      }
      set.offerings.push({
        key: `O|${set.key}|${activityName}`,
        activityName,
        activityKey: camp ? camp.Id : `A|${activityName}`,
        setKey: set.key,
        setName: set.name
      });
    }
  }
  const activities = [...choiceCells.values()]
    .sort((a, b) => byText(a.name, b.name))
    .map(({ name, cells }) => choiceActivity(name, cells, ctx));
  for (const set of electives.sets) {
    deleted.push(...linkSet(set, ctx));
  }
  return { activities, deleted };
}

/**
 * An activity a choice needs that neither the camp nor the import has: who can take it is who held
 * the set, as the file shows; never placed as an activity of its own (0 times a week, which is what
 * the file shows), one block long, one group at a time, as an activity added by hand starts.
 */
function choiceActivity(name, cells, ctx) {
  const timetables = new Set(cells.map((c) => c.timetable));
  const pool = ctx.groups
    .filter((g) => !g.leftOut && timetables.has(g.timetable))
    .map((g) => g.name);
  const record = ctx.activityRecord(
    name,
    cells,
    pool,
    ctx.divisionOf,
    ctx.keyOf
  );
  return {
    ...record,
    length: 1,
    lengthsVary: false,
    min: 0,
    max: 0,
    groupsAtOnce: 1,
    place: null,
    choiceOf: true
  };
}

/** The set's linked choices from its double periods, for the offerings this import adds. */
function linkSet(set, ctx) {
  const deleted = [];
  const { spans, unlinked } = doublePeriods(set, ctx.timetables);
  set.unlinked = unlinked.map((u) => ({
    day: u.day,
    program: ctx.timetables[u.timetable].name
  }));
  let sort = set.camp ? set.camp.maxSort : 0;
  const named = new Map();
  for (const offering of [...set.offerings].sort((a, b) =>
    byText(a.activityName, b.activityName)
  )) {
    for (const span of spans) {
      const t = ctx.timetables[span.timetable];
      const blockNames = span.blocks.map((i) => t.blocks[i].name);
      const gone = deletedAs(
        ctx.deletions,
        "LinkedChoice",
        set.name,
        linkedChoiceName(offering.activityName, [span.day], blockNames)
      );
      // As the editor names them (ADR 0018 choice 41, the desktop's D7): the activity's name for
      // an offering's first linked choice, then the activity and its first period.
      const count = named.get(offering.key) || 0;
      named.set(offering.key, count + 1);
      const name =
        count === 0
          ? offering.activityName
          : `${offering.activityName} · ${SHORT_DAYS[span.day]} ${shortClock(blockStart(t.blocks[span.blocks[0]]))}`;
      if (gone) {
        deleted.push({
          key: gone,
          kind: "LinkedChoice",
          name,
          program: set.name
        });
        continue;
      }
      set.linked.push({
        key: `LC|${offering.key}|${t.key}|${span.day}|${span.blocks.join(",")}`,
        name: limited(name),
        setKey: set.key,
        setName: set.name,
        offeringKey: offering.key,
        sortOrder: ++sort,
        day: span.day,
        blockNames,
        program: t.name,
        times: span.blocks.map((i) => ({
          weekday: span.day,
          blockKey: blockKeyOf(t, i)
        }))
      });
    }
  }
  return deleted;
}
