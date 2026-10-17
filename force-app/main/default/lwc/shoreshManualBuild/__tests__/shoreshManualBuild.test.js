import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import startBlankWeek from "@salesforce/apex/ManualBuildController.startBlankWeek";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import addActivity from "@salesforce/apex/ManualBuildController.addActivity";
import { buildTerms } from "c/shoreshTerms";
import { WITH_SOCCER, WITH_SWIM, draft, schedule } from "./data/draftFixture";
import { useYoursSendsWhatWasShown } from "./data/shownIsSent";

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/ManualBuildController.getDraft", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ManualBuildController.startBlankWeek",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/ManualBuildController.saveSlots", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/ManualBuildController.addActivity", () => apex(), {
  virtual: true
});

const SETUP = {
  season: { Id: "se1", Name: "Summer 2026" },
  weeks: [{ Id: "w1", Name: "Week 1" }],
  programs: [{ program: { Id: "p1", Name: "Main" } }],
  activities: [],
  locations: []
};
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

function later() {
  let answer;
  const promise = new Promise((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

async function render() {
  const element = createElement("c-shoresh-manual-build", {
    is: ShoreshManualBuild
  });
  element.terms = buildTerms(LABELS);
  element.setup = SETUP;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cell = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);
const cellText = (element, key) =>
  cell(element, key).querySelector(".cell-name").textContent;

async function press(target, key) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
  );
  await flush();
}

async function type(element, text) {
  const input = q(element, '[data-id="slot-input"]');
  input.value = text;
  input.dispatchEvent(new CustomEvent("input"));
  await flush();
  return input;
}

const optionLabels = (element) =>
  qa(element, '[role="option"]').map((o) => o.textContent.trim());

/** What the server answers after an edit: the draft as it now is. */
const answer = (items, rows, conflicts = []) => ({
  conflicts,
  schedule: schedule(items, rows)
});

describe("c-shoresh-manual-build", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("a week not started offers Start a blank week, which opens it", async () => {
    getDraft.mockResolvedValue(null);
    startBlankWeek.mockResolvedValue(draft());
    const element = await render();
    expect(getDraft).toHaveBeenCalledWith({ programId: "p1", weekId: "w1" });
    expect(grid(element)).toBeNull();
    const start = q(element, '[data-id="start-week"]');
    expect(start.label).toBe("Start a blank week");
    start.click();
    await flush();
    expect(startBlankWeek).toHaveBeenCalledWith({
      programId: "p1",
      weekId: "w1"
    });
    expect(grid(element).editable).toBe(true);
    expect(cellText(element, "0-0")).toBe("Flagpole");
    expect(cellText(element, "0-1")).toBe("Open");
  });

  it("Start a blank week names any fixed or recurring activity whose slot was taken", async () => {
    getDraft.mockResolvedValue(null);
    startBlankWeek.mockResolvedValue({
      ...draft(),
      notPlaced: ["Rest · Bunk 2 · Monday"]
    });
    const element = await render();
    q(element, '[data-id="start-week"]').click();
    await flush();
    const note = q(element, '[data-id="not-placed"]');
    expect(note.textContent).toContain("Rest · Bunk 2 · Monday");
    const dot = note.querySelector("c-shoresh-dot");
    expect(dot.label).toBe("Not placed: the cell was taken");
    expect(dot.focusable).toBe(true);
  });

  it("is a keyboard grid with one cell in the tab order; arrows move between cells", async () => {
    getDraft.mockResolvedValue(draft());
    const element = await render();
    const frame = grid(element).shadowRoot.querySelector('[role="grid"]');
    expect(frame).not.toBeNull();
    expect(cell(element, "0-0").getAttribute("tabindex")).toBe("0");
    expect(cell(element, "0-1").getAttribute("tabindex")).toBe("-1");
    await press(cell(element, "0-0"), "ArrowDown");
    expect(cell(element, "0-1").getAttribute("tabindex")).toBe("0");
    await press(cell(element, "0-1"), "ArrowRight");
    expect(cell(element, "1-1").getAttribute("tabindex")).toBe("0");
  });

  it("Enter, typing, and Enter place an activity at its full length; it saves at once", async () => {
    getDraft.mockResolvedValue(draft());
    const saved = later();
    saveSlots.mockReturnValue(saved.promise);
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    expect(
      q(element, '[data-id="slot-editor"]').getAttribute("aria-label")
    ).toBe("Bunk 1 · Monday · Period 2");
    const input = await type(element, "boa");
    expect(optionLabels(element)).toEqual([
      "Boating",
      'Add "boa" to activities'
    ]);
    await press(input, "Enter");
    expect(saveSlots).toHaveBeenCalledWith({
      scheduleId: "d1",
      edits: [
        {
          runs: [
            {
              day: "2026-06-29",
              groupId: "g1",
              firstBlockId: "t2",
              before: ["", ""],
              after: ["A:a2", "^A:a2"],
              blockIds: ["t2", "t3"]
            }
          ]
        }
      ]
    });
    // Shown before the server answers, and the editor is gone.
    expect(q(element, '[data-id="slot-editor"]')).toBeNull();
    expect(cellText(element, "0-1")).toBe("Boating");
    expect(cell(element, "0-1").getAttribute("aria-rowspan")).toBe("2");
    saved.answer(
      answer(
        [...WITH_SOCCER.slice(0, 1), { kind: "A", id: "a2", name: "Boating" }],
        ["1,2,^", "1,,"]
      )
    );
    await flush();
    expect(q(element, '[data-id="announce"]').textContent).toContain(
      "Placed Boating · Bunk 1 · Monday · Period 2"
    );
  });

  it("double-click opens the same editor", async () => {
    getDraft.mockResolvedValue(draft());
    const element = await render();
    cell(element, "1-1").dispatchEvent(
      new CustomEvent("dblclick", { bubbles: true, composed: true })
    );
    await flush();
    expect(
      q(element, '[data-id="slot-editor"]').getAttribute("aria-label")
    ).toBe("Bunk 2 · Monday · Period 2");
  });

  it("an activity not set up for the bunk is offered last, with a dot", async () => {
    getDraft.mockResolvedValue(draft());
    const element = await render();
    await press(cell(element, "1-1"), "Enter");
    expect(optionLabels(element)).toEqual(["Boating", "Soccer", "Swim"]);
    const dots = qa(element, '[role="option"] c-shoresh-dot');
    expect(dots.map((d) => d.label)).toEqual(["Not set up for Bunk 2"]);
  });

  it("arrowing to an option with a dot shows its words; screen readers hear them in the option", async () => {
    getDraft.mockResolvedValue(draft());
    const element = await render();
    await press(cell(element, "1-1"), "Enter");
    const input = await type(element, "sw");
    const option = q(element, '[role="option"]');
    const dot = option.querySelector("c-shoresh-dot");
    // The option is the highlighted one, so its dot's words show.
    expect(option.getAttribute("aria-selected")).toBe("true");
    expect(dot.open).toBe(true);
    expect(
      dot.shadowRoot.querySelector('[data-id="dot-words"]').textContent
    ).toBe("Not set up for Bunk 2");
    await type(element, "s");
    await press(input, "ArrowDown");
    expect(dot.open).toBe(true);
  });

  it("Escape on a dot's words closes the words only, not the typing box", async () => {
    getDraft.mockResolvedValue(draft());
    const element = await render();
    await press(cell(element, "1-1"), "Enter");
    const input = await type(element, "sw");
    const dot = q(element, '[role="option"] c-shoresh-dot');
    expect(dot.shadowRoot.querySelector('[data-id="dot-tip"]')).not.toBeNull();
    await press(input, "Escape");
    expect(dot.shadowRoot.querySelector('[data-id="dot-tip"]')).toBeNull();
    expect(q(element, '[data-id="slot-editor"]')).not.toBeNull();
    await press(input, "Escape");
    expect(q(element, '[data-id="slot-editor"]')).toBeNull();
  });

  it("Delete clears a placed slot; Open is offered when typing into a filled one", async () => {
    getDraft.mockResolvedValue(draft(WITH_SOCCER, ["1,2,", "1,,"]));
    saveSlots.mockResolvedValue(
      answer(WITH_SOCCER.slice(0, 1), ["1,,", "1,,"])
    );
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    expect(optionLabels(element)[0]).toBe("Open");
    await press(q(element, '[data-id="slot-input"]'), "Escape");
    expect(q(element, '[data-id="slot-editor"]')).toBeNull();
    await press(cell(element, "0-1"), "Delete");
    expect(saveSlots.mock.calls[0][0].edits[0].runs[0]).toEqual({
      day: "2026-06-29",
      groupId: "g1",
      firstBlockId: "t2",
      before: ["A:a3"],
      after: [""],
      blockIds: ["t2"]
    });
    expect(cellText(element, "0-1")).toBe("Open");
  });

  it("fixed activities and slots where a bunk isn't at camp can't be changed", async () => {
    getDraft.mockResolvedValue(draft());
    const element = await render();
    expect(cellText(element, "1-2")).toBe("Not at camp");
    await press(cell(element, "0-0"), "Enter");
    expect(q(element, '[data-id="slot-editor"]')).toBeNull();
    expect(q(element, '[data-id="announce"]').textContent).toContain(
      "Flagpole stays where it is set up."
    );
    await press(cell(element, "0-0"), "Delete");
    await press(cell(element, "1-2"), "Enter");
    expect(q(element, '[data-id="slot-editor"]')).toBeNull();
    expect(saveSlots).not.toHaveBeenCalled();
  });

  it("a new name adds it to activities, then places it", async () => {
    getDraft.mockResolvedValue(draft());
    addActivity.mockResolvedValue({
      id: "a7",
      name: "Archery",
      length: 1,
      notFor: []
    });
    saveSlots.mockResolvedValue(
      answer(
        [...WITH_SOCCER.slice(0, 1), { kind: "A", id: "a7", name: "Archery" }],
        ["1,2,", "1,,"]
      )
    );
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    const input = await type(element, "  Archery ");
    expect(optionLabels(element)).toEqual(['Add "Archery" to activities']);
    await press(input, "Enter");
    expect(addActivity).toHaveBeenCalledWith({
      scheduleId: "d1",
      name: "Archery"
    });
    expect(saveSlots.mock.calls[0][0].edits[0].runs[0].after).toEqual(["A:a7"]);
    expect(cellText(element, "0-1")).toBe("Archery");
  });

  it("a slot someone else changed asks keep theirs or use yours; Use yours saves over theirs", async () => {
    getDraft.mockResolvedValue(draft());
    // Someone put Soccer in Bunk 1's Period 2 before this Swim reached the server.
    saveSlots.mockResolvedValueOnce(answer(WITH_SOCCER, ["1,2,", "1,,"], [0]));
    saveSlots.mockResolvedValueOnce(answer(WITH_SWIM, ["1,2,", "1,,"]));
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    const dialog = q(element, '[data-id="conflict"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("Bunk 1 · Monday · Period 2");
    expect(q(element, '[data-id="theirs"]').textContent).toBe("Soccer");
    expect(q(element, '[data-id="yours"]').textContent).toBe("Swim");
    // Theirs shows on the grid meanwhile: nothing was overwritten.
    expect(cellText(element, "0-1")).toBe("Soccer");
    // Use yours sends exactly what the question listed.
    await useYoursSendsWhatWasShown(element, saveSlots, schedule(), flush);
    expect(saveSlots.mock.calls[1][0].edits[0].runs[0]).toEqual({
      day: "2026-06-29",
      groupId: "g1",
      firstBlockId: "t2",
      before: ["A:a3"],
      after: ["A:a1"],
      blockIds: ["t2"]
    });
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(cellText(element, "0-1")).toBe("Swim");
  });

  it("Keep theirs saves nothing more", async () => {
    getDraft.mockResolvedValue(draft());
    saveSlots.mockResolvedValueOnce(answer(WITH_SOCCER, ["1,2,", "1,,"], [0]));
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    q(element, '[data-id="keep-theirs"]').click();
    await flush();
    expect(saveSlots).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(cellText(element, "0-1")).toBe("Soccer");
  });

  it("edits made while one is saving are sent in order, each after the last", async () => {
    getDraft.mockResolvedValue(draft());
    const first = later();
    saveSlots.mockReturnValueOnce(first.promise);
    saveSlots.mockResolvedValueOnce(
      answer(
        [...WITH_SOCCER, { kind: "A", id: "a1", name: "Swim" }],
        ["1,3,", "1,2,"]
      )
    );
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    await press(cell(element, "1-1"), "Enter");
    await press(await type(element, "soccer"), "Enter");
    expect(saveSlots).toHaveBeenCalledTimes(1);
    expect(cellText(element, "1-1")).toBe("Soccer");
    first.answer(answer(WITH_SWIM, ["1,2,", "1,,"]));
    await flush();
    expect(saveSlots).toHaveBeenCalledTimes(2);
    expect(saveSlots.mock.calls[1][0].edits[0].runs[0].groupId).toBe("g2");
    expect(cellText(element, "0-1")).toBe("Swim");
    expect(cellText(element, "1-1")).toBe("Soccer");
  });

  it("a refused save says why and reloads the week", async () => {
    getDraft.mockResolvedValue(draft());
    saveSlots.mockRejectedValue({
      body: { message: "Couldn't save. Try again." }
    });
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Couldn't save. Try again."
    );
    expect(getDraft).toHaveBeenCalledTimes(2);
    expect(cellText(element, "0-1")).toBe("Open");
  });

  it("while keep-theirs-or-yours is open, later edits wait for the answer", async () => {
    getDraft.mockResolvedValue(draft());
    saveSlots.mockResolvedValueOnce(answer(WITH_SOCCER, ["1,2,", "1,,"], [0]));
    saveSlots.mockResolvedValueOnce(answer(WITH_SOCCER, ["1,2,", "1,2,"]));
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    expect(q(element, '[data-id="conflict"]')).not.toBeNull();
    await press(cell(element, "1-1"), "Enter");
    await press(await type(element, "soccer"), "Enter");
    // Bunk 2's edit shows, but is not sent while the question is open.
    expect(saveSlots).toHaveBeenCalledTimes(1);
    expect(cellText(element, "1-1")).toBe("Soccer");
    q(element, '[data-id="keep-theirs"]').click();
    await flush();
    expect(saveSlots).toHaveBeenCalledTimes(2);
    expect(saveSlots.mock.calls[1][0].edits[0].runs[0].groupId).toBe("g2");
  });

  it("Use yours over a longer activity of theirs replaces all of it", async () => {
    const boating = [
      { kind: "F", id: "f1", name: "Flagpole", gone: false },
      { kind: "A", id: "a2", name: "Boating", gone: false }
    ];
    getDraft.mockResolvedValue(draft());
    saveSlots.mockResolvedValueOnce(answer(boating, ["1,2,^", "1,,"], [0]));
    saveSlots.mockResolvedValueOnce(answer(WITH_SWIM, ["1,2,", "1,,"]));
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    expect(q(element, '[data-id="theirs"]').textContent).toBe("Boating");
    // Use yours sends exactly what the question listed.
    await useYoursSendsWhatWasShown(element, saveSlots, schedule(), flush);
    expect(saveSlots.mock.calls[1][0].edits[0].runs[0]).toEqual({
      day: "2026-06-29",
      groupId: "g1",
      firstBlockId: "t2",
      before: ["A:a2", "^A:a2"],
      after: ["A:a1", ""],
      blockIds: ["t2", "t3"]
    });
  });

  it("a reload that started before an edit doesn't replace it when it answers", async () => {
    getDraft.mockResolvedValueOnce(draft());
    const element = await render();
    const stale = later();
    getDraft.mockReturnValueOnce(stale.promise);
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    saveSlots.mockResolvedValue(answer(WITH_SWIM, ["1,2,", "1,,"]));
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    expect(cellText(element, "0-1")).toBe("Swim");
    stale.answer(draft());
    await flush();
    expect(cellText(element, "0-1")).toBe("Swim");
  });

  it("Use yours over theirs that starts earlier keeps your cell and replaces all of theirs", async () => {
    // Someone put two-block Boating in Bunk 1's Period 2 and Lunch; I typed Swim into Lunch.
    const boating = [
      { kind: "F", id: "f1", name: "Flagpole", gone: false },
      { kind: "A", id: "a2", name: "Boating", gone: false }
    ];
    getDraft.mockResolvedValue(draft());
    saveSlots.mockResolvedValueOnce(answer(boating, ["1,2,^", "1,,"], [0]));
    saveSlots.mockResolvedValueOnce(answer(WITH_SWIM, ["1,,2", "1,,"]));
    const element = await render();
    await press(cell(element, "0-2"), "Enter");
    await press(await type(element, "swim"), "Enter");
    expect(q(element, '[data-id="conflict"]').textContent).toContain(
      "Bunk 1 · Monday · Lunch"
    );
    expect(q(element, '[data-id="theirs"]').textContent).toBe("Boating");
    // Use yours sends exactly what the question listed.
    await useYoursSendsWhatWasShown(element, saveSlots, schedule(), flush);
    expect(saveSlots.mock.calls[1][0].edits[0].runs[0]).toEqual({
      day: "2026-06-29",
      groupId: "g1",
      firstBlockId: "t2",
      before: ["A:a2", "^A:a2"],
      after: ["", "A:a1"],
      blockIds: ["t2", "t3"]
    });
  });

  it("Use yours where theirs is in your second block keeps your full length", async () => {
    // I typed two-block Boating into Period 2; someone had put Soccer in Lunch meanwhile.
    getDraft.mockResolvedValue(draft());
    saveSlots.mockResolvedValueOnce(answer(WITH_SOCCER, ["1,,2", "1,,"], [0]));
    saveSlots.mockResolvedValueOnce(
      answer(
        [WITH_SOCCER[0], { kind: "A", id: "a2", name: "Boating" }],
        ["1,2,^", "1,,"]
      )
    );
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "boat"), "Enter");
    // The slot that changed is Lunch, and theirs there is Soccer (not "Open").
    expect(q(element, '[data-id="conflict"]').textContent).toContain(
      "Bunk 1 · Monday · Lunch"
    );
    expect(q(element, '[data-id="theirs"]').textContent).toBe("Soccer");
    expect(q(element, '[data-id="yours"]').textContent).toBe("Boating");
    // Use yours sends exactly what the question listed.
    await useYoursSendsWhatWasShown(element, saveSlots, schedule(), flush);
    expect(saveSlots.mock.calls[1][0].edits[0].runs[0]).toEqual({
      day: "2026-06-29",
      groupId: "g1",
      firstBlockId: "t2",
      before: ["", "A:a3"],
      after: ["A:a2", "^A:a2"],
      blockIds: ["t2", "t3"]
    });
  });

  it("Use yours goes before the edits that waited, worked out on the server's week", async () => {
    getDraft.mockResolvedValue(draft());
    saveSlots.mockResolvedValueOnce(answer(WITH_SOCCER, ["1,2,", "1,,"], [0]));
    saveSlots.mockResolvedValue(answer(WITH_SWIM, ["1,2,", "1,,"]));
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    // While the question is open: Soccer for Bunk 2, waiting.
    await press(cell(element, "1-1"), "Enter");
    await press(await type(element, "soccer"), "Enter");
    // Use yours sends exactly what the question listed.
    await useYoursSendsWhatWasShown(element, saveSlots, schedule(), flush);
    expect(saveSlots.mock.calls[1][0].edits[0].runs[0]).toEqual({
      day: "2026-06-29",
      groupId: "g1",
      firstBlockId: "t2",
      before: ["A:a3"],
      after: ["A:a1"],
      blockIds: ["t2"]
    });
    expect(saveSlots.mock.calls[2][0].edits[0].runs[0].groupId).toBe("g2");
  });

  it("something left where a bunk isn't at camp can only be cleared", async () => {
    getDraft.mockResolvedValue(draft(WITH_SOCCER, ["1,,", "1,,2"]));
    const element = await render();
    await press(cell(element, "1-2"), "Enter");
    await type(element, "sw");
    expect(optionLabels(element)).toEqual(["Open"]);
  });

  it("when someone made the activity longer, the question names the cell that changed", async () => {
    getDraft.mockResolvedValue(draft(WITH_SWIM, ["1,2,", "1,,"]));
    // I clear the one-block Swim I see; someone had made it run on into Lunch.
    saveSlots.mockResolvedValueOnce(answer(WITH_SWIM, ["1,2,^", "1,,"], [0]));
    const element = await render();
    await press(cell(element, "0-1"), "Delete");
    expect(q(element, '[data-id="conflict"]').textContent).toContain(
      "Bunk 1 · Monday · Lunch"
    );
    expect(q(element, '[data-id="theirs"]').textContent).toBe("Swim");
    expect(q(element, '[data-id="announce"]').textContent).toBe(
      "Bunk 1 · Monday · Lunch changed since you opened it."
    );
  });

  it("a cell the day no longer has is named, not asked about, and the rest still save", async () => {
    getDraft.mockResolvedValue(draft());
    // Lunch was taken out of the program's day while I typed two-block Boating into Period 2.
    const shorter = schedule(WITH_SOCCER, ["1,2", "1,"]);
    shorter.days[0] = {
      ...shorter.days[0],
      blocks: shorter.days[0].blocks.slice(0, 2)
    };
    saveSlots.mockResolvedValueOnce({ conflicts: [0], schedule: shorter });
    const rest = later();
    saveSlots.mockReturnValueOnce(rest.promise);
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "boat"), "Enter");
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Bunk 1 · Monday · Lunch isn't in the week any more."
    );
    expect(q(element, '[data-id="announce"]').textContent).toBe(
      "Bunk 1 · Monday · Lunch isn't in the week any more."
    );
    // The next change still saves.
    await press(cell(element, "1-1"), "Enter");
    await press(await type(element, "soccer"), "Enter");
    expect(saveSlots).toHaveBeenCalledTimes(2);
    expect(saveSlots.mock.calls[1][0].edits[0].runs[0].groupId).toBe("g2");
    // Once the rest have saved, the line goes.
    rest.answer(answer(WITH_SOCCER, ["1,2", "1,2"]));
    await flush();
    expect(q(element, '[data-id="notice"]')).toBeNull();
  });

  it("when theirs already matches yours there is nothing to ask", async () => {
    getDraft.mockResolvedValue(draft());
    saveSlots.mockResolvedValueOnce(answer(WITH_SWIM, ["1,2,", "1,,"], [0]));
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(saveSlots).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Already as you had it."
    );
  });

  it("an activity that starts where the bunk is at camp offers the full list", async () => {
    // Boating starts in Period 2 (at camp) and carries on into Lunch (away): the start decides.
    getDraft.mockResolvedValue(
      draft(
        [WITH_SOCCER[0], { kind: "A", id: "a2", name: "Boating", gone: false }],
        ["1,,", "1,2,^"]
      )
    );
    const element = await render();
    await press(cell(element, "1-1"), "Enter");
    expect(optionLabels(element)).toEqual([
      "Open",
      "Boating",
      "Soccer",
      "Swim"
    ]);
  });

  it("an activity that starts where a bunk isn't at camp can only be cleared", async () => {
    const start = draft(
      [WITH_SOCCER[0], { kind: "A", id: "a2", name: "Boating", gone: false }],
      ["1,,", "1,2,^"]
    );
    getDraft.mockResolvedValue({
      ...start,
      away: [{ groupId: "g2", blockIds: ["t2"] }]
    });
    const element = await render();
    await press(cell(element, "1-1"), "Enter");
    await type(element, "sw");
    expect(optionLabels(element)).toEqual(["Open"]);
  });

  it("an error goes away once a save works", async () => {
    getDraft.mockResolvedValue(draft());
    addActivity.mockRejectedValueOnce({
      body: { message: "Keep the name to 80 characters or fewer." }
    });
    saveSlots.mockResolvedValue(answer(WITH_SWIM, ["1,2,", "1,,"]));
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "x".repeat(81)), "Enter");
    expect(q(element, '[data-id="build-error"]')).not.toBeNull();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    expect(q(element, '[data-id="build-error"]')).toBeNull();
  });

  it("slots that can't change are read-only for screen readers", async () => {
    getDraft.mockResolvedValue(draft());
    const element = await render();
    expect(cell(element, "0-0").getAttribute("aria-readonly")).toBe("true");
    expect(cell(element, "1-2").getAttribute("aria-readonly")).toBe("true");
    expect(cell(element, "0-1").getAttribute("aria-readonly")).toBeNull();
  });

  it("Tab stays on the question's two buttons", async () => {
    getDraft.mockResolvedValue(draft());
    saveSlots.mockResolvedValueOnce(answer(WITH_SOCCER, ["1,2,", "1,,"], [0]));
    const element = await render();
    await press(cell(element, "0-1"), "Enter");
    await press(await type(element, "swim"), "Enter");
    const keep = q(element, '[data-id="keep-theirs"]');
    expect(element.shadowRoot.activeElement).toBe(keep);
    await press(keep, "Tab");
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="use-yours"]')
    );
    await press(q(element, '[data-id="use-yours"]'), "Tab");
    expect(element.shadowRoot.activeElement).toBe(keep);
  });

  it("Group View edits one bunk's week the same way", async () => {
    getDraft.mockResolvedValue(draft());
    saveSlots.mockResolvedValue(answer(WITH_SOCCER, ["1,2,", "1,,"]));
    const element = await render();
    q(element, '[data-view="group"]').click();
    await flush();
    // Columns are days: Tuesday's Period 2 for Bunk 1.
    await press(cell(element, "1-1"), "Enter");
    expect(
      q(element, '[data-id="slot-editor"]').getAttribute("aria-label")
    ).toBe("Bunk 1 · Tuesday · Period 2");
    await press(await type(element, "socc"), "Enter");
    expect(saveSlots.mock.calls[0][0].edits[0].runs[0].day).toBe("2026-06-30");
  });
});
