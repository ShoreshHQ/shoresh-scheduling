// Copy and Paste on the week editor's grid (Greg decision 45; desktop useClipboardSelection.js):
// cells chosen together with Shift or Cmd/Ctrl, Cmd/Ctrl+C and Cmd/Ctrl+V (and Edit's Copy and
// Paste), pasted on another bunk or day as one Undo step by Copy day to…'s rules.
import { createElement } from "lwc";
import ShoreshWeekEditor from "c/shoreshWeekEditor";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { draft } from "./data/draftFixture";

const SETUP = { activities: [], locations: [] };
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];
const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };
const ITEMS = [FLAGPOLE, SWIM, SOCCER];

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(rows, options = {}) {
  const element = createElement("c-shoresh-week-editor", {
    is: ShoreshWeekEditor
  });
  element.terms = buildTerms(LABELS);
  element.setup = nsRecord(SETUP);
  element.weekName = "Week 1";
  element.programName = "Main";
  // The week on screen, as the editor last told its host: the saver answers with it (the edit
  // is on screen at once, so it is the week as saved).
  let shown = null;
  element.addEventListener("statechange", (e) => {
    shown = e.detail.draft;
  });
  const saveRuns = jest.fn(() =>
    Promise.resolve({
      status: "saved",
      conflicts: [],
      schedule: shown.schedule
    })
  );
  element.saveRuns = saveRuns;
  if (options.locks) {
    element.locks = options.locks;
  }
  document.body.appendChild(element);
  element.show(draft(ITEMS, rows), true);
  await flush();
  return { element, saveRuns };
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cell = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);
const cellText = (element, key) =>
  cell(element, key).querySelector(".cell-name").textContent;
const chosen = (element) =>
  [...grid(element).shadowRoot.querySelectorAll('[aria-selected="true"]')].map(
    (c) => c.dataset.cell
  );
const notice = (element) => {
  const line = q(element, '[data-id="notice"]');
  return line ? line.textContent.trim() : null;
};
const toolNotice = (element) => {
  const line = q(element, '[data-id="tool-notice"]');
  return line ? line.textContent.replace(/\s+/g, " ").trim() : null;
};
const sentRuns = (saveRuns, n) => saveRuns.mock.calls[n][0][0].runs;

/** Something on the grid as the grid itself says it. */
async function fromGrid(element, name, detail) {
  grid(element).dispatchEvent(new CustomEvent(name, { detail }));
  await flush();
}

/** Cmd/Ctrl with a key, pressed on a cell. */
async function shortcut(element, key, letter) {
  cell(element, key).dispatchEvent(
    new KeyboardEvent("keydown", {
      key: letter,
      ctrlKey: true,
      bubbles: true,
      composed: true,
      cancelable: true
    })
  );
  await flush();
}

async function copyAt(element, key) {
  await fromGrid(element, "cellfocus", { key });
  await shortcut(element, key, "c");
}

async function pasteAt(element, key) {
  await fromGrid(element, "cellfocus", { key });
  await shortcut(element, key, "v");
}

describe("c-shoresh-week-editor: Copy and Paste", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("Cmd/Ctrl+C copies the cell with focus, Cmd/Ctrl+V pastes it on another bunk as one Undo step", async () => {
    const { element, saveRuns } = await render(["1,2,", "1,,"]);
    await copyAt(element, "0-1");
    expect(notice(element)).toBe("Copied Swim.");
    expect(saveRuns).not.toHaveBeenCalled();
    await pasteAt(element, "1-1");
    expect(saveRuns).toHaveBeenCalledTimes(1);
    expect(sentRuns(saveRuns, 0)).toEqual([
      expect.objectContaining({
        day: "2026-06-29",
        groupId: "g2",
        firstBlockId: "t2",
        after: ["A:a1"]
      })
    ]);
    expect(cellText(element, "1-1")).toBe("Swim");
    expect(toolNotice(element)).toBe(
      "Pasted Swim · Bunk 2 · Monday · Period 2 ·Undo"
    );
    // A shortcut on the grid keeps focus there (no jump to the line's Undo).
    expect(element.shadowRoot.activeElement).not.toBe(
      q(element, '[data-id="tool-undo"]')
    );
    expect(q(element, '[data-id="undo"]').title).toBe(
      "Undo: Pasted Swim · Bunk 2 · Monday · Period 2"
    );
    q(element, '[data-id="undo"]').click();
    await flush();
    expect(saveRuns).toHaveBeenCalledTimes(2);
    expect(sentRuns(saveRuns, 1)[0].after).toEqual([""]);
    expect(cellText(element, "1-1")).toBe("Open");
  });

  it("Shift reaches a block of cells; it is copied whole and what can't go is left out and said", async () => {
    const { element, saveRuns } = await render(["1,2,3", "1,,"]);
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "0-2", extend: true });
    expect(chosen(element)).toEqual(["0-1", "0-2"]);
    expect(cell(element, "0-2").className).toContain("cell_chosen");
    await shortcut(element, "0-2", "c");
    expect(notice(element)).toBe("Copied 2 activities.");
    // Paste on Bunk 2's Period 2: Swim goes in; Soccer would be at Lunch, when Bunk 2 is away.
    await pasteAt(element, "1-1");
    expect(saveRuns).toHaveBeenCalledTimes(1);
    expect(cellText(element, "1-1")).toBe("Swim");
    expect(toolNotice(element)).toBe(
      "Pasted 2 activities · Bunk 2 · Monday · Period 2. 1 left out: Soccer · Bunk 2 · Monday: not at camp then. ·Undo"
    );
    // What is pasted lets go of what was chosen.
    expect(chosen(element)).toEqual([]);
  });

  it("what runs off the grid is left out: no room there", async () => {
    const { element } = await render(["1,2,3", "1,,"]);
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "0-2", extend: true });
    await shortcut(element, "0-2", "c");
    await pasteAt(element, "0-2");
    expect(cellText(element, "0-2")).toBe("Swim");
    expect(toolNotice(element)).toContain("1 left out: Soccer: no room there.");
  });

  it("fixed activities aren't copied, and a paste onto one is left out and said", async () => {
    const { element, saveRuns } = await render(["1,2,", "1,,"]);
    await fromGrid(element, "cellfocus", { key: "0-0" });
    await fromGrid(element, "cellselect", { key: "0-1", extend: true });
    await shortcut(element, "0-1", "c");
    expect(notice(element)).toBe("Copied Swim.");
    // Onto Period 1, the row everyone spends at Flagpole (drawn as one cell).
    await pasteAt(element, "0-0");
    expect(saveRuns).not.toHaveBeenCalled();
    expect(notice(element)).toBe(
      "Nothing pasted. 1 left out: Swim · Bunk 1 · Monday: Flagpole is set up there."
    );
    // Copy and Paste leave fixed activities where they are; a hand move or edit can change one.
    await copyAt(element, "0-0");
    expect(notice(element)).toBe("Nothing copied: Flagpole is set up there.");
  });

  it("a copied Open cell clears where it is pasted", async () => {
    const { element, saveRuns } = await render(["1,2,", "1,,"]);
    await copyAt(element, "1-1");
    expect(notice(element)).toBe("Copied Open.");
    await pasteAt(element, "0-1");
    expect(sentRuns(saveRuns, 0)[0].after).toEqual([""]);
    expect(toolNotice(element)).toBe(
      "Pasted Open · Bunk 1 · Monday · Period 2 ·Undo"
    );
  });

  it("Cmd/Ctrl with a click adds or takes off a cell; Escape lets go of them all", async () => {
    const { element } = await render(["1,2,", "1,,"]);
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "1-2", toggle: true });
    expect(chosen(element).sort()).toEqual(["0-1", "1-2"]);
    await fromGrid(element, "cellselect", { key: "1-2", toggle: true });
    expect(chosen(element)).toEqual(["0-1"]);
    await fromGrid(element, "cellselect", { key: "1-1", toggle: true });
    await fromGrid(element, "cellescape", { key: "1-1" });
    expect(chosen(element)).toEqual([]);
  });

  it("focus moved on by itself lets go of what was chosen; focus that follows the choice keeps it", async () => {
    const { element } = await render(["1,2,", "1,,"]);
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "1-1", extend: true });
    await fromGrid(element, "cellfocus", { key: "1-1", extend: true });
    expect(chosen(element)).toEqual(["0-1", "1-1"]);
    await fromGrid(element, "cellfocus", { key: "1-2" });
    expect(chosen(element)).toEqual([]);
  });

  it("Edit has Copy and Paste: held until there is a cell and something copied; Paste puts focus on the line's Undo", async () => {
    const { element, saveRuns } = await render(["1,2,", "1,,"]);
    const copy = q(element, '[data-id="copy"]');
    const pasteRow = () => q(element, '[data-id="paste"]');
    expect(copy.getAttribute("aria-keyshortcuts")).toBe("Control+C Meta+C");
    expect(copy.disabled).toBe(true);
    expect(pasteRow().disabled).toBe(true);
    await fromGrid(element, "cellfocus", { key: "0-1" });
    expect(q(element, '[data-id="copy"]').disabled).toBe(false);
    q(element, '[data-id="copy"]').click();
    await flush();
    expect(notice(element)).toBe("Copied Swim.");
    expect(pasteRow().disabled).toBe(false);
    await fromGrid(element, "cellfocus", { key: "1-1" });
    pasteRow().click();
    await flush();
    expect(saveRuns).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="tool-undo"]')
    );
  });

  it("pastes onto another day in Group View", async () => {
    const { element, saveRuns } = await render(["1,2,", "1,,"]);
    q(element, '[data-view="group"]').click();
    await flush();
    // Group View: a column per day ("day-row").
    await copyAt(element, "0-1");
    await pasteAt(element, "1-1");
    expect(sentRuns(saveRuns, 0)).toEqual([
      expect.objectContaining({
        day: "2026-06-30",
        groupId: "g1",
        firstBlockId: "t2",
        after: ["A:a1"]
      })
    ]);
  });

  it("another day keeps what was copied; another week doesn't", async () => {
    const { element } = await render(["1,2,", "1,,"]);
    await copyAt(element, "0-1");
    q(element, '[data-index="1"]').click();
    await flush();
    await fromGrid(element, "cellfocus", { key: "0-1" });
    expect(q(element, '[data-id="paste"]').disabled).toBe(false);
    element.clear();
    element.show(draft(ITEMS, ["1,2,", "1,,"]), true);
    await flush();
    await fromGrid(element, "cellfocus", { key: "0-1" });
    expect(q(element, '[data-id="paste"]').disabled).toBe(true);
  });

  it("on Generated, pasted cells lock, as a hand edit does there", async () => {
    const { element, saveRuns } = await render(["1,2,", "1,,"], {
      locks: []
    });
    await copyAt(element, "0-1");
    await pasteAt(element, "1-1");
    expect(sentRuns(saveRuns, 0)[0].locksBefore).toEqual([""]);
    expect(
      cell(element, "1-1").querySelector('[data-id="lock-words"]').textContent
    ).toBe("Locked");
  });

  it("on Generated, a locked cell is left as it is and said; the rest is pasted", async () => {
    const { element, saveRuns } = await render(["1,2,3", "1,,"], {
      locks: ["2026-06-30|g1|t2"]
    });
    q(element, '[data-view="group"]').click();
    await flush();
    // Bunk 1's Monday Swim and Soccer onto Tuesday, whose Period 2 is locked.
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "0-2", extend: true });
    await shortcut(element, "0-2", "c");
    await pasteAt(element, "1-1");
    expect(sentRuns(saveRuns, 0)).toEqual([
      expect.objectContaining({
        day: "2026-06-30",
        groupId: "g1",
        firstBlockId: "t3",
        after: ["A:a3"]
      })
    ]);
    expect(toolNotice(element)).toBe(
      "Pasted 2 activities · Bunk 1 · Tuesday · Period 2. 1 left out: Swim · Bunk 1 · Tuesday: locked. ·Undo"
    );
  });
});
