import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import { buildTerms } from "c/shoreshTerms";
import { day, draft } from "./data/draftFixture";

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

const q = (element, selector) => element.shadowRoot.querySelector(selector);
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
});
