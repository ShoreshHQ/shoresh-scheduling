/**
 * Rainy day on the Generated Schedule screen (repo docs/adr/0019; desktop: "Rainy day…" on either
 * schedule): Edit has it, the week is kept through this screen's own controller as "Before rainy
 * Monday", and the switch saves through this screen's saver like any hand edit. The editor's own
 * tests cover the rest. Synthetic data only: SMALL, where Soccer is outdoors with Art as its rain
 * plan.
 */
import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import { find } from "shoresh-jest/week-editor";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveSlots from "@salesforce/apex/GeneratedScheduleController.saveSlots";
import saveRainyVersion from "@salesforce/apex/RainyDayController.keepGeneratedWeek";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { PROGRAM, SCHEDULE, SMALL, WEEK, camp } from "./data/camp";

const apex = () => ({ default: jest.fn() });
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.getInputs",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveSlots",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/RainyDayController.keepGeneratedWeek",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/SchedulesController.getVersions", () => apex(), {
  virtual: true
});

const SETUP = nsRecord({
  season: { Id: "a0Z000000000001AAA", Name: "Summer 2026" },
  weeks: [{ Id: WEEK, Name: "Week 1" }],
  programs: [
    {
      program: { Id: PROGRAM, Name: "Main", Monday__c: true },
      divisions: [],
      timeBlocks: []
    }
  ],
  activities: [],
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

/** SMALL with Soccer outdoors (Art its rain plan) in Bunk 1's Monday Period 1. */
function rainyWeek() {
  const inputs = camp({ ...SMALL, scheduleId: SCHEDULE });
  const [, art, soccer] = inputs.activities;
  const outdoors = nsRecord({ Outdoor__c: true, RainPlan__c: art.Id });
  inputs.activities = inputs.activities.map((r) => {
    return r.Id === soccer.Id ? { ...r, ...outdoors } : r;
  });
  const item = { kind: "A", id: soccer.Id, name: "Soccer", gone: false };
  inputs.days = inputs.days.map((day, d) => ({
    ...day,
    items: [...day.items, item],
    rows: d === 0 ? ["1,2,,", "1,,,"] : day.rows
  }));
  return { inputs, art, soccer };
}

const q = (element, selector) => find(element, selector);

describe("c-shoresh-generated-schedule: rainy day", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.resetAllMocks();
  });

  it("keeps the Generated week as Before rainy Monday, then saves the switch as a hand edit", async () => {
    const { inputs, art, soccer } = rainyWeek();
    getInputs.mockResolvedValue(inputs);
    getVersions.mockResolvedValue([]);
    saveRainyVersion.mockResolvedValue("v1");
    saveSlots.mockReturnValue(new Promise(() => {}));
    const element = createElement("c-shoresh-generated-schedule", {
      is: ShoreshGeneratedSchedule
    });
    element.terms = terms;
    element.setup = SETUP;
    document.body.appendChild(element);
    await flush();
    q(element, '[data-id="rainy-day"]').click();
    await flush();
    q(element, '[data-id="rainy-day-2026-06-29"]').click();
    await flush();
    expect(saveRainyVersion).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      name: "Before rainy Monday"
    });
    const request = saveSlots.mock.calls[0][0].request;
    expect(request.scheduleId).toBe(SCHEDULE);
    expect(request.edits[0].runs).toEqual([
      expect.objectContaining({
        day: "2026-06-29",
        before: [`A:${soccer.Id}`],
        after: [`A:${art.Id}`]
      })
    ]);
  });
});
