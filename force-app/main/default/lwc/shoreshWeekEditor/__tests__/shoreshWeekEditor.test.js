// The week editor on its own, the way a host uses it: it is handed a week and a saver, and says
// what happened (Manual Build's own tests drive the same editor through the whole screen).
import { createElement } from "lwc";
import ShoreshWeekEditor from "c/shoreshWeekEditor";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { WITH_SWIM, draft, schedule } from "./data/draftFixture";

const SETUP = { activities: [], locations: [] };
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

/** What the host's saver answers: the week as it now is. */
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
  element.restoring = !!options.restoring;
  const heard = { state: [], edited: 0, errors: [], reloads: 0 };
  element.addEventListener("statechange", (e) => heard.state.push(e.detail));
  element.addEventListener("edited", () => (heard.edited += 1));
  element.addEventListener("errorchange", (e) =>
    heard.errors.push(e.detail.message)
  );
  element.addEventListener("reload", () => (heard.reloads += 1));
  document.body.appendChild(element);
  element.show(draft(), true);
  await flush();
  return { element, heard };
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cellText = (element, key) =>
  grid(element)
    .shadowRoot.querySelector(`[data-cell="${key}"]`)
    .querySelector(".cell-name").textContent;

async function press(target, key) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
  );
  await flush();
}

/** Types "swim" into Bunk 1's Period 2 and chooses it. */
async function placeSwim(element) {
  await press(
    grid(element).shadowRoot.querySelector('[data-cell="0-1"]'),
    "Enter"
  );
  const input = q(element, '[data-id="slot-input"]');
  input.value = "swim";
  input.dispatchEvent(new CustomEvent("input"));
  await flush();
  await press(input, "Enter");
}

describe("c-shoresh-week-editor", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("draws the week it is shown, with the view buttons, Undo and Redo", async () => {
    const { element } = await render(jest.fn());
    expect(grid(element).editable).toBe(true);
    expect(cellText(element, "0-0")).toBe("Flagpole");
    expect(cellText(element, "0-1")).toBe("Open");
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    expect(q(element, '[data-id="redo"]').disabled).toBe(true);
    expect(element.settled).toBe(true);
  });

  it("sends an edit to the saver it was given, shows it at once, and tells the host", async () => {
    const saveRuns = jest.fn().mockResolvedValue(saved(WITH_SWIM, ["1,2,"]));
    const { element, heard } = await render(saveRuns);
    await placeSwim(element);
    expect(saveRuns).toHaveBeenCalledTimes(1);
    const [edits] = saveRuns.mock.calls[0];
    expect(edits).toHaveLength(1);
    expect(edits[0].runs[0]).toMatchObject({
      day: "2026-06-29",
      groupId: "g1",
      firstBlockId: "t2",
      after: ["A:a1"]
    });
    expect(cellText(element, "0-1")).toBe("Swim");
    expect(heard.edited).toBe(1);
    expect(heard.errors).toEqual([null]);
    // The host heard the editor was busy, then not.
    const busy = heard.state.map((s) => s.busy);
    expect(busy).toContain(true);
    expect(busy[busy.length - 1]).toBe(false);
    expect(element.busy).toBe(false);
    expect(element.savedWeek).toBe(
      heard.state[heard.state.length - 1].draft.schedule
    );
    expect(q(element, '[data-id="undo"]').disabled).toBe(false);
  });

  it("a refusal from the saver says why, empties the queue, and asks the host to reload", async () => {
    const saveRuns = jest
      .fn()
      .mockResolvedValue({ status: "refused", message: "Not allowed." });
    const { element, heard } = await render(saveRuns);
    await placeSwim(element);
    expect(heard.errors).toHaveLength(1);
    expect(heard.errors[0]).toMatch(
      /^Your change wasn't saved: Placed Swim · .*\. Not allowed\.$/
    );
    expect(heard.reloads).toBe(1);
    // What is saved is no longer known here: there is nothing to undo.
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    expect(element.busy).toBe(false);
  });

  it("a slot someone else changed asks, and Keep theirs leaves theirs", async () => {
    const saveRuns = jest
      .fn()
      .mockResolvedValue(
        saved(
          [
            ...WITH_SWIM.slice(0, 1),
            { kind: "A", id: "a3", name: "Soccer", gone: false }
          ],
          ["1,2,"],
          [0]
        )
      );
    const { element } = await render(saveRuns);
    await placeSwim(element);
    expect(q(element, '[data-id="conflict"]')).not.toBeNull();
    expect(element.settled).toBe(false);
    q(element, '[data-id="keep-theirs"]').click();
    await flush();
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(saveRuns).toHaveBeenCalledTimes(1);
    expect(cellText(element, "0-1")).toBe("Soccer");
  });

  it("while the host is restoring, an edit waits: it says so and sends nothing", async () => {
    const saveRuns = jest.fn();
    const { element } = await render(saveRuns, { restoring: true });
    await placeSwim(element);
    expect(saveRuns).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "One moment: the week is being saved or restored."
    );
    expect(cellText(element, "0-1")).toBe("Open");
  });

  it("a tool the host runs goes through the same queue and Undo", async () => {
    const saveRuns = jest
      .fn()
      .mockResolvedValueOnce(saved(WITH_SWIM, ["1,2,"]))
      .mockResolvedValueOnce(saved(undefined, ["1,,"]));
    const { element } = await render(saveRuns);
    await placeSwim(element);
    element.runTool({
      kind: "clear",
      dates: ["2026-06-29"],
      name: "Monday"
    });
    await flush();
    expect(saveRuns).toHaveBeenCalledTimes(2);
    expect(saveRuns.mock.calls[1][0][0].runs[0].after).toEqual([""]);
    expect(q(element, '[data-id="tool-notice"]').textContent).toContain(
      "Cleared Monday"
    );
    // One Undo takes the whole tool back.
    q(element, '[data-id="undo"]').click();
    await flush();
    expect(saveRuns).toHaveBeenCalledTimes(3);
  });

  it("a tool refused while the host holds edits says nothing was done, and its line never names the edit before it", async () => {
    let answer;
    const saveRuns = jest.fn().mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const { element } = await render(saveRuns);
    // An earlier edit, still saving, is the last waiting edit.
    await placeSwim(element);
    element.restoring = true;
    element.runTool({ kind: "clear", dates: ["2026-06-29"], name: "Monday" });
    await flush();
    expect(q(element, '[data-id="tool-notice"]')).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "One moment: the week is being saved or restored."
    );
    element.restoring = false;
    answer(saved(WITH_SWIM, ["1,2,"]));
    await flush();
    // Only the earlier edit was sent, and nothing about a Clear is said with it.
    expect(saveRuns).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="tool-notice"]')).toBeNull();
    expect(cellText(element, "0-1")).toBe("Swim");
  });

  it("clear() lets go of the old week: no notice, nothing to undo", async () => {
    const saveRuns = jest.fn().mockResolvedValue(saved(WITH_SWIM, ["1,2,"]));
    const { element, heard } = await render(saveRuns);
    await placeSwim(element);
    element.setNotice("Someone else started this week; nothing was copied.");
    await flush();
    expect(q(element, '[data-id="notice"]')).not.toBeNull();
    element.clear();
    await flush();
    expect(q(element, '[data-id="notice"]')).toBeNull();
    expect(grid(element)).toBeNull();
    expect(heard.state[heard.state.length - 1].draft).toBeNull();
  });

  it("clear() also ends Undo and the typing box: the next week starts with neither", async () => {
    const saveRuns = jest.fn().mockResolvedValue(saved(WITH_SWIM, ["1,2,"]));
    const { element } = await render(saveRuns);
    await placeSwim(element);
    expect(q(element, '[data-id="undo"]').disabled).toBe(false);
    await press(
      grid(element).shadowRoot.querySelector('[data-cell="0-2"]'),
      "Enter"
    );
    expect(q(element, '[data-id="slot-editor"]')).not.toBeNull();
    element.clear();
    element.show(draft(), true);
    await flush();
    expect(q(element, '[data-id="slot-editor"]')).toBeNull();
    expect(q(element, '[data-id="undo"]').disabled).toBe(true);
    expect(q(element, '[data-id="redo"]').disabled).toBe(true);
  });

  describe("settled: nothing under way, so the host may read the week again", () => {
    it("is false while the typing box is open", async () => {
      const { element } = await render(jest.fn());
      await press(
        grid(element).shadowRoot.querySelector('[data-cell="0-1"]'),
        "Enter"
      );
      expect(q(element, '[data-id="slot-editor"]')).not.toBeNull();
      expect(element.settled).toBe(false);
      await press(q(element, '[data-id="slot-input"]'), "Escape");
      expect(element.settled).toBe(true);
    });

    it("is false while an edit is saving", async () => {
      let answer;
      const saveRuns = jest.fn().mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      const { element } = await render(saveRuns);
      await placeSwim(element);
      expect(element.busy).toBe(true);
      expect(element.settled).toBe(false);
      answer(saved(WITH_SWIM, ["1,2,"]));
      await flush();
      expect(element.settled).toBe(true);
    });
  });

  describe("focus goes back to the cell", () => {
    /** The cell with keyboard focus in the grid, or null. */
    const focusedCell = (element) => {
      const on = grid(element).shadowRoot.activeElement;
      return on ? on.dataset.cell : null;
    };
    const theirs = [
      ...WITH_SWIM.slice(0, 1),
      { kind: "A", id: "a3", name: "Soccer", gone: false }
    ];
    const asked = async () => {
      const saveRuns = jest
        .fn()
        .mockResolvedValueOnce(saved(theirs, ["1,2,"], [0]))
        .mockResolvedValue(saved(WITH_SWIM, ["1,2,"]));
      const made = await render(saveRuns);
      await placeSwim(made.element);
      expect(q(made.element, '[data-id="conflict"]')).not.toBeNull();
      // The question has focus, so a cell having it later is the editor's doing.
      expect(focusedCell(made.element)).toBeNull();
      return made;
    };

    it("after Keep theirs", async () => {
      const { element } = await asked();
      q(element, '[data-id="keep-theirs"]').click();
      await flush();
      expect(focusedCell(element)).toBe("0-1");
    });

    it("after Use yours", async () => {
      const { element } = await asked();
      q(element, '[data-id="use-yours"]').click();
      await flush();
      expect(focusedCell(element)).toBe("0-1");
    });

    it("after Escape on the question, which keeps theirs", async () => {
      const { element } = await asked();
      await press(q(element, '[data-id="conflict"]'), "Escape");
      expect(q(element, '[data-id="conflict"]')).toBeNull();
      expect(cellText(element, "0-1")).toBe("Soccer");
      expect(focusedCell(element)).toBe("0-1");
    });

    it("after Escape closes the typing box", async () => {
      const { element } = await render(jest.fn());
      await press(
        grid(element).shadowRoot.querySelector('[data-cell="0-1"]'),
        "Enter"
      );
      const input = q(element, '[data-id="slot-input"]');
      expect(element.shadowRoot.activeElement).toBe(input);
      expect(focusedCell(element)).toBeNull();
      await press(input, "Escape");
      expect(q(element, '[data-id="slot-editor"]')).toBeNull();
      expect(focusedCell(element)).toBe("0-1");
    });
  });
});
