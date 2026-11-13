import { buildTerms } from "c/shoreshTerms";
import { buildInPieces } from "../../shoreshGeneratedSchedule/pieces";
import {
  BIG,
  PROGRAM,
  SCHEDULE,
  SMALL,
  WEEK,
  camp
} from "../../shoreshGeneratedSchedule/__tests__/data/camp";
import {
  ACTION,
  buildInputOf,
  buildWeek,
  builtWeekOf,
  loadedOf
} from "../build";

const terms = buildTerms([]);

/** The week as it is after a save of built: its days, a draft, the notes the server kept. */
function savedOf(loaded, built, notes) {
  return {
    ...loaded,
    scheduleId: SCHEDULE,
    revision: "2026-06-29:2|2026-06-30:2",
    engineNotes: notes,
    input: { ...loaded.input, days: built.days }
  };
}

/** What Generated Schedule builds: the same input, run through its pieces runner. */
async function screenBuild(loaded, how) {
  const result = await buildInPieces(buildInputOf(loaded, how), () => {});
  return builtWeekOf(loaded, how, result);
}

describe("c/shoreshGeneratedWeek build.js", () => {
  // GEN-10.11, API-1.19
  describe.each([
    ["a small camp", SMALL],
    ["a camp built in many pieces", BIG]
  ])("10.11: the screen and an agent build the same week, %s", (_, spec) => {
    const fresh = loadedOf(camp(spec), PROGRAM, WEEK);
    const generated = buildWeek(fresh, {
      action: ACTION.GENERATE,
      option: 1,
      terms
    });
    const saved = savedOf(fresh, generated, generated.notes);

    it.each([
      ["Generate", fresh, ACTION.GENERATE, 1],
      ["Try another", saved, ACTION.TRY_ANOTHER, 2],
      ["Rebuild", saved, ACTION.REBUILD, 1],
      ["Fill the open cells", saved, ACTION.FILL_OPEN, 1]
    ])("%s", async (__, loaded, action, option) => {
      const how = { action, option, terms };
      const atOnce = buildWeek(loaded, how);
      expect(atOnce.ok).toBe(true);
      expect(await screenBuild(loaded, how)).toEqual(atOnce);
      expect(atOnce.request).toMatchObject({ action, option });
    });
  });

  // GEN-10.13, GEN-10.14 (Greg 2026-11-12): Rebuild generates fresh, the same as Generate on that
  // week and option; only the director's locks and hand-placed cells (a hand edit locks its
  // cell) carry over, never a generated cell just because setup still allows it.
  describe("10.13: Rebuild builds the week fresh, keeping only locks and hand-placed cells", () => {
    const fresh = loadedOf(camp(BIG), PROGRAM, WEEK);
    const build = (loaded, action, option) =>
      buildWeek(loaded, { action, option, terms });
    // The week as saved after Try another (option 2): every cell generated, none locked.
    const other = build(fresh, ACTION.TRY_ANOTHER, 2);
    const saved = savedOf(fresh, other, other.notes);
    const generate1 = build(fresh, ACTION.GENERATE, 1);
    const rowsOf = (days) => days.map((d) => d.rows);

    it("a generated cell not locked changes on Rebuild exactly as Generate places it", () => {
      expect(rowsOf(saved.input.days)).not.toEqual(rowsOf(generate1.days));
      const rebuilt = build(saved, ACTION.REBUILD, 1);
      expect(rebuilt.ok).toBe(true);
      expect(rebuilt.days).toEqual(generate1.days);
    });

    it("locked and hand-edited cells stay; Rebuild equals Generate with the same locks", () => {
      // Lock Bunk 1's first day (as a lock or a hand edit leaves it) in the option 2 week.
      const day = saved.input.days[0];
      const locks = day.blocks.map((b) => ({
        date: day.dateValue,
        groupId: day.groups[0].id,
        blockId: b.id
      }));
      const locked = { ...saved, input: { ...saved.input, locks } };
      const rebuilt = build(locked, ACTION.REBUILD, 1);
      const generated = build(locked, ACTION.GENERATE, 1);
      const shown = (d) => d.rows[0].split(",").map((t) => d.items[t - 1]);
      // Unlocked, Generate puts something else there: the lock is what kept it.
      expect(shown(generate1.days[0])).not.toEqual(shown(day));
      expect(shown(rebuilt.days[0])).toEqual(shown(day));
      expect(rebuilt.days).toEqual(generated.days);
      // Same inputs, same option: the same week every time (10.14).
      expect(build(locked, ACTION.REBUILD, 1)).toEqual(rebuilt);
    });
  });
});
