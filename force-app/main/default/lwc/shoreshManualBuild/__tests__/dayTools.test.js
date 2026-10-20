import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import { buildTerms } from "c/shoreshTerms";
import {
  day,
  draft,
  schedule
} from "../../shoreshWeekEditor/__tests__/data/draftFixture";
import { editorRoot, find } from "shoresh-jest/week-editor";

// Clear day, Clear week and Copy day to… on the Manual Build screen (tools.js works them out;
// tools.test.js covers the rules). Synthetic camp: draftFixture (Bunk 2 isn't at camp at Lunch).

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
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "TimeBlock", singular: "Period", plural: "Periods", isCustom: true }
];
const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };
const ELECTIVE = { kind: "E", id: null, name: "Chugim", gone: false };
const BOATING = { kind: "A", id: "a2", name: "Boating", gone: false };
const ITEMS = [FLAGPOLE, SWIM, SOCCER];

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

/** Monday's and Tuesday's rows, both days with Flagpole, Swim and Soccer. */
function start(monday, tuesday) {
  const result = draft(ITEMS, monday);
  result.schedule.days[1] = day("2026-06-30", ITEMS, tuesday);
  return result;
}

async function render(first) {
  getDraft.mockResolvedValue(first);
  saveSlots.mockImplementation(() =>
    Promise.resolve({ conflicts: [], schedule: first.schedule })
  );
  const element = createElement("c-shoresh-manual-build", {
    is: ShoreshManualBuild
  });
  element.terms = buildTerms(LABELS);
  element.setup = SETUP;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => find(element, selector);
const sentRuns = (call) => saveSlots.mock.calls[call][0].edits[0].runs;
const choose = async (element, id, value) => {
  q(element, `[data-id="${id}"]`).dispatchEvent(
    new CustomEvent("select", { detail: { value } })
  );
  await flush();
};
/** The line after a tool, as read: its words, then its Undo. */
const toolNotice = (element) =>
  [...q(element, '[data-id="tool-notice"]').children]
    .map((child) => child.textContent.trim())
    .join(" ");

describe("c-shoresh-manual-build: day and week tools", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("Clear day clears the day shown for every bunk, no confirm, and says so with Undo", async () => {
    const element = await render(start(["1,2,3", "1,3,"], ["1,2,", "1,,"]));
    q(element, '[data-id="clear-day"]').click();
    await flush();
    const runs = sentRuns(0);
    expect(runs.every((run) => run.day === "2026-06-29")).toBe(true);
    expect(runs.map((run) => run.after)).toEqual([["", ""], [""]]);
    expect(toolNotice(element)).toBe("Cleared Monday · Undo");
    // Focus goes to the line's Undo: the most useful next stop.
    expect(q(element, "c-shoresh-week-editor").shadowRoot.activeElement).toBe(
      q(element, '[data-id="tool-undo"]')
    );
    // Undo, from the line: one step puts every bunk's day back.
    q(element, '[data-id="tool-undo"]').click();
    await flush();
    expect(sentRuns(1).map((run) => run.after)).toEqual([
      ["A:a3"],
      ["A:a1", "A:a3"]
    ]);
    expect(q(element, '[data-id="tool-notice"]')).toBeNull();
  });

  it("with nothing to clear, says so and sends nothing", async () => {
    const element = await render(start(["1,,", "1,,"], ["1,2,", "1,,"]));
    q(element, '[data-id="clear-day"]').click();
    await flush();
    expect(saveSlots).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Nothing to clear on Monday."
    );
  });

  it("Clear week clears every day; Group View's Clear day clears that bunk's day", async () => {
    const element = await render(start(["1,2,", "1,3,"], ["1,2,", "1,3,"]));
    expect(q(element, '[data-id="clear-week"]').textContent.trim()).toBe(
      "Clear week"
    );
    q(element, '[data-view="group"]').click();
    await flush();
    await choose(element, "clear-group-day", "1");
    expect(sentRuns(0)).toEqual([
      expect.objectContaining({
        day: "2026-06-30",
        groupId: "g1",
        after: [""]
      })
    ]);
    expect(toolNotice(element)).toBe("Cleared Bunk 1 · Tuesday · Undo");
    // After the menu, focus is on the line's Undo too (the menu may be held while it saves).
    expect(q(element, "c-shoresh-week-editor").shadowRoot.activeElement).toBe(
      q(element, '[data-id="tool-undo"]')
    );
    q(element, '[data-id="clear-week"]').click();
    await flush();
    expect(new Set(sentRuns(1).map((run) => run.day))).toEqual(
      new Set(["2026-06-29", "2026-06-30"])
    );
    expect(toolNotice(element)).toBe("Cleared Week 1 · Undo");
  });

  it("Copy day to… copies each bunk's activities and lists what was left out", async () => {
    // Monday: Bunk 2 has Soccer at Lunch, but Tuesday it isn't at camp then (the fixture's away).
    const element = await render(start(["1,2,", "1,,3"], ["1,3,", "1,,"]));
    await choose(element, "copy-day", "1");
    expect(sentRuns(0)).toEqual([
      expect.objectContaining({
        day: "2026-06-30",
        groupId: "g1",
        after: ["A:a1"]
      })
    ]);
    expect(toolNotice(element)).toBe(
      "Copied Monday to Tuesday. 1 left out: Soccer · Bunk 2 · Tuesday: not at camp then. · Undo"
    );
  });

  it("the tools aren't in Activity View", async () => {
    const element = await render(start(["1,2,", "1,,"], ["1,,", "1,,"]));
    expect(q(element, '[data-id="tools"]')).not.toBeNull();
    q(element, '[data-view="activity"]').click();
    await flush();
    expect(q(element, '[data-id="tools"]')).toBeNull();
  });

  it("Undo on the line takes the copy back in one step and puts focus on the toolbar", async () => {
    const element = await render(start(["1,2,", "1,3,"], ["1,,", "1,,"]));
    await choose(element, "copy-day", "1");
    q(element, '[data-id="tool-undo"]').click();
    await flush();
    expect(sentRuns(1).map((run) => [run.groupId, run.after])).toEqual([
      ["g2", [""]],
      ["g1", [""]]
    ]);
    const focused = editorRoot(element).activeElement;
    expect(["undo", "redo"]).toContain(focused && focused.dataset.id);
  });

  it("the line goes once Undo would take back something else", async () => {
    const element = await render(start(["1,2,", "1,,"], ["1,,", "1,,"]));
    q(element, '[data-id="clear-day"]').click();
    await flush();
    expect(q(element, '[data-id="tool-notice"]')).not.toBeNull();
    q(element, '[data-id="undo"]').click();
    await flush();
    expect(q(element, '[data-id="tool-notice"]')).toBeNull();
  });

  it("what was left out is said with the save, for screen readers", async () => {
    const element = await render(start(["1,2,", "1,,3"], ["1,3,", "1,,"]));
    await choose(element, "copy-day", "1");
    expect(q(element, '[data-id="announce"]').textContent).toContain(
      "1 left out: Soccer · Bunk 2 · Tuesday: not at camp then."
    );
  });

  it("a copy that changes nothing says the day already matches", async () => {
    const element = await render(start(["1,2,", "1,,"], ["1,2,", "1,,"]));
    await choose(element, "copy-day", "1");
    expect(saveSlots).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Tuesday already matches Monday."
    );
  });

  /** The server's week after someone else's change: Monday's and Tuesday's rows. */
  const theirWeek = (monday, tuesday, items = ITEMS) => {
    const week = schedule(items, monday);
    week.days[1] = day("2026-06-30", items, tuesday);
    return week;
  };

  it("Keep theirs on a Clear keeps their cell and clears the rest, as one Undo step", async () => {
    const element = await render(start(["1,2,3", "1,3,"], ["1,,", "1,,"]));
    // Someone else put Swim in Bunk 2's Period 2 meanwhile.
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: theirWeek(["1,2,3", "1,2,"], ["1,,", "1,,"])
    });
    q(element, '[data-id="clear-day"]').click();
    await flush();
    expect(q(element, '[data-id="conflict"]')).not.toBeNull();
    // Not claimed while the question is open.
    expect(q(element, '[data-id="tool-notice"]')).toBeNull();
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: theirWeek(["1,,", "1,2,"], ["1,,", "1,,"])
    });
    q(element, '[data-id="keep-theirs"]').click();
    await flush();
    expect(sentRuns(1).map((run) => [run.groupId, run.after])).toEqual([
      ["g1", ["", ""]]
    ]);
    expect(toolNotice(element)).toBe(
      "Cleared Monday, except 1 activity that changed · Undo"
    );
    // One Undo step puts Bunk 1 back, and leaves their Swim.
    q(element, '[data-id="tool-undo"]').click();
    await flush();
    expect(sentRuns(2).map((run) => [run.groupId, run.after])).toEqual([
      ["g1", ["A:a1", "A:a3"]]
    ]);
  });

  it("Keep theirs counts an activity running two blocks that someone else put there as one", async () => {
    const items = [...ITEMS, BOATING];
    const first = draft(items, ["1,2,3", "1,3,"]);
    first.schedule.days[1] = day("2026-06-30", items, ["1,,", "1,,"]);
    const element = await render(first);
    // Someone else put Boating (two blocks) over Bunk 1's Period 2 and Lunch meanwhile.
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: theirWeek(["1,4,^", "1,3,"], ["1,,", "1,,"], items)
    });
    q(element, '[data-id="clear-day"]').click();
    await flush();
    expect(q(element, '[data-id="conflict"]')).not.toBeNull();
    saveSlots.mockResolvedValueOnce({
      conflicts: [],
      schedule: theirWeek(["1,4,^", "1,,"], ["1,,", "1,,"], items)
    });
    q(element, '[data-id="keep-theirs"]').click();
    await flush();
    expect(sentRuns(1).map((run) => [run.groupId, run.after])).toEqual([
      ["g2", [""]]
    ]);
    // Two cells, one activity.
    expect(toolNotice(element)).toBe(
      "Cleared Monday, except 1 activity that changed · Undo"
    );
  });

  it("Use yours on a Clear clears their cell too", async () => {
    const element = await render(start(["1,2,3", "1,3,"], ["1,,", "1,,"]));
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: theirWeek(["1,2,3", "1,2,"], ["1,,", "1,,"])
    });
    q(element, '[data-id="clear-day"]').click();
    await flush();
    q(element, '[data-id="use-yours"]').click();
    await flush();
    expect(
      sentRuns(1)
        .map((run) => run.groupId)
        .sort()
    ).toEqual(["g1", "g2"]);
  });

  it("a fixed activity now in a cleared cell leaves that cell, and the rest is cleared", async () => {
    const element = await render(start(["1,2,3", "1,3,"], ["1,,", "1,,"]));
    // Setup now puts Flagpole in Bunk 1's Period 2 as well.
    saveSlots.mockResolvedValueOnce({
      conflicts: [0],
      schedule: theirWeek(["1,1,3", "1,3,"], ["1,,", "1,,"])
    });
    q(element, '[data-id="clear-day"]').click();
    await flush();
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(
      sentRuns(1).map((run) => [run.groupId, run.firstBlockId, run.after])
    ).toEqual([
      ["g1", "t3", [""]],
      ["g2", "t2", [""]]
    ]);
    expect(toolNotice(element)).toBe(
      "Cleared Monday, except 1 activity that changed · Undo"
    );
  });

  it("Copy day to… offers the other days, and All other days when there are two or more", async () => {
    const first = start(["1,2,", "1,,"], ["1,,", "1,,"]);
    first.schedule.days.push(day("2026-07-01", ITEMS, ["1,,", "1,,"]));
    const element = await render(first);
    const items = [
      ...q(element, '[data-id="copy-day"]').querySelectorAll(
        "lightning-menu-item"
      )
    ].map((i) => i.label);
    expect(items).toEqual(["Tuesday", "Wednesday", "All other days"]);
    await choose(element, "copy-day", "all");
    expect(new Set(sentRuns(0).map((run) => run.day))).toEqual(
      new Set(["2026-06-30", "2026-07-01"])
    );
    expect(toolNotice(element)).toBe("Copied Monday to all other days · Undo");
  });

  it("a copy that changes nothing but leaves things out says Nothing copied first", async () => {
    // Bunk 2's Soccer at Lunch can't go: Bunk 2 isn't at camp at Lunch.
    const element = await render(start(["1,,", "1,,3"], ["1,,", "1,,"]));
    await choose(element, "copy-day", "1");
    expect(saveSlots).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Nothing copied. 1 left out: Soccer · Bunk 2 · Tuesday: not at camp then."
    );
  });

  it("Clear says what stayed and why, five named at most", async () => {
    const withElective = [...ITEMS, ELECTIVE];
    const first = draft(withElective, ["4,4,4", "4,4,4"]);
    first.schedule.days[1] = day("2026-06-30", withElective, [
      "4,4,4",
      "4,4,4"
    ]);
    const element = await render(first);
    q(element, '[data-id="clear-week"]').click();
    await flush();
    const text = q(element, '[data-id="notice"]').textContent;
    expect(
      text.startsWith(
        "Nothing cleared in Week 1. 12 stayed: Chugim · Bunk 1 · Monday (not set up yet);"
      )
    ).toBe(true);
    expect(text.endsWith("; and 7 more.")).toBe(true);
  });

  it("no Clear day or Copy day on a day that can't be read", async () => {
    const first = start(["1,2,", "1,,"], ["1,,", "1,,"]);
    first.schedule.days[0] = {
      ...first.schedule.days[0],
      problem: "unreadable"
    };
    const element = await render(first);
    expect(q(element, '[data-id="clear-day"]')).toBeNull();
    expect(q(element, '[data-id="copy-day"]')).toBeNull();
    expect(q(element, '[data-id="clear-week"]')).not.toBeNull();
    // Said in camp words: not why it can't be read (how the day is stored).
    const said = q(element, '[role="alert"]').textContent.trim();
    expect(said).toBe("Monday can't be shown. Nothing on it was changed.");
    expect(said).not.toContain("unreadable");
  });

  it("the line's Undo is named for what it takes back", async () => {
    const element = await render(start(["1,2,", "1,,"], ["1,,", "1,,"]));
    q(element, '[data-id="clear-day"]').click();
    await flush();
    expect(q(element, '[data-id="tool-undo"]').getAttribute("aria-label")).toBe(
      "Undo Cleared Monday"
    );
  });

  it("the director's own edit made while a Clear saves isn't counted as someone else's", async () => {
    const element = await render(start(["1,2,3", "1,3,"], ["1,2,", "1,,"]));
    let answer;
    saveSlots.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    q(element, '[data-id="clear-day"]').click();
    await flush();
    // While it saves, the director clears Bunk 1's Period 2 on Tuesday (it waits its turn).
    q(element, '[data-view="group"]').click();
    await flush();
    q(element, '[data-id="edit-grid"]')
      .shadowRoot.querySelector('[data-cell="1-1"]')
      .dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Delete",
          bubbles: true,
          composed: true
        })
      );
    await flush();
    // Someone else put Swim in Bunk 2's Monday Period 2.
    answer({
      conflicts: [0],
      schedule: theirWeek(["1,2,3", "1,2,"], ["1,2,", "1,,"])
    });
    await flush();
    saveSlots.mockResolvedValue({
      conflicts: [],
      schedule: theirWeek(["1,,", "1,2,"], ["1,,", "1,,"])
    });
    q(element, '[data-id="keep-theirs"]').click();
    await flush();
    // Only their one cell is kept (Bunk 2's); the Clear goes first, then the director's own edit.
    expect(sentRuns(1).map((run) => run.groupId)).toEqual(["g1"]);
    // The line isn't shown: Undo would now take back the director's later edit.
    expect(q(element, '[data-id="tool-notice"]')).toBeNull();
    const order = saveSlots.mock.calls
      .slice(1)
      .map((call) => call[0].edits[0].runs[0].day);
    expect(order).toEqual(["2026-06-29", "2026-06-30"]);
  });
});
