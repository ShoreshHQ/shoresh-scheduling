/**
 * A later week is never reshuffled behind the director's back (wiki decision 0005,
 * docs/protocol/week.md): building or changing one week gives another week nothing new to build
 * from, so the other week comes out exactly as it did.
 */
import { generateWeek } from "c/shoreshEngine";
import { activity, block, camp, dateAt, group } from "./data/camp";

const spec = {
  groups: [group("g1"), group("g2"), group("g3", { division: "div2" })],
  days: 3,
  blocks: [block(1), block(2), block(3)],
  locations: [{ id: "pool", name: "Pool", fit: 2 }],
  activities: [
    activity("swim", { min: 2, max: 3, atOnce: 2, location: "pool" }),
    activity("arts", { min: 1, max: 3, atOnce: 2 }),
    activity("hike", { min: 1, max: 2, atOnce: 1, priority: "Low" })
  ]
};

function rowsOf(result) {
  return JSON.stringify(
    result.days.map((d) => ({
      items: d.items.map((i) => `${i.kind}:${i.id}`).join(" "),
      rows: d.rows
    }))
  );
}

describe("other weeks", () => {
  // WEEK-6.1
  it("building and changing week 1 leaves what week 2 builds exactly as it was", () => {
    const week2 = () => rowsOf(generateWeek(camp({ ...spec, weekId: "w2" })));
    const before = week2();

    // Week 1 built, then built again with a hand edit locked in and another option.
    generateWeek(camp({ ...spec, weekId: "w1" }));
    generateWeek(
      camp({
        ...spec,
        weekId: "w1",
        option: 3,
        cells: [{ day: 0, group: "g1", block: "b1", act: "hike" }],
        locks: [{ date: dateAt(0), groupId: "g1", blockId: "b1" }]
      })
    );

    expect(week2()).toBe(before);
  });
});
