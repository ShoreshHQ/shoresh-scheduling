/**
 * WEEK-4.2 (Greg 2026-10-27): in a short week (fewer days than the camp's programs run, ADR
 * 0022) each weekly minimum is kept unless the camp chose to lower it to match the days.
 */
import { checkGeneratedWeek, generateWeek } from "c/shoreshEngine";
import { activity, block, camp } from "./data/camp";
import { campShortWeek } from "c/shoreshImportEngine";
import { FIELD } from "c/shoreshSchema";
import { shortWeekMinimums } from "../setup";

const FIVE_DAY_CAMP = { shrink: false, campDays: 5 };
const LOWER = { shrink: true, campDays: 5 };

/** A 3-day week, one bunk, one period a day, Swim (minimum 2) in it once. */
function holidayWeek(shortWeek) {
  return {
    ...camp({
      days: 3,
      blocks: [block(0)],
      activities: [activity("swim", { name: "Swim", min: 2 })],
      cells: [{ day: 0, group: "g1", block: "b0", act: "swim" }]
    }),
    shortWeek
  };
}

describe("a short week's minimums (WEEK-4.2)", () => {
  // WEEK-4.2
  it("keeps each minimum by default: Swim still needs 2 in a 3-day week", () => {
    for (const shortWeek of [undefined, FIVE_DAY_CAMP]) {
      const week = checkGeneratedWeek(holidayWeek(shortWeek));
      expect(week.checked.stillNeeded).toEqual([
        "Swim · Bunk g1: 1 still needed"
      ]);
      expect(week.shortWeek).toEqual([]);
    }
  });

  // WEEK-4.2
  it("lowered to match the days: Swim needs 1 in a 3-day week, and the Why list says so", () => {
    const week = checkGeneratedWeek(holidayWeek(LOWER));
    expect(week.checked.stillNeeded).toEqual([]);
    expect(week.shortWeek).toEqual([
      "Short week: Swim needs 1 this week, not 2"
    ]);
  });

  // WEEK-4.2
  it("the build places what the choice asks for", () => {
    const empty = (shortWeek) => ({
      ...camp({
        days: 3,
        blocks: [block(0)],
        activities: [
          activity("swim", { name: "Swim", min: 3, priority: "Low" }),
          activity("arts", { name: "Arts", min: 0, priority: "High" })
        ]
      }),
      shortWeek
    });
    const swims = (result) =>
      result.days.filter((d) => d.items.some((i) => i.id === "swim")).length;
    const kept = generateWeek(empty(FIVE_DAY_CAMP));
    expect(kept.ok).toBe(true);
    expect(swims(kept)).toBe(3);
    const lowered = generateWeek(empty(LOWER));
    expect(lowered.ok).toBe(true);
    expect(swims(lowered)).toBeGreaterThanOrEqual(2);
    expect(lowered.stillNeeded).toEqual([]);
  });

  // WEEK-4.2
  it("rounds to the nearest, halves up, never below 1 and never above the minimum set up", () => {
    const acts = [
      { id: "a", min: 2 },
      { id: "b", min: 1 },
      { id: "c", min: 5 },
      { id: "d", min: 0 },
      { id: "e", min: 4 }
    ];
    const mins = (shortWeek, days) =>
      shortWeekMinimums(acts, shortWeek, days).map((a) => a.min);
    // 2x3/5 = 1.2 -> 1; 1x3/5 = 0.6 -> 1; 5x3/5 = 3; 0 stays 0; 4x3/5 = 2.4 -> 2.
    expect(mins(LOWER, 3)).toEqual([1, 1, 3, 0, 2]);
    // 1 day: never below 1. 5x1/5 = 1; 4x1/5 = 0.8 -> 1.
    expect(mins(LOWER, 1)).toEqual([1, 1, 1, 0, 1]);
    // 2.5 rounds up: 5x2/4.
    expect(mins({ shrink: true, campDays: 4 }, 2)[2]).toBe(3);
    // A full week, a longer one, or the keep choice: unchanged.
    expect(mins(LOWER, 5)).toEqual([2, 1, 5, 0, 4]);
    expect(mins(LOWER, 6)).toEqual([2, 1, 5, 0, 4]);
    expect(mins(FIVE_DAY_CAMP, 3)).toEqual([2, 1, 5, 0, 4]);
    expect(mins(null, 3)).toEqual([2, 1, 5, 0, 4]);
  });

  // WEEK-4.2
  it("the camp's choice comes from its season, keep by default; normal is the days its programs run", () => {
    const P = FIELD.Program;
    const program = {
      [P.Sunday]: true,
      [P.Monday]: true,
      [P.Tuesday]: true,
      [P.Wednesday]: true,
      [P.Thursday]: true
    };
    const setup = (season) => ({ season, programs: [{ program }] });
    expect(campShortWeek(setup({}))).toEqual({ shrink: false, campDays: 5 });
    expect(
      campShortWeek(setup({ [FIELD.Season.ShrinkShortWeek]: true }))
    ).toEqual({ shrink: true, campDays: 5 });
  });
});
