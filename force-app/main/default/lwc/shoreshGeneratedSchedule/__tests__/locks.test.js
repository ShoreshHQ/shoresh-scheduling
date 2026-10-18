import { LOCK, UNLOCK } from "c/shoreshGeneratedWeek";
import { lockChoices, lockedKeys, lockedText, weekCells } from "../locks";

// A made-up Monday: Flagpole fixed in Flag, a two-block Hike for Bunk 1, Swim for Bunk 2 in
// Period 1, Bunk 2's Period 2 Open; Bunk 2 is away in Period 3.
const DAY = {
  dateValue: "2026-06-29",
  blocks: [
    { id: "b1", name: "Flag" },
    { id: "b2", name: "Period 1" },
    { id: "b3", name: "Period 2" },
    { id: "b4", name: "Period 3" }
  ],
  groups: [
    { id: "g1", name: "Bunk 1" },
    { id: "g2", name: "Bunk 2" }
  ],
  items: [
    { kind: "F", id: "f1", name: "Flagpole" },
    { kind: "A", id: "a1", name: "Hike" },
    { kind: "A", id: "a2", name: "Swim" }
  ],
  rows: ["1,2,^,3", "1,3,,"]
};
const away = (groupId, blockId) => groupId === "g2" && blockId === "b4";
const cellsWith = (locks) => weekCells([DAY], lockedKeys(locks), away);
const lock = (groupId, blockId) => ({
  date: "2026-06-29",
  groupId,
  blockId
});
const cell = (groupId, blockId, where, groupName) => ({
  dateValue: "2026-06-29",
  groupId,
  blockId,
  where,
  groupName
});
const labels = (choices) => choices.map((c) => c.label);

describe("weekCells", () => {
  it("weighs each placement once, its whole length; leaves out an away cell with nothing in it", () => {
    const cells = cellsWith([lock("g1", "b3")]);
    expect(cells.map((c) => `${c.groupId}:${c.blockIds.join("+")}`)).toEqual([
      "g1:b1",
      "g1:b2+b3",
      "g1:b4",
      "g2:b1",
      "g2:b2",
      "g2:b3"
    ]);
    // A lock on the Hike's second block locks the Hike.
    expect(cells.find((c) => c.blockIds.includes("b3")).locked).toBe(true);
    expect(cells[0].setTime).toBe(true);
    expect(cells[0].filled).toBe(false);
  });
});

describe("a lock left where the bunk is now away", () => {
  it("is listed, so it can be unlocked; an away cell with no lock isn't", () => {
    const at = (c) => c.groupId === "g2" && c.blockIds[0] === "b4";
    expect(cellsWith([lock("g2", "b4")]).find(at)).toMatchObject({
      filled: false,
      locked: true
    });
    expect(cellsWith([]).find(at)).toBeUndefined();
  });
});

describe("lockChoices", () => {
  it("a focused cell: Lock it, an Open one too (kept empty); then Unlock it", () => {
    const open = cell("g2", "b3", "Bunk 2 · Monday · Period 2", "Bunk 2");
    // With it, Bunk 2's Monday: Swim there isn't locked yet.
    expect(labels(lockChoices(cellsWith([]), { cell: open }))).toEqual([
      "Lock Bunk 2 · Monday · Period 2",
      "Lock Bunk 2 · Monday"
    ]);
    const choices = lockChoices(cellsWith([lock("g2", "b3")]), { cell: open });
    expect(labels(choices)).toEqual([
      "Unlock Bunk 2 · Monday · Period 2",
      "Lock Bunk 2 · Monday",
      "Unlock Bunk 2 · Monday"
    ]);
    expect(choices[0].change).toEqual({
      action: UNLOCK,
      dateValue: "2026-06-29",
      groupId: "g2",
      blockId: "b3"
    });
  });

  it("never offers a fixed or recurring activity's cell", () => {
    const flag = cell("g1", "b1", "Bunk 1 · Monday · Flag", "Bunk 1");
    expect(
      labels(lockChoices(cellsWith([]), { cell: flag })).filter((l) =>
        l.includes("Flag")
      )
    ).toEqual([]);
  });

  it("a day shortcut locks only filled cells: offered while one isn't locked", () => {
    const day = { dateValue: "2026-06-29", name: "Monday" };
    const choices = lockChoices(cellsWith([]), { day });
    expect(labels(choices)).toEqual(["Lock Monday"]);
    expect(choices[0].change).toEqual({
      action: LOCK,
      dateValue: "2026-06-29"
    });
    // Every filled cell locked (Bunk 2's Open cell isn't): only Unlock.
    const all = [lock("g1", "b2"), lock("g1", "b4"), lock("g2", "b2")];
    expect(labels(lockChoices(cellsWith(all), { day }))).toEqual([
      "Unlock Monday"
    ]);
  });

  it("a group, and the focused cell's group's day", () => {
    const at = cell("g2", "b2", "Bunk 2 · Monday · Period 1", "Bunk 2");
    const choices = lockChoices(cellsWith([lock("g2", "b2")]), {
      cell: at,
      group: { groupId: "g2", name: "Bunk 2" }
    });
    // Bunk 2's only filled cell is locked: nothing left for the shortcuts to lock.
    expect(labels(choices)).toEqual([
      "Unlock Bunk 2 · Monday · Period 1",
      "Unlock Bunk 2",
      "Unlock Bunk 2 · Monday"
    ]);
    expect(choices[2].change).toEqual({
      action: UNLOCK,
      groupId: "g2",
      dateValue: "2026-06-29"
    });
  });

  it("each choice names every cell it covers, locked already or not (what Undo and Redo then leave)", () => {
    const k = (groupId, blockId) => `2026-06-29|${groupId}|${blockId}`;
    const keysOf = (choices, label) =>
      [...choices.find((c) => c.label === label).keys].sort();
    const choices = lockChoices(cellsWith([lock("g1", "b3")]), {
      cell: cell("g1", "b3", "Bunk 1 · Monday · Period 2", "Bunk 1"),
      day: { dateValue: "2026-06-29", name: "Monday" },
      group: { groupId: "g2", name: "Bunk 2" }
    });
    // The focused cell: Hike's whole placement.
    expect(keysOf(choices, "Unlock Bunk 1 · Monday · Period 2")).toEqual([
      k("g1", "b2"),
      k("g1", "b3")
    ]);
    // The day: every cell listed, the locked Hike too; Bunk 2's away Period 3 isn't listed.
    const day = [
      k("g1", "b1"),
      k("g1", "b2"),
      k("g1", "b3"),
      k("g1", "b4"),
      k("g2", "b1"),
      k("g2", "b2"),
      k("g2", "b3")
    ].sort();
    expect(keysOf(choices, "Lock Monday")).toEqual(day);
    expect(keysOf(choices, "Unlock Monday")).toEqual(day);
    expect(keysOf(choices, "Lock Bunk 2")).toEqual(
      [k("g2", "b1"), k("g2", "b2"), k("g2", "b3")].sort()
    );
    expect(keysOf(choices, "Lock Bunk 1 · Monday")).toEqual(
      [k("g1", "b1"), k("g1", "b2"), k("g1", "b3"), k("g1", "b4")].sort()
    );
  });

  it("offers nothing with nothing to say", () => {
    expect(lockChoices(cellsWith([]), {})).toEqual([]);
  });
});

describe("lockedText", () => {
  it("says what a change did", () => {
    expect(lockedText({ label: "Lock Monday", change: { action: LOCK } })).toBe(
      "Locked Monday."
    );
    expect(
      lockedText({ label: "Unlock Bunk 2", change: { action: UNLOCK } })
    ).toBe("Unlocked Bunk 2.");
  });
});
