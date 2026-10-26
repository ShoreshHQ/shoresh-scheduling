// Elective sets on the week (repo ADR 0018 slice E5; decision 53.2; mock-up
// design-research/electives-r1 grid-a): the sets come first in the drawer, only when the camp has
// any; a set is put down, dragged or typed onto a cell or the cells chosen together, each time
// block on its own; bunks side by side holding it are one cell, "Chugim (3)"; it never swaps; it
// takes up its offerings' places and is not counted as placed; a cell a file noted offers Set it
// up. Synthetic data only.
import { createElement } from "lwc";
import ShoreshWeekEditor from "c/shoreshWeekEditor";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { draft } from "./data/draftFixture";

const SET_ID = "a0X000000000001AAA";
const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };
const CHUGIM = { kind: "E", id: SET_ID, name: "Chugim", gone: false };

// The season setup carries its elective sets (SeasonSetupController: electives, ElectiveMenus):
// Chugim offers Swim (12 seats) and Soccer (no limit); Boating is only proposed; Gaga has 0 seats, which
// does not close it (Greg, 2026-10-26), so Chugim counts 3. Soccer is at the Field, which fits one bunk.
const ELECTIVES = {
  sets: [{ Id: SET_ID, Name: "Chugim" }],
  offerings: [
    {
      Id: "o1",
      ElectiveSet__c: SET_ID,
      Activity__c: "a1",
      Seats__c: 12,
      NoSeatLimit__c: false,
      Proposed__c: false
    },
    {
      Id: "o2",
      ElectiveSet__c: SET_ID,
      Activity__c: "a3",
      Seats__c: null,
      NoSeatLimit__c: true,
      Proposed__c: false
    },
    {
      Id: "o3",
      ElectiveSet__c: SET_ID,
      Activity__c: "a2",
      Seats__c: 10,
      NoSeatLimit__c: false,
      Proposed__c: true
    },
    {
      Id: "o4",
      ElectiveSet__c: SET_ID,
      Activity__c: "a4",
      Seats__c: 0,
      NoSeatLimit__c: false,
      Proposed__c: false
    }
  ],
  linkedChoices: []
};
const ACTIVITY_RECORDS = [
  { Id: "a1", Name: "Swim", Location__c: "pool", Length__c: 1 },
  { Id: "a3", Name: "Soccer", Location__c: "field", Length__c: 1 }
];
const LOCATIONS = [
  { Id: "pool", Name: "Pool", GroupsThatFit__c: 1 },
  { Id: "field", Name: "Field", GroupsThatFit__c: 1 }
];
const SETUP = {
  activities: ACTIVITY_RECORDS,
  locations: LOCATIONS,
  electives: ELECTIVES
};
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(items, rows, options = {}) {
  const element = createElement("c-shoresh-week-editor", {
    is: ShoreshWeekEditor
  });
  element.terms = buildTerms(options.labels || LABELS);
  element.setup = nsRecord(options.setup || SETUP);
  element.weekName = "Week 1";
  element.programName = "Main";
  let shown = null;
  element.addEventListener("statechange", (e) => {
    shown = e.detail.draft;
  });
  const saveRuns = jest.fn(() =>
    Promise.resolve({
      status: "saved",
      conflicts: [],
      schedule: shown.schedule
    })
  );
  element.saveRuns = saveRuns;
  if (options.setUpWith) {
    element.setUpWith = options.setUpWith;
  }
  document.body.appendChild(element);
  const week = draft(items, rows);
  element.show(
    nsRecord({
      ...week,
      activityRecords: ACTIVITY_RECORDS,
      locationRecords: LOCATIONS,
      specials: { days: [] }
    }),
    true
  );
  await flush();
  return { element, saveRuns };
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const grid = (element) => q(element, '[data-id="edit-grid"]');
const palette = (element) => q(element, "c-shoresh-build-palette");
const drawn = (gridElement) =>
  [...gridElement.shadowRoot.querySelectorAll("[data-cell]")].map((c) => ({
    key: c.dataset.cell,
    text: (c.querySelector(".cell-name") || {}).textContent,
    colSpan: c.getAttribute("aria-colspan")
  }));
const sentRuns = (saveRuns, n) => saveRuns.mock.calls[n][0][0].runs;

async function fromGrid(element, name, detail) {
  grid(element).dispatchEvent(new CustomEvent(name, { detail }));
  await flush();
}

async function pickSet(element) {
  palette(element).dispatchEvent(
    new CustomEvent("pickelective", { detail: { id: SET_ID } })
  );
  await flush();
}

describe("c-shoresh-week-editor: elective sets", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("offers the camp's elective sets in the drawer, with their open offerings", async () => {
    const { element } = await render();
    expect(palette(element).electives).toEqual([
      {
        id: SET_ID,
        name: "Chugim",
        words: "3 offerings",
        said: "Chugim, Elective set, 3 offerings"
      }
    ]);
    const tiles = [
      ...palette(element).shadowRoot.querySelectorAll(
        '[data-id="drawer-tiles"] button'
      )
    ];
    // First, before the activities, with the set's mark.
    expect(tiles[0].dataset.kind).toBe("elective");
    expect(tiles[0].querySelector(".flag")).not.toBeNull();
    expect(tiles[0].querySelector(".tile-name").textContent.trim()).toBe(
      "Chugim"
    );
    expect(tiles[0].querySelector(".tile-words").textContent).toBe(
      "3 offerings"
    );
  });

  it("has no elective tiles when the camp has no sets", async () => {
    const { element } = await render(undefined, undefined, {
      setup: { activities: [], locations: [] }
    });
    expect(palette(element).electives).toEqual([]);
  });

  it("puts a picked set on a cell, which reads as the set and its count", async () => {
    const { element, saveRuns } = await render();
    await pickSet(element);
    expect(palette(element).pickedElectiveId).toBe(SET_ID);
    await fromGrid(element, "cellclick", { key: "0-1" });
    expect(sentRuns(saveRuns, 0)).toEqual([
      expect.objectContaining({
        groupId: "g1",
        firstBlockId: "t2",
        before: [""],
        after: [`E:${SET_ID}`]
      })
    ]);
    const cell = grid(element).shadowRoot.querySelector('[data-cell="0-1"]');
    expect(cell.querySelector(".cell-name").textContent).toBe("Chugim (3)");
    expect(cell.querySelector(".flag")).not.toBeNull();
  });

  it("puts a set over the cells chosen together, each time block on its own, as one step", async () => {
    const { element, saveRuns } = await render();
    // Bunk 1 and Bunk 2, Period 2 and Lunch (Bunk 2 is home by Lunch: refused there), so
    // Period 2 alone for both bunks.
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "1-1", extend: true });
    await pickSet(element);
    expect(saveRuns).toHaveBeenCalledTimes(1);
    expect(sentRuns(saveRuns, 0).map((r) => [r.groupId, r.after])).toEqual([
      ["g1", [`E:${SET_ID}`]],
      ["g2", [`E:${SET_ID}`]]
    ]);
    // Bunk 1 and Bunk 2 side by side: one cell (decision 53.2).
    const cells = drawn(grid(element)).filter((c) => c.text === "Chugim (3)");
    expect(cells).toEqual([expect.objectContaining({ colSpan: "2" })]);
  });

  it("holds each time block on its own when a set covers two of a bunk's blocks", async () => {
    const { element, saveRuns } = await render();
    await fromGrid(element, "cellfocus", { key: "0-1" });
    await fromGrid(element, "cellselect", { key: "0-2", extend: true });
    await pickSet(element);
    expect(sentRuns(saveRuns, 0)).toEqual([
      expect.objectContaining({
        groupId: "g1",
        after: [`E:${SET_ID}`, `E:${SET_ID}`]
      })
    ]);
  });

  it("lists the sets first when typing, and places the one picked", async () => {
    const { element, saveRuns } = await render();
    await fromGrid(element, "editcell", {
      key: "0-1",
      rect: { bottom: 0, left: 0 }
    });
    const input = q(element, '[data-id="slot-input"]');
    let options = [...q(element, '[role="listbox"]').querySelectorAll("li")];
    expect(options[0].textContent.trim()).toBe("Chugim (3)");
    input.value = "chugim";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    options = [...q(element, '[role="listbox"]').querySelectorAll("li")];
    // The set only: no "Add" for a name the camp already has as a set.
    expect(options.map((o) => o.textContent.trim())).toEqual(["Chugim (3)"]);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await flush();
    expect(sentRuns(saveRuns, 0)[0].after).toEqual([`E:${SET_ID}`]);
  });

  it("never swaps an activity with a set, and says so", async () => {
    const { element, saveRuns } = await render(
      [FLAGPOLE, SWIM, CHUGIM],
      ["1,2,", "1,3,"]
    );
    // Bunk 1's Swim (Period 2) picked up, put down on Bunk 2's Chugim.
    await fromGrid(element, "cellspace", { key: "0-1" });
    await fromGrid(element, "cellspace", { key: "1-1" });
    expect(saveRuns).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Can’t swap with an elective or an event. Move it to an empty cell instead."
    );
  });

  it("says the camp's own word for electives when it refuses a swap", async () => {
    const { element, saveRuns } = await render(
      [FLAGPOLE, SWIM, CHUGIM],
      ["1,2,", "1,3,"],
      {
        labels: [
          ...LABELS,
          {
            term: "Elective",
            singular: "Chug",
            plural: "Chugim",
            isCustom: true
          }
        ]
      }
    );
    await fromGrid(element, "cellspace", { key: "0-1" });
    await fromGrid(element, "cellspace", { key: "1-1" });
    expect(saveRuns).not.toHaveBeenCalled();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Can’t swap with Chugim or events. Move it to an empty cell instead."
    );
  });

  it("clears a set drawn across bunks from all of them at once", async () => {
    const { element, saveRuns } = await render(
      [FLAGPOLE, CHUGIM],
      ["1,2,", "1,2,"]
    );
    await fromGrid(element, "clearcell", { key: "0-1" });
    expect(
      sentRuns(saveRuns, 0).map((r) => [r.groupId, r.before, r.after])
    ).toEqual([
      ["g1", [`E:${SET_ID}`], [""]],
      ["g2", [`E:${SET_ID}`], [""]]
    ]);
  });

  it("takes up its offerings' places, and isn't counted as placed", async () => {
    // Bunk 1 in Chugim (at the Pool and the Field), Bunk 2 at Soccer on the Field: one more bunk
    // than the Field fits. The dot goes on Soccer, never on the set.
    const { element } = await render(
      [FLAGPOLE, CHUGIM, SOCCER],
      ["1,2,", "1,3,"]
    );
    const checked = element.checked;
    expect(checked.flags.get("2026-06-29|g2|t2")).toBe(
      "More Bunks at Field than fit"
    );
    expect(checked.flags.has("2026-06-29|g1|t2")).toBe(false);
    // Soccer is placed; Chugim's cell is not one to fill.
    const without = await render([FLAGPOLE, SOCCER], ["1,,", "1,2,"]);
    expect(checked.cells.total).toBe(without.element.checked.cells.total - 1);
    expect(checked.cells.filled).toBe(without.element.checked.cells.filled);
  });

  it("offers Set it up on a cell a file noted as an elective", async () => {
    const setUpWith = jest
      .fn()
      .mockResolvedValue('"Chugim" is set up as an elective set.');
    const noted = { kind: "E", id: "", name: "Chugim", gone: false };
    const { element } = await render([FLAGPOLE, noted], ["1,2,", "1,,"], {
      setUpWith
    });
    await fromGrid(element, "cellfocus", { key: "0-1" });
    const offer = q(element, '[data-id="set-up-offer"]');
    expect(offer.textContent.replace(/\s+/g, " ").trim()).toMatch(
      /^Chugim isn't set up yet ·\s?Set it up$/
    );
    const button = q(element, '[data-id="set-up"]');
    expect(button.getAttribute("aria-label")).toBe(
      "Set up Chugim as an elective set"
    );
    button.click();
    await flush();
    expect(setUpWith).toHaveBeenCalledWith({ kind: "E", name: "Chugim" });
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      '"Chugim" is set up as an elective set.'
    );
  });

  it("is accessible with a set on the grid and in the drawer", async () => {
    const { element } = await render([FLAGPOLE, CHUGIM], ["1,2,", "1,2,"]);
    await expect(element).toBeAccessible();
  });
});
