/**
 * The hand-edit rules (handEdits.js) on a week alone, without the screen: what an edit changes,
 * its Undo label, and when a Lock refuses it.
 */
import { dayLabel } from "c/shoreshScheduleViews";
import {
  canMove,
  clearAllStep,
  editContextOf,
  placeOverStep,
  placeStep,
  resizeStep
} from "../handEdits";
import { owner } from "../slotEdits";
import { day } from "./data/draftFixture";

const SWIM = "A:a1";
const ITEMS = [
  { kind: "F", id: "f1", name: "Flagpole", gone: false },
  { kind: "A", id: "a1", name: "Swim", gone: false },
  { kind: "A", id: "a2", name: "Boating", gone: false }
];
const at = (group, block) => ({ day: 0, group, block });

// Monday: Bunk 1 Flagpole, Swim, Open; Bunk 2 Flagpole, Boating over the last two blocks.
function ctxOf(locked = []) {
  const week = [day("2026-06-29", ITEMS, ["1,2,", "1,3,^"])];
  return {
    week,
    t: { sIn: () => "period", pIn: () => "periods" },
    nameOf: (slot, d) =>
      d.items.find((i) => `${i.kind}:${i.id}` === owner(slot))?.name || "Open",
    dayNameOf: () => "Monday",
    isLocked: (slot) =>
      locked.some((l) => l.group === slot.group && l.block === slot.block)
  };
}

describe("hand edits without the screen", () => {
  it("a fixed or recurring activity can be picked up by hand", () => {
    expect(canMove("F:f1")).toBe(true);
    expect(canMove("^R:r1")).toBe(true);
    expect(canMove(SWIM)).toBe(true);
    expect(canMove("")).toBe(false);
  });

  it("placing in an Open cell is one run, labelled for Undo", () => {
    const ctx = ctxOf();
    const step = placeStep(ctx, at(0, 2), SWIM, 1);
    expect(step.runs).toEqual([
      { day: 0, group: 0, first: 2, before: [""], after: [SWIM] }
    ]);
    expect(step.label).toMatch(/^Placed Swim · /);
  });

  it("a hand edit covers a fixed activity (Greg, 2026-10-26)", () => {
    const step = placeStep(ctxOf(), at(0, 0), "", 1);
    expect(step.runs[0].before).toEqual(["F:f1"]);
    expect(step.label).toMatch(/^Cleared /);
  });

  // LOCK-4.9
  it("typing over a fixed activity says what it took the place of", () => {
    const step = placeStep(ctxOf(), at(0, 0), SWIM, 1);
    expect(step.runs[0].before).toEqual(["F:f1"]);
    expect(step.label).toMatch(/^Placed Swim · .* in place of Flagpole$/);
    // An Open cell names nothing.
    expect(placeStep(ctxOf(), at(0, 2), SWIM, 1).label).not.toMatch(
      /in place of/
    );
  });

  it("a locked cell refuses the edit, naming the cell", () => {
    const step = placeStep(ctxOf([at(0, 1)]), at(0, 1), "", 1);
    expect(step.runs).toBeUndefined();
    expect(step.refused).toMatch(/ · Monday · .* is locked\.$/);
    expect(step.locked).toEqual(at(0, 1));
  });

  it("cells drawn as one are cleared together, unless one is locked", () => {
    const both = clearAllStep(ctxOf(), [at(0, 1), at(1, 1)]);
    expect(both.runs).toHaveLength(2);
    const refused = clearAllStep(ctxOf([at(1, 1)]), [at(0, 1), at(1, 1)]);
    expect(refused.locked).toEqual(at(1, 1));
  });

  it("stretching says how long it now runs; ending before it starts is refused", () => {
    const longer = resizeStep(ctxOf(), at(0, 1), 2);
    expect(longer.label).toMatch(/^Swim runs 2 periods · /);
    expect(resizeStep(ctxOf(), at(1, 2), 0).refused).toBe(
      "Boating can't end before it starts."
    );
  });

  it("an event over cells covers what is there, and only a Lock stops it", () => {
    const rows = [{ day: 0, group: 0, first: 0, last: 1 }];
    expect(placeOverStep(ctxOf(), rows, "S:e1").runs).toHaveLength(1);
    expect(placeOverStep(ctxOf([at(0, 0)]), rows, "S:e1").locked).toEqual(
      at(0, 0)
    );
  });
});

// The context the week editor and an AI's tools (connect/cells.js) both edit with.
describe("a draft's edit context", () => {
  const t = { s: (term) => term };
  const draftOf = (more = {}) => ({
    schedule: { days: [day("2026-06-29", ITEMS, ["1,2,", "1,3,^"])] },
    activities: [{ id: "a9", name: "Archery" }],
    ...more
  });
  const setup = {
    special: { specialEvents: [{ Id: "e1", Name: "Carnival" }] },
    electives: { sets: [{ Id: "s1", Name: "Chugim" }] }
  };
  const OPEN_CELL = { items: [] };

  it("names a cell by the day's saved name, else the draft's activity or the season's event or set, else as removed", () => {
    const ctx = editContextOf({ draft: draftOf(), t, setup });
    const monday = ctx.week[0];
    expect(ctx.nameOf(SWIM, monday)).toBe("Swim");
    expect(ctx.nameOf("A:a9", OPEN_CELL)).toBe("Archery");
    expect(ctx.nameOf("S:e1", OPEN_CELL)).toBe("Carnival");
    expect(ctx.nameOf("E:s1", OPEN_CELL)).toBe("Chugim");
    expect(ctx.nameOf("S:gone", OPEN_CELL)).toBe("SpecialEvent (removed)");
    expect(ctx.nameOf("", OPEN_CELL)).toBe("Open");
  });

  it("a group is away where the draft's away blocks say, in any week asked about", () => {
    const ctx = editContextOf({
      draft: draftOf({ away: [{ groupId: "g2", blockIds: ["t3"] }] }),
      t,
      setup
    });
    expect(ctx.isAwayOn(ctx.week, 0, 1, 2)).toBe(true);
    expect(ctx.isAwayOn(ctx.week, 0, 1, 1)).toBe(false);
    expect(ctx.isAwayOn(ctx.week, 0, 0, 2)).toBe(false);
    expect(
      editContextOf({ draft: draftOf(), t }).isAwayOn(ctx.week, 0, 1, 2)
    ).toBe(false);
  });

  // LOCK-4.1
  it("a lock on one block of a placement locks all of it; no locks lock nothing", () => {
    const locks = new Set(["2026-06-29|g2|t3"]);
    const ctx = editContextOf({ draft: draftOf(), t, setup, locks });
    expect([0, 1, 2].map((b) => ctx.isLocked(at(1, b)))).toEqual([
      false,
      true,
      true
    ]);
    expect(ctx.liveLocks).toBe(locks);
    const none = editContextOf({ draft: draftOf(), t, setup });
    expect(none.isLocked(at(1, 2))).toBe(false);
    expect(none.liveLocks).toBeNull();
  });

  it("a day is its weekday, or a special day's or event's own schedule's name", () => {
    const week = editContextOf({ draft: draftOf(), t });
    expect(week.dayNameOf("2026-06-29")).toBe(dayLabel("2026-06-29").label);
    const own = editContextOf({ draft: draftOf(), t, planName: "Color War" });
    expect(own.dayNameOf("2026-06-29")).toBe("Color War");
  });

  // LOCK-4.9
  it("knows where setup puts each fixed activity, and the days a special day replaces", () => {
    const setUpCells = [{ key: "2026-06-29|g1|t1", slot: "F:f1" }];
    const special = { dateValue: "2026-06-30", name: "Trip" };
    const ctx = editContextOf({
      draft: draftOf({ setUpCells, specials: { days: [special] } }),
      t
    });
    expect(ctx.setUp).toEqual({ "2026-06-29|g1|t1": "F:f1" });
    expect(ctx.replaced.get("2026-06-30")).toBe(special);
    expect(editContextOf({ draft: draftOf(), t }).setUp).toBeNull();
    const given = new Map();
    expect(
      editContextOf({ draft: draftOf(), t, replaced: given }).replaced
    ).toBe(given);
  });
});
