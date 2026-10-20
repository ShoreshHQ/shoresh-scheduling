/**
 * Locks on the Generated Schedule screen (ADR 0010 decision 3, G4): the lock icon, the Lock menu
 * (a cell, the day, the bunk, the bunk's day), builds that keep locks, and the confirms' words.
 * Synthetic data only.
 */
import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import { find } from "shoresh-jest/week-editor";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import setLocksOnServer from "@salesforce/apex/GeneratedScheduleController.setLocks";
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

const SETUP = nsRecord({
  season: { Id: "a0Z000000000001AAA", Name: "Summer 2026" },
  weeks: [{ Id: WEEK, Name: "Week 1" }],
  // Everything building needs (desktop readiness.js), so Generate is offered.
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

const q = (element, selector) => find(element, selector);
const grid = (element) => q(element, '[data-id="edit-grid"]');
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
    // Not Open: Fill the open cells passes it over (its dot says nothing about a gap either).
    expect(cellAt(element, "0-2").querySelector("c-shoresh-dot")).toBeNull();
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
      "Locked Bunk 1, Monday, Period 1."
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
    const monday = request.days[0];
    const token = monday.rows[0].split(",")[1];
    expect(monday.items[Number(token) - 1].name).toBe("Swim");
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

  it("Rebuild's confirm speaks of locks only when there are some; Start over asks nothing", async () => {
    const element = await render(savedWeek([[",1,,", ",,,"]]));
    q(element, '[data-action="Rebuild"]').click();
    await flush();
    expect(q(element, '[data-id="confirm-body"]').textContent).toBe(
      "Builds Week 1 again from your setup. Locked cells stay as they are."
    );
    q(element, '[data-id="confirm-cancel"]').click();
    await flush();
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:2|2026-06-30:2",
      locks: []
    });
    q(element, '[data-action="StartOver"]').click();
    await flush();
    expect(q(element, '[data-id="confirm"]')).toBeNull();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
  });

  it("Start over: the server clears the locks, and none show after", async () => {
    const element = await render(savedWeek([[",1,,", ",,,"]]));
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:2|2026-06-30:2",
      locks: []
    });
    q(element, '[data-action="StartOver"]').click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    await flush();
    expect(saveWeekOnServer.mock.calls[0][0].request.action).toBe("StartOver");
    expect(cellAt(element, "0-1").querySelector(".cell-lock")).toBeNull();
  });

  it("lock a cell, Start over, then fill: the cleared lock no longer keeps the cell empty", async () => {
    // Monday, Bunk 1, Period 3 is Open and locked: a build would leave it empty.
    const element = await render(savedWeek([[",,1,", ",,,"]]));
    saveWeekOnServer.mockResolvedValueOnce({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:2|2026-06-30:2",
      locks: []
    });
    q(element, '[data-action="StartOver"]').click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    await flush();
    saveWeekOnServer.mockResolvedValueOnce({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:3|2026-06-30:3",
      locks: []
    });
    q(element, '[data-action="FillOpen"]').click();
    await until(() => saveWeekOnServer.mock.calls.length > 1);
    const sent = saveWeekOnServer.mock.calls[1][0].request;
    expect(sent.action).toBe("FillOpen");
    // The cell the lock held empty is filled now (the server cleared the lock).
    expect(sent.days[0].rows[0].split(",")[2]).not.toBe("");
  });

  it("after a Lock is saved, focus is back on the Lock menu", async () => {
    const element = await render(savedWeek());
    const after = savedWeek([[",1,,", ",,,"]]);
    setLocksOnServer.mockResolvedValue({
      conflict: false,
      revision: "2026-06-29:2|2026-06-30:1",
      schedule: { days: after.days }
    });
    // The test's stand-in for Salesforce's menu can't hold focus: see that it is asked to.
    const focus = jest.fn();
    menu(element).focus = focus;
    await choose(element, "Lock Monday");
    await flush();
    expect(focus).toHaveBeenCalled();
  });

  it("another week chosen while a Lock saves: the screen isn't left waiting", async () => {
    const element = await render(savedWeek());
    let answer;
    setLocksOnServer.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    await choose(element, "Lock Monday");
    // The pickers wait while it saves...
    expect(q(element, '[data-id="week"]').disabled).toBe(true);
    // ...but setup read again without this week moves on (as if the week was deleted).
    getInputs.mockResolvedValue(savedWeek());
    element.setup = {
      ...SETUP,
      weeks: [{ Id: "a0K000000000002AAA", Name: "Week 2" }]
    };
    await flush();
    answer({ conflict: false, revision: "x", schedule: { days: [] } });
    await flush();
    expect(q(element, '[data-action="Rebuild"]').disabled).toBe(false);
    expect(menu(element).disabled).toBe(false);
  });

  it("a cell reached in one week isn't offered in the next", async () => {
    const element = await render(savedWeek());
    await focusCell(element, "0-1");
    expect(menuLabels(element)).toContain("Lock Bunk 1 · Monday · Period 1");
    getInputs.mockResolvedValue(savedWeek());
    element.setup = {
      ...SETUP,
      weeks: [{ Id: "a0K000000000002AAA", Name: "Week 2" }]
    };
    await flush();
    expect(menuLabels(element)).toEqual(["Lock Monday"]);
  });

  it("Start over with only locks on Open cells clears them too", async () => {
    // Nothing placed but Flagpole; Bunk 1's Period 2 locked empty.
    const inputs = camp({ ...SMALL, scheduleId: SCHEDULE });
    inputs.days[0] = { ...inputs.days[0], locks: [",,1,", ",,,"] };
    const element = await render(inputs);
    saveWeekOnServer.mockResolvedValue({
      conflict: false,
      scheduleId: SCHEDULE,
      revision: "2026-06-29:2|2026-06-30:2",
      locks: []
    });
    q(element, '[data-action="StartOver"]').click();
    await until(() => saveWeekOnServer.mock.calls.length > 0);
    await flush();
    expect(saveWeekOnServer.mock.calls[0][0].request.action).toBe("StartOver");
    expect(cellAt(element, "0-2").querySelector(".cell-lock")).toBeNull();
  });

  it("a day that can't be read: the Lock menu offers nothing, held (the server would refuse)", async () => {
    const inputs = savedWeek();
    inputs.days[1] = { ...inputs.days[1], problem: "the grid has 3 rows" };
    const element = await render(inputs);
    expect(menu(element).disabled).toBe(true);
    expect(menuLabels(element)).toEqual([]);
  });
});
