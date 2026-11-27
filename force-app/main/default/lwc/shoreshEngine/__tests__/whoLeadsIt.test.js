/**
 * Who leads it (ADR 0031 piece B; protocol CORE-6.20): a staff member leading two different
 * activities placed at the same time is a line in the Why list, once per day and time, and never
 * fixed: the build never reads Who leads it, so a camp's week is the same with or without it.
 */
import { checkGeneratedWeek, generateWeek, measureWeek } from "c/shoreshEngine";
import { activity, block, camp, dateAt, group } from "./data/camp";
import { randomCamp, withHistory } from "./data/randomCamp";

const DANA = { id: "s1", name: "Dana" };
const ELI = { id: "s2", name: "Eli" };

/** A week with these cells, as a person placed them, and its check. */
function checked(spec) {
  const result = generateWeek(camp({ mode: "fillOpen", ...spec }));
  expect(result.ok).toBe(true);
  return result;
}

describe("Who leads it", () => {
  // CORE-6.20
  it("one person leading two activities at the same time is one line, by day and time block", () => {
    const result = checked({
      groups: [group("g1"), group("g2"), group("g3")],
      blocks: [block(0), block(1)],
      activities: [
        activity("Archery", { leaders: [DANA] }),
        activity("Swim", { leaders: [DANA, ELI] }),
        activity("Arts", { leaders: [ELI] })
      ],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "Archery" },
        { day: 0, group: "g2", block: "b0", act: "Swim" },
        { day: 0, group: "g3", block: "b0", act: "Swim" },
        { day: 0, group: "g1", block: "b1", act: "Swim" },
        { day: 0, group: "g2", block: "b1", act: "Arts" },
        { day: 0, group: "g3", block: "b1", act: "Archery" }
      ]
    });
    expect(result.leading.map((l) => l.text)).toEqual([
      `Dana leads Archery and Swim · Monday · Period 1`,
      `Dana leads Swim and Archery · Monday · Period 2`,
      `Eli leads Swim and Arts · Monday · Period 2`
    ]);
    expect(result.leading[0]).toMatchObject({
      dateValue: dateAt(0),
      blockId: "b0",
      staffId: "s1"
    });
  });

  // CORE-6.20
  it("the same activity with several groups at once is no conflict, nor one person in two blocks", () => {
    const result = checked({
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      activities: [
        activity("Swim", { atOnce: 2, leaders: [DANA] }),
        activity("Archery", { leaders: [DANA] })
      ],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "Swim" },
        { day: 0, group: "g2", block: "b0", act: "Swim" },
        { day: 0, group: "g1", block: "b1", act: "Archery" }
      ]
    });
    expect(result.leading).toBeUndefined();
  });

  // CORE-6.20
  it("a multi-block activity conflicts in each block it covers", () => {
    const result = checked({
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      activities: [
        activity("Hike", { span: 2, leaders: [DANA] }),
        activity("Archery", { leaders: [DANA] })
      ],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "Hike" },
        { day: 0, group: "g1", block: "b1", act: "Hike" },
        { day: 0, group: "g2", block: "b1", act: "Archery" }
      ]
    });
    expect(result.leading.map((l) => l.blockId)).toEqual(["b1"]);
  });

  // CORE-6.20
  it("the Why list shows each conflict to look at", () => {
    const result = checked({
      groups: [group("g1"), group("g2")],
      blocks: [block(0)],
      activities: [
        activity("Archery", { leaders: [DANA] }),
        activity("Swim", { leaders: [DANA] })
      ],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "Archery" },
        { day: 0, group: "g2", block: "b0", act: "Swim" }
      ]
    });
    const look = measureWeek(result, []).look.filter(
      (l) => l.kind === "leading"
    );
    expect(look).toEqual([
      expect.objectContaining({
        key: `leading|${dateAt(0)}|b0|s1`,
        text: "Dana leads Archery and Swim · Monday · Period 1",
        dateValue: dateAt(0),
        blockId: "b0"
      })
    ]);
  });

  // CORE-6.20: Generated Schedule checks a week as it stands (checkGeneratedWeek), so a leader in
  // two places at once is a line there too, from the activities' own Leaders__r rows.
  it("Generated Schedule's own check of a week shows each conflict", () => {
    const input = camp({
      groups: [group("g1"), group("g2")],
      blocks: [block(0), block(1)],
      activities: [
        activity("Art", { leaders: [DANA] }),
        activity("Archery", {
          leaders: [DANA],
          off: [{ block: "b0", day: "Monday" }]
        })
      ],
      cells: [
        { day: 0, group: "g1", block: "b0", act: "Art" },
        { day: 0, group: "g2", block: "b1", act: "Archery" },
        { day: 0, group: "g1", block: "b1", act: "Art" }
      ]
    });
    expect(
      checkGeneratedWeek(input).checked.leading.map((l) => l.text)
    ).toEqual(["Dana leads Art and Archery · Monday · Period 2"]);
  });

  // CORE-6.20: the build never reads Who leads it.
  it("a camp builds exactly the same week with or without leaders (60 random camps)", () => {
    const changed = [];
    for (let seed = 1; seed <= 60; seed++) {
      const spec = withHistory(randomCamp(seed), seed);
      const plain = generateWeek(camp(spec));
      const led = generateWeek(
        camp({
          ...spec,
          activities: spec.activities.map((a, i) => ({
            ...a,
            leaders: [i % 2 ? DANA : ELI]
          }))
        })
      );
      // Everything but the Why list's own conflict lines, byte for byte.
      const { leading, ...rest } = led;
      if (JSON.stringify(rest) !== JSON.stringify(plain)) {
        changed.push(seed);
      }
      expect(leading === undefined || Array.isArray(leading)).toBe(true);
    }
    expect(changed).toEqual([]);
  });
});
