/**
 * The promise behind a day or week tool meeting someone else's change (ADR 0008 §24), over
 * generated weeks: a random Clear or Copy; others making, lengthening, shortening and clearing
 * placements (on the source and target days alike) and putting whole rows back, before the tool
 * saves and between rounds; up to four rounds of Keep theirs (the tool worked out again,
 * tools.js replan) or Use yours; and an edit of the director's own waiting behind the tool.
 *
 *   - nothing kept in any round is overwritten, so nothing someone else changed is, unless the
 *     director answered Use yours;
 *   - the tool changes only cells it meant to, to what it meant;
 *   - every placement is left whole;
 *   - Undo (the runs backwards) puts the saved week back exactly;
 *   - "except N" is the number of cells the tool meant to change that don't hold what it meant;
 *   - the director's own waiting edit is never someone else's, and saves after the tool when
 *     nobody else touched its cell.
 *
 * The server is modelled as SlotSaves takes an edit: every run's slots must still hold what it
 * says they held, a run may not start inside a placement, cells outside a run must still belong
 * to what they did, and no day may be left with a carry-on after an empty block
 * (ScheduleGridRules); otherwise nothing of the edit is made. Seeded (mulberry32).
 */
import { cellKey, placementAt, replan, resultOf, toolRuns } from "../tools";
import { slots } from "../slotEdits";
import { inverse } from "../moves";

const ALL_DATES = [
  "2026-06-29",
  "2026-06-30",
  "2026-07-01",
  "2026-07-02",
  "2026-07-03"
];
const GROUPS = [
  { id: "g1", name: "Bunk 1" },
  { id: "g2", name: "Bunk 2" },
  { id: "g3", name: "Bunk 3" }
];
const ACTIVITIES = ["A:a1", "A:a2", "A:a3"];
const SEEDS = 3000;

function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const int = (rnd, n) => Math.floor(rnd() * n);
const owner = (slot) => (slot.startsWith("^") ? slot.slice(1) : slot);

// ---------- weeks from rows of identities ----------

function dayOf(date, blockIds, rows) {
  const items = [];
  const tokens = rows.map((row) =>
    row
      .map((slot) => {
        if (slot === "") {
          return "";
        }
        if (slot.startsWith("^")) {
          return "^";
        }
        const [kind, id] = slot.split(":");
        let i = items.findIndex(
          (it) => it.kind === kind && (it.id === id || it.name === id)
        );
        if (i < 0) {
          items.push(
            kind === "E" ? { kind, id: null, name: id } : { kind, id, name: id }
          );
          i = items.length - 1;
        }
        return String(i + 1);
      })
      .join(",")
  );
  return {
    dateValue: date,
    problem: null,
    blocks: blockIds.map((id) => ({ id, name: id })),
    groups: GROUPS,
    items,
    rows: tokens
  };
}

const rowsOfWeek = (week) =>
  week.map((day) => day.groups.map((_, g) => slots(day, g)));
const copyRows = (rows) => rows.map((day) => day.map((row) => [...row]));

/** A row of Open cells, fixed activities, electives, and activities one to three blocks long. */
function randomRow(rnd, width) {
  const row = [];
  while (row.length < width) {
    const r = rnd();
    if (r < 0.3) {
      row.push("");
    } else if (r < 0.37) {
      row.push("F:f1");
    } else if (r < 0.42) {
      row.push("E:Chugim");
    } else {
      const a = pick(rnd, ACTIVITIES);
      row.push(a);
      for (let n = int(rnd, 3); n > 0 && row.length < width; n--) {
        row.push(`^${a}`);
      }
    }
  }
  return row;
}

/** Every placement whole: no carry-on at a row's start or after something else. */
function whole(rows) {
  return rows.every((day) =>
    day.every((row) =>
      row.every(
        (slot, b) =>
          !slot.startsWith("^") || (b > 0 && owner(row[b - 1]) === owner(slot))
      )
    )
  );
}

// ---------- someone else ----------

/** The activity placements of a row: { first, length, slot }. */
function placements(row) {
  const list = [];
  row.forEach((slot, b) => {
    if (slot.startsWith("A:")) {
      let length = 1;
      while (row[b + length] === `^${slot}`) {
        length++;
      }
      list.push({ first: b, length, slot });
    }
  });
  return list;
}

/** One change by someone else, keeping every placement whole. */
function othersMove(rnd, rows, seenRows) {
  const d = int(rnd, rows.length);
  const g = int(rnd, GROUPS.length);
  const row = rows[d][g];
  const r = rnd();
  const theirs = placements(row);
  if (r < 0.3) {
    // Makes a placement over Open cells.
    const b = int(rnd, row.length);
    if (row[b] === "") {
      const a = pick(rnd, ACTIVITIES);
      row[b] = a;
      const length = 1 + int(rnd, 3);
      for (let i = 1; i < length && row[b + i] === ""; i++) {
        row[b + i] = `^${a}`;
      }
    }
  } else if (r < 0.5 && theirs.length) {
    // Lengthens one into the Open cell after it.
    const p = pick(rnd, theirs);
    if (row[p.first + p.length] === "") {
      row[p.first + p.length] = `^${p.slot}`;
    }
  } else if (r < 0.7 && theirs.length) {
    // Shortens one.
    const p = pick(rnd, theirs);
    if (p.length > 1) {
      row[p.first + p.length - 1] = "";
    }
  } else if (r < 0.85 && theirs.length) {
    // Clears one.
    const p = pick(rnd, theirs);
    for (let i = 0; i < p.length; i++) {
      row[p.first + i] = "";
    }
  } else {
    // Puts the whole row back as the director saw it.
    rows[d][g] = [...seenRows[d][g]];
  }
}

// ---------- the server, as SlotSaves takes an edit ----------

/** Makes an edit's runs, all or nothing, as SlotSaves does. */
function save(rows, runs) {
  const next = copyRows(rows);
  for (const run of runs) {
    const row = next[run.day][run.group];
    const was = [...row];
    if (!run.before.every((slot, i) => row[run.first + i] === slot)) {
      return false;
    }
    // checkStartsClean: a run doesn't start inside a placement.
    if (was[run.first].startsWith("^")) {
      return false;
    }
    run.after.forEach((slot, i) => {
      row[run.first + i] = slot;
    });
    // neighboursKept: cells outside the run still belong to what they did.
    const inRun = (b) => b >= run.first && b < run.first + run.after.length;
    if (!row.every((slot, b) => inRun(b) || owner(slot) === owner(was[b]))) {
      return false;
    }
  }
  // ScheduleGridRules: a day whose grid has a carry-on after an empty block isn't saved (the
  // whole edit fails).
  if (!whole(next)) {
    return false;
  }
  next.forEach((day, d) =>
    day.forEach((row, g) => {
      rows[d][g] = row;
    })
  );
  return true;
}

function randomTool(rnd, dates) {
  const r = rnd();
  if (r < 0.25) {
    return { kind: "clear", dates: [pick(rnd, dates)] };
  }
  if (r < 0.4) {
    return {
      kind: "clear",
      dates: [pick(rnd, dates)],
      groupId: pick(rnd, GROUPS).id
    };
  }
  if (r < 0.55) {
    return { kind: "clear", dates };
  }
  const from = pick(rnd, dates);
  const others = dates.filter((d) => d !== from);
  return {
    kind: "copy",
    from,
    dates: rnd() < 0.5 ? others : [pick(rnd, others)]
  };
}

describe("a day or week tool and someone else's change (seeded)", () => {
  it(`keeps every promise over ${SEEDS} generated weeks`, () => {
    const broken = [];
    const check = (seed, ok, what) => {
      if (!ok && broken.length < 5) {
        broken.push(`seed ${seed}: ${what}`);
      }
    };
    const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rnd = random(seed);
      const dates = ALL_DATES.slice(0, 4 + int(rnd, 2));
      const width = 5 + int(rnd, 3);
      const blockIds = Array.from({ length: width }, (_, i) => `t${i + 1}`);
      const weekOf = (rowsByDay) =>
        dates.map((date, d) => dayOf(date, blockIds, rowsByDay[d]));
      const seen = weekOf(
        dates.map(() => GROUPS.map(() => randomRow(rnd, width)))
      );
      const seenRows = rowsOfWeek(seen);
      const awayCells = new Set();
      for (let n = int(rnd, 4); n > 0; n--) {
        awayCells.add(
          `${pick(rnd, dates)}|${pick(rnd, GROUPS).id}|${pick(rnd, blockIds)}`
        );
      }
      const isAway = (week, d, g, b) => awayCells.has(cellKey(week[d], g, b));
      const tool = randomTool(rnd, dates);
      const first = toolRuns(tool, seen, { isAway }).runs;
      const intended = resultOf(seen, first);

      // The director's own edit after the tool, waiting behind it: an Open cell (as the director
      // saw it after the tool) given an activity.
      const md = int(rnd, dates.length);
      const mg = int(rnd, GROUPS.length);
      const mb = int(rnd, width);
      const mineKey = `${dates[md]}|${GROUPS[mg].id}|${blockIds[mb]}`;
      const afterTool = copyRows(seenRows);
      first.forEach((run) =>
        run.after.forEach((slot, i) => {
          afterTool[run.day][run.group][run.first + i] = slot;
        })
      );
      const mineFits =
        afterTool[md][mg][mb] === "" &&
        !(afterTool[md][mg][mb + 1] || "").startsWith("^");
      const mineRun = {
        day: md,
        group: mg,
        first: mb,
        before: [""],
        after: ["A:a1"]
      };

      const rows = copyRows(seenRows);
      for (let n = int(rnd, 4); n > 0; n--) {
        othersMove(rnd, rows, seenRows);
      }
      let runs = first;
      let kept = new Set();
      let missed = 0;
      let before = copyRows(rows);
      let usedYours = false;
      let laterChange = false;
      let done = false;
      for (let round = 0; round < 5 && !done; round++) {
        before = copyRows(rows);
        if (save(rows, runs)) {
          done = true;
        } else if (round === 4) {
          break;
        } else if (rnd() < 0.15) {
          // Use yours is conflicts.js's plan, which its own property test covers.
          usedYours = true;
          done = true;
        } else {
          const saved = weekOf(rows);
          const result = replan(tool, seen, saved, kept, isAway);
          check(
            seed,
            [...kept].every((key) => result.kept.has(key)),
            "a cell kept earlier is no longer kept"
          );
          const othersMine =
            placementAt(saved, mineKey) !== placementAt(seen, mineKey);
          const copyTarget =
            tool.kind === "copy" && tool.dates.includes(dates[md]);
          check(
            seed,
            othersMine || copyTarget || !result.kept.has(mineKey),
            `the director's own cell ${mineKey} counted as someone else's`
          );
          kept = result.kept;
          runs = result.runs;
          missed = result.missed;
          laterChange = false;
          if (rnd() < 0.5) {
            laterChange = true;
            for (let n = 1 + int(rnd, 2); n > 0; n--) {
              othersMove(rnd, rows, seenRows);
            }
          }
        }
      }
      check(seed, whole(rows), "a placement left cut");
      if (!done || usedYours) {
        continue;
      }
      const now = weekOf(rows);
      dates.forEach((date, d) =>
        GROUPS.forEach((grp, g) =>
          blockIds.forEach((blockId, b) => {
            const key = `${date}|${grp.id}|${blockId}`;
            const after = rows[d][g][b];
            const prior = before[d][g][b];
            check(
              seed,
              !kept.has(key) || after === prior,
              `kept cell ${key} overwritten (${prior} -> ${after})`
            );
            check(
              seed,
              after === prior || intended.get(key) === after,
              `cell ${key} changed to ${after}, not what the tool meant (${intended.get(key)})`
            );
          })
        )
      );
      const notAsMeant = [...intended.keys()].filter((key) => {
        const [date, groupId, blockId] = key.split("|");
        const d = dates.indexOf(date);
        const g = GROUPS.findIndex((x) => x.id === groupId);
        const b = blockIds.indexOf(blockId);
        return rows[d][g][b] !== intended.get(key);
      }).length;
      check(
        seed,
        laterChange || kept.size === 0 || missed === notAsMeant,
        `"except ${missed}" but ${notAsMeant} cells aren't as meant`
      );
      // Undo: the runs backwards put the saved week back exactly.
      const undone = copyRows(rows);
      check(
        seed,
        save(undone, inverse(runs)) && same(undone, before),
        "Undo didn't put the week back"
      );
      // The director's own waiting edit saves after the tool when its cell is as the director
      // saw it after the tool.
      if (mineFits) {
        const asSeen =
          placementAt(now, mineKey) === placementAt(weekOf(afterTool), mineKey);
        check(
          seed,
          !asSeen || save(copyRows(rows), [mineRun]),
          `the director's own edit at ${mineKey} couldn't save after the tool`
        );
      }
    }
    expect(broken).toEqual([]);
  });
});
