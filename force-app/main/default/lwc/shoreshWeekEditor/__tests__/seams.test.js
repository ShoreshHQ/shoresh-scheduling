// The seams Generated Schedule needs from the week editor (locks, unlock request, tools, save
// events, cell focus). All are off until a host passes them: Manual Build passes none.
import { createElement } from "lwc";
import ShoreshWeekEditor from "c/shoreshWeekEditor";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { WITH_SWIM, draft, schedule } from "./data/draftFixture";

const SETUP = { activities: [], locations: [] };
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];

// Bunk 1 on Monday: Period 2 is the cell these tests work on.
const P2 = "2026-06-29|g1|t2";
const SWIM_AT_P2 = ["1,2,", "1,,"];

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

async function render(saveRuns, options = {}) {
  const element = createElement("c-shoresh-week-editor", {
    is: ShoreshWeekEditor
  });
  element.terms = buildTerms(LABELS);
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

      q(element, '[data-id="redo"]').click();
      await flush();
      expect(bySent(saveRuns, 2).locksBefore).toEqual(["1"]);
      expect(bySent(saveRuns, 2).locksAfter).toEqual([""]);
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

    it("a longer activity is not made over a locked cell, using the locks the host passed again", async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValue(saved(WITH_SWIM, SWIM_AT_P2));
      const { element } = await render(saveRuns, { locks: [] });
      element.locks = ["2026-06-29|g1|t3"];
      await flush();
      await press(cell(element, "0-1"), "Enter");
      const input = q(element, '[data-id="slot-input"]');
      input.value = "boating";
      input.dispatchEvent(new CustomEvent("input"));
      await flush();
      await press(input, "Enter");
      // Boating needs two blocks: Period 2 and Lunch, and Lunch is locked.
      expect(saveRuns).not.toHaveBeenCalled();
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

    it("tools=false also leaves out adding an activity by typing its name", async () => {
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
      expect(await options({ tools: false })).toEqual([]);
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
