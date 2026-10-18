/**
 * The checks over generated weeks (seeded, so every run is the same), against an oracle written
 * independently: placement by placement, straight from each rule's definition, with no grouping
 * shared with checks.js. Every dot's words, every still-needed and early-week line, the number of
 * overlaps, and Filled must agree.
 */
import { checkWeek } from "../checks";
import { buildTerms } from "c/shoreshTerms";
import { dayName, dayOf } from "./data/checkWeeks";

const SEEDS = 2000;
const t = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
]);
const DATES = [
  "2026-06-29",
  "2026-06-30",
  "2026-07-01",
  "2026-07-02",
  "2026-07-03"
];

function random(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function camp(rnd) {
  const int = (n) => Math.floor(rnd() * n);
  const pick = (list) => list[int(list.length)];
  const locations = new Map([
    ["pool", { name: "Pool", fit: 1 + int(2) }],
    ["field", { name: "Field", fit: 1 + int(3) }]
  ]);
  const activities = ["swim", "soccer", "arts", "hike"].map((id) => ({
    id,
    name: id,
    locationId: rnd() < 0.5 ? pick(["pool", "field", "nowhere"]) : null,
    min: int(3),
    max: rnd() < 0.3 ? null : int(3),
    atOnce: rnd() < 0.3 ? null : 1 + int(2),
    sameDivision: rnd() < 0.3,
    sortOrder: rnd() < 0.7 ? int(5) : null,
    early: rnd() < 0.3 ? { count: 1 + int(2), byDay: 1 + int(5) } : null
  }));
  const groupCount = 2 + int(3);
  const groupIds = Array.from({ length: groupCount }, (_, g) => `g${g + 1}`);
  const divisions = new Map(
    groupIds.map((id) => [id, rnd() < 0.15 ? null : pick(["a", "b"])])
  );
  const notFor = new Map(
    activities.map((a) => [a.id, groupIds.filter(() => rnd() < 0.2)])
  );
  const setTimeLocations = new Map([
    ["flag", rnd() < 0.5 ? "pool" : null],
    ["rest", rnd() < 0.5 ? "field" : null]
  ]);
  // Time blocks, some overlapping, some touching.
  const width = 3 + int(3);
  let clock = 9 * 60;
  const blocks = Array.from({ length: width }, (_, b) => {
    const start = clock - (rnd() < 0.25 ? 15 : 0);
    const end = start + 45 + int(2) * 15;
    clock = end;
    const hhmm = (m) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return {
      id: `t${b + 1}`,
      name: `P${b + 1}`,
      startTime: hhmm(start),
      endTime: hhmm(end)
    };
  });
  const away = new Set(
    groupIds.filter(() => rnd() < 0.2).map((id) => `${id}|${pick(blocks).id}`)
  );
  const dayCount = 1 + int(4);
  const start = int(DATES.length - dayCount + 1);
  const days = DATES.slice(start, start + dayCount).map((date) => {
    const rows = groupIds.map(() => {
      const row = [];
      while (row.length < width) {
        const r = rnd();
        if (r < 0.3) {
          row.push("");
        } else if (r < 0.37) {
          row.push(pick(["F:flag", "R:rest"]));
        } else if (r < 0.4) {
          row.push("E:Chugim");
        } else {
          const a = `A:${pick(activities).id}`;
          const length = Math.min(width - row.length, 1 + int(2));
          row.push(a);
          for (let i = 1; i < length; i++) {
            row.push(`^${a}`);
          }
        }
      }
      return row;
    });
    return dayOf(date, rows, blocks);
  });
  if (rnd() < 0.1) {
    days[0] = { ...days[0], problem: "unreadable" };
  }
  return {
    days,
    model: {
      activities: new Map(activities.map((a) => [a.id, a])),
      locations,
      divisions,
      setTimeLocations,
      notFor,
      isAway: (groupId, blockId) => away.has(`${groupId}|${blockId}`)
    }
  };
}

// ---------- the oracle ----------

const NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const weekday = (date) => DATES.indexOf(date) + 1;
const mins = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Placements read straight from the rows' tokens. */
function readPlacements(days) {
  const out = [];
  days.forEach((day, d) => {
    if (day.problem) {
      return;
    }
    day.rows.forEach((rowText, g) => {
      const tokens = rowText.split(",");
      tokens.forEach((token, b) => {
        if (token === "" || token === "^") {
          return;
        }
        const item = day.items[Number(token) - 1];
        let end = b + 1;
        while (tokens[end] === "^") {
          end += 1;
        }
        out.push({
          d,
          g,
          groupId: day.groups[g].id,
          groupName: day.groups[g].name,
          kind: item.kind,
          id: item.id,
          blocks: Array.from({ length: end - b }, (_, i) => b + i),
          key: `${day.dateValue}|${day.groups[g].id}|${day.blocks[b].id}`
        });
      });
    });
  });
  return out;
}

function oracle(days, model) {
  const all = readPlacements(days);
  const acts = model.activities;
  const placeOf = (p) => {
    let loc = null;
    if (p.kind === "A") {
      loc = acts.get(p.id).locationId;
    } else if (p.kind === "F" || p.kind === "R") {
      loc = model.setTimeLocations.get(p.id);
    }
    return loc && model.locations.has(loc) ? loc : null;
  };
  const at = (d, b) => all.filter((q) => q.d === d && q.blocks.includes(b));
  const div = (q) => model.divisions.get(q.groupId) || null;
  const strict = (q) => q.kind === "A" && acts.get(q.id).sameDivision;
  const flags = new Map();
  // Each clash once, by what it is, with the line the screen shows (the first time it is met).
  const clashes = new Map();
  const when = (d, b) =>
    `${NAMES[weekday(days[d].dateValue)]} · ${days[d].blocks[b].name}`;
  const add = (key, text) => {
    if (!clashes.has(key)) {
      clashes.set(key, text);
    }
  };
  all.forEach((p) => {
    if (p.kind !== "A") {
      return;
    }
    const act = acts.get(p.id);
    const reasons = [];
    const mine = all.filter(
      (q) => q.kind === "A" && q.id === p.id && q.groupId === p.groupId
    );
    // Over the limit: only the sessions past it, the latest in the week (day, start time,
    // place in the day, Id).
    const firstOf = (q) => q.blocks[0];
    const startOf = (q) => mins(days[q.d].blocks[firstOf(q)].startTime);
    const later = (q, r) =>
      days[q.d].dateValue > days[r.d].dateValue ||
      (days[q.d].dateValue === days[r.d].dateValue &&
        (startOf(q) > startOf(r) ||
          (startOf(q) === startOf(r) &&
            (firstOf(q) > firstOf(r) ||
              (firstOf(q) === firstOf(r) &&
                days[q.d].blocks[firstOf(q)].id >
                  days[r.d].blocks[firstOf(r)].id)))));
    const earlier = mine.filter((q) => q !== p && later(p, q)).length;
    if (act.max !== null && earlier >= act.max) {
      reasons.push("Over its weekly limit");
    }
    if (mine.some((q) => q !== p && q.d === p.d)) {
      reasons.push("Twice in a day");
    }
    if (model.notFor.get(p.id).includes(p.groupId)) {
      reasons.push(`Not set up for ${p.groupName}`);
    }
    if (
      act.atOnce !== null &&
      p.blocks.some(
        (b) =>
          at(p.d, b).filter((q) => q.kind === "A" && q.id === p.id).length >
          act.atOnce
      )
    ) {
      reasons.push(
        `Over its limit of ${act.atOnce} ${act.atOnce === 1 ? "Bunk" : "Bunks"} at once`
      );
    }
    const loc = placeOf(p);
    p.blocks.forEach((b) => {
      const here = loc ? at(p.d, b).filter((q) => placeOf(q) === loc) : [];
      const divided =
        (strict(p) && here.some((q) => q !== p && div(q) !== div(p))) ||
        here.some((x) => x !== p && strict(x) && div(x) !== div(p));
      if (divided) {
        reasons.push(
          `Shares ${model.locations.get(loc).name} with another division`
        );
      }
      if (
        !loc &&
        strict(p) &&
        at(p.d, b).some(
          (q) => q.kind === "A" && q.id === p.id && div(q) !== div(p)
        )
      ) {
        reasons.push("With another division at the same time");
      }
      if (loc && here.length > model.locations.get(loc).fit) {
        reasons.push(`More Bunks at ${model.locations.get(loc).name} than fit`);
      }
    });
    const blocks = days[p.d].blocks;
    const overlaps = (b1, b2) =>
      b1 !== b2 &&
      mins(blocks[b1].startTime) < mins(blocks[b2].endTime) &&
      mins(blocks[b2].startTime) < mins(blocks[b1].endTime);
    if (
      all.some(
        (q) =>
          q !== p &&
          q.d === p.d &&
          q.groupId === p.groupId &&
          q.blocks.some((b2) => p.blocks.some((b1) => overlaps(b1, b2)))
      )
    ) {
      reasons.push("Already busy then");
    }
    // In the order rules give way (the engine's), each once.
    const ORDER = [
      "weekly",
      "Twice",
      "Not set",
      "at once",
      "division",
      "than fit",
      "busy then"
    ];
    const rank = (r) => ORDER.findIndex((w) => r.includes(w));
    const unique = reasons
      .filter((r, i) => reasons.indexOf(r) === i)
      .sort((a, b) => rank(a) - rank(b));
    if (unique.length) {
      flags.set(p.key, unique.join(" · "));
    }
  });
  // Overlaps, each once.
  days.forEach((day, d) => {
    if (day.problem) {
      return;
    }
    day.blocks.forEach((block, b) => {
      const here = at(d, b);
      const ids = [
        ...new Set(here.filter((q) => q.kind === "A").map((q) => q.id))
      ];
      ids.forEach((id) => {
        const act = acts.get(id);
        const doing = here.filter((q) => q.kind === "A" && q.id === id);
        if (act.atOnce !== null && doing.length > act.atOnce) {
          add(
            `atOnce|${id}|${d}|${b}`,
            `${act.name} · ${when(d, b)}: Over its limit of ${act.atOnce} ${act.atOnce === 1 ? "Bunk" : "Bunks"} at once`
          );
        }
        if (
          act.sameDivision &&
          !placeOf(doing[0]) &&
          new Set(doing.map(div)).size > 1
        ) {
          add(
            `division|act:${id}|${d}|${b}`,
            `${act.name} · ${when(d, b)}: With another division at the same time`
          );
        }
      });
      model.locations.forEach((place, loc) => {
        const there = here.filter((q) => placeOf(q) === loc);
        if (there.length > place.fit && there.some((q) => q.kind === "A")) {
          add(
            `capacity|${loc}|${d}|${b}`,
            `${place.name} · ${when(d, b)}: More Bunks at ${place.name} than fit`
          );
        }
        if (
          there.some((x) => strict(x) && there.some((y) => div(y) !== div(x)))
        ) {
          add(
            `division|loc:${loc}|${d}|${b}`,
            `${place.name} · ${when(d, b)}: Shares ${place.name} with another division`
          );
        }
      });
      day.groups.forEach((grp) => {
        day.blocks.forEach((other, b2) => {
          if (
            b2 <= b ||
            !(
              mins(block.startTime) < mins(other.endTime) &&
              mins(other.startTime) < mins(block.endTime)
            )
          ) {
            return;
          }
          const p1 = here.find((q) => q.groupId === grp.id);
          const p2 = at(d, b2).find((q) => q.groupId === grp.id);
          if (p1 && p2 && p1 !== p2 && (p1.kind === "A" || p2.kind === "A")) {
            // Two placements clash once, however many of their blocks overlap.
            add(
              `busy|${p1.key}|${p2.key}`,
              `${grp.name} · ${when(d, b)} · ${other.name}: Already busy then`
            );
          }
        });
      });
    });
  });
  // Still to place.
  const stillNeeded = [];
  const spread = [];
  const groups = [];
  days.forEach((day) =>
    day.groups.forEach((grp) => {
      if (!groups.some((x) => x.id === grp.id)) {
        groups.push(grp);
      }
    })
  );
  // Group by group, then activity by SortOrder (none last) and Id.
  const rank = (a) => (a.sortOrder === null ? 99 : a.sortOrder);
  const ordered = [...acts.values()].sort(
    (a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : Number(a.id > b.id))
  );
  groups.forEach((grp) =>
    ordered.forEach((act) => {
      if (model.notFor.get(act.id).includes(grp.id)) {
        return;
      }
      const mine = all.filter(
        (q) => q.kind === "A" && q.id === act.id && q.groupId === grp.id
      );
      if (mine.length < act.min) {
        stillNeeded.push(
          `${act.name} · ${grp.name}: ${act.min - mine.length} still needed`
        );
      }
      const byDay = act.early && act.early.byDay;
      if (
        byDay &&
        days.some((day) => !day.problem && weekday(day.dateValue) <= byDay)
      ) {
        const early = mine.filter(
          (q) => weekday(days[q.d].dateValue) <= byDay
        ).length;
        if (early < act.early.count) {
          spread.push(
            `${act.name} · ${grp.name}: ${act.early.count - early} still needed by ${NAMES[byDay]}`
          );
        }
      }
    })
  );
  // Filled.
  let filled = 0;
  let total = 0;
  days.forEach((day) => {
    if (day.problem) {
      return;
    }
    day.groups.forEach((grp, g) => {
      day.blocks.forEach((block, b) => {
        const owner = all.find(
          (q) => q.d === days.indexOf(day) && q.g === g && q.blocks.includes(b)
        );
        if (
          model.isAway(grp.id, block.id) ||
          (owner && (owner.kind === "F" || owner.kind === "R"))
        ) {
          return;
        }
        total += 1;
        filled += owner ? 1 : 0;
      });
    });
  });
  return {
    flags,
    clashes: [...clashes.values()],
    stillNeeded,
    spread,
    cells: { filled, total }
  };
}

describe("checks over generated weeks", () => {
  it(`agree with an independent oracle over ${SEEDS} weeks`, () => {
    const failures = [];
    // How often each rule is met, so the generator is known to reach every one.
    const REASONS = [
      "Over its weekly limit",
      "Twice in a day",
      "Not set up for",
      "at once",
      "Shares",
      "With another division",
      "than fit",
      "Already busy then"
    ];
    const seen = { stillNeeded: 0, spread: 0 };
    REASONS.forEach((r) => {
      seen[r] = 0;
    });
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { days, model } = camp(random(seed));
      const got = checkWeek(days, model, { t, dayName });
      const want = oracle(days, model);
      const gotFlags = JSON.stringify([...got.flags].sort());
      const wantFlags = JSON.stringify([...want.flags].sort());
      if (gotFlags !== wantFlags) {
        failures.push(`seed ${seed}: dots ${gotFlags} != ${wantFlags}`);
      }
      // The same lines (their order is the scenario tests' to check).
      const gotLines = JSON.stringify([...got.overlapping].sort());
      const wantLines = JSON.stringify([...want.clashes].sort());
      if (gotLines !== wantLines) {
        failures.push(`seed ${seed}: overlaps ${gotLines} != ${wantLines}`);
      }
      ["stillNeeded", "spread"].forEach((list) => {
        if (JSON.stringify(got[list]) !== JSON.stringify(want[list])) {
          failures.push(`seed ${seed}: ${list} ${got[list]} != ${want[list]}`);
        }
      });
      if (JSON.stringify(got.cells) !== JSON.stringify(want.cells)) {
        failures.push(`seed ${seed}: filled ${JSON.stringify(got.cells)}`);
      }
      seen.stillNeeded += want.stillNeeded.length;
      seen.spread += want.spread.length;
      want.flags.forEach((words) =>
        REASONS.forEach((r) => {
          seen[r] += words.includes(r) ? 1 : 0;
        })
      );
    }
    expect(failures.slice(0, 5)).toEqual([]);
    // The generator reaches every rule.
    Object.entries(seen).forEach(([what, n]) =>
      expect([what, n > 30]).toEqual([what, true])
    );
  });
});
