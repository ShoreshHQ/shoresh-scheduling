// The seams Generated Schedule needs from the week editor (locks, unlock request, tools, save
// events, cell focus). All are off until a host passes them: Manual Build passes none.
import { createElement } from "lwc";
import ShoreshWeekEditor from "c/shoreshWeekEditor";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { WITH_SOCCER, WITH_SWIM, draft, schedule } from "./data/draftFixture";

const SETUP = { activities: [], locations: [] };
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];

// Bunk 1 on Monday: Period 2 is the cell these tests work on.
const P2 = "2026-06-29|g1|t2";
const SWIM_AT_P2 = ["1,2,", "1,,"];
const LUNCH_KEY = "2026-06-29|g1|t3";

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

const saved = (items, rows, conflicts = []) => ({
  status: "saved",
  conflicts,
  schedule: schedule(items, rows)
});

/** An answer that carries the week's locks the way the server sends them (Monday's, per bunk). */
const savedLocked = (items, rows, mondayLocks, conflicts = []) => {
  const result = saved(items, rows, conflicts);
  result.schedule.days[0].locks = mondayLocks;
  result.schedule.days[1].locks = [];
  return result;
};

const BOATING = [
  { kind: "F", id: "f1", name: "Flagpole", gone: false },
  { kind: "A", id: "a2", name: "Boating", gone: false }
];

async function render(saveRuns, options = {}) {
  const element = createElement("c-shoresh-week-editor", {
    is: ShoreshWeekEditor
  });
  element.terms = buildTerms(options.labels || LABELS);
  element.setup = nsRecord(SETUP);
  element.weekName = "Week 1";
  element.programName = "Main";
  element.saveRuns = saveRuns;
  if (options.locks) {
    element.locks = options.locks;
  }
  if (options.tools === false) {
    element.tools = false;
  }
  // Everything the host hears, in order.
  const heard = [];
  [
    "saved",
    "editstate",
    "unlockrequest",
    "cellfocus",
    "statechange",
    "reload"
  ].forEach((name) =>
    element.addEventListener(name, (e) =>
      heard.push({ name, detail: e.detail })
    )
  );
  const hostTools = document.createElement("button");
  hostTools.slot = "tools";
  element.appendChild(hostTools);
  document.body.appendChild(element);
  element.show(
    options.items ? draft(options.items, options.rows) : draft(),
    true
  );
  await flush();
  return { element, heard };
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cell = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);
const cellText = (element, key) =>
  cell(element, key).querySelector(".cell-name").textContent;
const lockText = (element, key) => {
  const icon = cell(element, key).querySelector("lightning-icon");
  return icon ? icon.alternativeText : null;
};
const heardNamed = (heard, name) =>
  heard.filter((h) => h.name === name).map((h) => h.detail);

async function press(target, key) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
  );
  await flush();
}

/** Something on the grid as the grid itself says it (a drag, a drop). */
async function fromGrid(element, name, detail) {
  grid(element).dispatchEvent(new CustomEvent(name, { detail }));
  await flush();
}

/** Types a name into a cell and presses Enter, the way a director places an activity. */
async function typeInto(element, key, text) {
  await press(cell(element, key), "Enter");
  const input = q(element, '[data-id="slot-input"]');
  input.value = text;
  input.dispatchEvent(new CustomEvent("input"));
  await flush();
  await press(input, "Enter");
}

async function placeSwim(element) {
  await press(cell(element, "0-1"), "Enter");
  const input = q(element, '[data-id="slot-input"]');
  input.value = "swim";
  input.dispatchEvent(new CustomEvent("input"));
  await flush();
  await press(input, "Enter");
}

describe("c-shoresh-week-editor seams for Generated Schedule", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  describe("locks: what the cells show", () => {
    it("a locked cell says Locked, and one locked empty says Locked empty and shows no Open", async () => {
      const { element } = await render(jest.fn(), {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: [P2, "2026-06-29|g1|t3"]
      });
      expect(lockText(element, "0-1")).toBe("Locked");
      expect(lockText(element, "0-2")).toBe("Locked empty");
      expect(cellText(element, "0-2")).toBe("");
      // Not locked, not marked.
      expect(lockText(element, "0-0")).toBeNull();
      expect(cellText(element, "1-1")).toBe("Open");
    });

    it("no locks passed: no cell is marked and nothing changes", async () => {
      const { element } = await render(jest.fn());
      expect(lockText(element, "0-1")).toBeNull();
      expect(cellText(element, "0-1")).toBe("Open");
    });

    it("a lock covers the whole placement, and an edit locks the cell it made at once", async () => {
      const saveRuns = jest.fn().mockReturnValue(new Promise(() => {}));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      expect(cellText(element, "0-1")).toBe("Swim");
      expect(lockText(element, "0-1")).toBe("Locked");
    });
  });

  describe("locks: a locked cell is left alone", () => {
    async function lockedSwim(saveRuns = jest.fn()) {
      return render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: [P2, "2026-06-29|g1|t3"]
      });
    }

    it("Enter asks to unlock instead of opening the typing box, and focus stays on the cell", async () => {
      const { element, heard } = await lockedSwim();
      expect(grid(element).shadowRoot.activeElement).toBeNull();
      await press(cell(element, "0-1"), "Enter");
      expect(q(element, '[data-id="slot-editor"]')).toBeNull();
      const [request] = heardNamed(heard, "unlockrequest");
      expect(request.slot).toEqual({ day: 0, group: 0, block: 1 });
      expect(request.key).toBe(P2);
      expect(grid(element).shadowRoot.activeElement).toBe(cell(element, "0-1"));
    });

    it("a click asks to unlock; a click on a cell that is not locked does not", async () => {
      const { element, heard } = await lockedSwim();
      await fromGrid(element, "cellclick", { key: "1-1" });
      expect(heardNamed(heard, "unlockrequest")).toHaveLength(0);
      await fromGrid(element, "cellclick", { key: "0-1" });
      expect(heardNamed(heard, "unlockrequest")).toHaveLength(1);
    });

    it("a locked empty cell asks to unlock too", async () => {
      const { element, heard } = await lockedSwim();
      await press(cell(element, "0-2"), "Enter");
      expect(q(element, '[data-id="slot-editor"]')).toBeNull();
      expect(heardNamed(heard, "unlockrequest")[0].slot).toEqual({
        day: 0,
        group: 0,
        block: 2
      });
    });

    it("Delete does not clear it", async () => {
      const saveRuns = jest.fn();
      const { element } = await lockedSwim(saveRuns);
      await press(cell(element, "0-1"), "Delete");
      expect(saveRuns).not.toHaveBeenCalled();
      expect(cellText(element, "0-1")).toBe("Swim");
      expect(q(element, '[data-id="notice"]').textContent).toMatch(/locked/);
    });

    it("Delete on a cell locked empty says it is locked", async () => {
      const saveRuns = jest.fn();
      const { element } = await lockedSwim(saveRuns);
      await press(cell(element, "0-2"), "Delete");
      expect(saveRuns).not.toHaveBeenCalled();
      expect(q(element, '[data-id="notice"]').textContent).toMatch(/locked/);
    });

    it("cannot be picked up with Space", async () => {
      const saveRuns = jest.fn();
      const { element } = await lockedSwim(saveRuns);
      await press(cell(element, "0-1"), " ");
      expect(q(element, '[data-id="notice"]').textContent).toMatch(/locked/);
      // Nothing is held: Space on an Open cell puts nothing down.
      await press(cell(element, "1-1"), " ");
      expect(saveRuns).not.toHaveBeenCalled();
      expect(cellText(element, "1-1")).toBe("Open");
    });

    it("cannot be dragged: the drag does not start, so a drop moves nothing", async () => {
      const saveRuns = jest.fn();
      const { element } = await lockedSwim(saveRuns);
      await fromGrid(element, "celldragstart", { key: "0-1" });
      await fromGrid(element, "celldrop", { key: "1-1", data: "Swim", at: 0 });
      expect(saveRuns).not.toHaveBeenCalled();
      expect(cellText(element, "0-1")).toBe("Swim");
      expect(cellText(element, "1-1")).toBe("Open");
    });

    it("nothing can be dropped on it: not an activity from the list, not a placement", async () => {
      const saveRuns = jest.fn();
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: [P2]
      });
      // Soccer from the list, onto the locked Swim.
      q(element, "c-shoresh-build-palette").dispatchEvent(
        new CustomEvent("activitydragstart", { detail: { id: "a3" } })
      );
      await fromGrid(element, "celldrop", {
        key: "0-1",
        data: "Soccer",
        at: 0
      });
      expect(saveRuns).not.toHaveBeenCalled();
      expect(cellText(element, "0-1")).toBe("Swim");
      expect(q(element, '[data-id="notice"]').textContent).toMatch(/locked/);
    });

    it("an unlocked placement can't be dropped onto a locked cell either", async () => {
      const saveRuns = jest.fn();
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: ["1,,", "1,2,"],
        locks: ["2026-06-29|g1|t2"]
      });
      await fromGrid(element, "celldragstart", { key: "1-1" });
      await fromGrid(element, "celldrop", { key: "0-1", data: "Swim", at: 0 });
      expect(saveRuns).not.toHaveBeenCalled();
      expect(cellText(element, "1-1")).toBe("Swim");
      expect(lockText(element, "0-1")).toBe("Locked empty");
    });

    it("an unlocked cell still works as before when others are locked", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(saved(WITH_SWIM, ["1,,", "1,2,"]));
      const { element } = await render(saveRuns, { locks: ["x|y|z"] });
      await press(cell(element, "1-1"), "Enter");
      expect(q(element, '[data-id="slot-editor"]')).not.toBeNull();
    });
  });

  describe("locks in the runs that are saved", () => {
    const CLEAR_MONDAY = {
      kind: "clear",
      dates: ["2026-06-29"],
      name: "Monday"
    };
    const bySent = (saveRuns, n) => saveRuns.mock.calls[n][0][0].runs[0];

    it("a locked cell cleared by a tool, then Undo and Redo, restores its lock exactly", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]))
        .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]));
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: [P2]
      });
      element.runTool(CLEAR_MONDAY);
      await flush();
      // The clear names the lock the screen saw and carries nothing to restore.
      expect(bySent(saveRuns, 0).locksBefore).toEqual(["1"]);
      expect(bySent(saveRuns, 0).locksAfter).toBeUndefined();
      // Cleared: the lock went with it.
      expect(lockText(element, "0-1")).toBeNull();

      q(element, '[data-id="undo"]').click();
      await flush();
      // Undo: the cell is unlocked on the server now; it must be locked again.
      expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
      expect(bySent(saveRuns, 1).locksAfter).toEqual(["1"]);
      expect(bySent(saveRuns, 1).after).toEqual(["A:a1"]);
      // The lock is back on screen.
      expect(lockText(element, "0-1")).toBe("Locked");

      q(element, '[data-id="redo"]').click();
      await flush();
      expect(bySent(saveRuns, 2).locksBefore).toEqual(["1"]);
      expect(bySent(saveRuns, 2).locksAfter).toEqual([""]);
      expect(lockText(element, "0-1")).toBeNull();
    });

    it("a hand edit names the locks the screen saw, and Undo puts back the ones from before it", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      expect(bySent(saveRuns, 0).locksBefore).toEqual([""]);
      expect(bySent(saveRuns, 0).locksAfter).toBeUndefined();

      q(element, '[data-id="undo"]').click();
      await flush();
      // The edit locked the cell; undoing it leaves the cell as it was: unlocked.
      expect(bySent(saveRuns, 1).locksBefore).toEqual(["1"]);
      expect(bySent(saveRuns, 1).locksAfter).toEqual([""]);
    });

    describe("Undo and Redo keep a Lock the director set or removed after the step (Greg, 2026-10-18)", () => {
      const EMPTY = ["1,,", "1,,"];
      /** A Lock or Unlock from the host's Lock menu: the host says which cells changed, then passes the locks as saved. */
      const fromLockMenu = async (element, locks) => {
        element.lockChosen([P2]);
        element.locks = locks;
        await flush();
      };
      const undo = async (element) => {
        q(element, '[data-id="undo"]').click();
        await flush();
      };
      const redo = async (element) => {
        q(element, '[data-id="redo"]').click();
        await flush();
      };

      it("a Lock set on a cleared cell stays through Undo and Redo", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY));
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: SWIM_AT_P2,
          locks: []
        });
        await press(cell(element, "0-1"), "Delete");
        // The director locks the emptied cell from the Lock menu.
        await fromLockMenu(element, [P2]);

        q(element, '[data-id="undo"]').click();
        await flush();
        expect(bySent(saveRuns, 1).after).toEqual(["A:a1"]);
        expect(bySent(saveRuns, 1).locksBefore).toEqual(["1"]);
        expect(bySent(saveRuns, 1).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked");

        q(element, '[data-id="redo"]').click();
        await flush();
        expect(bySent(saveRuns, 2).after).toEqual([""]);
        expect(bySent(saveRuns, 2).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked empty");
      });

      it("a Lock set again on a cell a tool cleared and unlocked stays through Undo and Redo", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY));
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: SWIM_AT_P2,
          locks: [P2]
        });
        element.runTool(CLEAR_MONDAY);
        await flush();
        expect(lockText(element, "0-1")).toBeNull();
        await fromLockMenu(element, [P2]);

        q(element, '[data-id="undo"]').click();
        await flush();
        expect(bySent(saveRuns, 1).locksAfter).toEqual(["1"]);
        q(element, '[data-id="redo"]').click();
        await flush();
        // Redo would have taken the lock off with the activity; the director's Lock stays.
        expect(bySent(saveRuns, 2).locksBefore).toEqual(["1"]);
        expect(bySent(saveRuns, 2).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked empty");
      });

      it("a lock the director removed from an edit stays off through Undo, then Redo", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2));
        const { element } = await render(saveRuns, { locks: [] });
        await placeSwim(element);
        expect(lockText(element, "0-1")).toBe("Locked");
        // The director unlocks the cell the edit locked.
        await fromLockMenu(element, []);

        q(element, '[data-id="undo"]').click();
        await flush();
        expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
        expect(bySent(saveRuns, 1).locksAfter).toEqual([""]);
        q(element, '[data-id="redo"]').click();
        await flush();
        expect(bySent(saveRuns, 2).after).toEqual(["A:a1"]);
        expect(bySent(saveRuns, 2).locksAfter).toEqual([""]);
        expect(lockText(element, "0-1")).toBeNull();
      });

      it("undoing an earlier step keeps a Lock set after a later step on the same cell", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY));
        const { element } = await render(saveRuns, { locks: [] });
        // Step 1 places Swim (and locks it); the director unlocks it to change it again.
        await placeSwim(element);
        await fromLockMenu(element, []);
        // Step 2 clears it; then the director locks the empty cell.
        await press(cell(element, "0-1"), "Delete");
        await fromLockMenu(element, [P2]);

        await undo(element);
        expect(bySent(saveRuns, 2).after).toEqual(["A:a1"]);
        expect(bySent(saveRuns, 2).locksAfter).toEqual(["1"]);
        // Step 1 made its lock before the director's Lock: undoing it keeps the Lock.
        await undo(element);
        expect(bySent(saveRuns, 3).after).toEqual([""]);
        expect(bySent(saveRuns, 3).locksBefore).toEqual(["1"]);
        expect(bySent(saveRuns, 3).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked empty");
      });

      it("a cell unlocked and locked again from the Lock menu keeps its Lock through Undo and Redo", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2));
        const { element } = await render(saveRuns, { locks: [] });
        await placeSwim(element);
        // Unlock, then Lock again: the cell ends locked, as the edit left it, but by the director.
        await fromLockMenu(element, []);
        await fromLockMenu(element, [P2]);

        await undo(element);
        expect(bySent(saveRuns, 1).after).toEqual([""]);
        expect(bySent(saveRuns, 1).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked empty");
        await redo(element);
        expect(bySent(saveRuns, 2).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked");
      });

      it("an Undo sent again by Use yours keeps a Lock set after its step", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          // Someone else put Soccer there meanwhile.
          .mockResolvedValueOnce(saved(WITH_SOCCER, SWIM_AT_P2, [0]))
          .mockResolvedValue(saved(undefined, EMPTY));
        const { element } = await render(saveRuns, { locks: [] });
        await placeSwim(element);
        await fromLockMenu(element, []);
        await fromLockMenu(element, [P2]);
        await undo(element);
        expect(q(element, '[data-id="conflict"]')).not.toBeNull();
        q(element, '[data-id="use-yours"]').click();
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(3);
        expect(bySent(saveRuns, 2).after).toEqual([""]);
        expect(bySent(saveRuns, 2).locksAfter).toEqual(["1"]);
      });

      it("a Redo sent again by Use yours keeps a Lock set after its step", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          // Someone else put Soccer there meanwhile.
          .mockResolvedValueOnce(saved(WITH_SOCCER, SWIM_AT_P2, [0]))
          .mockResolvedValue(saved(WITH_SWIM, SWIM_AT_P2));
        const { element } = await render(saveRuns, { locks: [] });
        await placeSwim(element);
        await undo(element);
        // The director locks the cell the Undo emptied.
        await fromLockMenu(element, [P2]);
        await redo(element);
        expect(q(element, '[data-id="conflict"]')).not.toBeNull();
        // The Lock-menu Lock came after the step: kept, though the Redo leaves the cell locked anyway.
        q(element, '[data-id="use-yours"]').click();
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(4);
        expect(bySent(saveRuns, 3).after).toEqual(["A:a1"]);
        expect(bySent(saveRuns, 3).locksAfter).toEqual(["1"]);
      });

      it("two steps on one cell, a Lock after them, then Undo, Undo, Redo, Redo: the Lock stays throughout", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY));
        const { element } = await render(saveRuns, { locks: [] });
        // Edit A places Swim; the cell is unlocked so edit B can clear it; then the Lock.
        await placeSwim(element);
        await fromLockMenu(element, []);
        await press(cell(element, "0-1"), "Delete");
        await fromLockMenu(element, [P2]);

        const leaves = (n, after, shown) => {
          const sent = bySent(saveRuns, n);
          expect(sent.after).toEqual([after]);
          expect(sent.locksBefore).toEqual(["1"]);
          expect(sent.locksAfter).toEqual(["1"]);
          expect(lockText(element, "0-1")).toBe(shown);
        };
        await undo(element);
        leaves(2, "A:a1", "Locked");
        await undo(element);
        leaves(3, "", "Locked empty");
        await redo(element);
        leaves(4, "A:a1", "Locked");
        await redo(element);
        leaves(5, "", "Locked empty");
      });

      it("a Lock-menu choice made before a step doesn't hold its cell when that step is undone and redone", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2));
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: SWIM_AT_P2,
          locks: [P2]
        });
        // The director's Unlock comes before both steps: each Undo and Redo leaves its own lock.
        await fromLockMenu(element, []);
        await press(cell(element, "0-1"), "Delete");
        await placeSwim(element);
        await undo(element);
        expect(bySent(saveRuns, 2).after).toEqual([""]);
        expect(bySent(saveRuns, 2).locksAfter).toEqual([""]);
        await undo(element);
        expect(bySent(saveRuns, 3).locksAfter).toEqual([""]);
        await redo(element);
        expect(bySent(saveRuns, 4).locksAfter).toEqual([""]);
        await redo(element);
        expect(bySent(saveRuns, 5).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked");
      });

      it("with no Lock changed, Undo then Redo takes back and makes again the edit's own lock", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2));
        const { element } = await render(saveRuns, { locks: [] });
        await placeSwim(element);
        q(element, '[data-id="undo"]').click();
        await flush();
        expect(bySent(saveRuns, 1).locksAfter).toEqual([""]);
        expect(lockText(element, "0-1")).toBeNull();
        q(element, '[data-id="redo"]').click();
        await flush();
        expect(bySent(saveRuns, 2).locksBefore).toEqual([""]);
        expect(bySent(saveRuns, 2).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked");
      });

      it("an Undo leaves a lock someone else set since on a cell its step didn't lock or unlock", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2));
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: SWIM_AT_P2,
          locks: []
        });
        // Clearing an unlocked Swim leaves the cell unlocked: the step makes no lock.
        await press(cell(element, "0-1"), "Delete");
        // The week read again: someone else locked the cell meanwhile (not from this Lock menu).
        element.locks = [P2];
        await flush();
        await undo(element);
        expect(bySent(saveRuns, 1).after).toEqual(["A:a1"]);
        expect(bySent(saveRuns, 1).locksBefore).toEqual(["1"]);
        expect(bySent(saveRuns, 1).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked");
      });

      it("a Redo leaves a lock someone else set since on a cell its step didn't lock or unlock", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(undefined, EMPTY))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY));
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: SWIM_AT_P2,
          locks: []
        });
        await press(cell(element, "0-1"), "Delete");
        await undo(element);
        expect(lockText(element, "0-1")).toBeNull();
        element.locks = [P2];
        await flush();
        await redo(element);
        expect(bySent(saveRuns, 2).after).toEqual([""]);
        expect(bySent(saveRuns, 2).locksBefore).toEqual(["1"]);
        expect(bySent(saveRuns, 2).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked empty");
      });

      it("a Lock chosen on a cell the step had already locked still keeps it", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY));
        const { element } = await render(saveRuns, { locks: [] });
        await placeSwim(element);
        // A day or bunk Lock covers the cell the edit locked: the lock doesn't flip, it is chosen.
        await fromLockMenu(element, [P2]);
        await undo(element);
        expect(bySent(saveRuns, 1).after).toEqual([""]);
        expect(bySent(saveRuns, 1).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked empty");
      });

      it("a Lock-menu choice made before the step doesn't hold the cell the step locked", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY));
        const { element } = await render(saveRuns, { locks: [] });
        // Locked empty, then unlocked again from the Lock menu, before any step.
        await fromLockMenu(element, [P2]);
        await fromLockMenu(element, []);
        await placeSwim(element);
        await undo(element);
        expect(bySent(saveRuns, 1).locksBefore).toEqual(["1"]);
        expect(bySent(saveRuns, 1).locksAfter).toEqual([""]);
        expect(lockText(element, "0-1")).toBeNull();
      });

      it("a choice made right after the oldest step still holds it once later steps are made", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(WITH_SWIM, ["1,2,2", "1,,"]))
          .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
          .mockResolvedValueOnce(saved(undefined, EMPTY));
        const { element } = await render(saveRuns, { locks: [] });
        await placeSwim(element);
        await fromLockMenu(element, [P2]);
        // A second step, on Lunch.
        await typeInto(element, "0-2", "swim");
        expect(bySent(saveRuns, 1).blockIds).toEqual(["t3"]);
        await undo(element);
        await undo(element);
        expect(bySent(saveRuns, 3).blockIds).toEqual(["t2"]);
        expect(bySent(saveRuns, 3).after).toEqual([""]);
        expect(bySent(saveRuns, 3).locksAfter).toEqual(["1"]);
        expect(lockText(element, "0-1")).toBe("Locked empty");
      });
    });

    it("an Undo sent again after someone only took a lock off leaves that cell unlocked, as they left it", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]))
        // The Undo: refused only because the lock has been taken off again meanwhile.
        .mockResolvedValueOnce(
          savedLocked(undefined, ["1,,", "1,,"], ["", ""], [0])
        )
        .mockResolvedValue(savedLocked(WITH_SWIM, SWIM_AT_P2, ["", ""]));
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: []
      });
      // Clearing an unlocked Swim makes no lock; then someone else locks the cell.
      await press(cell(element, "0-1"), "Delete");
      element.locks = [P2];
      await flush();
      q(element, '[data-id="undo"]').click();
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(3);
      expect(bySent(saveRuns, 1).locksBefore).toEqual(["1"]);
      expect(bySent(saveRuns, 1).locksAfter).toEqual(["1"]);
      // Sent again: the lock they took off stays off.
      expect(bySent(saveRuns, 2).after).toEqual(["A:a1"]);
      expect(bySent(saveRuns, 2).locksBefore).toEqual([""]);
      expect(bySent(saveRuns, 2).locksAfter).toEqual([""]);
      expect(lockText(element, "0-1")).toBeNull();
    });

    it("an edit made while the one before still saves sees the lock that one made", async () => {
      let answer;
      const saveRuns = jest
        .fn()
        .mockReturnValueOnce(
          new Promise((resolve) => {
            answer = resolve;
          })
        )
        .mockResolvedValue(saved(undefined, ["1,,", "1,,"]));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      q(element, '[data-id="undo"]').click();
      await flush();
      answer(saved(WITH_SWIM, SWIM_AT_P2));
      await flush();
      expect(bySent(saveRuns, 1).locksBefore).toEqual(["1"]);
      expect(bySent(saveRuns, 1).locksAfter).toEqual([""]);
    });

    it("a longer activity stops at a locked cell, using the locks the host passed again, and says it is short", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(saved(BOATING, ["1,2,", "1,,"]));
      const { element } = await render(saveRuns, { locks: [] });
      element.locks = ["2026-06-29|g1|t3"];
      await flush();
      await typeInto(element, "0-1", "boating");
      // Boating needs two blocks, Period 2 and Lunch; Lunch is locked empty, so it stops there.
      expect(saveRuns).toHaveBeenCalledTimes(1);
      const run = bySent(saveRuns, 0);
      expect(run.after).toEqual(["A:a2"]);
      expect(run.blockIds).toEqual(["t2"]);
      expect(q(element, '[data-id="undo"]').title).toBe(
        "Undo: Placed Boating · Bunk 1 · Monday · Period 2 (1 of 2)"
      );
      // The locked cell is left as it was, locked empty.
      expect(lockText(element, "0-2")).toBe("Locked empty");
    });

    it("a longer activity stops at a locked cell with the same words as at a filled one", async () => {
      const filled = jest
        .fn()
        .mockResolvedValue(
          saved([...WITH_SOCCER, BOATING[1]], ["1,3,2", "1,,"])
        );
      const first = await render(filled, {
        items: WITH_SOCCER,
        rows: ["1,,2", "1,,"]
      });
      await typeInto(first.element, "0-1", "boating");
      const filledTitle = q(first.element, '[data-id="undo"]').title;
      const lockedSaver = jest
        .fn()
        .mockResolvedValue(saved(BOATING, ["1,2,", "1,,"]));
      const second = await render(lockedSaver, {
        locks: ["2026-06-29|g1|t3"]
      });
      await typeInto(second.element, "0-1", "boating");
      expect(q(second.element, '[data-id="undo"]').title).toBe(filledTitle);
    });

    it("no locks passed: no run carries any", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]));
      const { element } = await render(saveRuns);
      await placeSwim(element);
      q(element, '[data-id="undo"]').click();
      await flush();
      [0, 1].forEach((n) => {
        expect(Object.keys(bySent(saveRuns, n))).not.toContain("locksBefore");
        expect(Object.keys(bySent(saveRuns, n))).not.toContain("locksAfter");
      });
    });
  });

  describe("tools", () => {
    it("shows the host's tools by default and leaves them out with tools=false", async () => {
      const shown = await render(jest.fn());
      expect(q(shown.element, 'slot[name="tools"]')).not.toBeNull();
      const hidden = await render(jest.fn(), { tools: false });
      expect(q(hidden.element, 'slot[name="tools"]')).toBeNull();
    });

    it("tools=false keeps adding an activity by typing its name, as on the desktop", async () => {
      const options = async (settings) => {
        const { element } = await render(jest.fn(), settings);
        await press(cell(element, "0-1"), "Enter");
        const input = q(element, '[data-id="slot-input"]');
        input.value = "Kayaking";
        input.dispatchEvent(new CustomEvent("input"));
        await flush();
        return [...element.shadowRoot.querySelectorAll('[role="option"]')].map(
          (o) => o.textContent.trim()
        );
      };
      expect((await options({})).join("|")).toMatch(/Add "Kayaking"/);
      expect((await options({ tools: false })).join("|")).toMatch(
        /Add "Kayaking"/
      );
    });
  });

  describe("saved and editstate", () => {
    it("a save is announced in order: busy, queue empty, saved, then settled", async () => {
      const result = saved(WITH_SWIM, SWIM_AT_P2);
      const saveRuns = jest.fn().mockResolvedValue(result);
      const { element, heard } = await render(saveRuns);
      heard.length = 0;
      await placeSwim(element);
      const order = heard
        .filter((h) => h.name === "editstate" || h.name === "saved")
        .map((h) => {
          if (h.name === "saved") {
            return "saved";
          }
          return `${h.detail.busy ? "busy" : "idle"}/${h.detail.queueEmpty ? "empty" : "waiting"}`;
        });
      expect(order).toEqual([
        "busy/waiting",
        "busy/empty",
        "saved",
        "idle/empty"
      ]);
      const [savedDetail] = heardNamed(heard, "saved");
      expect(savedDetail.schedule).toBe(result.schedule);
      expect(savedDetail.conflicts).toEqual([]);
      expect(savedDetail.label).toMatch(/^Placed Swim/);
      expect(savedDetail.kind).toBe("edit");
    });

    it("a save someone else's change got in the way of is still announced, with its conflicts", async () => {
      const result = saved(
        [
          ...WITH_SWIM.slice(0, 1),
          { kind: "A", id: "a3", name: "Soccer", gone: false }
        ],
        ["1,2,"],
        [0]
      );
      const { element, heard } = await render(
        jest.fn().mockResolvedValue(result)
      );
      await placeSwim(element);
      const [savedDetail] = heardNamed(heard, "saved");
      expect(savedDetail.conflicts).toEqual([0]);
      expect(savedDetail.schedule).toBe(result.schedule);
    });

    it("a refused save is not announced as saved", async () => {
      const { element, heard } = await render(
        jest.fn().mockResolvedValue({ status: "refused", message: "No." })
      );
      await placeSwim(element);
      expect(heardNamed(heard, "saved")).toHaveLength(0);
      expect(heardNamed(heard, "editstate").pop()).toEqual({
        busy: false,
        queueEmpty: true
      });
    });

    it("the state is only announced when it changes", async () => {
      const { heard } = await render(jest.fn());
      expect(heardNamed(heard, "editstate")).toEqual([
        { busy: false, queueEmpty: true }
      ]);
    });
  });

  describe("locks: a lock covers the whole placement", () => {
    const resize = (element, delta) =>
      fromGrid(element, "cellresize", { key: "0-1", delta });

    it("lengthening an unlocked activity locks all of it, so Undo and Redo name every block", async () => {
      const LONG = ["1,2,^", "1,,"];
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(BOATING, LONG))
        .mockResolvedValue(saved(WITH_SWIM, SWIM_AT_P2));
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: []
      });
      await resize(element, 1);
      q(element, '[data-id="undo"]').click();
      await flush();
      const undone = saveRuns.mock.calls[1][0][0].runs[0];
      expect(undone.blockIds).toEqual(["t2", "t3"]);
      expect(undone.locksBefore).toEqual(["1", "1"]);
      expect(undone.locksAfter).toEqual(["", ""]);
      q(element, '[data-id="redo"]').click();
      await flush();
      expect(saveRuns.mock.calls[2][0][0].runs[0].locksAfter).toEqual([
        "1",
        "1"
      ]);
    });

    it("shortening one locks what is left, and the freed block stays unlocked", async () => {
      const saveRuns = jest.fn().mockReturnValue(new Promise(() => {}));
      const { element } = await render(saveRuns, {
        items: BOATING,
        rows: ["1,2,^", "1,,"],
        locks: []
      });
      await resize(element, -1);
      expect(saveRuns).toHaveBeenCalledTimes(1);
      expect(lockText(element, "0-1")).toBe("Locked");
      expect(lockText(element, "0-2")).toBeNull();
    });

    it("a lock on any block of a placement locks the placement", async () => {
      const { element, heard } = await render(jest.fn(), {
        items: BOATING,
        rows: ["1,2,^", "1,,"],
        locks: ["2026-06-29|g1|t3"]
      });
      expect(lockText(element, "0-1")).toBe("Locked");
      await press(cell(element, "0-1"), "Enter");
      expect(heardNamed(heard, "unlockrequest")).toHaveLength(1);
    });

    it("a locked empty cell in an away block still reads as away, not as locked empty", async () => {
      const { element } = await render(jest.fn(), {
        locks: ["2026-06-29|g2|t3"]
      });
      expect(cellText(element, "1-2")).toBe("Not at camp");
      expect(lockText(element, "1-2")).toBe("Locked");
    });
  });

  describe("locks: what the server holds after a save", () => {
    const bySent = (saveRuns, n) => saveRuns.mock.calls[n][0][0].runs[0];
    const clickUseYours = async (element) => {
      q(element, '[data-id="use-yours"]').click();
      await flush();
    };

    it("a saver's own locks beat the editor's guess, and the next run names them", async () => {
      const saveRuns = jest
        .fn()
        // The server did not lock it after all.
        .mockResolvedValueOnce({ ...saved(WITH_SWIM, SWIM_AT_P2), locks: [] })
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      expect(lockText(element, "0-1")).toBeNull();
      q(element, '[data-id="undo"]').click();
      await flush();
      expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
    });

    it("the locks in the week the server sent are used when the saver gives none", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(savedLocked(WITH_SWIM, SWIM_AT_P2, ["", ""]))
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      expect(lockText(element, "0-1")).toBeNull();
      q(element, '[data-id="undo"]').click();
      await flush();
      expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
    });

    it("an edit that wasn't made leaves no lock of its own on the screen", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(saved(WITH_SOCCER, ["1,2,", "1,,"], [0]));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      expect(q(element, '[data-id="conflict"]')).not.toBeNull();
      expect(lockText(element, "0-1")).toBeNull();
    });

    const P2_LOCKED = [",1,", ""];
    const LOCKED_NOTICE = "Bunk 1 · Monday · Period 2 is locked.";
    const noticeOf = (element) => q(element, '[data-id="notice"]').textContent;

    it("a cell someone locked meanwhile is not covered by the edit, even when theirs is also changed: it is refused and said", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(
          savedLocked(WITH_SOCCER, ["1,2,", "1,,"], P2_LOCKED, [0])
        );
      const { element, heard } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      // Sent once, no question, no second send over their lock.
      expect(saveRuns).toHaveBeenCalledTimes(1);
      expect(q(element, '[data-id="conflict"]')).toBeNull();
      expect(noticeOf(element)).toBe(LOCKED_NOTICE);
      // Their Soccer stands, shown locked as the server holds it; nothing is left to undo.
      expect(cellText(element, "0-1")).toBe("Soccer");
      expect(lockText(element, "0-1")).toBe("Locked");
      expect(q(element, '[data-id="undo"]').disabled).toBe(true);
      expect(heardNamed(heard, "saved")).toHaveLength(1);
    });

    it("a lock-only conflict on an Open cell (nothing else changed) is refused, not sent again", async () => {
      // P3: the cell was locked empty on purpose by someone else.
      const saveRuns = jest
        .fn()
        .mockResolvedValue(
          savedLocked(undefined, ["1,,", "1,,"], P2_LOCKED, [0])
        );
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      expect(saveRuns).toHaveBeenCalledTimes(1);
      expect(noticeOf(element)).toBe(LOCKED_NOTICE);
      // Their lock stands: locked empty, not filled with Swim.
      expect(cellText(element, "0-1")).toBe("");
      expect(lockText(element, "0-1")).toBe("Locked empty");
      expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    });

    it("Delete on a cell someone locked meanwhile does not clear it or unlock it", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(savedLocked(WITH_SWIM, SWIM_AT_P2, P2_LOCKED, [0]));
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: []
      });
      await press(cell(element, "0-1"), "Delete");
      expect(saveRuns).toHaveBeenCalledTimes(1);
      expect(noticeOf(element)).toBe(LOCKED_NOTICE);
      expect(cellText(element, "0-1")).toBe("Swim");
      expect(lockText(element, "0-1")).toBe("Locked");
      expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    });

    it("an Undo that meets a lock someone placed meanwhile is refused, and leaves nothing to undo or redo", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]))
        .mockResolvedValueOnce(
          savedLocked(undefined, ["1,,", "1,,"], P2_LOCKED, [0])
        );
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: []
      });
      await press(cell(element, "0-1"), "Delete");
      q(element, '[data-id="undo"]').click();
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(2);
      expect(noticeOf(element)).toBe(LOCKED_NOTICE);
      expect(lockText(element, "0-1")).toBe("Locked empty");
      expect(q(element, '[data-id="undo"]').disabled).toBe(true);
      expect(q(element, '[data-id="redo"]').disabled).toBe(true);
    });

    it("a Redo that meets a lock someone placed meanwhile is refused too", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]))
        .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
        .mockResolvedValueOnce(
          savedLocked(WITH_SWIM, SWIM_AT_P2, P2_LOCKED, [0])
        );
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: [P2]
      });
      element.locks = [];
      await flush();
      await press(cell(element, "0-1"), "Delete");
      q(element, '[data-id="undo"]').click();
      await flush();
      q(element, '[data-id="redo"]').click();
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(3);
      expect(noticeOf(element)).toBe(LOCKED_NOTICE);
      expect(q(element, '[data-id="redo"]').disabled).toBe(true);
    });

    it("a lock the edit already saw is not new: a conflict over a cell that stays locked still asks", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
        .mockResolvedValueOnce(
          savedLocked(WITH_SOCCER, ["1,2,", "1,,"], P2_LOCKED, [0])
        );
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      q(element, '[data-id="undo"]').click();
      await flush();
      // The Undo saw P2 locked (the Swim edit locked it), and it still is: their Soccer is asked about.
      expect(saveRuns).toHaveBeenCalledTimes(2);
      expect(q(element, '[data-id="conflict"]')).not.toBeNull();
    });

    it("a longer activity's refusal names the cell that was locked, not the one it starts in", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(
          savedLocked(BOATING, ["1,2,^", "1,,"], [",,1", ""], [0])
        );
      const { element } = await render(saveRuns, { locks: [] });
      await typeInto(element, "0-1", "boating");
      expect(saveRuns).toHaveBeenCalledTimes(1);
      expect(bySent(saveRuns, 0).blockIds).toEqual(["t2", "t3"]);
      expect(noticeOf(element)).toBe("Bunk 1 · Monday · Lunch is locked.");
    });

    it("a lock on a day the answer no longer has is not a lock refusal: the vanished day is what is said", async () => {
      const answer = savedLocked(undefined, ["1,,", "1,,"], P2_LOCKED, [0]);
      answer.schedule.days = [answer.schedule.days[1]];
      answer.locks = [P2];
      const saveRuns = jest.fn().mockResolvedValue(answer);
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      expect(saveRuns).toHaveBeenCalledTimes(1);
      expect(noticeOf(element)).not.toContain("is locked");
      expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    });

    it("locks taken back to none by the host mean runs carry no locks again", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(saved(WITH_SWIM, SWIM_AT_P2));
      const { element } = await render(saveRuns, { locks: [P2] });
      element.locks = undefined;
      await flush();
      await placeSwim(element);
      expect(Object.keys(bySent(saveRuns, 0))).not.toContain("locksBefore");
    });

    it("a lock on a cell the edit does not touch does not stop it being sent again", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(
          savedLocked(undefined, ["1,,", "1,,"], [",,1", ""], [0])
        )
        .mockResolvedValue(savedLocked(WITH_SWIM, SWIM_AT_P2, [",1,1", ""]));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      // Lunch was locked by someone else, but Swim only touches Period 2: sent again, made.
      expect(saveRuns).toHaveBeenCalledTimes(2);
      expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
      expect(cellText(element, "0-1")).toBe("Swim");
      expect(q(element, '[data-id="conflict"]')).toBeNull();
    });

    it("the answer to a conflict that still asks about their change shows the question when no lock is new", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(saved(WITH_SOCCER, ["1,2,", "1,,"], [0]));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      expect(q(element, '[data-id="conflict"]')).not.toBeNull();
      expect(saveRuns).toHaveBeenCalledTimes(1);
    });

    it("Redo after Use yours restores the locks of what Use yours made, not of the first try", async () => {
      // Lunch was locked empty on screen; theirs is a two-block Boating over Period 2 and Lunch,
      // so Use yours clears Lunch too, and Redo must unlock it.
      const LUNCH = "2026-06-29|g1|t3";
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(BOATING, ["1,2,^", "1,,"], [0]))
        .mockResolvedValue(saved(WITH_SWIM, SWIM_AT_P2));
      const { element } = await render(saveRuns, { locks: [LUNCH] });
      await placeSwim(element);
      await clickUseYours(element);
      expect(saveRuns).toHaveBeenCalledTimes(2);
      expect(bySent(saveRuns, 1).after).toEqual(["A:a1", ""]);
      q(element, '[data-id="undo"]').click();
      await flush();
      q(element, '[data-id="redo"]').click();
      await flush();
      expect(bySent(saveRuns, 3).locksAfter).toEqual(["1", ""]);
    });
  });

  describe("locks: refusals name the locked cell", () => {
    it("a longer activity into a locked cell says which cell is locked", async () => {
      const saveRuns = jest.fn();
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: ["2026-06-29|g1|t3"]
      });
      await fromGrid(element, "cellresize", { key: "0-1", delta: 1 });
      expect(saveRuns).not.toHaveBeenCalled();
      expect(q(element, '[data-id="notice"]').textContent).toBe(
        "Bunk 1 · Monday · Lunch is locked."
      );
    });

    it("moving onto the locked cell next to it says which cell is locked", async () => {
      const saveRuns = jest.fn();
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: ["2026-06-29|g1|t3"]
      });
      await fromGrid(element, "celldragstart", { key: "0-1" });
      await fromGrid(element, "celldrop", { key: "0-2", data: "Swim", at: 0 });
      expect(saveRuns).not.toHaveBeenCalled();
      expect(q(element, '[data-id="notice"]').textContent).toBe(
        "Bunk 1 · Monday · Lunch is locked."
      );
    });

    it("Shift+Up or Down on a locked cell says it is locked", async () => {
      const saveRuns = jest.fn();
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: [P2]
      });
      await fromGrid(element, "cellresize", { key: "0-1", delta: 1 });
      expect(saveRuns).not.toHaveBeenCalled();
      expect(q(element, '[data-id="notice"]').textContent).toBe(
        "Bunk 1 · Monday · Period 2 is locked."
      );
    });

    it("clicking the end handle of a locked cell says it is locked", async () => {
      const saveRuns = jest.fn();
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: [P2]
      });
      await fromGrid(element, "handleclick", { key: "0-1" });
      expect(saveRuns).not.toHaveBeenCalled();
      expect(q(element, '[data-id="notice"]').textContent).toBe(
        "Bunk 1 · Monday · Period 2 is locked."
      );
    });
  });

  describe("what Use yours and a conflict leave behind", () => {
    const bySent = (saveRuns, n) => saveRuns.mock.calls[n][0][0].runs[0];
    const LUNCH = "2026-06-29|g1|t3";

    it("a save that keeps coming back as a conflict is given up with a reason, not sent for ever", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(saved(WITH_SOCCER, ["1,2,", "1,,"], [0]));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      q(element, '[data-id="use-yours"]').click();
      await flush();
      // Sent, then sent again twice after the answers, and then given up: exactly three sends.
      expect(saveRuns).toHaveBeenCalledTimes(3);
      expect(q(element, '[data-id="conflict"]')).toBeNull();
      expect(q(element, '[data-id="notice"]').textContent).toMatch(
        /Your change wasn't saved: .*kept changing/
      );
      // Nothing is left to undo or redo for it.
      expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    });

    it("a Redo sent again by Use yours carries the locks of what Use yours makes, not the first try's", async () => {
      // Lunch is locked empty. Swim at Period 2 is placed, undone, and redone; their two-block
      // Boating is in the way of the Redo, so Use yours clears Lunch too, and its lock goes.
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]))
        .mockResolvedValueOnce(saved(BOATING, ["1,2,^", "1,,"], [0]))
        .mockResolvedValue(saved(WITH_SWIM, SWIM_AT_P2));
      const { element } = await render(saveRuns, { locks: [LUNCH] });
      await placeSwim(element);
      q(element, '[data-id="undo"]').click();
      await flush();
      q(element, '[data-id="redo"]').click();
      await flush();
      expect(q(element, '[data-id="conflict"]')).not.toBeNull();
      q(element, '[data-id="use-yours"]').click();
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(4);
      const again = bySent(saveRuns, 3);
      expect(again.after).toEqual(["A:a1", ""]);
      expect(again.locksAfter).toEqual(["1", ""]);
    });

    it("an Undo sent again by Use yours still carries the locks from before its step", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
        .mockResolvedValueOnce(saved(WITH_SOCCER, ["1,2,", "1,,"], [0]))
        .mockResolvedValue(saved(undefined, ["1,,", "1,,"]));
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      q(element, '[data-id="undo"]').click();
      await flush();
      q(element, '[data-id="use-yours"]').click();
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(3);
      expect(bySent(saveRuns, 2).locksAfter).toEqual([""]);
    });

    it("the give-up notice uses the camp's word for the week, in Manual Build too (no locks passed)", async () => {
      const labels = [
        ...LABELS,
        {
          term: "Week",
          singular: "Session",
          plural: "Sessions",
          isCustom: true
        }
      ];
      const saveRuns = jest
        .fn()
        .mockResolvedValue(saved(WITH_SOCCER, ["1,2,", "1,,"], [0]));
      const { element } = await render(saveRuns, { labels });
      await placeSwim(element);
      q(element, '[data-id="use-yours"]').click();
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(3);
      const text = q(element, '[data-id="notice"]').textContent;
      expect(text).toContain("The Session kept changing");
      expect(text).not.toContain("week");
    });

    it("the saved event says what kind of change it was: an edit, an Undo, a Redo", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2))
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]))
        .mockResolvedValueOnce(saved(WITH_SWIM, SWIM_AT_P2));
      const { element, heard } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      q(element, '[data-id="undo"]').click();
      await flush();
      q(element, '[data-id="redo"]').click();
      await flush();
      expect(heardNamed(heard, "saved").map((d) => d.kind)).toEqual([
        "edit",
        "undo",
        "redo"
      ]);
    });

    it("while an Undo still saves, the cell shows the locks it will restore, not a new hand edit's", async () => {
      // Swim is unlocked on the server; Clear it, then Undo: the Undo restores "unlocked", so the
      // cell must not show Locked while the Undo waits for its answer.
      let answer;
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]))
        .mockReturnValueOnce(
          new Promise((resolve) => {
            answer = resolve;
          })
        );
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: []
      });
      await press(cell(element, "0-1"), "Delete");
      q(element, '[data-id="undo"]').click();
      await flush();
      expect(cellText(element, "0-1")).toBe("Swim");
      expect(lockText(element, "0-1")).toBeNull();
      answer(saved(WITH_SWIM, SWIM_AT_P2));
      await flush();
      expect(lockText(element, "0-1")).toBeNull();
    });

    it("a placement dragged out of the week is not removed if its cell was locked meanwhile", async () => {
      const saveRuns = jest.fn();
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: []
      });
      await fromGrid(element, "celldragstart", { key: "0-1" });
      element.locks = [P2];
      await flush();
      q(element, "c-shoresh-build-palette").dispatchEvent(
        new CustomEvent("removedrop", { detail: { data: "Swim" } })
      );
      await flush();
      expect(saveRuns).not.toHaveBeenCalled();
      expect(cellText(element, "0-1")).toBe("Swim");
      expect(q(element, '[data-id="notice"]').textContent).toBe(
        "Bunk 1 · Monday · Period 2 is locked."
      );
    });
  });

  describe("locks: what the director saw is what an edit names", () => {
    const bySent = (saveRuns, n) => saveRuns.mock.calls[n][0][0].runs[0];
    const noticeOf = (element) => q(element, '[data-id="notice"]').textContent;
    const toolNoticeOf = (element) =>
      q(element, '[data-id="tool-notice"]').textContent;
    const slow = () => {
      const held = {};
      held.promise = new Promise((resolve) => {
        held.answer = resolve;
      });
      return held;
    };
    const SESSION = [
      ...LABELS,
      { term: "Week", singular: "Session", plural: "Sessions", isCustom: true }
    ];

    it("a queued edit behind a slow save is sent with the locks it was made with, so a lock that arrived meanwhile refuses it", async () => {
      const first = slow();
      const saveRuns = jest
        .fn()
        .mockReturnValueOnce(first.promise)
        // The server holds Lunch locked (theirs), so the second edit comes back as a conflict.
        .mockResolvedValue(
          savedLocked(WITH_SWIM, SWIM_AT_P2, [",1,1", ""], [0])
        );
      const { element } = await render(saveRuns, { locks: [] });
      await placeSwim(element);
      await typeInto(element, "0-2", "soccer");
      expect(saveRuns).toHaveBeenCalledTimes(1);
      // Another director's lock on Lunch arrives in the first save's answer.
      first.answer(savedLocked(WITH_SWIM, SWIM_AT_P2, [",1,1", ""]));
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(2);
      // Lunch was unlocked on the screen when the edit was made: that is what is sent.
      expect(bySent(saveRuns, 1).blockIds).toEqual(["t3"]);
      expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
      expect(noticeOf(element)).toBe("Bunk 1 · Monday · Lunch is locked.");
      expect(q(element, '[data-id="conflict"]')).toBeNull();
      expect(cellText(element, "0-2")).toBe("");
    });

    it("an Undo waiting behind a slow save names the locks it was pressed with, so a lock that arrived meanwhile refuses it", async () => {
      const first = slow();
      const saveRuns = jest
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue(
          savedLocked(undefined, ["1,,", "1,,"], [",1,", ""], [0])
        );
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: []
      });
      await press(cell(element, "0-1"), "Delete");
      q(element, '[data-id="undo"]').click();
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(1);
      // Someone locks Period 2 while the Undo waits.
      first.answer(savedLocked(undefined, ["1,,", "1,,"], [",1,", ""]));
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(2);
      expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
      expect(bySent(saveRuns, 1).locksAfter).toEqual([""]);
      expect(noticeOf(element)).toBe("Bunk 1 · Monday · Period 2 is locked.");
      expect(q(element, '[data-id="undo"]').disabled).toBe(true);
      expect(q(element, '[data-id="redo"]').disabled).toBe(true);
    });

    it("a Redo waiting behind a slow Undo names the locks it was pressed with, so a lock that arrived meanwhile refuses it", async () => {
      const second = slow();
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(undefined, ["1,,", "1,,"]))
        .mockReturnValueOnce(second.promise)
        .mockResolvedValue(
          savedLocked(undefined, ["1,,", "1,,"], [",1,", ""], [0])
        );
      const { element } = await render(saveRuns, {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks: []
      });
      await press(cell(element, "0-1"), "Delete");
      q(element, '[data-id="undo"]').click();
      await flush();
      q(element, '[data-id="redo"]').click();
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(2);
      second.answer(savedLocked(WITH_SWIM, SWIM_AT_P2, [",1,", ""]));
      await flush();
      expect(saveRuns).toHaveBeenCalledTimes(3);
      expect(bySent(saveRuns, 2).locksBefore).toEqual([""]);
      expect(noticeOf(element)).toBe("Bunk 1 · Monday · Period 2 is locked.");
      expect(q(element, '[data-id="redo"]').disabled).toBe(true);
    });

    describe("a tool that meets a cell someone locked meanwhile", () => {
      const BOTH = [...WITH_SWIM, WITH_SOCCER[1]];
      const BOTH_ROWS = ["1,2,3", "1,,"];
      const CLEAR_MONDAY = {
        kind: "clear",
        dates: ["2026-06-29"],
        name: "Monday"
      };

      it("Clear day skips the locked cell, clears the rest, and lists it", async () => {
        const saveRuns = jest
          .fn()
          // Lunch (Soccer) was locked by someone else: the first send comes back as a conflict.
          .mockResolvedValueOnce(savedLocked(BOTH, BOTH_ROWS, [",,1", ""], [0]))
          .mockResolvedValue(savedLocked(BOTH, ["1,,3", "1,,"], [",,1", ""]));
        const { element } = await render(saveRuns, {
          items: BOTH,
          rows: BOTH_ROWS,
          locks: []
        });
        element.runTool(CLEAR_MONDAY);
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(2);
        // Sent again without the locked cell, still naming only what the director saw.
        expect(bySent(saveRuns, 1).blockIds).toEqual(["t2"]);
        expect(bySent(saveRuns, 1).after).toEqual([""]);
        expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
        expect(q(element, '[data-id="conflict"]')).toBeNull();
        expect(toolNoticeOf(element)).toContain(
          "Cleared Monday, except 1 activity that is locked. 1 stayed: Soccer · Bunk 1 · Monday (locked)."
        );
        expect(cellText(element, "0-1")).toBe("Open");
        expect(cellText(element, "0-2")).toBe("Soccer");
        expect(lockText(element, "0-2")).toBe("Locked");
      });

      it("Clear day lists and counts a locked activity that runs two blocks once", async () => {
        const items = [...BOATING, WITH_SOCCER[1]];
        const rows = ["1,2,^", "1,3,"];
        const saveRuns = jest
          .fn()
          // Someone locked both of Boating's cells: the first send comes back as a conflict.
          .mockResolvedValueOnce(savedLocked(items, rows, [",1,1", ""], [0]))
          .mockResolvedValue(
            savedLocked(items, ["1,2,^", "1,,"], [",1,1", ""])
          );
        const { element } = await render(saveRuns, { items, rows, locks: [] });
        element.runTool(CLEAR_MONDAY);
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(2);
        expect(saveRuns.mock.calls[1][0][0].runs).toHaveLength(1);
        expect(bySent(saveRuns, 1).groupId).toBe("g2");
        expect(toolNoticeOf(element)).toContain(
          "Cleared Monday, except 1 activity that is locked. 1 stayed: Boating · Bunk 1 · Monday (locked)."
        );
      });

      it("Copy day names the activity that was being copied as left out, not what stays in the locked cell", async () => {
        const COPY = {
          kind: "copy",
          from: "2026-06-29",
          dates: ["2026-06-30"],
          fromName: "Monday",
          toName: "Tuesday"
        };
        const rows = ["1,2,", "1,3,"];
        // Someone else put Soccer in Bunk 1's Tuesday Period 2 and locked it.
        const theirs = (conflicts) => {
          const result = savedLocked(BOTH, rows, ["", ""], conflicts);
          result.schedule.days[1] = {
            ...result.schedule.days[1],
            items: WITH_SOCCER,
            rows: conflicts.length ? ["1,2,", "1,,"] : ["1,2,", "1,2,"],
            locks: [",1,", ""]
          };
          return result;
        };
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(theirs([0]))
          .mockResolvedValue(theirs([]));
        const { element } = await render(saveRuns, {
          items: BOTH,
          rows,
          locks: []
        });
        element.runTool(COPY);
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(2);
        // Only Bunk 2's Soccer is copied; Bunk 1's locked cell is left as it is.
        expect(saveRuns.mock.calls[1][0][0].runs).toHaveLength(1);
        expect(bySent(saveRuns, 1).groupId).toBe("g2");
        expect(toolNoticeOf(element)).toContain(
          "Copied Monday to Tuesday, except 1 activity that is locked. 1 left out: Swim · Bunk 1 · Tuesday: locked."
        );
      });

      it("Clear day with nothing left but locked cells says so and changes nothing", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValue(savedLocked(BOTH, BOTH_ROWS, [",1,1", ""], [0]));
        const { element } = await render(saveRuns, {
          items: BOTH,
          rows: BOTH_ROWS,
          locks: []
        });
        element.runTool(CLEAR_MONDAY);
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(1);
        expect(noticeOf(element)).toBe(
          "Cleared Monday: nothing done, those activities are locked."
        );
        expect(q(element, '[data-id="undo"]').disabled).toBe(true);
      });
    });

    describe("a lock someone took off meanwhile", () => {
      // The answer when the server refuses an edit only because a cell it names locked has been
      // unlocked since: Bunk 1's Monday Period 2 still holds Swim, with no lock.
      const unlockedSince = () =>
        savedLocked(WITH_SWIM, SWIM_AT_P2, ["", ""], [0]);

      it("an Undo is sent again once naming the cell unlocked, and is made", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(
            savedLocked(WITH_SWIM, SWIM_AT_P2, [",1,", ""])
          )
          .mockResolvedValueOnce(unlockedSince())
          .mockResolvedValue(savedLocked(undefined, ["1,,", "1,,"], ["", ""]));
        const { element } = await render(saveRuns, { locks: [] });
        await placeSwim(element);
        q(element, '[data-id="undo"]').click();
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(3);
        expect(bySent(saveRuns, 1).locksBefore).toEqual(["1"]);
        expect(bySent(saveRuns, 2).locksBefore).toEqual([""]);
        expect(bySent(saveRuns, 2).after).toEqual([""]);
        expect(cellText(element, "0-1")).toBe("Open");
        expect(q(element, '[data-id="notice"]')).toBeNull();
        expect(q(element, '[data-id="conflict"]')).toBeNull();
        expect(q(element, '[data-id="redo"]').disabled).toBe(false);
      });

      it("a Redo is sent again once naming the cell unlocked, and is made", async () => {
        const saveRuns = jest
          .fn()
          // Delete clears Swim (and its lock); Undo puts both back.
          .mockResolvedValueOnce(
            savedLocked(undefined, ["1,,", "1,,"], ["", ""])
          )
          .mockResolvedValueOnce(
            savedLocked(WITH_SWIM, SWIM_AT_P2, [",1,", ""])
          )
          .mockResolvedValueOnce(unlockedSince())
          .mockResolvedValue(savedLocked(undefined, ["1,,", "1,,"], ["", ""]));
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: SWIM_AT_P2,
          locks: [P2]
        });
        element.runTool({
          kind: "clear",
          dates: ["2026-06-29"],
          name: "Monday"
        });
        await flush();
        q(element, '[data-id="undo"]').click();
        await flush();
        expect(lockText(element, "0-1")).toBe("Locked");
        q(element, '[data-id="redo"]').click();
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(4);
        expect(bySent(saveRuns, 2).locksBefore).toEqual(["1"]);
        expect(bySent(saveRuns, 3).locksBefore).toEqual([""]);
        expect(bySent(saveRuns, 3).after).toEqual([""]);
        expect(cellText(element, "0-1")).toBe("Open");
        expect(q(element, '[data-id="notice"]')).toBeNull();
        expect(q(element, '[data-id="undo"]').disabled).toBe(false);
      });

      it("an edit (here Clear day, which clears a cell the director saw locked) is sent again once naming it unlocked, and is made", async () => {
        const resend = slow();
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(unlockedSince())
          .mockReturnValueOnce(resend.promise);
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: SWIM_AT_P2,
          locks: [P2]
        });
        element.runTool({
          kind: "clear",
          dates: ["2026-06-29"],
          name: "Monday"
        });
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(2);
        // While it is sent again, the grid still shows it made.
        expect(cellText(element, "0-1")).toBe("Open");
        resend.answer(savedLocked(undefined, ["1,,", "1,,"], ["", ""]));
        await flush();
        expect(bySent(saveRuns, 0).locksBefore).toEqual(["1"]);
        expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
        expect(bySent(saveRuns, 1).after).toEqual([""]);
        expect(cellText(element, "0-1")).toBe("Open");
        expect(toolNoticeOf(element)).not.toMatch(/except/);
        expect(q(element, '[data-id="notice"]')).toBeNull();
        expect(q(element, '[data-id="conflict"]')).toBeNull();
      });

      it("an edit waiting behind one sent again keeps its place and is saved after it", async () => {
        const first = slow();
        const saveRuns = jest
          .fn()
          .mockReturnValueOnce(first.promise)
          .mockResolvedValueOnce(
            savedLocked(undefined, ["1,,", "1,,"], ["", ""])
          )
          .mockResolvedValue(
            savedLocked(WITH_SOCCER, ["1,,", "1,2,"], ["", ""])
          );
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: SWIM_AT_P2,
          locks: [P2]
        });
        element.runTool({
          kind: "clear",
          dates: ["2026-06-29"],
          name: "Monday"
        });
        await flush();
        // Bunk 2's Period 2 gets Soccer while the clear is still saving.
        await typeInto(element, "1-1", "soccer");
        expect(saveRuns).toHaveBeenCalledTimes(1);
        first.answer(unlockedSince());
        await flush();
        // The clear, the clear sent again, then the edit that waited: none lost, in order.
        expect(saveRuns).toHaveBeenCalledTimes(3);
        expect(
          [0, 1, 2].map((n) => [
            bySent(saveRuns, n).groupId,
            bySent(saveRuns, n).after
          ])
        ).toEqual([
          ["g1", [""]],
          ["g1", [""]],
          ["g2", ["A:a3"]]
        ]);
        expect(bySent(saveRuns, 1).locksBefore).toEqual([""]);
        expect(q(element, '[data-id="notice"]')).toBeNull();
      });

      it("a lock still held on the server is still named when another one was taken off", async () => {
        // Both bunks have Swim in Period 2, both locked when the director cleared Monday; someone
        // unlocked Bunk 1's only.
        const both = ["1,2,", "1,2,"];
        const BUNK2_P2 = "2026-06-29|g2|t2";
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(savedLocked(WITH_SWIM, both, ["", ",1,"], [0]))
          .mockResolvedValue(
            savedLocked(WITH_SWIM, ["1,,", "1,2,"], ["", ",1,"])
          );
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: both,
          locks: [P2, BUNK2_P2]
        });
        element.runTool({
          kind: "clear",
          dates: ["2026-06-29"],
          name: "Monday"
        });
        await flush();
        expect(saveRuns).toHaveBeenCalledTimes(2);
        const resent = saveRuns.mock.calls[1][0][0].runs;
        const named = (groupId) =>
          resent.find((run) => run.groupId === groupId).locksBefore;
        // Bunk 1's lock is gone on the server: named unlocked. Bunk 2's is still there: named
        // locked, as the director saw it.
        expect(named("g1")).toEqual([""]);
        expect(named("g2")).toEqual(["1"]);
      });

      it("a conflict with no lock taken off and nothing of anyone else's is still sent again only a few times", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValueOnce(
            savedLocked(WITH_SWIM, SWIM_AT_P2, [",1,", ""])
          )
          .mockResolvedValue(
            savedLocked(WITH_SWIM, SWIM_AT_P2, [",1,", ""], [0])
          );
        const { element } = await render(saveRuns, { locks: [] });
        await placeSwim(element);
        await typeInto(element, "1-1", "soccer");
        // The first send and two more, all naming the locks as they are.
        expect(saveRuns).toHaveBeenCalledTimes(4);
        expect(bySent(saveRuns, 3).locksBefore).toEqual([""]);
        expect(noticeOf(element)).toMatch(/kept changing/);
      });

      it("a lock someone added is still refused, never sent again over it", async () => {
        const saveRuns = jest
          .fn()
          .mockResolvedValue(
            savedLocked(WITH_SWIM, SWIM_AT_P2, [",1,1", ""], [0])
          );
        const { element } = await render(saveRuns, {
          items: WITH_SWIM,
          rows: SWIM_AT_P2,
          locks: [P2]
        });
        await typeInto(element, "0-2", "soccer");
        expect(saveRuns).toHaveBeenCalledTimes(1);
        expect(noticeOf(element)).toBe("Bunk 1 · Monday · Lunch is locked.");
      });
    });

    it("the camp's word for the week is used when a cell has left it, in a Session camp", async () => {
      const shorter = saved(WITH_SOCCER, ["1,2", "1,"], [0]);
      shorter.schedule.days[0] = {
        ...shorter.schedule.days[0],
        blocks: shorter.schedule.days[0].blocks.slice(0, 2)
      };
      const saveRuns = jest.fn().mockResolvedValue(shorter);
      const { element } = await render(saveRuns, { labels: SESSION });
      await typeInto(element, "0-1", "boating");
      expect(noticeOf(element)).toBe(
        "Bunk 1 · Monday · Lunch isn't in the Session any more."
      );
    });

    it("the camp's word for the week is used when an Undo can't be made, in a Session camp", async () => {
      const shorter = saved(WITH_SWIM, ["1,", "1,2"]);
      shorter.schedule.days[0] = {
        ...shorter.schedule.days[0],
        blocks: shorter.schedule.days[0].blocks.slice(0, 2)
      };
      const saveRuns = jest.fn().mockResolvedValue(shorter);
      const { element } = await render(saveRuns, { labels: SESSION });
      await typeInto(element, "0-2", "swim");
      q(element, '[data-id="undo"]').click();
      await flush();
      expect(noticeOf(element)).toBe(
        "Can't undo Placed Swim · Bunk 1 · Monday · Lunch: the Session has changed."
      );
    });
  });

  describe("an unlock request is one per gesture", () => {
    const count = (heard) => heardNamed(heard, "unlockrequest").length;
    const mouse = (element, key, name = "click") =>
      cell(element, key).dispatchEvent(
        new MouseEvent(name, { bubbles: true, composed: true })
      );
    async function lockedSwim(locks = [P2]) {
      return render(jest.fn(), {
        items: WITH_SWIM,
        rows: SWIM_AT_P2,
        locks
      });
    }

    afterEach(() => jest.restoreAllMocks());

    it("a double-click (click, click, double-click) asks once", async () => {
      const { element, heard } = await lockedSwim();
      mouse(element, "0-1");
      mouse(element, "0-1");
      mouse(element, "0-1", "dblclick");
      await flush();
      expect(count(heard)).toBe(1);
    });

    it("a click and then Enter on the same cell right after asks once, and focus stays on it", async () => {
      const { element, heard } = await lockedSwim();
      mouse(element, "0-1");
      await press(cell(element, "0-1"), "Enter");
      expect(count(heard)).toBe(1);
      expect(grid(element).shadowRoot.activeElement).toBe(cell(element, "0-1"));
    });

    it("a repeated ask puts focus back on the cell it is for", async () => {
      const { element } = await lockedSwim();
      mouse(element, "0-1");
      grid(element).focusCell("1-1");
      await flush();
      await press(cell(element, "0-1"), "Enter");
      expect(grid(element).shadowRoot.activeElement).toBe(cell(element, "0-1"));
    });

    it("a later gesture on the same cell asks again", async () => {
      const { element, heard } = await lockedSwim();
      const now = jest.spyOn(Date, "now");
      now.mockReturnValue(1000);
      mouse(element, "0-1");
      now.mockReturnValue(1000 + 5000);
      mouse(element, "0-1");
      await flush();
      expect(count(heard)).toBe(2);
    });

    it("a different locked cell right after asks too", async () => {
      const { element, heard } = await lockedSwim([P2, LUNCH_KEY]);
      mouse(element, "0-1");
      mouse(element, "0-2");
      await flush();
      expect(count(heard)).toBe(2);
    });
  });

  describe("cellfocus", () => {
    it("says which cell keyboard focus reached, and where it is", async () => {
      const { element, heard } = await render(jest.fn());
      grid(element).focusCell("1-0");
      await flush();
      const focused = heardNamed(heard, "cellfocus").pop();
      expect(focused.key).toBe("1-0");
      expect(focused.slot).toEqual({ day: 0, group: 1, block: 0 });
      expect(focused.cell).toBe("2026-06-29|g2|t1");
    });
  });
});
