/*
 * One setup list read from a file and set against what the season has (slice 4c, Greg's
 * decisions of 2026-10-17):
 * - an unreadable row is listed with its reason and left out;
 * - a row naming an item already set up is compared on the columns the file has, never on the
 *   ones it doesn't, and every difference is shown for Keep or Change;
 * - a location or location type the season doesn't have yet "will also be added";
 * - similar names (Music / Musik) are always asked, as in Import last year;
 * - the same file and answers always give the same result.
 * Pure JavaScript: the screen calls listProposal again on every answer.
 */
import {
  BRING_BACK,
  LEAVE_OUT,
  deletedAs,
  deletionsIn,
  programGroupKeys,
  looseKey,
  mergesFrom,
  similarPairs,
  tidy
} from "c/shoreshImportEngine";
import { NONE, dashKeyOf, days as readDays, readCell } from "./cells";
import {
  headingRowIndex,
  mapHeadings,
  pickSheet,
  sheetChoices
} from "./headings";
import { cellText, listScreen } from "./screens";
import { resolveWho, whoTargets } from "./who";
import {
  ampmCards,
  ampmKey,
  dashCards,
  dashKey,
  tueThuCards,
  tueThuKey,
  blockAddKey,
  unknownBlocks,
  unknownRainPlans,
  unknownWho
} from "./adds";
import { resolveProgramDays, resolvePrograms } from "./scope";
import { resolveColumn } from "./refs";
import { FIELD } from "c/shoreshSchema";

/** Keep or Change, for one difference. */
export const KEEP = "keep";
export const CHANGE = "change";

// What each kind of name is called in similar-name questions: the same keys as Import last
// year, so an answer given there ("Music" and "Musik" are the same) is not asked again here.
const PAIR_KIND = {
  Activity: "activity",
  activity: "activity",
  Location: "location",
  location: "location",
  LocationType: "locationType",
  locationType: "locationType",
  Program: "program",
  Division: "division",
  division: "division",
  Group: "group",
  TimeBlock: "timeBlock",
  timeBlock: "timeBlock",
  FixedActivity: "fixed",
  RecurringActivity: "recurring"
};

const HALF_DAY = 12 * 60;

/** A difference's answer key: the item, the column, and the new value (a new value asks again). */
export function changeKey(screenKey, name, columnKey, to) {
  return `change|${screenKey}|${looseKey(name)}|${columnKey}|${JSON.stringify(to ?? null)}`;
}

function blankValue(column) {
  if (column.type === "list" || column.type === "days") {
    return [];
  }
  return column.type === "yesNo" ? false : null;
}

/** The columns of the screen the file gives, in the screen's order. */
function usedColumns(screen, mapping) {
  const byColumn = new Map(
    mapping.headings.filter((h) => h.column).map((h) => [h.column, h.index])
  );
  return screen.columns
    .filter((c) => byColumn.has(c.key))
    .map((c) => ({ column: c, index: byColumn.get(c.key) }));
}

/** Each row with something in it: its cells read, and why it can't be read, if so. */
function readRows(rows, start, used) {
  const result = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!row.some((cell) => tidy(cell))) {
      continue;
    }
    const values = {};
    const blanks = new Set();
    const unsure = {};
    const dayAsks = {};
    const problems = [];
    const requiredBlanks = [];
    used.forEach(({ column, index }) => {
      const read = readCell(column, row[index]);
      if (read.problem) {
        problems.push(`${column.heading}: ${read.problem}`);
      } else if (read.ask) {
        dayAsks[column.key] = tidy(row[index]);
      } else if (
        read.blank &&
        column.requiredValue &&
        column.newValue !== undefined
      ) {
        // Settled once it is known whether the row is new (settleBlanks).
        requiredBlanks.push(column);
      } else if (read.blank && column.requiredValue) {
        // Nothing to start from (a name, a day, a time): never quietly skipped.
        problems.push(`${column.heading} is blank`);
      } else if (read.blank) {
        blanks.add(column.key);
      } else {
        values[column.key] = read.value;
        if (read.unsure) {
          unsure[column.key] = tidy(row[index]);
        }
      }
    });
    if (!values.name && !problems.length) {
      problems.push("No name");
    }
    if (
      typeof values.min === "number" &&
      typeof values.max === "number" &&
      values.max < values.min
    ) {
      problems.push(`At most ${values.max} is below at least ${values.min}`);
    }
    result.push({
      rowNumber: i + 1,
      name: values.name || "",
      values,
      blanks,
      unsure,
      dayAsks,
      requiredBlanks,
      problems
    });
  }
  return result;
}

function usable(row) {
  return !row.problems.length && !row.leftOut;
}

/** Similar names among the rows and against the camp's, scope by scope (season or program). */
function matchNames(leads, screen, setup, answers) {
  const scoped = screen.scope === "program";
  const rows = leads.filter((r) => usable(r) && (!scoped || r.program));
  const records = screen.records(setup);
  // A group is matched within its program and (resolved) division; other items in their scope.
  const bucketOf = (r) => {
    return screen.kind === "Group"
      ? `${scopeOf(r)}|${looseKey(r.values.division || "")}`
      : scopeOf(r);
  };
  const inBucket = (rec, r) => {
    if (!scoped) {
      return true;
    }
    if (rec._programId !== scopeOf(r)) {
      return false;
    }
    return (
      screen.kind !== "Group" ||
      looseKey(rec._divisionName) === looseKey(r.values.division || "")
    );
  };
  const pairs = [];
  [...new Set(rows.map(bucketOf))].sort().forEach((bucket) => {
    const inThis = rows.filter((r) => bucketOf(r) === bucket);
    pairs.push(
      ...matchScope(
        inThis,
        records.filter((rec) => inBucket(rec, inThis[0])),
        screen.kind,
        answers
      )
    );
  });
  if (screen.kind === "Group") {
    groupMoves(rows, records, leads);
  }
  return pairs;
}

/**
 * A group the file names in another division of its program is that group moving (a
 * difference to Keep or Change), unless the file also names it in the division it is in: then
 * this row is a new group of the same name. Only one of that name in the program, never
 * guessed; and decided on every row of the file, so a row that can't be read changes nothing.
 */
function groupMoves(rows, records, allRows) {
  const claims = new Map();
  rows
    .filter((r) => !r.existing && !r.open && !r.leftOut && !r.found.length)
    .forEach((r) => {
      const named = records.filter(
        (rec) =>
          rec._programId === scopeOf(r) &&
          looseKey(rec.Name) === looseKey(r.name)
      );
      if (named.length !== 1) {
        return;
      }
      const home = looseKey(named[0]._divisionName);
      // A row that can't be read has no program settled: it may be this one.
      const listedAtHome = allRows.some(
        (other) =>
          (!other.program || scopeOf(other) === scopeOf(r)) &&
          looseKey(other.name) === looseKey(r.name) &&
          looseKey(other.values.division || "") === home
      );
      if (!listedAtHome) {
        claims.set(named[0], [...(claims.get(named[0]) || []), r]);
      }
    });
  // Two rows moving one group to two divisions: never picked by order; both are new groups.
  claims.forEach((claimants, rec) => {
    if (claimants.length === 1) {
      claimants[0].existing = rec;
      claimants[0].found = [rec];
    }
  });
}

/**
 * A name written several ways (capitals and spacing aside) is spelled one way whatever the row
 * order: as an item set up spells it, if one does; else the way written most often, then the
 * first alphabetically.
 */
/** The way a name is written most often, then the first alphabetically. */
function mostWritten(spellings) {
  const counts = new Map();
  spellings.forEach((n) => counts.set(n, (counts.get(n) || 0) + 1));
  return [...counts.entries()].sort(
    (x, y) => y[1] - x[1] || x[0].localeCompare(y[0])
  )[0][0];
}

function settleSpelling(readable, records) {
  const names = new Set(records.map((rec) => tidy(rec.Name)));
  readable.forEach((r) => {
    const counts = new Map();
    (r.spellings || [r.name]).forEach((n) =>
      counts.set(n, (counts.get(n) || 0) + 1)
    );
    const ranked = [...counts.entries()].sort(
      (x, y) => y[1] - x[1] || x[0].localeCompare(y[0])
    );
    const name = (ranked.find(([n]) => names.has(n)) || ranked[0])[0];
    r.name = name;
    r.values.name = name;
  });
}

function matchScope(leads, records, kind, answers) {
  const readable = leads.filter(usable);
  settleSpelling(readable, records);
  const campNames = [...new Set(records.map((r) => tidy(r.Name)))];
  const pairs = similarPairs(
    PAIR_KIND[kind],
    readable.map((r) => ({ name: r.name, count: 1 })),
    campNames
  );
  const byName = new Map();
  // Spaces aside, as the file's names are read ("Board  games" is "Board games").
  records.forEach((r) =>
    byName.set(tidy(r.Name), [...(byName.get(tidy(r.Name)) || []), r])
  );
  const rowOf = new Map(readable.map((r) => [r.name, r]));
  readable.forEach((r) => {
    r.found = byName.get(r.name) || [];
  });
  pairs.forEach((pair) => {
    const answer = answers[pair.id];
    const a = rowOf.get(pair.a);
    const b = pair.existing ? null : rowOf.get(pair.b);
    const sameThing = answer === "a" || answer === "b";
    if (answer === LEAVE_OUT) {
      a.leftOut = true;
      if (b) {
        b.leftOut = true;
      }
    } else if (pair.existing && sameThing && rowOf.has(pair.existing)) {
      // The same as the camp's item, which another row of the file gives: that row is used.
      a.leftOut = true;
      a.sameAs = pair.existing;
    } else if (pair.existing && sameThing) {
      // Either spelling chosen (Import last year asks with both): the camp's item is used.
      a.found = byName.get(pair.existing) || [];
    } else if (answer !== "different" && !sameThing) {
      // Not answered (or an answer this question doesn't offer).
      a.open = true;
      if (b) {
        b.open = true;
      }
    }
  });
  // Rows answered to be one thing form one set (even with answers that go round in a circle),
  // which keeps one spelling (names.js mergesFrom, as Import last year does): the row with it
  // is used, the others are the same as it.
  mergesFrom(
    pairs.filter((p) => !p.existing),
    answers
  ).forEach((kept, name) => {
    const dropped = rowOf.get(name);
    if (dropped && rowOf.has(kept)) {
      dropped.leftOut = true;
      dropped.sameAs = kept;
    }
  });
  readable.forEach((r) => {
    // A group of one name in two divisions: the one in the division the row names.
    if (r.found.length > 1 && r.values.division) {
      const inDivision = r.found.filter(
        (rec) => rec._divisionName === r.values.division
      );
      if (inDivision.length === 1) {
        r.found = inDivision;
      }
    }
    r.existing = r.found.length === 1 ? r.found[0] : null;
  });
  return pairs;
}

export function whichKey(screenKey, name) {
  return `which|${screenKey}|${looseKey(name)}`;
}

/**
 * Two items set up with the name a row gives: never picked by order. The director says which
 * one the row means (or that it is a new one, or to leave it out).
 */
function whichOne(read, screen, setup, answers) {
  const cards = [];
  const asked = new Map();
  read
    .filter((r) => usable(r) && !r.open && r.found && r.found.length > 1)
    .forEach((r) => {
      const name = r.found[0].Name;
      const id = whichKey(
        screen.key,
        r.program ? `${r.program.name}/${name}` : name
      );
      const answer = answers[id];
      if (!asked.has(id)) {
        asked.set(id, true);
        cards.push({
          id,
          title: `Which “${name}”?`,
          options: [
            ...r.found.map((rec) => ({
              value: rec.Id,
              label: describe(screen, rec, setup)
            })),
            { value: "new", label: `A new “${name}”` },
            { value: LEAVE_OUT, label: "Leave it out for now" }
          ],
          answer: answer || null,
          noMemory: true
        });
      }
      const chosen = r.found.find((rec) => rec.Id === answer);
      if (chosen) {
        r.existing = chosen;
      } else if (answer === LEAVE_OUT) {
        r.leftOut = true;
      } else if (answer === "new") {
        // A new one of that name, spelled as the items set up are.
        r.name = name;
        r.values.name = name;
        r.pickedNew = true;
      } else {
        r.open = true;
      }
    });
  return cards;
}

/** A few of a record's values, to tell two of the same name apart. */
function describe(screen, record, setup) {
  return screen.columns
    .filter((c) => c.key !== "name" && c.fromRecord)
    .slice(0, 3)
    .map(
      (c) =>
        `${c.heading}: ${cellText(c, c.fromRecord(record, setup), null) || "none"}`
    )
    .join(", ");
}

function checkNewLimits(read, screen) {
  const min = screen.columns.find((c) => c.key === "min");
  if (!min) {
    return;
  }
  read
    .filter((r) => !r.existing && !r.problems.length && !r.open)
    .forEach((r) => {
      const atLeast =
        typeof r.values.min === "number" ? r.values.min : min.newValue;
      if (typeof r.values.max === "number" && r.values.max < atLeast) {
        r.problems.push(`At most ${r.values.max} is below at least ${atLeast}`);
      }
    });
}

/** What a row's name is matched within: its program for a program's list, else the season. */
function scopeOf(row) {
  if (row.program) {
    return row.program.id;
  }
  // A row whose program is still asked about is matched with nothing until it is answered.
  return row.values.program ? `waiting|${row.rowNumber}` : "season";
}

/**
 * What makes two rows the same item: their scope and name, and for a group its division too
 * (a group is its program, division, and name: ADR 0006 §14).
 */
function itemKey(row) {
  const division =
    row.values.division !== undefined
      ? `|${looseKey(row.values.division)}`
      : "";
  return `${scopeOf(row)}${division}|${looseKey(row.name)}`;
}

/**
 * 5 and 6 o'clock without AM or PM: asked; "morning" moves the time to the morning. Then a
 * block that ends before it starts can't be read.
 */
function resolveAmpm(read, answers) {
  const asks = new Map();
  read.filter(usable).forEach((r) => {
    const unsure = Object.entries(r.unsure);
    if (!unsure.length) {
      return;
    }
    const id = ampmKey(r.values.program || "", r.name);
    asks.set(id, { name: r.name, texts: unsure.map(([, text]) => text) });
    const answer = answers[id];
    if (answer === LEAVE_OUT) {
      r.leftOut = true;
    } else if (answer === "morning") {
      unsure.forEach(([key]) => {
        if (r.values[key] >= HALF_DAY) {
          r.values[key] -= HALF_DAY;
        }
      });
    } else if (answer !== "evening") {
      r.open = true;
    }
  });
  // Not while it is asked: until then the time reads as evening.
  read
    .filter((r) => usable(r) && !r.open)
    .forEach((r) => {
      const { start, end } = r.values;
      if (
        typeof start === "number" &&
        typeof end === "number" &&
        end <= start
      ) {
        r.problems.push("End is before Start");
      }
    });
  return ampmCards(asks, answers);
}

/**
 * A days cell that can't be read without an answer, asked per item, never guessed: a lone "T"
 * (Tuesday or Thursday?), then a dash between two days ("T-Th": a range, or just those two?).
 */
function resolveDayAsks(read, answers) {
  const asks = { t: new Map(), dash: new Map() };
  const note = (kind, id, r, text, extra) => {
    const ask = asks[kind].get(id) || { names: [], texts: [] };
    // The days shown come from the first cell alphabetically, whatever the row order.
    const first = !ask.texts.length || text < ask.texts[0];
    asks[kind].set(id, {
      ...(first ? extra : { from: ask.from, to: ask.to }),
      names: [...ask.names, r.name],
      texts: [...new Set([...ask.texts, text])].sort()
    });
  };
  read.filter(usable).forEach((r) => {
    Object.entries(r.dayAsks).forEach(([key, text]) => {
      const program = r.values.program || "";
      const said = {};
      let reread = readDays(text, said);
      while (reread.ask && !r.leftOut && !r.open) {
        // A lone T first; then every dash still unsure, each its own question.
        const asked =
          reread.ask === "t"
            ? [{ kind: "t", id: tueThuKey(program, r.name), text }]
            : reread.dashes.map((d) => ({
                kind: "dash",
                id: dashKey(program, r.name, dashKeyOf(d.text)),
                text: d.text,
                from: d.from,
                to: d.to,
                key: dashKeyOf(d.text)
              }));
        asked.forEach((a) => {
          note(a.kind, a.id, r, a.text, { from: a.from, to: a.to });
          const answer = answers[a.id];
          const allowed =
            a.kind === "t" ? ["Tuesday", "Thursday"] : ["range", "list"];
          if (answer === LEAVE_OUT) {
            r.leftOut = true;
          } else if (!allowed.includes(answer)) {
            r.open = true;
          } else if (a.kind === "t") {
            said.t = answer;
          } else {
            said.dashes = { ...said.dashes, [a.key]: answer };
          }
        });
        if (!r.leftOut && !r.open) {
          reread = readDays(text, said);
        }
      }
      if (reread.problem) {
        r.problems.push(reread.problem);
      } else if (!reread.ask) {
        r.values[key] = reread.value;
      }
    });
  });
  [...asks.t.values(), ...asks.dash.values()].forEach((ask) => {
    ask.name = mostWritten(ask.names);
    ask.text = ask.texts.join(", ");
  });
  return [...tueThuCards(asks.t, answers), ...dashCards(asks.dash, answers)];
}

function programEntry(setup, programId) {
  return (setup.programs || []).find((e) => e.program.Id === programId);
}

/**
 * A program's division or time block the camp deleted on its setup screen (Greg, decision 45):
 * the rows naming it are left out, without asking when it is, until it is brought back.
 */
function leaveOutDeletedRefs(rows, column, context, deleted) {
  const { deletions, t } = context;
  const kind = column.ref === "division" ? "Division" : "TimeBlock";
  rows.filter(usable).forEach((r) => {
    const target = (r.targets || {})[column.key];
    const gone =
      target && target.add
        ? deletedAs(deletions, kind, r.program.name, target.add)
        : null;
    if (gone) {
      r.leftOut = true;
      r.reason = `its ${t.sIn(kind)} was deleted before; not brought back`;
      if (!deleted.some((d) => d.key === gone)) {
        deleted.push({
          key: gone,
          kind,
          name: target.add,
          program: r.program.name
        });
      }
    }
  });
}

/**
 * A program's divisions or time blocks a row names, resolved within the row's program
 * (refs.js); a division it doesn't have is added; a time block is added once the director says
 * when it is (adds.js). One the camp deleted is not (leaveOutDeletedRefs). Returns { pairs,
 * cards, blocks: [{ programId, name, start, end }], deleted }.
 */
function resolveProgramRefs(leads, used, setup, context, kinds) {
  const { answers, t } = context;
  const result = { pairs: [], cards: [], blocks: [], deleted: [] };
  used
    .filter(({ column }) => kinds.includes(column.ref))
    .forEach(({ column }) => {
      const rows = leads.filter((r) => usable(r) && r.program);
      [...new Set(rows.map(scopeOf))].sort().forEach((scope) => {
        const entry = programEntry(setup, scope);
        const records = !entry
          ? []
          : column.ref === "division"
            ? (entry.divisions || []).map((d) => d.division)
            : entry.timeBlocks || [];
        result.pairs.push(
          ...resolveColumn(
            rows.filter((r) => scopeOf(r) === scope),
            column,
            records,
            null,
            answers,
            PAIR_KIND[column.ref]
          )
        );
      });
      leaveOutDeletedRefs(rows, column, context, result.deleted);
      if (column.ref !== "timeBlock") {
        return;
      }
      const asks = new Map();
      const rowsOf = new Map();
      rows.filter(usable).forEach((r) => {
        const target = (r.targets || {})[column.key];
        if (target && target.add) {
          const id = blockAddKey(r.program.name, target.add);
          asks.set(id, { program: r.program, name: target.add });
          rowsOf.set(id, [...(rowsOf.get(id) || []), r]);
        }
      });
      const blocks = unknownBlocks(asks, answers, t);
      result.cards.push(...blocks.cards);
      result.blocks.push(...blocks.adds);
      rowsOf.forEach((waiting, id) => {
        waiting.forEach((r) => {
          if (blocks.leftOut.has(id)) {
            r.leftOut = true;
          } else if (blocks.open.has(id)) {
            r.open = true;
          }
        });
      });
    });
  return result;
}

/** The programs a who list can name: all of them, or the given ones. */
function whoPrograms(setup, programIds) {
  return (setup.programs || [])
    .filter((e) => !programIds || programIds.includes(e.program.Id))
    .map((e) => ({
      id: e.program.Id,
      name: e.program.Name,
      divisions: (e.divisions || []).map((d) => ({
        id: d.division.Id,
        name: d.division.Name
      }))
    }));
}

/**
 * Who lists: "Who can do it" names any division or group of the season; a recurring activity's
 * "Who" only its own program's. Names that are nothing are asked about, then resolved.
 */
function resolveAllWho(leads, used, screen, setup, answers, t, allTargets) {
  const found = used.find(({ column }) => column.type === "list");
  if (!found) {
    return { cards: [], adds: [] };
  }
  const rows = leads.filter(
    (r) => usable(r) && Array.isArray(r.values.who) && r.values.who.length
  );
  let buckets;
  if (screen.scope === "program") {
    const withProgram = rows.filter((r) => r.program);
    buckets = [...new Set(withProgram.map(scopeOf))].sort().map((scope) => {
      const inScope = withProgram.filter((r) => scopeOf(r) === scope);
      const program = inScope[0].program;
      const entry = programEntry(setup, scope);
      return {
        rows: inScope,
        targets: whoTargets({ programs: entry ? [entry] : [] }),
        programs: entry
          ? whoPrograms(setup, [scope])
          : [{ id: program.id, name: program.name, divisions: [] }],
        program: program.name
      };
    });
  } else {
    buckets = [
      { rows, targets: whoTargets(setup), programs: whoPrograms(setup, null) }
    ];
  }
  const adds = unknownWho(buckets, answers, t);
  buckets.forEach((bucket, index) => {
    bucket.rows.forEach((r) => {
      const marks = r.values.who.map((name) => `${index}|${looseKey(name)}`);
      if (marks.some((m) => adds.leftOut.has(m))) {
        r.leftOut = true;
      } else if (marks.some((m) => adds.open.has(m))) {
        r.open = true;
      } else {
        const resolved = resolveWho(r.values.who, bucket.targets);
        if (resolved.problem) {
          r.problems.push(`${found.column.heading}: ${resolved.problem}`);
        } else {
          r.values.who = resolved.ids;
        }
      }
    });
    bucket.targets.byId.forEach((target, id) =>
      allTargets.byId.set(id, target)
    );
  });
  return adds;
}

/**
 * A blank cell for a value an item can't be without (Greg, 2026-10-17): a new item starts as one
 * added by hand does, tagged "starting value"; an item set up can't be cleared, so its row can't
 * be read ("Length is blank").
 */
function settleBlanks(rows) {
  rows
    .filter((r) => usable(r) && !r.open && r.requiredBlanks.length)
    .forEach((r) => {
      if (r.existing) {
        r.requiredBlanks.forEach((column) => {
          r.problems.push(`${column.heading} is blank`);
        });
      } else {
        r.startingValues = r.requiredBlanks.map((column) => column.heading);
      }
    });
}

/**
 * The first row of each name (capitals and spacing aside) leads, even if it can't be read; the
 * rows after it with that name repeat it and follow it, never saved on their own.
 */
function settleLeads(read, screen, used, answers, records) {
  // Two set up whose names differ only in capitals ("Swim", "swim") are two items: a row
  // spelled exactly as one of them is that one, never a repeat of the other.
  const spellingsOf = new Map();
  records.forEach((rec) => {
    const key = looseKey(rec.Name);
    spellingsOf.set(
      key,
      new Set([...(spellingsOf.get(key) || []), tidy(rec.Name)])
    );
  });
  const exact = new Set(
    [...spellingsOf.values()]
      .filter((names) => names.size > 1)
      .flatMap((names) => [...names])
  );
  const groups = new Map();
  read
    .filter((r) => r.name)
    .forEach((r) => {
      const key = exact.has(r.name) ? `${itemKey(r)}|=${r.name}` : itemKey(r);
      groups.set(key, [...(groups.get(key) || []), r]);
    });
  const cards = [];
  groups.forEach((rows, key) => {
    const spellings = rows.map((r) => r.name);
    // A row that can't be read leads, whatever the order: the item waits on it, never saved
    // from the other rows (PR 19 review, 5c).
    const broken = rows.find((r) => r.problems.length);
    let lead = broken || rows[0];
    // Compared once every row's own questions are answered (a lone T, 5 or 6 o'clock).
    const differ =
      broken || rows.some((r) => r.open) ? null : differingRows(rows, used);
    if (differ) {
      const id = `rowsDiffer|${screen.key}|${key}`;
      const answer = answers[id];
      cards.push({
        id,
        title: `Rows for “${mostWritten(spellings)}” differ`,
        options: [
          ...differ.map((variant) => ({
            value: `row:${variant.row.rowNumber}`,
            label: `Row ${variant.row.rowNumber}: ${variant.label}`
          })),
          { value: LEAVE_OUT, label: "Leave it out for now" }
        ],
        answer: answer || null,
        noMemory: true
      });
      const chosen = rows.find((r) => `row:${r.rowNumber}` === answer);
      if (chosen) {
        lead = chosen;
        rows
          .filter(
            (r) =>
              r !== chosen &&
              differ.some(
                (v) => v.members.includes(r) && !v.members.includes(chosen)
              )
          )
          .forEach((r) => {
            r.notChosen = true;
          });
      } else if (answer === LEAVE_OUT) {
        rows.forEach((r) => {
          r.leftOut = true;
        });
      } else {
        rows.forEach((r) => {
          r.open = true;
        });
      }
    }
    lead.spellings = spellings;
    // Who names as every row agreeing with the lead writes them, for one spelling per name.
    lead.whoWritten = rows
      .filter((r) => !r.notChosen && Array.isArray(r.values.who))
      .flatMap((r) => r.values.who);
    rows
      .filter((r) => r !== lead)
      .forEach((r) => {
        r.repeatOf = lead;
      });
  });
  return {
    leads: read.filter((r) => r.name && !r.repeatOf),
    cards
  };
}

/**
 * Rows for one item whose details differ (coordinator, after #20's review: as Import last year
 * asks when files disagree, never the first row winning): the variants, each with the row
 * that first gives it and what differs, or null when they agree (then they are repeats).
 */
function differingRows(rows, used) {
  const readable = rows.filter((r) => !r.problems.length);
  if (readable.length < 2) {
    return null;
  }
  const columns = used
    .map(({ column }) => column)
    .filter((c) => c.key !== "name" && !c.scope);
  const valueOf = (r, c) => {
    if (r.blanks.has(c.key) || (r.requiredBlanks || []).includes(c)) {
      return "";
    }
    const v = r.values[c.key];
    if (Array.isArray(v)) {
      return v
        .map((x) => looseKey(String(x)))
        .sort()
        .join(",");
    }
    return typeof v === "string" ? looseKey(v) : JSON.stringify(v ?? "");
  };
  const variants = new Map();
  readable.forEach((r) => {
    const key = columns.map((c) => valueOf(r, c)).join("\u0000");
    variants.set(key, [...(variants.get(key) || []), r]);
  });
  if (variants.size < 2) {
    return null;
  }
  const differing = columns.filter(
    (c) => new Set(readable.map((r) => valueOf(r, c))).size > 1
  );
  return [...variants.values()].map((members) => ({
    row: members[0],
    members,
    label: differing
      .map((c) => {
        const v = members[0].values[c.key];
        // Who names are still as written here, not yet records.
        const text =
          c.type === "list"
            ? (v || []).join(", ") || "Everyone"
            : cellText(c, v, null);
        return text === "" || text === undefined
          ? "none"
          : String(Array.isArray(v) ? v.join(", ") : text);
      })
      .join(" · ")
  }));
}

/**
 * Last, every repeat takes its lead's outcome: waiting with it, left out with it, or not saved
 * ("Same as row 2"); and two rows standing for one item set up keep only the first.
 */
function finishRepeats(read) {
  read
    .filter((r) => r.repeatOf && !r.problems.length)
    .forEach((r) => {
      const lead = r.repeatOf;
      if (r.notChosen) {
        // The director chose another row for this item.
        r.leftOut = true;
        r.usedRow = lead.rowNumber;
      } else if (lead.problems.length) {
        r.problems.push(`Same as row ${lead.rowNumber}, which can't be read`);
      } else if (lead.leftOut) {
        r.leftOut = true;
        r.sameAs = lead.sameAs || lead.name;
      } else if (lead.open) {
        r.open = true;
      } else {
        r.problems.push(`Same as row ${lead.rowNumber}`);
      }
    });
  const taken = new Map();
  read
    .filter((r) => !r.repeatOf && usable(r) && !r.open && r.existing)
    .forEach((r) => {
      if (taken.has(r.existing.Id)) {
        r.problems.push(`Same as row ${taken.get(r.existing.Id)}`);
      } else {
        taken.set(r.existing.Id, r.rowNumber);
      }
    });
}

/**
 * Rain plans: resolved after everything else about the rows is settled (so a plan never names
 * a row that won't be saved), and again until nothing changes (a row waiting on a question
 * makes the rows naming it wait too). A plan naming nothing is added as by hand; untick it
 * (answer "skip") and the rows naming it are saved without it (Greg, 2026-10-17).
 */
function resolveRainPlans(read, leads, column, setup, answers) {
  // Questions from every pass: an answer that leaves its row out still shows (and can change).
  const pairs = new Map();
  for (let pass = 0; pass <= leads.length; pass++) {
    const before = leads.filter((r) => r.open || !usable(r)).length;
    resolveColumn(
      leads,
      column,
      setup.activities || [],
      leads,
      answers,
      "activity"
    ).forEach((pair) => pairs.set(pair.id, pair));
    // Resolved, a plan may turn out to be its own row ("Tenis" answered the same as "Tennis").
    leads.filter(usable).forEach((r) => {
      const target = (r.targets || {})[column.key];
      const own = r.existing
        ? target && target.id === r.existing.Id
        : target && target.key === `Activity:${r.name}`;
      if (own) {
        r.problems.push(`${column.heading}: can't be itself`);
      }
    });
    if (leads.filter((r) => r.open || !usable(r)).length === before) {
      break;
    }
  }
  refuseOutdoorRainPlans(leads, column, setup);
  const added = new Set();
  leads.filter(usable).forEach((r) => {
    const target = (r.targets || {})[column.key];
    if (target && target.add) {
      added.add(target.add);
    }
  });
  const adds = unknownRainPlans(added, answers);
  leads.filter(usable).forEach((r) => {
    const target = (r.targets || {})[column.key];
    if (target && target.add && adds.skipped.has(target.add)) {
      // Saved without it: as if the file said nothing about its rain plan.
      delete r.values[column.key];
      r.droppedPlan = target.add;
    }
  });
  return {
    pairs: [...pairs.values()].sort((x, y) => x.id.localeCompare(y.id)),
    adds: adds.adds
  };
}

/**
 * A rain plan has to be indoors (desktop ActivitiesScreen.jsx save(); ActivityTriggerHandler
 * refuses the save otherwise): a row whose rain plan would be outdoors after the import, as the
 * file says or as it is now, can't be saved, and says so before anything is.
 */
function refuseOutdoorRainPlans(leads, column, setup) {
  const outdoors = (target) => {
    if (!target || target.add) {
      // Added the way a hand-added activity is: indoors.
      return false;
    }
    const isTarget = (r) => {
      if (target.id) {
        return !!r.existing && r.existing.Id === target.id;
      }
      return target.key === `Activity:${r.name}`;
    };
    const row = leads.find(isTarget);
    if (row && "outdoors" in row.values) {
      return !!row.values.outdoors;
    }
    const saved = (setup.activities || []).find((a) => a.Id === target.id);
    return !!(saved && saved[FIELD.Activity.Outdoor]);
  };
  leads.filter(usable).forEach((r) => {
    const fromFile = (r.targets || {})[column.key];
    const kept =
      !(column.key in r.values) && r.existing && r.existing[column.refField]
        ? { id: r.existing[column.refField] }
        : null;
    if (outdoors(fromFile || kept)) {
      r.problems.push(`${column.heading}: has to be indoors`);
    }
  });
}

/**
 * Reads one list for one screen. input: { screenKey, file, sheet (chosen, optional), setup,
 * terms, answers }. Returns the sheet used, the headings and their columns, every row with what
 * happens to it, the questions, and what will also be added. Rows are settled first (cells,
 * repeats, names, questions), then the names they refer to (refs.js), rain plans last.
 */
export function listProposal(input) {
  const t = input.terms;
  const answers = input.answers || {};
  const setup = input.setup || {};
  const screen = listScreen(input.screenKey, t);
  const sheetName = input.sheet || pickSheet(input.file, screen, t);
  const base = { screen, sheets: sheetChoices(input.file), sheet: sheetName };
  if (!sheetName) {
    return { ...base, empty: true };
  }
  const sheet = input.file.sheets.find((s) => s.name === sheetName);
  const rows = (sheet && sheet.rows) || [];
  const at = headingRowIndex(rows);
  if (at < 0) {
    return { ...base, empty: true };
  }
  const mapping = mapHeadings(rows[at], screen, answers);
  const result = {
    ...base,
    mapping,
    rows: [],
    pairs: [],
    cards: [],
    alsoAdd: {}
  };
  if (mapping.missing.length || mapping.doubled.length) {
    return { ...result, blocked: true };
  }
  const used = usedColumns(screen, mapping);
  const read = readRows(rows, at + 1, used);
  const deletions = {
    gone: deletionsIn(answers),
    back: deletionsIn(answers, BRING_BACK)
  };
  const programs = resolvePrograms(
    read,
    screen,
    setup,
    answers,
    t,
    deletions.gone
  );
  result.pairs.push(...programs.pairs);
  result.cards.push(...programs.cards);
  // Asked per block once its program is settled (the key is the program as resolved).
  result.cards.push(...resolveAmpm(read, answers));
  result.cards.push(...resolveDayAsks(read, answers));
  // A group's division is resolved before rows are settled: a group is its program,
  // division, and name, by the division it resolves to, not as written.
  const divisions = resolveProgramRefs(
    read,
    used,
    setup,
    { answers, t, deletions: deletions.gone },
    ["division"]
  );
  result.pairs.push(...divisions.pairs);
  const settled = settleLeads(
    read,
    screen,
    used,
    answers,
    screen.records(setup)
  );
  const leads = settled.leads;
  result.cards.push(...settled.cards);
  result.pairs.push(...matchNames(leads, screen, setup, answers));
  result.cards.push(...whichOne(leads, screen, setup, answers));
  used
    .filter(
      ({ column }) => column.ref === "location" || column.ref === "locationType"
    )
    .forEach(({ column }) => {
      result.pairs.push(
        ...resolveColumn(
          leads,
          column,
          (column.ref === "location" ? setup.locations : setup.locationTypes) ||
            [],
          null,
          answers,
          PAIR_KIND[column.ref]
        )
      );
    });
  const deletedPlaces = leaveOutDeletedPlaces(leads, used, deletions.gone);
  const programRefs = resolveProgramRefs(
    leads,
    used,
    setup,
    { answers, t, deletions: deletions.gone },
    ["timeBlock"]
  );
  result.pairs.push(...programRefs.pairs);
  result.cards.push(...programRefs.cards);
  const targets = whoTargets(setup);
  const whoAdds = resolveAllWho(
    leads,
    used,
    screen,
    setup,
    answers,
    t,
    targets
  );
  result.cards.push(...whoAdds.cards);
  const days =
    screen.kind === "RecurringActivity"
      ? resolveProgramDays(leads, answers)
      : { cards: [], added: new Map() };
  result.cards.push(...days.cards);
  settleBlanks(leads);
  checkNewLimits(leads, screen);
  const rain = used.find(({ column }) => column.ref === "activity");
  const rainPlans = rain
    ? resolveRainPlans(read, leads, rain.column, setup, answers)
    : { pairs: [], adds: [] };
  // With no rain plan column, a row still saves its activity with the rain plan it has.
  const rainColumn = (screen.columns || []).find((c) => c.ref === "activity");
  if (!rain && rainColumn) {
    refuseOutdoorRainPlans(leads, rainColumn, setup);
  }
  result.pairs.push(...rainPlans.pairs);
  finishRepeats(read);
  result.rows = read.map((r) =>
    describeRow(r, used, screen, setup, answers, deletions)
  );
  result.targets = targets;
  result.setupActivities = setup.activities || [];
  result.setup = setup;
  result.knownKeys = input.knownKeys || [];
  result.alsoAdd = alsoAdded(result.rows, used, {
    rain: rainPlans.adds,
    who: whoAdds.adds,
    programs: programs.adds,
    blocks: programRefs.blocks,
    days: days.added
  });
  result.deleted = deletedOfList(result, [
    ...deletedPlaces,
    ...programs.deleted,
    ...divisions.deleted,
    ...programRefs.deleted
  ]);
  result.broughtBack = broughtBackAdds(result, deletions);
  return result;
}

/**
 * What saving would add because rows name it (Greg, #4): only what a row that will be saved
 * uses (a new row, or a difference answered Change).
 */
function alsoAdded(rows, used, asked) {
  const alsoAdd = {};
  const uses = (key) => rows.filter((row) => usesValue(row, key));
  const addedNames = (key) => {
    return uses(key)
      .map((row) => ({ row, target: (row.targets || {})[key] }))
      .filter(({ target }) => target && target.add);
  };
  used
    .filter(
      ({ column }) => column.ref === "location" || column.ref === "locationType"
    )
    .forEach(({ column }) => {
      alsoAdd[column.ref] = [
        ...new Set(addedNames(column.key).map(({ target }) => target.add))
      ].sort((x, y) => x.localeCompare(y));
    });
  // A program's divisions and time blocks: per program.
  const perProgram = (key) => {
    const seen = new Map();
    addedNames(key).forEach(({ row, target }) => {
      seen.set(`${row.programId}|${target.add}`, {
        programId: row.programId,
        name: target.add
      });
    });
    return [...seen.values()];
  };
  alsoAdd.division = perProgram("division");
  alsoAdd.timeBlock = asked.blocks.filter((b) =>
    perProgram("timeBlock").some(
      (u) => u.programId === b.programId && u.name === b.name
    )
  );
  const saving = rows.filter(
    (r) => r.status === "new" || r.status === "changed"
  );
  alsoAdd.program = asked.programs.filter((p) =>
    saving.some((r) => r.programId === `Program:${p.name}`)
  );
  alsoAdd.programDays = [...asked.days.entries()]
    .map(([programId, added]) => ({ programId, days: added }))
    .filter((d) => uses("days").some((row) => row.programId === d.programId));
  // Rain plans to add, ticked (or unticked: skipped), for the rows that will be saved.
  alsoAdd.activity = asked.rain.filter((add) =>
    rows.some(
      (row) =>
        (usesValue(row, "rainPlan") &&
          ((row.targets || {}).rainPlan || {}).add === add.name) ||
        (row.droppedPlan === add.name &&
          ["new", "changed", "unchanged"].includes(row.status))
    )
  );
  alsoAdd.who = asked.who.filter((add) =>
    uses("who").some(
      (row) => Array.isArray(row.values.who) && row.values.who.includes(add.key)
    )
  );
  return alsoAdd;
}

const ADD_KIND = { location: "Location", locationType: "LocationType" };

/**
 * Places and kinds of place a row names that the camp deleted before (Greg, decision 45) are
 * not added with the list: the row is saved without it, as if the file said nothing about its
 * place (a row the camp has keeps the place it has), as Import last year saves a placement
 * without a place it no longer offers. Returns them, once each, to be listed with Bring back.
 */
function leaveOutDeletedPlaces(leads, used, gone) {
  const deleted = new Map();
  used
    .filter(({ column }) => ADD_KIND[column.ref])
    .forEach(({ column }) => {
      const kind = ADD_KIND[column.ref];
      leads.filter(usable).forEach((r) => {
        const target = (r.targets || {})[column.key];
        const key =
          target && target.add && deletedAs(gone, kind, "", target.add);
        if (key) {
          delete r.values[column.key];
          delete r.targets[column.key];
          r.droppedPlace = { kind, name: target.add };
          deleted.set(key, { key, kind, name: target.add, program: "" });
        }
      });
    });
  return [...deleted.values()].sort((x, y) => x.name.localeCompare(y.name));
}

/**
 * What the list leaves out because the camp deleted it before: its own rows marked "deleted",
 * then places, programs, divisions and time blocks its rows name (resolvePrograms,
 * leaveOutDeletedRefs, leaveOutDeletedPlaces): [{ key, kind, name, program }].
 */
function deletedOfList(result, deletedRefs) {
  const deleted = result.rows
    .filter((row) => row.status === "deleted")
    .map((row) => ({
      key: row.deletedKey,
      kind: result.screen.kind,
      name: row.name,
      program: result.screen.scope === "program" ? row.programName || "" : ""
    }));
  deleted.push(...deletedRefs);
  return deleted;
}

/** The program's name for a program id: an Id of the camp's, or "Program:<name>" for one added. */
function programNameOf(setup, programId) {
  const entry = programEntry(setup, programId);
  if (entry) {
    return entry.program.Name;
  }
  return String(programId || "").replace(/^Program:/, "");
}

/**
 * Deletions this list's save forgets: rows, added places, programs, divisions and time blocks
 * that were brought back.
 */
function broughtBackAdds(result, deletions) {
  const keys = result.rows
    .filter((row) => row.status === "new" && row.broughtBack)
    .map((row) => row.broughtBack);
  const add = result.alsoAdd;
  const back = (kind, program, name) => {
    const key = deletedAs(deletions.back, kind, program, name);
    if (key) {
      keys.push(key);
    }
  };
  (add.program || []).forEach((p) => {
    const key = deletedAs(deletions.back, "Program", "", p.name);
    if (key) {
      // With the groups remembered with it (Import last year's, deleted.js deletedPrograms).
      keys.push(key, ...programGroupKeys(deletions.gone, p.name));
    }
  });
  (add.division || []).forEach((d) =>
    back("Division", programNameOf(result.setup, d.programId), d.name)
  );
  (add.timeBlock || []).forEach((b) =>
    back("TimeBlock", programNameOf(result.setup, b.programId), b.name)
  );
  Object.keys(ADD_KIND).forEach((ref) => {
    (result.alsoAdd[ref] || []).forEach((name) => {
      const key = deletedAs(deletions.back, ADD_KIND[ref], "", name);
      if (key) {
        keys.push(key);
      }
    });
  });
  return [...new Set(keys)].sort();
}

/** Whether a row will save its value for a column: a new row, or a difference answered Change. */
function usesValue(row, key) {
  return (
    row.status === "new" ||
    (row.status === "changed" &&
      row.differences.some((d) => d.column === key && d.answer === CHANGE))
  );
}

export function newValueOf(column, row) {
  if (column.key in row.values) {
    return row.values[column.key];
  }
  if (column.newValue === undefined) {
    return blankValue(column);
  }
  return typeof column.newValue === "function"
    ? column.newValue(row.values)
    : column.newValue;
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Whether a row's value differs from the item's. A name of another record is compared by what
 * it points at, not its spelling: a new "Archery" is not the "Archery" set up.
 */
function differs(column, r, from, to) {
  const target = column.refField && (r.targets || {})[column.key];
  if (target && to) {
    // Only an item set up can be the one the record already points at.
    const now = column.fromId
      ? column.fromId(r.existing)
      : r.existing[column.refField];
    return !target.id || target.id !== now;
  }
  return !same(normal(column, from), normal(column, to));
}

/**
 * An item the camp deleted on its setup screen before (Greg, decision 45): the remembered key
 * when this new row would add it again, and the key when it was brought back in this import.
 */
function deletedRow(r, screen, deletions) {
  const scope = screen.scope === "program" && r.program ? r.program.name : "";
  return {
    gone: deletedAs(deletions.gone, screen.kind, scope, r.name),
    back: deletedAs(deletions.back, screen.kind, scope, r.name)
  };
}

function describeRow(r, used, screen, setup, answers, deletions) {
  const row = {
    rowNumber: r.rowNumber,
    name: r.name,
    values: r.values,
    problems: r.problems,
    sameAs: r.sameAs || null,
    usedRow: r.usedRow || null,
    droppedPlan: r.droppedPlan || null,
    droppedPlace: r.droppedPlace || null,
    startingValues: r.startingValues || [],
    targets: r.targets || {},
    programId: r.program ? r.program.id : null,
    programName: r.program ? r.program.name : null
  };
  if (r.problems.length) {
    return { ...row, status: "unreadable" };
  }
  if (r.leftOut) {
    return {
      ...row,
      status: "leftOut",
      ...(r.reason ? { reason: r.reason } : {})
    };
  }
  if (r.open) {
    return { ...row, status: "asked" };
  }
  if (!r.existing) {
    const deleted = deletedRow(r, screen, deletions);
    if (deleted.gone) {
      // Left out until brought back: never added again silently.
      return { ...row, status: "deleted", deletedKey: deleted.gone };
    }
    const values = {};
    screen.columns.forEach((column) => {
      values[column.key] = newValueOf(column, r);
    });
    return {
      ...row,
      status: "new",
      values,
      ...(deleted.back ? { broughtBack: deleted.back } : {})
    };
  }
  const differences = [];
  used.forEach(({ column }) => {
    if (column.key === "name" || column.scope) {
      return;
    }
    const blank = r.blanks.has(column.key);
    if (!blank && !(column.key in r.values)) {
      // Not in this row (a rain plan left unticked): nothing to compare.
      return;
    }
    // A blank clears an item set up: to none, or to "no maximum" or "no limit".
    const to = blank
      ? (column.blankMeans ?? blankValue(column))
      : r.values[column.key];
    const from = column.fromRecord(r.existing, setup);
    if (!differs(column, r, from, to)) {
      return;
    }
    const id = changeKey(
      screen.key,
      r.program ? `${r.program.name}/${r.existing.Name}` : r.existing.Name,
      column.key,
      to
    );
    differences.push({
      id,
      column: column.key,
      heading: column.heading,
      from,
      to,
      clears: isEmpty(column, to) && !isEmpty(column, from),
      answer: answers[id] || null
    });
  });
  return {
    ...row,
    id: r.existing.Id,
    existingName: r.existing.Name,
    record: r.existing,
    status: differences.length ? "changed" : "unchanged",
    differences
  };
}

/** Whether a value is "nothing": none, No, no maximum or limit, or everyone (no list). */
function isEmpty(column, value) {
  if (column.type === "list") {
    return !value || value.length === 0;
  }
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    value === false ||
    value === NONE
  );
}

function normal(column, value) {
  if (column.type === "list" || column.type === "days") {
    return [...(value || [])].sort();
  }
  if (column.type === "yesNo") {
    return !!value;
  }
  if (column.type === "early") {
    return value ? { count: Number(value.count), day: value.day } : null;
  }
  if (typeof value === "number" || column.type === "whole") {
    return value === null || value === undefined ? null : Number(value);
  }
  if (column.type === "wholeOrNone") {
    return value === NONE || value === null || value === undefined
      ? (value ?? null)
      : Number(value);
  }
  return value === "" ? null : (value ?? null);
}

export { cellText };
