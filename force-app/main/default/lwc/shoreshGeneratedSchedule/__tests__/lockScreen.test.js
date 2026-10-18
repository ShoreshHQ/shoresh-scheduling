/**
 * Locks on the Generated Schedule screen (ADR 0010 decision 3, G4): the lock icon, the Lock menu
 * (a cell, the day, the bunk, the bunk's day), builds that keep locks, and the confirms' words.
 * Synthetic data only.
 */
import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import setLocksOnServer from "@salesforce/apex/GeneratedScheduleController.setLocks";
import { buildTerms } from "c/shoreshTerms";
import { PROGRAM, SCHEDULE, SMALL, WEEK, camp } from "./data/camp";

const apex = () => ({ default: jest.fn() });
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.getInputs",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveWeek",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.setLocks",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveSlots",
  () => apex(),
  { virtual: true }
);

const SETUP = {
  season: { Id: "a0Z000000000001AAA", Name: "Summer 2026" },
  weeks: [{ Id: WEEK, Name: "Week 1" }],
  programs: [{ program: { Id: PROGRAM, Name: "Main" } }],
  activities: [],
  locations: []
};
const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
]);

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

/** A saved week: Bunk 1 swims in Period 1 on both days, the rest Open (SMALL's frame). */
function savedWeek(locks = []) {
  const inputs = camp({ ...SMALL, scheduleId: SCHEDULE });
  const swim = {
    kind: "A",
    id: inputs.activities[0].Id,
    name: "Swim",
    gone: false
  };
  inputs.days = inputs.days.map((day, d) => ({
    ...day,
    items: [...day.items, swim],
    rows: ["1,2,,", "1,,,"],
    locks: locks[d] || undefined
  }));
  return inputs;
}

async function render(inputs) {
  getInputs.mockResolvedValue(inputs);
  const element = createElement("c-shoresh-generated-schedule", {
    is: ShoreshGeneratedSchedule
  });
  element.terms = terms;
  element.setup = SETUP;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const grid = (element) => q(element, '[data-id="grid"]');
const cellAt = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);
const menu = (element) => q(element, '[data-id="lock-menu"]');
const menuLabels = (element) =>
  [...element.shadowRoot.querySelectorAll("lightning-menu-item")].map(
    (i) => i.label
  );
const filled = (element) =>
  q(element, "c-shoresh-week-checks").shadowRoot.querySelector(
    '[data-id="filled"]'
  ).textContent;

/** Gives the page turns until done() says yes (a build runs in pieces). */
async function until(done, tries = 200) {
  await flush();
  if (done() || !tries) {
    return;
  }
  await until(done, tries - 1);
}

async function focusCell(element, key) {
  cellAt(element, key).dispatchEvent(
    new CustomEvent("focusin", { bubbles: true, composed: true })
  );
  await flush();
}
async function choose(element, label) {
  const item = [
    ...element.shadowRoot.querySelectorAll("lightning-menu-item")
  ].find((i) => i.label === label);
  menu(element).dispatchEvent(
    new CustomEvent("select", { detail: { value: item.value } })
  );
  await flush();
}

describe("locks on the Generated Schedule screen", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.resetAllMocks();
  });

  it("shows the lock icon on a locked cell, every block of a placement, and nowhere else", async () => {
    // Monday: Bunk 1's Swim (Period 1) locked.
    const element = await render(savedWeek([[",1,,", ",,,"]]));
    const swim = cellAt(element, "0-1");
    expect(swim.querySelector(".cell-name").textContent).toBe("Swim");
    const icon = swim.querySelector(".cell-lock lightning-icon");
    expect(icon.iconName).toBe("utility:lock");
    expect(icon.alternativeText).toBe("Locked");
    expect(cellAt(element, "0-2").querySelector(".cell-lock")).toBeNull();
    expect(cellAt(element, "1-1").querySelector(".cell-lock")).toBeNull();
  });

  it("a cell locked empty is kept empty: not Open, not counted to fill", async () => {
    // Monday: Bunk 1's Period 2 Open and locked.
    const element = await render(savedWeek([[",,1,", ",,,"]]));
    expect(cellAt(element, "0-2").querySelector(".cell-lock")).not.toBeNull();
    // Bunk 1: 3 periods a day, Bunk 2: 2 mornings; Swim twice: 2 of 9 (10 less the locked one).
    expect(filled(element)).toContain("2 of 9");
    const openCount = q(
      element,
      "c-shoresh-week-checks"
    ).shadowRoot.querySelector('[data-counter="open"] .count').textContent;
    expect(openCount).toBe("7");
  });

  it("the Lock menu offers the day shown, then the cell focus reached, its bunk's day too", async () => {
    const element = await render(savedWeek());
    expect(menu(element).iconName).toBe("utility:lock");
    expect(menu(element).label).toBe("Lock");
    expect(menuLabels(element)).toEqual(["Lock Monday"]);
    await focusCell(element, "0-1");
    expect(menuLabels(element)).toEqual([
      "Lock Bunk 1 · Monday · Period 1",
      "Lock Monday",
      "Lock Bunk 1 · Monday"
    ]);
    // Another day: the cell reached was Monday's, so it isn't offered there.
    q(element, '[data-index="1"]').click();
    await flush();
    expect(menuLabels(element)).toEqual(["Lock Tuesday"]);
    // Group View: the bunk instead of the day.
    q(element, '[data-view="group"]').click();
    await flush();
    expect(menuLabels(element)).toContain("Lock Bunk 1");
    expect(menuLabels(element)).not.toContain("Lock Monday");
  });

  it("Lock saves through the data module, then shows the week as saved and says so", async () => {
    const element = await render(savedWeek());
    await focusCell(element, "0-1");
    const after = savedWeek([[",1,,", ",,,"]]);
    setLocksOnServer.mockResolvedValue({
      conflict: false,
      revision: "2026-06-29:2|2026-06-30:1",
      schedule: { days: after.days }
    });
    await choose(element, "Lock Bunk 1 · Monday · Period 1");
    expect(setLocksOnServer).toHaveBeenCalledWith({
      scheduleId: SCHEDULE,
      changes: [
        {
          action: "Lock",
          dateValue: "2026-06-29",
          groupId: after.groups[0].Id,
          blockId: after.timeBlocks[1].Id
        }
      ],
      revision: "2026-06-29:1"
    });
    expect(cellAt(element, "0-1").querySelector(".cell-lock")).not.toBeNull();
    expect(q(element, '[data-id="announce"]').textContent).toContain(
      "Locked Bunk 1 · Monday · Period 1."
    );
    // Now the menu offers Unlock for it.
    expect(menuLabels(element)).toContain("Unlock Bunk 1 · Monday · Period 1");

    // The next build keeps the lock: the engine gets it, and the save names the new revision.
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:3|2026-06-30:2",
      locks: [
        {
          dateValue: "2026-06-29",
          groupId: after.groups[0].Id,
          blockId: after.timeBlocks[1].Id
        }
      ]
    });
    q(element, '[data-action="TryAnother"]').click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    const request = saveWeekOnServer.mock.calls[0][0].request;
    expect(request.revision).toBe("2026-06-29:2|2026-06-30:1");
    // Bunk 1's locked Swim is where it was.
    expect(request.days[0].rows[0].split(",")[1]).not.toBe("");
    await flush();
    expect(cellAt(element, "0-1").querySelector(".cell-lock")).not.toBeNull();
  });

  it("someone else saved first: the conflict box, focus on Reload, nothing changed", async () => {
    const element = await render(savedWeek());
    setLocksOnServer.mockResolvedValue({
      conflict: true,
      message:
        "Someone else changed this schedule since you opened it. Open it again to see their changes, then make yours."
    });
    await choose(element, "Lock Monday");
    expect(q(element, '[data-id="conflict"] p').textContent).toBe(
      "Someone else changed this schedule since you opened it."
    );
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="reload"]')
    );
    expect(cellAt(element, "0-1").querySelector(".cell-lock")).toBeNull();
  });

  it("a refused change says why", async () => {
    const element = await render(savedWeek());
    setLocksOnServer.mockRejectedValue({
      body: { message: "A saved version can't be changed." }
    });
    await choose(element, "Lock Monday");
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "A saved version can't be changed."
    );
  });

  it("the confirms speak of locks only when there are some", async () => {
    const element = await render(savedWeek([[",1,,", ",,,"]]));
    q(element, '[data-action="Rebuild"]').click();
    await flush();
    expect(q(element, '[data-id="confirm-body"]').textContent).toBe(
      "Builds Week 1 again from your setup. Locked cells stay as they are."
    );
    q(element, '[data-id="confirm-cancel"]').click();
    await flush();
    q(element, '[data-action="StartOver"]').click();
    await flush();
    expect(q(element, '[data-id="confirm-body"]').textContent).toBe(
      "Clears the 2 activity cells in Week 1, locked ones too. Fixed activities and recurring activities stay."
    );
  });

  it("Start over builds with no locks and shows none after", async () => {
    const element = await render(savedWeek([[",1,,", ",,,"]]));
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:2|2026-06-30:2",
      locks: []
    });
    q(element, '[data-action="StartOver"]').click();
    await flush();
    q(element, '[data-id="confirm-go"]').click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    await flush();
    expect(saveWeekOnServer.mock.calls[0][0].request.action).toBe("StartOver");
    expect(cellAt(element, "0-1").querySelector(".cell-lock")).toBeNull();
  });
});
