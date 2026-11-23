/**
 * Undo and Redo (history.js) without the screen: a step that added an activity carries it
 * (LOCK-5.5), through a Use yours, an Undo and Redo, and a Redo that added it again.
 */
import { History, LIMIT } from "../history";

const run = (before, after) => ({ before: [before], after: [after] });
const SWIM = { id: "a1", name: "Swim" };

describe("Undo and Redo", () => {
  it("a step keeps the activity it added through Undo, Redo and a Use yours", () => {
    const h = new History();
    h.record({
      id: 1,
      runs: [run("", "A:a1")],
      label: "Placed Swim",
      added: SWIM
    });
    expect(h.undo().step.added).toEqual(SWIM);
    expect(h.find(1).added).toEqual(SWIM);
    h.redo();
    h.replace(1, { id: 1, runs: [run("A:a2", "A:a1")], label: "Placed Swim" });
    expect(h.find(1)).toEqual({
      id: 1,
      runs: [run("A:a2", "A:a1")],
      label: "Placed Swim",
      added: SWIM
    });
  });

  it("what a step added can be marked taken off, or nothing of its own", () => {
    const h = new History();
    h.record({
      id: 1,
      runs: [run("", "A:a1")],
      label: "Placed Swim",
      added: SWIM
    });
    h.setAdded(1, { ...SWIM, removed: true });
    expect(h.find(1).added.removed).toBe(true);
    h.setAdded(1, null);
    expect(h.find(1).added).toBeNull();
  });

  it("an activity added again under a new Id is renamed in every step, Undo and Redo alike", () => {
    const h = new History();
    h.record({ id: 1, runs: [run("", "A:a1")], label: "one" });
    h.record({
      id: 2,
      runs: [{ before: ["A:a1", "^A:a1"], after: ["", ""] }],
      label: "two"
    });
    h.record({ id: 3, runs: [run("", "A:a3")], label: "three" });
    h.undo();
    h.undo();
    h.renameActivity("a1", "a9");
    expect(h.find(1).runs).toEqual([run("", "A:a9")]);
    expect(h.find(2).runs).toEqual([
      { before: ["A:a9", "^A:a9"], after: ["", ""] }
    ]);
    expect(h.find(3).runs).toEqual([run("", "A:a3")]);
    expect(h.canRedo).toBe(true);
  });

  it("a step forgotten, cleared or past the limit takes what it added with it", () => {
    const h = new History();
    h.record({ id: 1, runs: [], label: "one", added: SWIM });
    h.forget(1);
    expect(h.find(1)).toBeUndefined();
    h.record({ id: 2, runs: [], label: "two", added: SWIM });
    h.clear();
    expect(h.find(2)).toBeUndefined();
    for (let id = 3; id < 3 + LIMIT + 1; id++) {
      h.record({ id, runs: [], label: `${id}` });
    }
    expect(h.find(3)).toBeUndefined();
    expect(h.replace(3, { id: 3, runs: [], label: "gone" })).toBe(false);
  });
});
