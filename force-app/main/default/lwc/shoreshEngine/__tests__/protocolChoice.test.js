/**
 * Which arrangement step 8 keeps, and how much work it may spend (docs/engine/protocol.md
 * GEN-8.14, GEN-8.27, GEN-8.28), on small camps made for each rule. The week going into a pass is
 * set by hand (hook.before), so the pass's own choice is what the test sees.
 */
import { generateWeek } from "c/shoreshEngine";
import { activity, at, block, camp, group } from "./data/camp";

// A hook into the search (weekSearch.js searchWeek) and the moves between days (weekAcross.js
// moveAcrossDays): `before(st)` sets the week going in; each pass's work is recorded.
const hook = { search: null, across: null, passes: [] };

/** Puts exactly these activities in the week's free cells: layout[d][g] = [activity id or null]. */
function arrange(st, layout) {
  for (const s of st.freeSlots) {
    const k = st.keyOf(s);
    if (st.assigned.has(k)) {
      st.unplace(
        st.actById.get(st.assigned.get(k)),
        s.groupId,
        s.dayIndex,
        s.blockId
      );
    }
  }
  for (const s of st.freeSlots) {
    const id =
      layout[s.dayIndex][s.groupId][st.blockIdx(s.dayIndex, s.blockId)];
    if (id) {
      st.place(st.actById.get(id), s.groupId, s.dayIndex, s.blockId);
    }
  }
}

jest.mock("../weekSearch", () => {
  const actual = jest.requireActual("../weekSearch");
  return {
    ...actual,
    *searchWeek(st, ...rest) {
      if (hook.search) {
        hook.search(st);
      }
      return yield* actual.searchWeek(st, ...rest);
    }
  };
});

jest.mock("../weekAcross", () => {
  const actual = jest.requireActual("../weekAcross");
  return {
    ...actual,
    *moveAcrossDays(st, ...rest) {
      if (hook.across && !hook.passes.length) {
        hook.across(st);
      }
      // Work per group and activity: the moves tried between one "short of" line and the next.
      const pass = { pairs: [], total: 0, moves: [] };
      hook.passes.push(pass);
      const start = st.searchWorkLeft;
      const firstMove = st.searchMoves.length;
      let mark = null;
      let last = st.watch.now;
      const gen = actual.moveAcrossDays(st, ...rest);
      let step = gen.next();
      while (!step.done) {
        const now = st.watch.now;
        if (now !== last && now && now.code === "short") {
          if (mark != null) {
            pass.pairs.push(mark - st.searchWorkLeft);
          }
          mark = st.searchWorkLeft;
        }
        last = now;
        step = gen.next(yield step.value);
      }
      if (mark != null) {
        pass.pairs.push(mark - st.searchWorkLeft);
      }
      pass.total = start - st.searchWorkLeft;
      pass.moves = st.searchMoves.slice(firstMove);
      return step.value;
    }
  };
});

beforeEach(() => {
  hook.search = null;
  hook.across = null;
  hook.passes = [];
});

const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

// GEN-8.14
describe("the search keeps the arrangement with fewer weekly-max bends, then fewest cells changed", () => {
  // Monday, Bunk h's second period is Open. C would go straight in, but h has had C (most once a
  // week) on Tuesday: one bend, nothing moved. Without a bend: h takes Arts first and Boats
  // second (one cell changed), or Bunk g swaps its two periods so h takes Arts second (two).
  // C is only for h; D only for g.
  const spec = {
    groups: [group("g"), group("h")],
    days: 2,
    blocks: [block(0), block(1)],
    activities: [
      activity("A", { max: 2 }),
      activity("B", { max: 2 }),
      activity("C", { max: 1, atOnce: null, eligible: ["h"] }),
      activity("D", { atOnce: null, eligible: ["g"] })
    ]
  };
  const layout = [
    { g: ["D", "A"], h: ["B", null] },
    { g: ["B", "D"], h: ["C", "A"] }
  ];

  it("fills h's Open cell by changing one cell, bending nothing", () => {
    hook.search = (st) => arrange(st, layout);
    const result = generateWeek(camp(spec));
    expect([0, 1].map((b) => at(result, 0, "h", b))).toEqual(["A", "B"]);
    expect([0, 1].map((b) => at(result, 0, "g", b))).toEqual(["D", "A"]);
    expect(result.flags).toEqual([]);
  });
});

// GEN-8.27
describe("of the chains between days that work, the one kept", () => {
  // Bunk g is short of Swim (once a week) and has Arts every day; Swim can take any day's place.
  const spec = {
    groups: [group("g")],
    days: 3,
    blocks: [block(0)],
    activities: [
      activity("S", { min: 1, max: 1 }),
      activity("A", { atOnce: null }),
      activity("B", { atOnce: null })
    ]
  };
  const swimDay = (layout) => {
    hook.across = (st) => arrange(st, layout);
    generateWeek(camp(spec));
    return hook.passes[0].moves
      .filter((m) => m.why === "minimum" && m.to === "S")
      .map((m) => m.dayIndex);
  };

  it("has fewer same-activity sessions on back-to-back days (spread)", () => {
    // Swim on Tuesday leaves Arts Monday and Wednesday, not back to back.
    expect(swimDay([{ g: ["A"] }, { g: ["A"] }, { g: ["A"] }])).toEqual([1]);
  });

  it("still a tie, is the first found, in the days' order", () => {
    expect(swimDay([{ g: ["A"] }, { g: ["B"] }, { g: ["A"] }])).toEqual([0]);
  });
});

// GEN-8.28
describe("the moves between days are counted in moves tried", () => {
  // 40 bunks each want Swim 3 times; Swim takes one bunk at a time in 42 periods, so most stay
  // short and every chain for them is tried until the work runs out.
  it("3,000 per group and activity, 60,000 per build", () => {
    generateWeek(
      camp({
        groups: ids("g", 40).map((id) => group(id)),
        days: 7,
        blocks: ids("", 6).map((_, i) => block(i)),
        activities: [
          activity("S", { min: 3 }),
          ...ids("f", 16).map((id) => activity(id, { atOnce: null }))
        ]
      })
    );
    const pairs = hook.passes.flatMap((p) => p.pairs);
    expect(Math.max(...pairs)).toBe(3000);
    expect(Math.max(...hook.passes.map((p) => p.total))).toBe(60000);
    const full = hook.passes.find((p) => p.total === 60000);
    // The last group tried gets only what the build has left.
    expect(full.pairs.reduce((n, x) => n + x, 0)).toBe(60000);
    expect(full.pairs[full.pairs.length - 1]).toBeLessThan(3000);
  });
});
