import { intentOf, plan, withSeen } from "../conflicts";
import { diffRuns } from "../slotEdits";

// Scenario tests for conflicts.js; the seeded property test is conflicts.property.test.js.

const DATE = "2026-06-29";
const GROUPS = [
  { id: "g1", name: "Bunk 1" },
  { id: "g2", name: "Bunk 2" }
];

/** A day from rows of identities ('' Open, 'A:a1', '^A:a1', 'F:f1'). */
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
        const [kind, id] = slot.split(":");
        let i = items.findIndex((it) => it.kind === kind && it.id === id);
        if (i < 0) {
          items.push({ kind, id, name: id });
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
        after: ["A:a3"],
        blockIds: ["t2"]
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
