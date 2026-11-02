import { buildTerms } from "c/shoreshTerms";
import { readNotes } from "c/shoreshEngine";
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

  // GEN-10.11, GEN-10.6
  it("10.11: a Rebuild reads the notes the server kept, not the ones it was sent", () => {
    const fresh = loadedOf(camp(BIG), PROGRAM, WEEK);
    const generated = buildWeek(fresh, {
      action: ACTION.GENERATE,
      option: 1,
      terms
    });
    const how = { action: ACTION.REBUILD, option: 1, terms };
    // The server dropped the notes: the week as a reload reads it, with none.
    const reload = savedOf(fresh, generated, readNotes(null));
    expect(buildInputOf(reload, how).builtMinimums).toBeNull();
    // Kept: the minimums as built, as they were sent.
    const kept = savedOf(
      fresh,
      generated,
      readNotes(generated.request.engineNotes)
    );
    expect(buildInputOf(kept, how).builtMinimums).toEqual(generated.notes.mins);
  });
});
