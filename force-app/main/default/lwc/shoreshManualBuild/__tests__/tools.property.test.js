/**
 * The promise behind a day or week tool meeting someone else's change (ADR 0008 §24), over
 * generated weeks: a random Clear or Copy, random changes by someone else before it saves and
 * between rounds, up to three rounds of Keep theirs (the tool worked out again, tools.js replan)
 * or Use yours, and an edit of the director's own still waiting to save.
 *
 *   - nothing kept in any round is overwritten, so nothing someone else changed is, unless the
 *     director answered Use yours;
 *   - the tool changes only cells it meant to, to what it meant;
 *   - Undo (the runs backwards) puts the saved week back exactly;
 *   - "except N" is the number of cells the tool meant to change that don't hold what it meant;
 *   - the director's own waiting edit never counts as someone else's.
 *
 * The server is modelled here as SlotSaves takes runs: each run's slots must still hold what it
 * says they held, or nothing of the edit is made. Seeded (mulberry32), so every run is the same.
 */
import { cellKey, replan, resultOf, slotAt, toolRuns } from "../tools";
import { slots } from "../slotEdits";
import { inverse } from "../moves";

const DATES = ["2026-06-29", "2026-06-30", "2026-07-01"];
const GROUPS = [
  { id: "g1", name: "Bunk 1" },
  { id: "g2", name: "Bunk 2" },
  { id: "g3", name: "Bunk 3" }
];
const BLOCK_IDS = ["t1", "t2", "t3", "t4", "t5"];
const ACTIVITIES = ["A:a1", "A:a2", "A:a3"];
const SEEDS = Number(process.env.SEEDS || 2000);
const DEBUG = process.env.DEBUG_SEED ? Number(process.env.DEBUG_SEED) : 0;

// ---------- weeks from rows of identities ----------

function dayOf(date, rows) {
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
    blocks: BLOCK_IDS.map((id) => ({ id, name: id })),
    groups: GROUPS,
    items,
    rows: tokens
  };
}

const rowsOf = (day) => day.groups.map((_, g) => slots(day, g));
const weekOf = (rowsByDay) => DATES.map((date, d) => dayOf(date, rowsByDay[d]));
const rowsOfWeek = (week) => week.map(rowsOf);

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

/** A row of Open cells, a fixed activity, an elective, and activities one or two blocks long. */
function randomRow(rnd) {
  const row = [];
  while (row.length < BLOCK_IDS.length) {
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
      if (rnd() < 0.3 && row.length < BLOCK_IDS.length) {
        row.push(`^${a}`);
      }
    }
  }
  return row;
}

// ---------- the server, as SlotSaves takes runs ----------

/** Makes an edit's runs on rows if every run's slots still hold its `before`; else false. */
function save(rows, runs) {
  const fits = runs.every((run) =>
    run.before.every(
      (slot, i) => rows[run.day][run.group][run.first + i] === slot
    )
  );
  if (!fits) {
    return false;
  }
  runs.forEach((run) =>
    run.after.forEach((slot, i) => {
      rows[run.day][run.group][run.first + i] = slot;
    })
  );
  return true;
}

/** Use yours: the runs made over whatever is there now (the question listed it). */
function overwrite(rows, runs) {
  runs.forEach((run) =>
    run.after.forEach((slot, i) => {
      rows[run.day][run.group][run.first + i] = slot;
    })
  );
}

/**
 * Someone else changes a few single-block cells (never a fixed activity, never part of a longer
 * placement): to Open, or to an activity. Returns the keys changed.
 */
function othersChange(rnd, rows, count) {
  const changed = [];
  for (let n = 0; n < count; n++) {
    const d = int(rnd, DATES.length);
    const g = int(rnd, GROUPS.length);
    const b = int(rnd, BLOCK_IDS.length);
    const row = rows[d][g];
    const single =
      !row[b].startsWith("^") &&
      !row[b].startsWith("F:") &&
      !(row[b + 1] || "").startsWith("^");
    if (single) {
      row[b] = rnd() < 0.4 ? "" : pick(rnd, ACTIVITIES);
      changed.push(`${DATES[d]}|${GROUPS[g].id}|${BLOCK_IDS[b]}`);
    }
  }
  return changed;
}

/** Someone else puts one single-block cell they changed back as it was in `seen`. */
function revertOne(rnd, rows, seen, kept) {
  const seenRows = rowsOfWeek(seen);
  const candidates = [...kept].filter((key) => {
    const [date, groupId, blockId] = key.split("|");
    const d = DATES.indexOf(date);
    const g = GROUPS.findIndex((x) => x.id === groupId);
    const b = BLOCK_IDS.indexOf(blockId);
    const was = seenRows[d][g][b];
    const row = rows[d][g];
    const single = (slot, next) =>
      !slot.startsWith("^") &&
      !slot.startsWith("F:") &&
      !(next || "").startsWith("^");
    return (
      row[b] !== was &&
      single(row[b], row[b + 1]) &&
      single(was, seenRows[d][g][b + 1]) &&
      !(row[b + 1] || "").startsWith("^")
    );
  });
  if (candidates.length) {
    const [date, groupId, blockId] = pick(rnd, candidates).split("|");
    const d = DATES.indexOf(date);
    const g = GROUPS.findIndex((x) => x.id === groupId);
    const b = BLOCK_IDS.indexOf(blockId);
    rows[d][g][b] = seenRows[d][g][b];
  }
}

function randomTool(rnd) {
  const r = rnd();
  if (r < 0.25) {
    return { kind: "clear", dates: [pick(rnd, DATES)] };
  }
  if (r < 0.4) {
    return {
      kind: "clear",
      dates: [pick(rnd, DATES)],
      groupId: pick(rnd, GROUPS).id
    };
  }
  if (r < 0.55) {
    return { kind: "clear", dates: DATES };
  }
  const from = pick(rnd, DATES);
  const others = DATES.filter((d) => d !== from);
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
    for (let seed = DEBUG || 1; seed <= (DEBUG || SEEDS); seed++) {
      const rnd = random(seed);
      const seen = weekOf(DATES.map(() => GROUPS.map(() => randomRow(rnd))));
      const awayCells = new Set();
      for (let n = int(rnd, 3); n > 0; n--) {
        awayCells.add(
          `${pick(rnd, DATES)}|${pick(rnd, GROUPS).id}|${pick(rnd, BLOCK_IDS)}`
        );
      }
      const isAway = (week, d, g, b) => awayCells.has(cellKey(week[d], g, b));
      const tool = randomTool(rnd);
      const first = toolRuns(tool, seen, { isAway }).runs;
      const intended = resultOf(seen, first);
      const log = DEBUG ? (...a) => console.log(...a) : () => undefined;
      log(
        "tool",
        JSON.stringify(tool),
        "seen",
        JSON.stringify(rowsOfWeek(seen)),
        "first",
        JSON.stringify(first)
      );

      // The director's own edit after the tool, still waiting: never sent here.
      const mineKey = `${pick(rnd, DATES)}|${pick(rnd, GROUPS).id}|${pick(rnd, BLOCK_IDS)}`;

      const rows = rowsOfWeek(seen);
      othersChange(rnd, rows, int(rnd, 4));
      let runs = first;
      let kept = new Set();
      let missed = 0;
      let before = rows.map((day) => day.map((row) => [...row]));
      let usedYours = false;
      // Someone else changed more after the last re-plan (its count was right when it was said).
      let laterChange = false;
      let done = false;
      for (let round = 0; round < 4 && !done; round++) {
        before = rows.map((day) => day.map((row) => [...row]));
        log(
          "round",
          round,
          "rows",
          JSON.stringify(rows),
          "runs",
          JSON.stringify(runs)
        );
        if (save(rows, runs)) {
          done = true;
        } else if (round === 3) {
          break;
        } else if (rnd() < 0.2) {
          overwrite(rows, runs);
          usedYours = true;
          done = true;
        } else {
          // Keep theirs: worked out again on the server's week.
          const saved = weekOf(rows);
          const result = replan(tool, seen, saved, kept, isAway);
          check(
            seed,
            [...kept].every((key) => result.kept.has(key)),
            "a cell kept earlier is no longer kept"
          );
          const othersMine = slotAt(saved, mineKey) !== slotAt(seen, mineKey);
          const sourceTarget =
            tool.kind === "copy" && tool.dates.includes(mineKey.split("|")[0]);
          check(
            seed,
            othersMine || sourceTarget || !result.kept.has(mineKey),
            `the director's own cell ${mineKey} counted as someone else's`
          );
          kept = result.kept;
          runs = result.runs;
          missed = result.missed;
          laterChange = false;
          // Someone else may change more before this one saves.
          if (rnd() < 0.4) {
            laterChange = true;
            othersChange(rnd, rows, 1 + int(rnd, 2));
          }
          // Or puts a cell they changed back as the director saw it: still theirs, still kept.
          if (rnd() < 0.3) {
            laterChange = true;
            revertOne(rnd, rows, seen, kept);
          }
        }
      }
      if (!done) {
        // Never made: the week is as it was.
        check(seed, same(rows, before), "a tool never made changed the week");
      } else {
        const now = weekOf(rows);
        DATES.forEach((date, d) =>
          GROUPS.forEach((grp, g) =>
            BLOCK_IDS.forEach((blockId, b) => {
              const key = `${date}|${grp.id}|${blockId}`;
              const after = rows[d][g][b];
              const prior = before[d][g][b];
              check(
                seed,
                usedYours || !kept.has(key) || after === prior,
                `kept cell ${key} overwritten (${prior} -> ${after})`
              );
              check(
                seed,
                usedYours || after === prior || intended.get(key) === after,
                `cell ${key} changed to ${after}, not what the tool meant (${intended.get(key)})`
              );
            })
          )
        );
        const notAsMeant = [...intended.keys()].filter(
          (key) => slotAt(now, key) !== intended.get(key)
        ).length;
        check(
          seed,
          usedYours || laterChange || kept.size === 0 || missed === notAsMeant,
          `"except ${missed}" but ${notAsMeant} cells aren't as meant`
        );
        // Undo: the runs backwards put the saved week back exactly (Use yours is re-planned on
        // the server by conflicts.js, which its own property test covers).
        const undone = rows.map((day) => day.map((row) => [...row]));
        check(
          seed,
          usedYours || (save(undone, inverse(runs)) && same(undone, before)),
          "Undo didn't put the week back"
        );
      }
    }
    expect(broken).toEqual([]);
  });
});
