// The Schedules page's raindrop (issue #129; ADR 0005 §14, ADR 0019 choice 9; mock-up
// design-research/screens-r1 schedules-rain-a.png): a cell a rainy-day switch moved to its rain
// plan carries a quiet raindrop before its name in Daily, Group and Activity View and on paper,
// said after the name; its day's pill carries one too. A "Rain plan full" mark draws nothing here.
// Synthetic data only.
import { createElement } from "lwc";
import ShoreshSchedules from "c/shoreshSchedules";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import openSchedule from "@salesforce/apex/SchedulesController.openSchedule";
import { buildTerms } from "c/shoreshTerms";
import { downloadWorkbook } from "c/shoreshDownload";
import { dailyGrid, withRaindrops } from "c/shoreshScheduleViews";
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

const PUBLISHED = {
  id: "s9",
  name: "Published",
  origin: "Manual",
  reason: null,
  savedAt: "2026-10-16T16:00:00.000Z"
};

/**
 * The fixture's week, published after a rainy Tuesday: Bunk 2's Period 1 Swim is there from the
 * switch; Bunk 1's Period 2 Swim is a
 * "Rain plan full" mark, which draws nothing here.
 */
function rainyWeek() {
  const view = opened();
  view.schedule = PUBLISHED;
  view.days[1] = {
    ...view.days[1],
    rain: ["g1|t2|a1", "g2|t1|a1|switched"]
  };
  return view;
}

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render() {
  getVersions.mockResolvedValue([PUBLISHED]);
  openSchedule.mockResolvedValue(rainyWeek());
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

/** A drawn grid's cells that carry a raindrop, as [their text, what a screen reader hears]. */
function drops(grid) {
  return [...grid.shadowRoot.querySelectorAll('[data-id="rain-drop"]')].map(
    (drop) => {
      const cell = drop.closest("[data-cell]");
      return [cell.dataset.cell, cell.textContent.replace(/\s+/g, " ").trim()];
    }
  );
}

describe("c-shoresh-schedules: a rainy day's raindrop", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("marks the rainy day's pill, named for screen readers", async () => {
    const element = await render();
    const pills = qa(element, '[data-id="day-pills"] button');
    expect(
      pills.map((b) => [
        b.getAttribute("aria-label"),
        !!b.querySelector('[data-id="rain-drop"]')
      ])
    ).toEqual([
      ["Monday, Jun 29", false],
      ["Tuesday, Jun 30, rainy day", true],
      ["Wednesday, Jul 1", false]
    ]);
    await expect(element).toBeAccessible();
  });

  it("draws the raindrop before a switched cell's name in Daily View, said after it", async () => {
    const element = await render();
    expect(drops(q(element, '[data-id="daily-grid"]'))).toEqual([]);
    qa(element, '[data-id="day-pills"] button')[1].click();
    await flush();
    const daily = q(element, '[data-id="daily-grid"]');
    // Bunk 2's Period 1 only: Bunk 1's full Swim has no drop.
    expect(drops(daily)).toEqual([["1-0", "Swim, rain plan"]]);
    const cell = daily.shadowRoot.querySelector('[data-cell="1-0"]');
    expect(cell.getAttribute("title")).toBe("Swim: rain plan");
    expect(
      daily.shadowRoot.querySelector('[data-cell="0-1"]').getAttribute("title")
    ).toBe("Swim");
    await expect(element).toBeAccessible();
  });

  it("draws it in Group View on the bunk's rainy day", async () => {
    const element = await render();
    q(element, '[data-view="group"]').click();
    await flush();
    const picker = q(element, '[data-id="group-picker"]');
    expect(drops(q(element, '[data-id="group-grid"]'))).toEqual([]);
    picker.dispatchEvent(
      new CustomEvent("change", { detail: { value: picker.options[1].value } })
    );
    await flush();
    expect(drops(q(element, '[data-id="group-grid"]'))).toEqual([
      ["1-0", "Swim, rain plan"]
    ]);
    await expect(element).toBeAccessible();
  });

  it("draws it in Activity View before the bunk the switch put there", async () => {
    const element = await render();
    q(element, '[data-view="activity"]').click();
    await flush();
    q(element, '[data-id="activity-cards"] button').click();
    await flush();
    const grid = q(element, '[data-id="activity-grid"]');
    expect(drops(grid)).toEqual([["1-0", "Bunk 2, rain plan"]]);
    expect(
      grid.shadowRoot.querySelector('[data-cell="1-0"]').getAttribute("title")
    ).toBe("Bunk 2 (rain plan)");
    await expect(element).toBeAccessible();
  });

  it("prints it as the screen shows it; Excel has the names alone, as the desktop's workbook", async () => {
    const element = await render();
    window.print = jest.fn();
    q(element, '[data-id="print"]').click();
    await flush();
    const printout = q(element, "c-shoresh-schedule-print");
    const tuesday = printout.pages[1].table;
    const parts = tuesday.rows
      .flatMap((row) => row.cells)
      .flatMap((cell) => cell.parts)
      .filter((part) => part.rain);
    expect(parts).toEqual([{ key: "0", text: "Swim", rain: true }]);
    expect(
      printout.shadowRoot.querySelectorAll('[data-id="print-rain-drop"]')
    ).toHaveLength(1);
    window.dispatchEvent(new CustomEvent("afterprint"));
    await flush();

    q(element, '[data-id="export"]').click();
    await flush();
    const sheets = downloadWorkbook.mock.calls[0][1];
    expect(JSON.stringify(sheets)).not.toContain("rain");
  });

  it("is drawn only on a view marked for it: Manual Build shows a switch as it happens", () => {
    const view = rainyWeek();
    const t = buildTerms(LABELS);
    expect(dailyGrid(view, 1, t).cells.some((c) => c.rain)).toBe(false);
    expect(
      dailyGrid(withRaindrops(view), 1, t)
        .cells.filter((c) => c.rain)
        .map((c) => c.key)
    ).toEqual(["1-0"]);
  });
});
