/**
 * Locks on the Generated Schedule screen, the edges (#58 review): a cell locked empty, a lock
 * left where a bunk is now away, the menu always in the toolbar, focus after a change, the
 * legend, the gate as the one message, and a Lock saving while other things happen. Synthetic
 * data only.
 */
import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import {
  chooseLock,
  editorRoot,
  find,
  findAll,
  lockLabels,
  lockRows
} from "shoresh-jest/week-editor";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
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

// Everything building needs (desktop readiness.js), so Generate is offered.
const READY = {
  season: { Id: "a0Z000000000001AAA", Name: "Summer 2026" },
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
};
const SETUP = nsRecord(READY);
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

async function render(inputs, setup = SETUP) {
  getInputs.mockResolvedValue(inputs);
  const element = createElement("c-shoresh-generated-schedule", {
    is: ShoreshGeneratedSchedule
  });
  element.terms = terms;
  element.setup = setup;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => find(element, selector);
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cellAt = (element, key) =>
  grid(element).shadowRoot.querySelector(`[data-cell="${key}"]`);
// Lock's choices are in the rail's Edit menu (ADR 0010 §58).
const editMenu = (element) => q(element, '[data-id="edit-menu"]');
const menuLabels = (element) => lockLabels(element);

async function focusCell(element, key) {
  cellAt(element, key).dispatchEvent(
    new CustomEvent("focusin", { bubbles: true, composed: true })
  );
  await flush();
}
async function choose(element, label) {
  chooseLock(element, label);
  await flush();
}

afterEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
  jest.resetAllMocks();
});

describe("a cell locked empty, and a lock left where a bunk is now away", () => {
  it("a cell locked empty reads as kept empty: no Open, Locked empty for a screen reader", async () => {
    const element = await render(savedWeek([[",,1,", ",,,"]]));
    const kept = cellAt(element, "0-2");
    expect(kept.className).toContain("cell_locked-empty");
    expect(kept.className).not.toContain("cell_open");
    expect(kept.querySelector(".cell-name").textContent).toBe("");
    expect(
      kept.querySelector('.cell-lock [data-id="lock-words"]').textContent
    ).toBe("Locked empty");
    // A locked activity still says Locked.
    document.body.removeChild(element);
    const locked = await render(savedWeek([[",1,,", ",,,"]]));
    expect(
      cellAt(locked, "0-1").querySelector('.cell-lock [data-id="lock-words"]')
        .textContent
    ).toBe("Locked");
  });

  it("a lock left where the bunk is now away can still be unlocked, never locked", async () => {
    // Bunk 2 (mornings only) has a lock on its afternoon Period 3, empty.
    const element = await render(savedWeek([[",,,", ",,,1"]]));
    await focusCell(element, "1-3");
    const labels = menuLabels(element);
    expect(labels).toContain("Unlock Bunk 2 · Monday · Period 3");
    expect(labels).toContain("Unlock Monday");
    expect(labels).not.toContain("Lock Bunk 2 · Monday · Period 3");
  });

  it("a lock on any block of a two-block placement shows on the whole of it", async () => {
    const inputs = camp({
      ...SMALL,
      scheduleId: SCHEDULE,
      activities: [{ name: "Hike", min: 0, max: 5, atOnce: 2, length: 2 }]
    });
    const hike = {
      kind: "A",
      id: inputs.activities[0].Id,
      name: "Hike",
      gone: false
    };
    inputs.days[0] = {
      ...inputs.days[0],
      items: [...inputs.days[0].items, hike],
      rows: ["1,2,^,", "1,,,"],
      // Locked on its second block (Period 2).
      locks: [",,1,", ",,,"]
    };
    const element = await render(inputs);
    expect(cellAt(element, "0-1").querySelector(".cell-lock")).not.toBeNull();
  });

  it("the lock carries its own words, so the quiet line under the grid leaves it out", async () => {
    const element = await render(savedWeek([[",1,,", ",,,"]]));
    expect(
      cellAt(element, "0-1").querySelector('.cell-lock [data-id="lock-words"]')
        .textContent
    ).toBe("Locked");
    const legend = q(element, '[data-id="edit-grid"]').shadowRoot.querySelector(
      '[data-id="legend"]'
    );
    expect(legend ? legend.textContent : "").not.toContain("Locked");
  });
});

describe("the Lock menu", () => {
  it("Edit offers no Lock when nothing applies (and in Activity View)", async () => {
    // Nothing placed but Flagpole, no cell reached: nothing to lock.
    const element = await render(camp({ ...SMALL, scheduleId: SCHEDULE }));
    expect(editMenu(element)).not.toBeNull();
    expect(menuLabels(element)).toEqual([]);
    q(element, '[data-view="activity"]').click();
    await flush();
    expect(menuLabels(element)).toEqual([]);
  });

  it("its choices are Edit's menu items, each naming what it locks", async () => {
    const element = await render(savedWeek());
    const rows = lockRows(element);
    expect(rows.map((row) => row.getAttribute("role"))).toEqual(["menuitem"]);
    expect(rows[0].closest('[role="group"]')).toBeNull();
  });

  it("an Unlock that leaves nothing to offer puts focus on the grid", async () => {
    // Monday's only lock is on an Open cell; no cell reached: the menu offers Unlock Monday only.
    const inputs = camp({ ...SMALL, scheduleId: SCHEDULE });
    inputs.days[0] = { ...inputs.days[0], locks: [",,1,", ",,,"] };
    const element = await render(inputs);
    expect(menuLabels(element)).toEqual(["Unlock Monday"]);
    setLocksOnServer.mockResolvedValue({
      conflict: false,
      revision: "2026-06-29:2|2026-06-30:1",
      schedule: { days: camp({ ...SMALL, scheduleId: SCHEDULE }).days }
    });
    const focusGrid = jest.spyOn(grid(element), "focusCell");
    await choose(element, "Unlock Monday");
    await flush();
    expect(menuLabels(element)).toEqual([]);
    expect(focusGrid).toHaveBeenCalled();
  });

  it("a refused change puts focus back on the Edit menu", async () => {
    const element = await render(savedWeek());
    setLocksOnServer.mockRejectedValue({
      body: { message: "A saved version can't be changed." }
    });
    await choose(element, "Lock Monday");
    await flush();
    expect(editorRoot(element).activeElement).toBe(editMenu(element));
  });

  it("forgets the cell reached on another view or bunk (grid keys repeat)", async () => {
    const element = await render(savedWeek());
    const offersCell = () =>
      menuLabels(element).some((l) => l.includes("Period 1"));
    await focusCell(element, "0-1");
    expect(offersCell()).toBe(true);
    q(element, '[data-view="group"]').click();
    await flush();
    expect(offersCell()).toBe(false);
    await focusCell(element, "0-1");
    expect(offersCell()).toBe(true);
    const pills = [...findAll(element, '[data-id="group-pills"] button')];
    pills[1].click();
    await flush();
    expect(offersCell()).toBe(false);
  });
});

describe("a deleted bunk", () => {
  it("its Group View pill says (removed), as on the Schedules page", async () => {
    const inputs = savedWeek();
    inputs.days = inputs.days.map((day) => ({
      ...day,
      groups: [
        ...day.groups,
        { id: "a0G000000000099AAA", name: "Bunk 9", gone: true }
      ],
      rows: [...day.rows, ",,,"]
    }));
    const element = await render(inputs);
    q(element, '[data-view="group"]').click();
    await flush();
    const pills = [...findAll(element, '[data-id="group-pills"] button')].map(
      (b) => b.textContent.replace(/\s+/g, " ").trim()
    );
    expect(pills).toEqual(["Bunk 1", "Bunk 2", "Bunk 9 (removed)"]);
  });
});

describe("the gate is the one message", () => {
  it("no weeks: only the screen's own No weeks yet", async () => {
    const element = await render(
      savedWeek(),
      nsRecord({ ...READY, weeks: [] })
    );
    expect(q(element, '[data-id="still-needed-box"]')).toBeNull();
    expect(q(element, '[data-id="nothing-to-build"]')).not.toBeNull();
  });

  it("a week that couldn't be read: its error, not the gate", async () => {
    getInputs.mockRejectedValue({ body: { message: "Boom." } });
    const element = createElement("c-shoresh-generated-schedule", {
      is: ShoreshGeneratedSchedule
    });
    element.terms = terms;
    element.setup = nsRecord({ ...READY, activities: [] });
    document.body.appendChild(element);
    await flush();
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Boom."
    );
    expect(q(element, '[data-id="still-needed-box"]')).toBeNull();
  });

  it("a week shown, then a read that fails: its error, the gate set aside", async () => {
    const element = await render(
      camp(SMALL),
      nsRecord({ ...READY, activities: [] })
    );
    expect(q(element, '[data-id="still-needed-box"]')).not.toBeNull();
    getInputs.mockRejectedValueOnce({
      body: { message: "Network went away." }
    });
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Network went away."
    );
    expect(q(element, '[data-id="still-needed-box"]')).toBeNull();
  });

  it("a program that runs on no day: the gate, not also Week 1 has no days", async () => {
    const noDays = camp({ ...SMALL, days: 0 });
    const element = await render(
      noDays,
      nsRecord({
        ...READY,
        programs: [
          {
            ...READY.programs[0],
            program: { Id: PROGRAM, Name: "Main" }
          }
        ]
      })
    );
    expect(q(element, '[data-id="still-needed-box"]')).not.toBeNull();
    expect(element.shadowRoot.textContent).not.toContain("has no days");
  });
});

describe("a Lock saving while other things happen", () => {
  /** A Lock whose save hasn't answered yet. */
  async function lockUnderway() {
    const element = await render(savedWeek());
    let answer;
    setLocksOnServer.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    await choose(element, "Lock Monday");
    return { element, answer: (value) => answer(value) };
  }
  const lockedMonday = () => ({
    conflict: false,
    revision: "2026-06-29:2|2026-06-30:1",
    schedule: { days: savedWeek([[",1,,", ",,,"]]).days }
  });

  it("the build actions and the menu wait, and a second choice does nothing", async () => {
    const { element, answer } = await lockUnderway();
    ["Rebuild", "TryAnother", "StartOver"].forEach((name) =>
      expect(q(element, `[data-action="${name}"]`).disabled).toBe(true)
    );
    // Held, and chosen anyway: nothing more is sent.
    expect(lockRows(element).every((row) => row.disabled)).toBe(true);
    q(element, "c-shoresh-week-editor").dispatchEvent(
      new CustomEvent("editselect", { detail: { value: "lock:Lock|day" } })
    );
    await flush();
    expect(setLocksOnServer).toHaveBeenCalledTimes(1);
    answer(lockedMonday());
    await flush();
    expect(q(element, '[data-action="Rebuild"]').disabled).toBe(false);
  });

  it("coming back to the window reads nothing over it", async () => {
    const { element, answer } = await lockUnderway();
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
    answer(lockedMonday());
    await flush();
    expect(cellAt(element, "0-1").querySelector(".cell-lock")).not.toBeNull();
  });

  it("the season read again: the week is read once the Lock is saved", async () => {
    const { element, answer } = await lockUnderway();
    element.setup = nsRecord({ ...READY });
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(1);
    getInputs.mockResolvedValue(savedWeek([[",1,,", ",,,"]]));
    answer(lockedMonday());
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
  });

  it("the season read again, then a conflict: the box stays and nothing is read", async () => {
    const { element, answer } = await lockUnderway();
    element.setup = nsRecord({ ...READY });
    await flush();
    answer({
      conflict: true,
      message: "Someone else changed this schedule since you opened it."
    });
    await flush();
    expect(q(element, '[data-id="conflict"]')).not.toBeNull();
    expect(getInputs).toHaveBeenCalledTimes(1);
  });
});
