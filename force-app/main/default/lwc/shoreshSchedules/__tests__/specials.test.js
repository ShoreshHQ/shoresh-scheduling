// The Schedules page with special days and events (ADR 0014 slice 5): a replaced day shows its
// special day's own schedule and line, and an event placed on a day opens its own schedule,
// read-only, with the cursor following there and back. Made-up data.
import { createElement } from "lwc";
import ShoreshSchedules from "c/shoreshSchedules";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import openSchedule from "@salesforce/apex/SchedulesController.openSchedule";
import { buildTerms } from "c/shoreshTerms";
import { downloadWorkbook } from "c/shoreshDownload";
import { nsRecord } from "shoresh-jest/namespace";
import {
  LABELS,
  opened
} from "../../shoreshScheduleViews/__tests__/data/scheduleFixture";

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/SchedulesController.getVersions", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SchedulesController.openSchedule", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SchedulesController.renameSchedule", () => apex(), {
  virtual: true
});
jest.mock("c/shoreshDownload", () => ({
  ...jest.requireActual("c/shoreshDownload"),
  downloadWorkbook: jest.fn(() => Promise.resolve())
}));

const SETUP = {
  season: { Id: "se1", Name: "Summer 2026" },
  weeks: [{ Id: "w1", Name: "Week 1" }],
  programs: [{ program: { Id: "p1", Name: "Main" } }],
  activities: [{ Id: "a1", Name: "Swim", Location__c: "l1" }],
  locations: [{ Id: "l1", Name: "Pool" }]
};
const VERSIONS = [
  {
    id: "s1",
    name: "Published Oct 18, 2:40 PM",
    origin: "Manual",
    reason: null,
    savedAt: "2026-10-18T14:40:00.000Z"
  }
];
const CARNIVAL = { kind: "S", id: "evt1", name: "Carnival", gone: false };
const CARNIVAL_PLAN = {
  dateValue: null,
  problem: null,
  blocks: [{ id: "b1", name: "Relays", startTime: "09:00", endTime: "10:00" }],
  groups: [
    { id: "s1", name: "Blue", gone: false },
    { id: "s2", name: "Gold", gone: false }
  ],
  items: [{ kind: "A", id: "a1", name: "Swim", gone: false }],
  rows: ["1", ""]
};

/** The fixture's week, Carnival placed on Monday and Tuesday replaced by Field Day. */
function withSpecials({ plan } = {}) {
  const view = opened();
  const monday = view.days[0];
  monday.items = [...monday.items, CARNIVAL];
  monday.rows = ["1,^,5", "3,4,2"];
  return {
    ...view,
    schedule: { ...view.schedule, ...VERSIONS[0] },
    specials: {
      asPublished: true,
      days: [
        {
          dateValue: "2026-06-30",
          day: "Tuesday",
          specialDayId: "sd1",
          name: "Field Day",
          notes: "Wear blue",
          plan:
            plan === undefined
              ? {
                  dateValue: "2026-06-30",
                  problem: null,
                  blocks: [
                    {
                      id: "b1",
                      name: "Relays",
                      startTime: "09:00",
                      endTime: "10:30"
                    }
                  ],
                  groups: monday.groups,
                  items: [{ kind: "A", id: "a1", name: "Swim", gone: false }],
                  rows: ["1", "1"]
                }
              : plan
        }
      ],
      events: [{ eventId: "evt1", name: "Carnival", plan: CARNIVAL_PLAN }]
    }
  };
}

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(view = withSpecials()) {
  getVersions.mockResolvedValue(VERSIONS);
  openSchedule.mockResolvedValue(view);
  const element = createElement("c-shoresh-schedules", {
    is: ShoreshSchedules
  });
  element.terms = buildTerms(LABELS);
  element.setup = nsRecord(SETUP);
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const pills = (element) => qa(element, '[data-id="day-pills"] button');

describe("c-shoresh-schedules: special days and events", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  // SPECIAL-6.1
  it("shows a replaced day as its special day: its pill, its own time blocks, its line", async () => {
    const element = await render();
    // "Tue" with the special day's flag, named in full.
    expect(
      pills(element).map((b) => [
        b.textContent.trim(),
        b.getAttribute("aria-label"),
        !!b.querySelector('[data-id="special-flag"]')
      ])
    ).toEqual([
      ["Mon", "Monday, Jun 29", false],
      ["Tue", "Tuesday, Jun 30, Field Day", true],
      ["Wed", "Wednesday, Jul 1", false]
    ]);
    expect(q(element, '[data-id="special-line"]')).toBeNull();
    pills(element)[1].click();
    await flush();
    const grid = q(element, '[data-id="daily-grid"]');
    expect(grid.grid.rows.map((r) => r.name)).toEqual(["Relays"]);
    expect(grid.label).toBe("Tuesday · Field Day");
    const line = q(element, '[data-id="special-line"]');
    expect(line.textContent).toContain("Field Day");
    expect(line.textContent).toContain("Special day");
    expect(q(element, '[data-id="special-notes"]').textContent.trim()).toBe(
      "Wear blue"
    );
    // A replaced day's own cells are out of sight: no events to open there.
    expect(q(element, '[data-id="day-events"]')).toBeNull();
    await expect(element).toBeAccessible();
  });

  it("says when a special day has no schedule yet, in its grid's place", async () => {
    const element = await render(withSpecials({ plan: null }));
    pills(element)[1].click();
    await flush();
    expect(q(element, '[data-id="daily-grid"]')).toBeNull();
    expect(q(element, '[data-id="no-special-schedule"]').title).toBe(
      "Field Day has no schedule yet."
    );
    expect(q(element, '[data-id="special-line"]')).not.toBeNull();
  });

  it("opens an event's own schedule from its day, read-only, the cursor going there and back", async () => {
    const element = await render();
    const events = q(element, '[data-id="day-events"]');
    expect(events.textContent).toContain("Carnival");
    expect(events.textContent).toContain("Special event");
    const open = q(element, '[data-event="evt1"]');
    expect(open.textContent.trim()).toBe("Open Carnival");
    open.click();
    await flush();
    const grid = q(element, '[data-id="event-grid"]');
    expect(grid.grid.columns.map((c) => c.label)).toEqual(["Blue", "Gold"]);
    expect(grid.editable).toBe(false);
    expect(grid.label).toBe("Carnival");
    expect(q(element, '[data-id="day-pills"]')).toBeNull();
    const back = q(element, '[data-id="event-back"]');
    expect(back.textContent.trim()).toBe("← Monday");
    expect(element.shadowRoot.activeElement).toBe(back);
    await expect(element).toBeAccessible();
    back.click();
    await flush();
    expect(q(element, '[data-id="daily-grid"]')).not.toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-event="evt1"]')
    );
  });

  it("lays a replaced day on its own time blocks in Group View", async () => {
    const element = await render();
    q(element, '[data-view="group"]').click();
    await flush();
    const grid = q(element, '[data-id="group-grid"]');
    expect(grid.grid.columns.map((c) => c.label)).toEqual([
      "Monday",
      "Tuesday · Field Day",
      "Wednesday"
    ]);
    expect(grid.grid.rows.map((r) => r.name)).toEqual([
      "Period 1",
      "Relays",
      "Period 2",
      "Lunch"
    ]);
  });

  // SPECIAL-6.1
  it("takes the special day and the event's schedule into the Excel file and the printout", async () => {
    const element = await render();
    q(element, '[data-id="export"]').click();
    await flush();
    const sheets = downloadWorkbook.mock.calls[0][1];
    expect(sheets.map((s) => s.name)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Carnival",
      "All Bunks",
      "All Activities"
    ]);
    window.print = jest.fn();
    q(element, '[data-id="print"]').click();
    await flush();
    const print = q(element, "c-shoresh-schedule-print");
    expect(print.pages.map((p) => p.title)).toEqual([
      "Monday, Jun 29",
      "Tuesday, Jun 30 · Field Day",
      "Wednesday, Jul 1",
      "Carnival (Special event)"
    ]);
  });
});
