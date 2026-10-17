import { intentOf, plan, withSeen } from "../conflicts";
import { diffRuns, editRun, slots } from "../slotEdits";
import { inverse, moveEdit, removeEdit, resizeEdit } from "../moves";

// ---------- a small made-up week, built from rows of slot identities ----------

const DATE = "2026-06-29";
const GROUPS = [
  { id: "g1", name: "Bunk 1" },
  { id: "g2", name: "Bunk 2" }
];
const ACTIVITIES = ["A:a1", "A:a2", "A:a3", "A:a4"];

/** A day from rows of identities ('' Open, 'A:a1', '^A:a1'). */
function dayOf(blocks, rows) {
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
        let i = items.findIndex((it) => `A:${it.id}` === slot);
        if (i < 0) {
          items.push({ kind: "A", id: slot.slice(2), name: slot.slice(2) });
          i = items.length - 1;
        }
        return String(i + 1);
      })
      .join(",")
  );
  return {
    dateValue: DATE,
    blocks: blocks.map((id) => ({ id, name: id })),
    groups: GROUPS,
    items,
    rows: tokens
  };
}

function rowsOf(day) {
  return day.groups.map((_, g) => slots(day, g));
}

/** Seeded random numbers (mulberry32), so every run of the test is the same. */
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

/** Rows with random single and two-block activities. */
function randomRows(rnd, width) {
  return GROUPS.map(() => {
    const row = [];
    while (row.length < width) {
      const r = rnd();
      if (r < 0.35) {
        row.push("");
      } else if (r < 0.75 || row.length === width - 1) {
        row.push(pick(rnd, ACTIVITIES));
      } else {
        const a = pick(rnd, ACTIVITIES);
        row.push(a, `^${a}`);
      }
    }
    return row;
  });
}

// ---------- the server: compare and set, as SlotSaves does ----------

let currentSeed = 0;

/** Makes runs on the server's day if every slot still holds what each run names. */
function serverApply(state, runs) {
  const rows = rowsOf(state.day);
  for (const run of runs) {
    const g = state.day.groups.findIndex((grp) => grp.id === run.groupId);
    const first = state.day.blocks.findIndex((b) => b.id === run.firstBlockId);
    if (g < 0 || first < 0 || first + run.before.length > rows[g].length) {
      return false;
    }
    if (run.before.some((slot, i) => rows[g][first + i] !== slot)) {
      return false;
    }
    if (rows[g][first].startsWith("^")) {
      return false;
    }
    const was = [...rows[g]];
    run.after.forEach((slot, i) => {
      rows[g][first + i] = slot;
    });
    // Slots outside the run keep what they belong to (SlotRules.neighboursKept), else a conflict.
    const owner = (slot) => (slot.startsWith("^") ? slot.slice(1) : slot);
    const kept = rows[g].every(
      (slot, b) =>
        (b >= first && b < first + run.after.length) ||
        owner(slot) === owner(was[b]) ||
        // A carry-on's owner is the start above it; compare by walking up.
        ownerAt(rows[g], b) === ownerAt(was, b)
    );
    if (!kept || rows[g].some((slot, b) => orphan(rows[g], b))) {
      return false;
    }
  }
  // No carry-on without what it carries on.
  rows.forEach((row) =>
    row.forEach((slot, b) => {
      if (slot.startsWith("^")) {
        if (!(row[b - 1] === slot.slice(1) || row[b - 1] === slot)) {
          throw new Error(
            `orphan at seed ${currentSeed}: ${JSON.stringify(rows)} runs ${JSON.stringify(runs)}`
          );
        }
      }
    })
  );
  state.day = dayOf(
    state.day.blocks.map((b) => b.id),
    rows
  );
  return true;
}

/** What a slot belongs to: the start above a carry-on, walking up. */
function ownerAt(row, b) {
  let first = b;
  while (first > 0 && row[first].startsWith("^")) {
    first -= 1;
  }
  return row[first].startsWith("^") ? "" : row[first];
}

function orphan(row, b) {
  const slot = row[b];
  return (
    slot.startsWith("^") &&
    (b === 0 || (row[b - 1] !== slot.slice(1) && row[b - 1] !== slot))
  );
}

let blockSeq = 100;

/** Someone else's change: a different activity in a cell, a placement cleared, or a new block. */
function otherChange(rnd, state, near) {
  const rows = rowsOf(state.day);
  const blocks = state.day.blocks.map((b) => b.id);
  let g = int(rnd, rows.length);
  let b = int(rnd, blocks.length);
  // Aimed at a cell an edit is about to change (so a second question really happens).
  if (near && near.length) {
    const run = pick(rnd, near);
    const at = blocks.indexOf(run.firstBlockId);
    g = state.day.groups.findIndex((grp) => grp.id === run.groupId);
    b = Math.min(blocks.length - 1, at + int(rnd, run.after.length));
  }
  const r = rnd();
  const clear = (row, at) => {
    let first = at;
    while (first > 0 && row[first].startsWith("^")) {
      first -= 1;
    }
    row[first] = "";
    let next = first + 1;
    while (next < row.length && row[next].startsWith("^")) {
      row[next] = "";
      next += 1;
    }
  };
  if (r < 0.45) {
    clear(rows[g], b);
    if (b + 1 < rows[g].length && rnd() < 0.4) {
      clear(rows[g], b + 1);
      const a = pick(rnd, ACTIVITIES);
      rows[g][b] = a;
      rows[g][b + 1] = `^${a}`;
    } else {
      rows[g][b] = pick(rnd, ACTIVITIES);
    }
  } else if (r < 0.75) {
    clear(rows[g], b);
  } else {
    // A time block added (Open for everyone), not inside anyone's two-block placement.
    if (rows.some((row) => b < row.length && row[b].startsWith("^"))) {
      return;
    }
    blockSeq += 1;
    blocks.splice(b, 0, `t${blockSeq}`);
    rows.forEach((row) => row.splice(b, 0, ""));
  }
  state.day = dayOf(blocks, rows);
}

/** A random edit by the director on the week they see: runs as the server takes them. */
function directorEdit(rnd, day) {
  const days = [day];
  const width = day.blocks.length;
  const at = () => ({ day: 0, group: int(rnd, 2), block: int(rnd, width) });
  const nowhereAway = () => false;
  const kind = int(rnd, 6);
  let runs = null;
  if (kind === 0) {
    const p = at();
    const run = editRun(
      day,
      p.group,
      p.block,
      pick(rnd, ACTIVITIES),
      1 + int(rnd, 2),
      nowhereAway
    );
    runs = run ? [{ day: 0, group: p.group, ...run }] : null;
  } else if (kind === 1) {
    const p = at();
    const run = editRun(day, p.group, p.block, "", 1, nowhereAway);
    runs = run ? [{ day: 0, group: p.group, ...run }] : null;
  } else if (kind === 2) {
    const result = moveEdit(days, at(), at(), nowhereAway);
    runs = result && result.runs;
  } else if (kind === 3) {
    const p = at();
    const result = resizeEdit(days, p, p.block + int(rnd, 3) - 1, nowhereAway);
    runs = result && result.runs;
  } else if (kind === 4) {
    const result = removeEdit(days, at());
    runs = result && result.runs;
  } else {
    // An Undo: a change made (and saved) earlier, sent back the other way.
    const p = at();
    const run = editRun(
      day,
      p.group,
      p.block,
      pick(rnd, ACTIVITIES),
      1,
      nowhereAway
    );
    if (run) {
      const rows = rowsOf(day);
      run.after.forEach((slot, i) => {
        rows[p.group][run.first + i] = slot;
      });
      const changed = dayOf(
        day.blocks.map((b) => b.id),
        rows
      );
      const server = inverse([{ day: 0, group: p.group, ...run }]);
      return { day: changed, runs: server.map((r) => toServer(changed, r)) };
    }
  }
  if (!runs || !runs.length) {
    return null;
  }
  return { day, runs: runs.map((r) => toServer(day, r)) };
}

function toServer(day, run) {
  return {
    day: day.dateValue,
    groupId: day.groups[run.group].id,
    firstBlockId: day.blocks[run.first].id,
    before: run.before,
    after: run.after
  };
}

// ---------- the promise ----------

/**
 * Every cell the plan sends a change to, whose content now isn't what the director saw there, is
 * a row; and every row is a cell the plan sends a change to.
 */
function expectShownIsSent(made, intent, state) {
  const sent = new Set();
  const mustShow = new Set();
  made.runs.forEach((run) => {
    const first = state.day.blocks.findIndex((b) => b.id === run.firstBlockId);
    run.before.forEach((theirs, i) => {
      if (theirs === run.after[i]) {
        return;
      }
      const blockId = state.day.blocks[first + i].id;
      const cell = `${run.groupId}|${blockId}`;
      sent.add(cell);
      const seen = (intent.seen[`${run.day}|${run.groupId}`] || {})[blockId];
      if (seen !== theirs) {
        mustShow.add(cell);
      }
    });
  });
  const shown = new Set(
    made.rows.map((row) => `${row.groupId}|${row.blockId}`)
  );
  expect([...shown].sort()).toEqual([...mustShow].sort());
  shown.forEach((cell) => expect(sent.has(cell)).toBe(true));
}

describe("keep theirs or use yours: what is shown is what is sent", () => {
  it("holds over 1000 generated weeks, edits, and other people's changes", () => {
    let conflicts = 0;
    let seconds = 0;
    // Seeds where the second plan wasn't accepted by the server (there should be none).
    const refused = [];
    for (let seed = 1; seed <= 1000; seed++) {
      const rnd = random(seed);
      const width = 4 + int(rnd, 3);
      const blocks = Array.from({ length: width }, (_, i) => `t${i + 1}`);
      const start = dayOf(blocks, randomRows(rnd, width));
      const edit = directorEdit(rnd, start);
      if (!edit) {
        continue;
      }
      const intent = intentOf([edit.day], edit.runs, () => "cell");
      const state = { day: edit.day };
      const changes = 1 + int(rnd, 3);
      for (let i = 0; i < changes; i++) {
        otherChange(rnd, state);
      }
      currentSeed = seed;
      if (serverApply(state, edit.runs)) {
        continue;
      }
      conflicts += 1;
      let made = plan([state.day], intent);
      if (made.gone) {
        continue;
      }
      expectShownIsSent(made, intent, state);
      let seenNow = withSeen(intent, made.rows);
      // Sometimes someone changes something again while the question is open.
      const changedAgain = rnd() < 0.5;
      if (changedAgain) {
        otherChange(rnd, state, made.runs);
      }
      if (!serverApply(state, made.runs)) {
        seconds += 1;
        made = plan([state.day], seenNow);
        if (made.gone) {
          continue;
        }
        expectShownIsSent(made, seenNow, state);
        seenNow = withSeen(seenNow, made.rows);
        if (!serverApply(state, made.runs)) {
          refused.push(seed);
        }
      }
      if (changedAgain) {
        // A cell the plan didn't need may since hold someone's new change; that is theirs.
        continue;
      }
      // With nothing changed after the question, the director's cells now hold what they chose.
      const rows = rowsOf(state.day);
      intent.cells.forEach((cell) => {
        const g = state.day.groups.findIndex((grp) => grp.id === cell.groupId);
        const b = state.day.blocks.findIndex((bl) => bl.id === cell.blockId);
        if (rows[g][b] !== cell.after) {
          throw new Error(
            `seed ${seed}: ${cell.blockId} ${cell.groupId} is ${rows[g][b]}, chose ${cell.after}; start ${JSON.stringify(rowsOf(start))} edit ${JSON.stringify(edit.runs)} now ${JSON.stringify(rows)} blocks ${JSON.stringify(state.day.blocks.map((x) => x.id))}`
          );
        }
      });
    }
    expect(refused).toEqual([]);
    // The generator really does reach the hard cases.
    expect(conflicts).toBeGreaterThan(100);
    expect(seconds).toBeGreaterThan(5);
  });
});

describe("keep theirs or use yours: the cases a review found", () => {
  const nameOf = (at) => `${GROUPS[at.g].name} · ${at.block}`;

  it("a swap within a row is two runs; the cell between is never part of it", () => {
    expect(diffRuns(["A:a1", "", "A:a2"], ["A:a2", "", "A:a1"])).toEqual([
      { first: 0, before: ["A:a1"], after: ["A:a2"] },
      { first: 2, before: ["A:a2"], after: ["A:a1"] }
    ]);
    // Someone fills the middle cell before the swap is saved: Use yours leaves it alone.
    const seenDay = dayOf(
      ["t1", "t2", "t3"],
      [
        ["A:a1", "", "A:a2"],
        ["", "", ""]
      ]
    );
    const runs = [
      {
        day: DATE,
        groupId: "g1",
        firstBlockId: "t1",
        before: ["A:a1"],
        after: ["A:a2"]
      },
      {
        day: DATE,
        groupId: "g1",
        firstBlockId: "t3",
        before: ["A:a2"],
        after: ["A:a1"]
      }
    ];
    const intent = intentOf([seenDay], runs, nameOf);
    const now = dayOf(
      ["t1", "t2", "t3"],
      [
        ["A:a1", "A:a3", "A:a2"],
        ["", "", ""]
      ]
    );
    const made = plan([now], intent);
    expect(made.runs.every((r) => r.firstBlockId !== "t2")).toBe(true);
    expect(made.rows).toEqual([]);
  });

  it("a block added earlier in the day doesn't shift what the director saw", () => {
    const seenDay = dayOf(
      ["t1", "t2", "t3"],
      [
        ["", "A:a1", "A:a2"],
        ["", "", ""]
      ]
    );
    // Swim (a3) typed into t2.
    const intent = intentOf(
      [seenDay],
      [
        {
          day: DATE,
          groupId: "g1",
          firstBlockId: "t2",
          before: ["A:a1"],
          after: ["A:a3"]
        }
      ],
      nameOf
    );
    // A block t0 is added at the start, and someone changes t3 (not the director's cell).
    const now = dayOf(
      ["t0", "t1", "t2", "t3"],
      [
        ["", "", "A:a4", "A:a2"],
        ["", "", "", ""]
      ]
    );
    const made = plan([now], intent);
    expect(made.rows.map((r) => r.blockId)).toEqual(["t2"]);
    expect(made.runs).toEqual([
      {
        day: DATE,
        groupId: "g1",
        firstBlockId: "t2",
        before: ["A:a4"],
        after: ["A:a3"]
      }
    ]);
  });

  it("a move, theirs longer, Use yours, then a third change: the second question lists all of it", () => {
    // Soccer (a1) moves from Bunk 1 · t2 to Bunk 2 · t2.
    const seenDay = dayOf(
      ["t1", "t2", "t3"],
      [
        ["", "A:a1", ""],
        ["", "", ""]
      ]
    );
    const intent = intentOf(
      [seenDay],
      [
        {
          day: DATE,
          groupId: "g1",
          firstBlockId: "t2",
          before: ["A:a1"],
          after: [""]
        },
        {
          day: DATE,
          groupId: "g2",
          firstBlockId: "t2",
          before: [""],
          after: ["A:a1"]
        }
      ],
      nameOf
    );
    // Theirs: two-block Boating (a2) in Bunk 2 · t2 and t3.
    const first = plan(
      [
        dayOf(
          ["t1", "t2", "t3"],
          [
            ["", "A:a1", ""],
            ["", "A:a2", "^A:a2"]
          ]
        )
      ],
      intent
    );
    expect(first.rows.map((r) => `${r.groupId}|${r.blockId}`)).toEqual([
      "g2|t2",
      "g2|t3"
    ]);
    // Before Use yours is saved, a third change: Boating back to one block, Swim (a3) in t3.
    const second = plan(
      [
        dayOf(
          ["t1", "t2", "t3"],
          [
            ["", "A:a1", ""],
            ["", "A:a2", "A:a3"]
          ]
        )
      ],
      withSeen(intent, first.rows)
    );
    // Their Swim in t3 isn't in the director's edit and isn't under anything of theirs being
    // replaced: it is neither sent nor listed (the old code sent t3 Swim → Open unlisted).
    // t2 was already shown and agreed to (theirs Boating there): nothing new to ask.
    expect(second.rows).toEqual([]);
    expect(
      second.runs.every((r) => !(r.groupId === "g2" && r.firstBlockId === "t3"))
    ).toBe(true);
    expect(second.runs.find((r) => r.groupId === "g2").after).toEqual(["A:a1"]);
  });

  it("a cell that left the week is named, and nothing is sent", () => {
    const seenDay = dayOf(
      ["t1", "t2"],
      [
        ["", ""],
        ["", ""]
      ]
    );
    const intent = intentOf(
      [seenDay],
      [
        {
          day: DATE,
          groupId: "g1",
          firstBlockId: "t2",
          before: [""],
          after: ["A:a1"]
        }
      ],
      nameOf
    );
    const made = plan([dayOf(["t1"], [[""], [""]])], intent);
    expect(made.gone.name).toBe("Bunk 1 · 1");
    expect(made.runs).toBeUndefined();
  });
});
