/*
 * The Electives setup screen on the Shoresh page (repo ADR 0018, slice E4; design-research
 * electives-r1 setup-a; decision 53). The menu lists it as coming until slice E11 (decision 44);
 * the page's address opens it (?c__preview=electives).
 */
import { createElement } from "lwc";
import ShoreshCampSetup from "c/shoreshCampSetup";
// The page address the component reads (its test adapter): emitted as the page would.
import * as navigation from "lightning/navigation";
import LightningConfirm from "lightning/confirm";
import getCamps from "@salesforce/apex/SeasonSetupController.getCamps";
import getSeasons from "@salesforce/apex/SeasonSetupController.getSeasons";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import getSeasonSetup from "@salesforce/apex/SeasonSetupController.getSeasonSetupInCamp";
import deleteRecord from "@salesforce/apex/SeasonSetupController.deleteRecord";
import saveRow from "@salesforce/apex/SetupTablesController.saveRow";
import scheduleUses from "@salesforce/apex/SetupTablesController.scheduleUses";
import linkedChoicePlaces from "@salesforce/apex/LinkedChoicesController.linkedChoicePlaces";
import saveLinkedChoice from "@salesforce/apex/LinkedChoicesController.saveLinkedChoice";
import { bareRecord, nsName, nsRecord } from "shoresh-jest/namespace";

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/SeasonSetupController.getCamps", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SeasonSetupController.getSeasons", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SeasonSetupController.getLabels", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/SeasonSetupController.getSeasonSetupInCamp",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/SeasonSetupController.deleteRecord", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SetupTablesController.saveRow", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SetupTablesController.scheduleUses", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/LinkedChoicesController.linkedChoicePlaces",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/LinkedChoicesController.saveLinkedChoice",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "lightning/confirm",
  () => ({ __esModule: true, default: { open: jest.fn() } }),
  { virtual: true }
);

const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Week", singular: "Week", plural: "Weeks", isCustom: false },
  { term: "Season", singular: "Season", plural: "Seasons", isCustom: false },
  {
    term: "ElectiveSet",
    singular: "Elective set",
    plural: "Elective sets",
    isCustom: false
  },
  {
    term: "Offering",
    singular: "Offering",
    plural: "Offerings",
    isCustom: false
  },
  { term: "Seats", singular: "Seats", plural: "Seats", isCustom: false },
  {
    term: "MinimumToRun",
    singular: "Minimum to run",
    plural: "Minimum to run",
    isCustom: false
  },
  {
    term: "LinkedChoice",
    singular: "Linked choice",
    plural: "Linked choices",
    isCustom: false
  }
];
const CAMP = { Id: "c1", Name: "Camp Tamarack" };
const SEASON = {
  Id: "s1",
  Name: "Summer 2027",
  StartDate__c: "2027-06-28",
  EndDate__c: "2027-08-06",
  Camp__c: "c1"
};
const at = (hours, minutes) => (hours * 60 + minutes) * 60000;
// Every name is made up (synthetic data only).
const ACTIVITIES = [
  { Id: "a1", Name: "Archery", Location__c: "l1" },
  { Id: "a2", Name: "Ceramics", Location__c: "l3" },
  { Id: "a3", Name: "Debate", Location__c: "l5" },
  { Id: "a4", Name: "Drama", Location__c: "l2" },
  { Id: "a5", Name: "Kayaking" },
  { Id: "a6", Name: "Photography" },
  { Id: "a7", Name: "Pottery", Location__c: "l3" },
  {
    Id: "a8",
    Name: "Ropes",
    Location__c: "l4",
    Eligibilities__r: [{ Id: "e1", Division__c: "d1" }]
  },
  { Id: "a9", Name: "Woodworking", Location__c: "l3" }
];
const ELECTIVES = {
  sets: [
    { Id: "es2", Name: "Bechirot" },
    { Id: "es1", Name: "Chugim" }
  ],
  // As the server sends them: each set's in the activity's order.
  offerings: [
    { Id: "o1", ElectiveSet__c: "es1", Activity__c: "a1", Seats__c: 12 },
    { Id: "o2", ElectiveSet__c: "es1", Activity__c: "a2", Seats__c: 0 },
    {
      Id: "o9",
      ElectiveSet__c: "es2",
      Activity__c: "a3",
      NoSeatLimit__c: true
    },
    { Id: "o3", ElectiveSet__c: "es1", Activity__c: "a4", Seats__c: 15 },
    { Id: "o8", ElectiveSet__c: "es2", Activity__c: "a6" },
    {
      Id: "o4",
      ElectiveSet__c: "es1",
      Activity__c: "a7",
      NoSeatLimit__c: true
    },
    {
      Id: "o5",
      ElectiveSet__c: "es1",
      Activity__c: "a8",
      Seats__c: 12,
      MinimumToRun__c: 6
    },
    {
      Id: "o6",
      ElectiveSet__c: "es1",
      Activity__c: "a9",
      Seats__c: 10,
      Proposed__c: true
    }
  ],
  linkedChoices: [
    {
      Id: "lc1",
      Name: "Pottery double",
      ElectiveSet__c: "es1",
      Offering__c: "o4",
      AppliesTo__c: "All",
      Times__r: [
        { Id: "x1", Weekday__c: "Tuesday", TimeBlock__c: "t2" },
        { Id: "x2", Weekday__c: "Tuesday", TimeBlock__c: "t3" }
      ]
    }
  ]
};

function setupWith(overrides = {}) {
  return {
    season: SEASON,
    weeks: [
      {
        Id: "w1",
        Name: "Week 1",
        StartDate__c: "2027-06-28",
        EndDate__c: "2027-07-02"
      }
    ],
    programs: [
      {
        program: { Id: "p1", Name: "Main", Monday__c: true },
        timeBlocks: [
          { Id: "t1", Name: "Period 1", StartTime__c: at(9, 0) },
          { Id: "t2", Name: "Period 3", StartTime__c: at(12, 30) },
          { Id: "t3", Name: "Period 4", StartTime__c: at(13, 20) }
        ],
        divisions: [
          { division: { Id: "d1", Name: "Inters" }, groups: [] },
          { division: { Id: "d2", Name: "Seniors" }, groups: [] }
        ]
      }
    ],
    locations: [
      { Id: "l1", Name: "Archery Range" },
      { Id: "l2", Name: "Rec Hall" },
      { Id: "l3", Name: "Arts Barn" },
      { Id: "l4", Name: "Ropes Course" },
      { Id: "l5", Name: "Library" }
    ],
    activities: ACTIVITIES,
    electives: ELECTIVES,
    labels: LABELS,
    ...overrides
  };
}

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

/** The Shoresh page, opened at an address (state: its c__ values). */
async function render(state = { c__preview: "electives" }, setup) {
  getLabels.mockResolvedValue(nsRecord(LABELS));
  getCamps.mockResolvedValue(nsRecord([CAMP]));
  getSeasons.mockResolvedValue(nsRecord([SEASON]));
  getSeasonSetup.mockResolvedValue(nsRecord(setup || setupWith()));
  const element = createElement("c-shoresh-camp-setup", {
    is: ShoreshCampSetup
  });
  document.body.appendChild(element);
  navigation.CurrentPageReference.emit({
    type: "standard__navItemPage",
    state
  });
  await flush();
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const shownScreens = (element) =>
  [...element.shadowRoot.querySelectorAll("[data-screen]")]
    .filter((screen) => !screen.className.includes("slds-hide"))
    .map((screen) => screen.dataset.screen);
const sections = (element) => [
  ...element.shadowRoot.querySelectorAll(
    'c-shoresh-editable-table[data-id="offerings"]'
  )
];
const section = (element, setId) =>
  sections(element).find((table) => table.dataset.set === setId);
const readonly = (table, column) =>
  [
    ...table.shadowRoot.querySelectorAll(
      `[data-id="readonly"][data-column="${column}"]`
    )
  ].map((cell) => cell.textContent);
const menuItem = (element, key) =>
  q(element, "c-shoresh-menu")
    .sections.flatMap((s) => s.items)
    .find((item) => item.key === key);

describe("c-shoresh-camp-setup: Electives", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("without the address, Electives stay coming: not openable, and nothing of theirs on Roots", async () => {
    const element = await render({});
    expect(shownScreens(element)).toEqual(["roots"]);
    expect(menuItem(element, "electives")).toMatchObject({
      label: "Electives",
      coming: true,
      disabled: true
    });
    const roots = q(element, "c-shoresh-roots");
    expect(roots.problems.filter((p) => p.screen === "electives")).toEqual([]);
  });

  it("the address opens Electives: the rail counts the sets, a section per set counts its open offerings", async () => {
    const element = await render();
    expect(shownScreens(element)).toEqual(["electives"]);
    expect(menuItem(element, "electives")).toMatchObject({
      coming: false,
      disabled: false
    });
    expect(
      q(element, '[data-screen="electives"] [data-id="count"]')
        .textContent.replace(/\s+/g, " ")
        .trim()
    ).toBe("2 elective sets");
    const tables = sections(element);
    expect(tables.map((t) => t.heading)).toEqual(["Bechirot", "Chugim"]);
    // Decision 53: confirmed, open offerings only. Chugim: not Ceramics (closed) or Woodworking
    // (proposed); Bechirot: Debate and Photography (its seats are only not filled in yet).
    expect(tables.map((t) => t.headingCount)).toEqual([2, 4]);
    expect(tables.map((t) => t.showColumns)).toEqual([true, false]);
    const chugim = section(element, "es1");
    expect(chugim.objectApiName).toBe(nsName("Offering__c"));
    expect(chugim.filterField).toBe(nsName("ElectiveSet__c"));
    expect(chugim.filterValue).toBe("es1");
    expect(chugim.addLabel).toBe("Add to Chugim");
    expect(bareRecord(chugim.newRowDefaults)).toEqual({
      ElectiveSet__c: "es1"
    });
    expect(chugim.columns.map((c) => c.label)).toEqual([
      "Offering",
      "Seats",
      "Minimum",
      "Who",
      "Where",
      "Linked"
    ]);
    // The sections line up: the same widths, column by column.
    expect(section(element, "es2").columns.map((c) => c.width)).toEqual(
      chugim.columns.map((c) => c.width)
    );
    // Who and where come from the activity, read only; the blank row has none yet.
    expect(readonly(chugim, "who")).toEqual([
      "Everyone",
      "Everyone",
      "Everyone",
      "Everyone",
      "Inters",
      "Everyone",
      ""
    ]);
    expect(readonly(chugim, "where")).toEqual([
      "Archery Range",
      "Arts Barn",
      "Rec Hall",
      "Arts Barn",
      "Ropes Course",
      "Arts Barn",
      ""
    ]);
    expect(readonly(chugim, "linked")).toEqual([
      "",
      "",
      "",
      "Pottery double",
      "",
      "",
      ""
    ]);
    expect(
      [...chugim.shadowRoot.querySelectorAll('[data-id="seats-text"]')].map(
        (s) => s.textContent
      )
    ).toEqual(["12", "Closed", "15", "No limit", "12", "10", ""]);
    // The sets themselves: named, added and deleted under the sections.
    const sets = q(
      element,
      'c-shoresh-editable-table[data-id="elective-sets"]'
    );
    expect(sets.objectApiName).toBe(nsName("ElectiveSet__c"));
    expect(sets.heading).toBe("Elective sets");
    expect(sets.addLabel).toBe("Add Elective set");
    expect(bareRecord(sets.newRowDefaults)).toEqual({ Season__c: "s1" });
    // axe looks at the screen once, smaller, with linked choices open (below): a check over
    // every row here takes CI's shared runners close to the test's time.
  });

  it("is accessible: an offering, a proposed one and one with blank seats, its linked choices open", async () => {
    const element = await render(
      { c__preview: "electives" },
      setupWith({
        electives: {
          sets: [{ Id: "es1", Name: "Chugim" }],
          offerings: ELECTIVES.offerings
            .filter((o) => ["o4", "o6"].includes(o.Id))
            .concat([{ Id: "o7", ElectiveSet__c: "es1", Activity__c: "a6" }]),
          linkedChoices: ELECTIVES.linkedChoices
        }
      })
    );
    section(element, "es1").dispatchEvent(
      new CustomEvent("details", { detail: { recordId: "o4" } })
    );
    await flush();
    expect(q(element, "c-shoresh-elective-details").openOfferingId).toBe("o4");
    await expect(q(element, '[data-screen="electives"]')).toBeAccessible();
  });

  it("an activity is offered once in a set: the choice leaves out those already offered there", async () => {
    const element = await render();
    const chugim = section(element, "es1");
    const activity = chugim.columns[0];
    const offered = (saved) =>
      activity.optionsFor(saved).map((option) => option.label);
    // The blank row: what Chugim doesn't offer yet.
    expect(offered({})).toEqual(["Debate", "Kayaking", "Photography"]);
    // A saved row keeps its own.
    expect(offered(nsRecord({ Id: "o1", Activity__c: "a1" }))).toEqual([
      "Archery",
      "Debate",
      "Kayaking",
      "Photography"
    ]);
    // Every activity is still named, for the question about someone else's change.
    expect(activity.options.length).toBe(9);
  });

  it("a row is named by its activity; a proposed one is dashed with Confirm; blank seats are marked", async () => {
    const element = await render();
    const chugim = section(element, "es1");
    expect(chugim.nameFor(nsRecord({ Activity__c: "a7" }))).toBe("Pottery");
    expect(chugim.rowClasses).toEqual({ o6: "row_proposed" });
    expect(bareRecord(chugim.endActions)).toEqual({
      o6: [
        { key: "confirm", label: "Confirm", changes: { Proposed__c: false } }
      ]
    });
    const bechirot = section(element, "es2");
    expect(bareRecord(bechirot.guesses)).toEqual({
      o8: {
        Seats__c: {
          field: "seats",
          words: "Seats not filled in yet",
          name: "Seats for Photography: seats not filled in yet",
          wordsOnly: true
        }
      }
    });
    // Marked in their rows, so not listed again above them; Roots lists them (plan section 4.6).
    expect(q(element, '[data-id="problems"]')).toBeNull();
    const problems = q(element, "c-shoresh-roots").problems.filter(
      (p) => p.screen === "electives"
    );
    expect(problems.map((p) => [p.name, p.why])).toEqual([
      ["Photography", 'In "Bechirot": seats not filled in yet.'],
      ["Woodworking", 'In "Chugim": proposed, not confirmed yet.']
    ]);
  });

  it("an offering's row is saved as every setup row is, and the screen says Saved", async () => {
    const element = await render();
    saveRow.mockResolvedValue(nsRecord({ id: "o10", changed: [] }));
    const onSaved = jest.fn();
    const onDone = jest.fn();
    section(element, "es1").dispatchEvent(
      new CustomEvent("save", {
        detail: {
          record: nsRecord({
            sobjectType: "Offering__c",
            ElectiveSet__c: "es1",
            Activity__c: "a5"
          }),
          seen: null,
          extras: { weeksOff: [], weeksBackOn: [] },
          seenWho: null,
          onSaved,
          onFailure: jest.fn(),
          onDone
        }
      })
    );
    await flush();
    expect(bareRecord(saveRow.mock.calls[0][0].record)).toEqual({
      sobjectType: "Offering__c",
      ElectiveSet__c: "es1",
      Activity__c: "a5"
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
    // The season is read again, so every screen shows it.
    expect(getSeasonSetup.mock.calls.length).toBe(2);
  });

  it("deleting an offering takes it off its set; the activity is kept", async () => {
    const element = await render();
    scheduleUses.mockResolvedValue({ schedules: 0, complete: true });
    LightningConfirm.open.mockResolvedValue(true);
    deleteRecord.mockResolvedValue();
    const onDeleted = jest.fn();
    section(element, "es1").dispatchEvent(
      new CustomEvent("delete", {
        detail: { recordId: "o1", name: "Archery", onDeleted }
      })
    );
    await flush();
    expect(LightningConfirm.open.mock.calls[0][0]).toMatchObject({
      label: "Delete",
      message: 'Take "Archery" off "Chugim"? The activity is kept.'
    });
    expect(deleteRecord).toHaveBeenCalledWith({ recordId: "o1" });
    expect(onDeleted).toHaveBeenCalled();
  });

  it("an offering's chevron opens its linked choices beside the list; Close goes back to it", async () => {
    const element = await render();
    const chugim = section(element, "es1");
    chugim.dispatchEvent(
      new CustomEvent("details", { detail: { recordId: "o4" } })
    );
    await flush();
    const details = q(element, "c-shoresh-elective-details");
    expect(details.openOfferingId).toBe("o4");
    expect(chugim.detailsOpenFor).toBe("o4");
    expect(
      details.shadowRoot.querySelector('[data-id="choice-name"]').value
    ).toBe("Pottery double");
    const back = jest.spyOn(chugim, "focusDetailsOf");
    details.shadowRoot.querySelector('[data-id="close"]').click();
    await flush();
    expect(back).toHaveBeenCalledWith("o4");
    expect(chugim.detailsOpenFor).toBeNull();
  });

  it("a linked choice's change is saved in turn, then the season is read again (slice E8)", async () => {
    linkedChoicePlaces.mockResolvedValue({
      complete: true,
      cells: [{ weekday: "Tuesday", blockId: "t2", divisionIds: ["d1"] }]
    });
    saveLinkedChoice.mockResolvedValue("lc1");
    const element = await render();
    section(element, "es1").dispatchEvent(
      new CustomEvent("details", { detail: { recordId: "o4" } })
    );
    await flush();
    const details = q(element, "c-shoresh-elective-details");
    expect(linkedChoicePlaces).toHaveBeenCalledWith({ electiveSetId: "es1" });
    const onSaved = jest.fn();
    const onFailure = jest.fn();
    const edit = { id: "lc1", appliesTo: "AllExcept" };
    details.dispatchEvent(
      new CustomEvent("save", { detail: { edit, onSaved, onFailure } })
    );
    await flush();
    expect(saveLinkedChoice).toHaveBeenCalledWith({
      edit: JSON.stringify(edit)
    });
    expect(onSaved).toHaveBeenCalledWith("lc1");
    expect(onFailure).not.toHaveBeenCalled();
    expect(getSeasonSetup.mock.calls.length).toBe(2);

    // Refused: the editor hears why, in the camp's words.
    saveLinkedChoice.mockRejectedValue({
      body: {
        message: "That linked choice is no longer there. Reload the page."
      }
    });
    details.dispatchEvent(
      new CustomEvent("save", { detail: { edit, onSaved, onFailure } })
    );
    await flush();
    expect(onFailure.mock.calls[0][0]).toContain(
      "That linked choice is no longer there. Reload the page."
    );
  });

  it("deleting a linked choice asks first, saying what a sheet that names it then counts as", async () => {
    const element = await render();
    LightningConfirm.open.mockResolvedValue(true);
    deleteRecord.mockResolvedValue();
    section(element, "es1").dispatchEvent(
      new CustomEvent("details", { detail: { recordId: "o4" } })
    );
    await flush();
    const onDeleted = jest.fn();
    q(element, "c-shoresh-elective-details").dispatchEvent(
      new CustomEvent("delete", {
        detail: { recordId: "lc1", name: "Pottery double", onDeleted }
      })
    );
    await flush();
    expect(LightningConfirm.open.mock.calls[0][0]).toMatchObject({
      label: "Delete",
      message:
        'Delete "Pottery double"? A sheet that names it then counts as Pottery.'
    });
    expect(scheduleUses).not.toHaveBeenCalled();
    expect(deleteRecord).toHaveBeenCalledWith({ recordId: "lc1" });
    expect(onDeleted).toHaveBeenCalled();
  });

  it("a season with no elective sets yet shows the sets list, ready for the first", async () => {
    const element = await render(
      { c__preview: "electives" },
      setupWith({ electives: undefined })
    );
    expect(sections(element)).toEqual([]);
    const sets = q(
      element,
      'c-shoresh-editable-table[data-id="elective-sets"]'
    );
    expect(sets.emptyMessage).toBe("No elective sets yet");
    expect(
      q(element, '[data-screen="electives"] [data-id="count"]')
        .textContent.replace(/\s+/g, " ")
        .trim()
    ).toBe("0 elective sets");
  });

  it("the rail has Import a list and Download this list for the offerings (plan §6.2)", async () => {
    const element = await render();
    const list = q(
      element,
      '[data-screen="electives"] [data-id="setup-rail"] c-shoresh-list-import'
    );
    expect(list.screenKey).toBe("electives");
    expect(list.variant).toBe("rail");
  });

  it("a file of camper choices given to the list goes on to Bring in choices", async () => {
    const element = await render();
    q(element, '[data-screen="electives"] c-shoresh-list-import').dispatchEvent(
      new CustomEvent("bringinchoices")
    );
    await flush();
    expect(shownScreens(element)).toEqual(["bringInChoices"]);
    expect(q(element, "c-shoresh-choices-import")).not.toBeNull();
  });
});
