/**
 * An archived season's week on Generated Schedule (WEEK-1.10, ADR 0029): shown and looked at,
 * with no edit controls (no Generate, Build or Edit menu, no tiles, no typing or dragging in the
 * grid, no Versions or Publish). Synthetic data only.
 */
import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import { find, findAll } from "shoresh-jest/week-editor";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { PROGRAM, SCHEDULE, SMALL, WEEK, camp } from "./data/camp";

const apex = () => ({ default: jest.fn() });
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.getInputs",
  () => apex(),
  { virtual: true }
);

const SETUP = nsRecord({
  season: { Id: "a0Z000000000001AAA", Name: "Summer 2025" },
  weeks: [{ Id: WEEK, Name: "Week 1" }],
  programs: [
    {
      program: { Id: PROGRAM, Name: "Main", Monday__c: true },
      divisions: [
        {
          division: { Id: "a0D000000000001AAA", Name: "Juniors" },
          groups: [{ Id: "a0G000000000001AAA" }]
        }
      ],
      timeBlocks: [{ Id: "a0B000000000001AAA", Name: "Period 1" }]
    }
  ],
  activities: [{ Id: "a0A000000000001AAA", Name: "Swim" }],
  locations: []
});
const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
]);

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

/** A generated week of SMALL with Swim in Bunk 1's Period 1 both days. */
function builtWeek() {
  const inputs = camp({ ...SMALL, scheduleId: SCHEDULE });
  const swim = {
    kind: "A",
    id: inputs.activities[0].Id,
    name: "Swim",
    gone: false
  };
  inputs.days = inputs.days.map((day) => ({
    ...day,
    items: [...day.items, swim],
    rows: ["1,2,,", "1,,,"]
  }));
  return inputs;
}

async function render(inputs, readOnly) {
  getInputs.mockResolvedValue(inputs);
  const element = createElement("c-shoresh-generated-schedule", {
    is: ShoreshGeneratedSchedule
  });
  element.terms = terms;
  element.setup = SETUP;
  element.readOnly = readOnly;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => find(element, selector);
const EDIT_CONTROLS = [
  '[data-id="edit-menu"]',
  '[data-id="build-menu"]',
  '[data-id="publish"]',
  '[data-id="versions"]',
  '[data-id="generate"]',
  "c-shoresh-build-palette"
];

describe("c-shoresh-generated-schedule: an archived season (read-only)", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("WEEK-1.10: shows the built week with no edit controls: no Edit, Build, tiles, Versions or Publish, and nothing typed or dragged in the grid", async () => {
    const element = await render(builtWeek(), true);
    const grid = q(element, '[data-id="edit-grid"]');
    expect(grid).not.toBeNull();
    expect(grid.editable).toBe(false);
    expect(grid.shadowRoot.querySelectorAll('[draggable="true"]')).toHaveLength(
      0
    );
    EDIT_CONTROLS.forEach((selector) =>
      expect(findAll(element, selector)).toHaveLength(0)
    );
    // The views and the counter stay.
    expect(findAll(element, "[data-view]").length).toBeGreaterThan(0);
    expect(q(element, '[data-id="counter"]')).not.toBeNull();
    await expect(element).toBeAccessible();
  });

  it("WEEK-1.10: a week never generated offers no Generate", async () => {
    const element = await render(camp({ ...SMALL, scheduleId: null }), true);
    expect(q(element, '[data-id="generate"]')).toBeNull();
    expect(q(element, '[data-id="start"]')).toBeNull();
    element.remove();
    const live = await render(camp({ ...SMALL, scheduleId: null }), false);
    expect(q(live, '[data-id="generate"]')).not.toBeNull();
  });

  it("WEEK-1.10: the same week in a season not archived has its edit controls", async () => {
    const element = await render(builtWeek(), false);
    expect(q(element, '[data-id="edit-grid"]').editable).toBe(true);
    expect(q(element, '[data-id="edit-menu"]')).not.toBeNull();
    expect(q(element, '[data-id="build-menu"]')).not.toBeNull();
    expect(q(element, '[data-id="publish"]')).not.toBeNull();
    expect(q(element, '[data-id="versions"]')).not.toBeNull();
  });
});
