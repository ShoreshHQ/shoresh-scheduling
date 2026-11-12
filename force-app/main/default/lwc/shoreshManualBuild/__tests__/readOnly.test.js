import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { find, findAll } from "shoresh-jest/week-editor";
import { draft } from "../../shoreshWeekEditor/__tests__/data/draftFixture";

// An archived season's week on Manual Build (WEEK-1.10, ADR 0029): shown and looked at, with no
// edit controls (no Edit menu, no tiles to drag, no typing in the grid, no Start, Versions or
// Publish). Synthetic camp: draftFixture.

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/ManualBuildController.getDraft", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ManualBuildController.startBlankWeek",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock("@salesforce/apex/ManualBuildController.saveSlots", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/ManualBuildController.addActivity", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/ManualBuildController.saveVersion", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ManualBuildController.restoreVersion",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.deleteVersion",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.getWeekSources",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.startFromWeek",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ManualBuildController.previewPublish",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock("@salesforce/apex/ManualBuildController.publish", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/ManualBuildController.unpublish", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SchedulesController.getVersions", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SchedulesController.renameSchedule", () => apex(), {
  virtual: true
});

const SETUP = {
  season: { Id: "se1", Name: "Summer 2026" },
  weeks: [
    { Id: "w1", Name: "Week 1" },
    { Id: "w2", Name: "Week 2" }
  ],
  programs: [
    {
      program: { Id: "p1", Name: "Main", Monday__c: true },
      divisions: [
        { division: { Id: "d1", Name: "Juniors" }, groups: [{ Id: "g1" }] }
      ],
      timeBlocks: [{ Id: "t1", Name: "Period 1" }]
    }
  ],
  activities: [{ Id: "a1", Name: "Swim" }],
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

async function render(first, readOnly) {
  getDraft.mockResolvedValue(first);
  getVersions.mockResolvedValue([]);
  const element = createElement("c-shoresh-manual-build", {
    is: ShoreshManualBuild
  });
  element.terms = buildTerms(LABELS);
  element.setup = nsRecord(SETUP);
  element.readOnly = readOnly;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => find(element, selector);
const EDIT_CONTROLS = [
  '[data-id="edit-menu"]',
  '[data-id="publish"]',
  '[data-id="versions"]',
  '[data-id="start-week"]',
  "c-shoresh-build-palette"
];

describe("c-shoresh-manual-build: an archived season (read-only)", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("WEEK-1.10: shows the week with no edit controls: no Edit, tiles, Versions or Publish, and nothing typed or dragged in the grid", async () => {
    const element = await render(draft(), true);
    const grid = q(element, '[data-id="edit-grid"]');
    expect(grid).not.toBeNull();
    expect(grid.editable).toBe(false);
    expect(grid.shadowRoot.querySelectorAll('[draggable="true"]')).toHaveLength(
      0
    );
    EDIT_CONTROLS.forEach((selector) =>
      expect(findAll(element, selector)).toHaveLength(0)
    );
    // The views stay.
    expect(findAll(element, "[data-view]").length).toBeGreaterThan(0);
    await expect(element).toBeAccessible();
  });

  it("WEEK-1.10: a week not started offers no Start", async () => {
    const element = await render(null, true);
    expect(q(element, '[data-id="start-week"]')).toBeNull();
    expect(q(element, '[data-id="still-needed-box"]')).toBeNull();
    element.remove();
    const live = await render(null, false);
    expect(q(live, '[data-id="start-week"]')).not.toBeNull();
  });

  it("WEEK-1.10: the same week in a season not archived has its edit controls", async () => {
    const element = await render(draft(), false);
    expect(q(element, '[data-id="edit-grid"]').editable).toBe(true);
    expect(q(element, '[data-id="edit-menu"]')).not.toBeNull();
    expect(q(element, '[data-id="publish"]')).not.toBeNull();
    expect(q(element, '[data-id="versions"]')).not.toBeNull();
    expect(q(element, "c-shoresh-build-palette")).not.toBeNull();
  });
});
