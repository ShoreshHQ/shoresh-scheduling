import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import saveRainyVersion from "@salesforce/apex/RainyDayController.keepManualWeek";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { editorRoot, find } from "shoresh-jest/week-editor";
import {
  ACTIVITIES,
  draft
} from "../../shoreshWeekEditor/__tests__/data/draftFixture";

// Rainy day on Manual Build (repo docs/adr/0018; desktop ScheduleScreen.jsx "Rainy day…",
// rainyDay.js): Edit > Rainy day… > a day keeps the week as "Before rainy Monday", then switches
// that day's outdoor activities to their rain plans as one Undo step, says what it did with Undo,
// and marks a cell whose rain plan had no room. Synthetic camp: draftFixture (Bunk 1, Bunk 2;
// Period 1, Period 2, Lunch), where Soccer is outdoors with Gym games as its rain plan and the
// Gym fits one bunk.

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
jest.mock("@salesforce/apex/RainyDayController.keepManualWeek", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SchedulesController.getVersions", () => apex(), {
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
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };
const GYM = { kind: "A", id: "a4", name: "Gym games", gone: false };
const MONDAY = "2026-06-29";
const RECORDS = nsRecord({
  activities: [
    {
      Id: "a3",
      Name: "Soccer",
      Outdoor__c: true,
      RainPlan__c: "a4",
      NoGroupLimit__c: true
    },
    { Id: "a4", Name: "Gym games", Location__c: "l1", NoGroupLimit__c: true }
  ],
  locations: [{ Id: "l1", Name: "Gym", GroupsThatFit__c: 1 }]
});

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

/** The draft with Monday's rows (items Flagpole, Soccer, Gym games) and the season's records. */
function week(mondayRows, mondayMarks = []) {
  const start = draft([FLAGPOLE, SOCCER, GYM], mondayRows);
  start.schedule.days[0] = {
    ...start.schedule.days[0],
    rainFull: mondayMarks
  };
  return {
    ...start,
    activities: [
      ...ACTIVITIES,
      {
        id: "a4",
        name: "Gym games",
        length: 1,
        notFor: [],
        minPerWeek: 0,
        maxPerWeek: null
      }
    ],
    activityRecords: RECORDS.activities,
    locationRecords: RECORDS.locations,
    groupRecords: [],
    fixedActivityRecords: [],
    recurringActivityRecords: [],
    otherPrograms: []
  };
}

/** The server's week after a save: Monday's rows and marks as given. */
function answer(mondayRows, mondayMarks = []) {
  const shown = week(mondayRows, mondayMarks);
  return { conflicts: [], schedule: shown.schedule };
}

async function render(start) {
  getDraft.mockResolvedValue(start);
  getVersions.mockResolvedValue([]);
  saveRainyVersion.mockResolvedValue("v1");
  saveSlots.mockImplementation(() =>
    Promise.resolve({ conflicts: [], schedule: start.schedule })
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
/** Edit > Rainy day… > the day. */
async function rainy(element, date = MONDAY) {
  q(element, '[data-id="rainy-day"]').click();
  await flush();
  q(element, `[data-id="rainy-day-${date}"]`).click();
  await flush();
}
const toolNotice = (element) => {
  const line = q(element, '[data-id="tool-notice"]');
  return line
    ? [...line.children].map((child) => child.textContent.trim()).join(" ")
    : null;
};
const notice = (element) => {
  const line = editorRoot(element).querySelector('[data-id="notice"]');
  return line ? line.textContent.trim() : null;
};
const sent = (call) => saveSlots.mock.calls[call][0].edits[0];
const dots = (element) =>
  [
    ...q(element, '[data-id="edit-grid"]').shadowRoot.querySelectorAll(
      "c-shoresh-dot"
    )
  ].map((dot) => dot.label);

describe("c-shoresh-manual-build: rainy day", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("is in Edit with the week's days under it, and not in Activity View", async () => {
    const element = await render(week(["1,2,", "1,2,"]));
    q(element, '[data-id="rainy-day"]').click();
    await flush();
    expect(q(element, '[data-id="rainy-day"]').textContent.trim()).toBe(
      "Rainy day…"
    );
    expect(q(element, `[data-id="rainy-day-${MONDAY}"]`).textContent).toBe(
      "Monday"
    );
    expect(q(element, '[data-id="rainy-day-2026-06-30"]').textContent).toBe(
      "Tuesday"
    );
    q(element, '[data-view="activity"]').click();
    await flush();
    expect(q(element, '[data-id="rainy-day"]')).toBeNull();
  });

  it("keeps the week as Before rainy Monday first, then switches the day as one edit with its marks", async () => {
    // Both bunks have Soccer in Period 2; the Gym fits one, so Bunk 2's rain plan is full.
    const element = await render(week(["1,2,", "1,2,"]));
    saveSlots.mockResolvedValueOnce(answer(["1,3,", "1,2,"], [`g2|t2|a3`]));
    await rainy(element);
    expect(saveRainyVersion).toHaveBeenCalledWith({
      scheduleId: "d1",
      name: "Before rainy Monday"
    });
    expect(saveRainyVersion.mock.invocationCallOrder[0]).toBeLessThan(
      saveSlots.mock.invocationCallOrder[0]
    );
    // The Versions list is read again, so Before rainy Monday is there.
    expect(getVersions.mock.calls.length).toBeGreaterThan(1);
    expect(sent(0).runs).toEqual([
      expect.objectContaining({
        day: MONDAY,
        groupId: "g1",
        firstBlockId: "t2",
        before: ["A:a3"],
        after: ["A:a4"]
      })
    ]);
    expect(sent(0).rain).toEqual([{ day: MONDAY, cells: ["g2|t2|a3"] }]);
    expect(toolNotice(element)).toBe(
      "Rainy Monday: 1 switched to rain plans, 1 full · Undo"
    );
    // The cell left outdoors carries the mark, in the desktop's words.
    expect(dots(element)).toContain("Rain plan full: choose another");
  });

  it("Undo puts every cell back and takes the marks away, in one step", async () => {
    const element = await render(week(["1,2,", "1,2,"]));
    saveSlots.mockResolvedValueOnce(answer(["1,3,", "1,2,"], ["g2|t2|a3"]));
    await rainy(element);
    saveSlots.mockResolvedValueOnce(answer(["1,2,", "1,2,"], []));
    q(element, '[data-id="tool-undo"]').click();
    await flush();
    expect(sent(1).runs).toEqual([
      expect.objectContaining({
        groupId: "g1",
        before: ["A:a4"],
        after: ["A:a3"]
      })
    ]);
    expect(sent(1).rain).toEqual([{ day: MONDAY, cells: [] }]);
    expect(dots(element)).not.toContain("Rain plan full: choose another");
    expect(toolNotice(element)).toBeNull();
  });

  it("a mark goes once its cell changes", async () => {
    const element = await render(week(["1,3,", "1,2,"], ["g2|t2|a3"]));
    expect(dots(element)).toContain("Rain plan full: choose another");
    // Bunk 2's Soccer taken out by hand: its cell is Open, and the mark is gone with it at once
    // (before the server answers).
    saveSlots.mockReturnValueOnce(new Promise(() => {}));
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
    expect(dots(element)).not.toContain("Rain plan full: choose another");
  });

  it("with nothing outdoors, says so, keeps no version and saves nothing", async () => {
    const element = await render(week(["1,3,", "1,,"]));
    await rainy(element);
    expect(notice(element)).toBe("Rainy Monday: nothing outdoors to switch");
    expect(saveRainyVersion).not.toHaveBeenCalled();
    expect(saveSlots).not.toHaveBeenCalled();
  });

  it("when the version can't be kept, nothing is switched and it says why", async () => {
    const element = await render(week(["1,2,", "1,,"]));
    saveRainyVersion.mockRejectedValueOnce({
      body: { message: "The name is too long." }
    });
    await rainy(element);
    expect(saveSlots).not.toHaveBeenCalled();
    const error = q(element, '[data-id="build-error"]').textContent;
    expect(error).toContain("The rainy day could not be applied.");
    expect(error).toContain("Nothing was changed.");
  });

  it("only full cells: still one step, with the marks and Undo", async () => {
    // Gym games already fills the Gym for Bunk 2, so Bunk 1's Soccer can't switch.
    const element = await render(week(["1,2,", "1,3,"]));
    saveSlots.mockResolvedValueOnce(answer(["1,2,", "1,3,"], ["g1|t2|a3"]));
    await rainy(element);
    expect(sent(0).runs).toEqual([]);
    expect(sent(0).rain).toEqual([{ day: MONDAY, cells: ["g1|t2|a3"] }]);
    expect(toolNotice(element)).toBe("Rainy Monday: 1 full · Undo");
  });
});
