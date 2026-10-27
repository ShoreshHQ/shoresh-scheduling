/**
 * CLOSE (docs/protocol/close.md) in the engine: a group away this week is not sent to the build
 * (GeneratedInputs leaves it out), so its row comes back exactly as it was, nothing new placed in
 * it and nothing cleared; a closure that leaves a group nothing to do is shown, cell by cell.
 */
import { generateWeek } from "c/shoreshEngine";
import { activity, at, block, camp, cellsOf, dateAt, group } from "./data/camp";

describe("closures and groups away", () => {
  // CLOSE-4.1
  it("a group away is left out of the build: its row comes back as it was, nothing new in it", () => {
    const input = camp({
      groups: [group("g1"), group("away")],
      days: 2,
      blocks: [block(0), block(1)],
      activities: [activity("swim", { atOnce: null }), activity("arts")],
      // Swim was placed for the group before it was marked away.
      cells: [{ day: 0, group: "away", block: "b0", act: "swim" }]
    });
    input.groups = input.groups.filter((g) => g.Id !== "away");
    const before = cellsOf(input.days);
    const result = generateWeek(input);
    expect(result.ok).toBe(true);
    const after = cellsOf(result.days);
    [0, 1].forEach((d) => expect(after[d].away).toEqual(before[d].away));
    // The placement already there stays (CLOSE-6.1 shows it); the empty cells stay empty.
    expect(after[0].away[0]).toEqual({ kind: "A", id: "swim", head: true });
    expect(after[1].away).toEqual([null, null]);
    expect(at(result, 0, "g1", 1)).not.toBeNull();
  });

  // CLOSE-6.2
  it("a closure that leaves a group nothing it can do: its cells stay Open, each saying why, and the rest is built", () => {
    const result = generateWeek(
      camp({
        groups: [group("g1"), group("g2")],
        blocks: [block(0), block(1)],
        activities: [
          activity("swim", { location: "pool", eligible: ["g1"] }),
          activity("arts", { eligible: ["g2"], atOnce: null })
        ],
        locations: [{ id: "pool", fit: 2 }],
        weekExceptions: [{ Id: "we1", Week__c: "week1", Location__c: "pool" }]
      })
    );
    expect(result.ok).toBe(true);
    ["b0", "b1"].forEach((b, i) => {
      expect(at(result, 0, "g1", i)).toBeNull();
      const open = result.openCells.find(
        (c) => c.date === dateAt(0) && c.groupId === "g1" && c.blockId === b
      );
      expect(open.reason).toBe("No activity this week is set up for Bunk g1");
    });
    expect(at(result, 0, "g2", 0)).toBe("arts");
  });
});
