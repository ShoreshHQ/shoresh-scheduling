import { createElement } from "lwc";
import ShoreshCampSetup from "c/shoreshCampSetup";
import LightningConfirm from "lightning/confirm";
import getCamps from "@salesforce/apex/SeasonSetupController.getCamps";
import getSeasons from "@salesforce/apex/SeasonSetupController.getSeasons";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import getSeasonSetup from "@salesforce/apex/SeasonSetupController.getSeasonSetupInCamp";
import saveRecords from "@salesforce/apex/SeasonSetupController.saveRecords";
import deleteRecord from "@salesforce/apex/SeasonSetupController.deleteRecord";
import addWeeksFromSeasonDates from "@salesforce/apex/SeasonSetupController.addWeeksFromSeasonDates";
import saveRowsAndWeeks from "@salesforce/apex/SeasonSetupController.saveRowsAndWeeks";
import saveRowsWeeksAndWho from "@salesforce/apex/SeasonSetupController.saveRowsWeeksAndWho";

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
jest.mock("@salesforce/apex/SeasonSetupController.saveRecords", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SeasonSetupController.deleteRecord", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/SeasonSetupController.addWeeksFromSeasonDates",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SeasonSetupController.saveRowsAndWeeks",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SeasonSetupController.saveRowsWeeksAndWho",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/SeasonSetupController.previewCopy", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SeasonSetupController.copySeason", () => apex(), {
  virtual: true
});
jest.mock(
  "lightning/confirm",
  () => ({ __esModule: true, default: { open: jest.fn() } }),
  { virtual: true }
);

const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  {
    term: "Activity",
    singular: "Activity",
    plural: "Activities",
    isCustom: false
  },
  { term: "Week", singular: "Week", plural: "Weeks", isCustom: false },
  { term: "Season", singular: "Season", plural: "Seasons", isCustom: false },
  { term: "Program", singular: "Program", plural: "Programs", isCustom: false },
  {
    term: "TimeBlock",
    singular: "Time block",
    plural: "Time blocks",
    isCustom: false
  },
  {
    term: "Division",
    singular: "Division",
    plural: "Divisions",
    isCustom: false
  }
];
const CAMP = { Id: "c1", Name: "Camp Willow" };
const SEASON = {
  Id: "s1",
  Name: "Summer 2026",
  StartDate__c: "2026-06-29",
  EndDate__c: "2026-08-07",
  Status__c: "Planning",
  Camp__c: "c1"
};

function setupWith(overrides = {}) {
  return {
    season: SEASON,
    weeks: [
      {
        Id: "w1",
        Name: "Week 1",
        StartDate__c: "2026-06-29",
        EndDate__c: "2026-07-03"
      }
    ],
    programs: [
      {
        program: { Id: "p1", Name: "Main", Monday__c: true },
        timeBlocks: [{ Id: "t1", Name: "Period 1" }],
        divisions: [{ division: { Id: "d1", Name: "Juniors" }, groups: [] }]
      }
    ],
    labels: LABELS,
    ...overrides
  };
}

// Lets pending (mocked) server calls and re-renders finish before checking the screen.
const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render() {
  const element = createElement("c-shoresh-camp-setup", {
    is: ShoreshCampSetup
  });
  document.body.appendChild(element);
  await flush();
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const button = (element, label) =>
  [...element.shadowRoot.querySelectorAll("lightning-button")].find(
    (b) => b.label === label
  );
/** Opens a screen from the left-hand menu, as a director would. */
async function openScreen(element, screen) {
  q(element, "c-shoresh-menu")
    .shadowRoot.querySelector(`a[data-screen="${screen}"]`)
    .click();
  await flush();
}
/** The screen shown: every screen stays on the page, all but one hidden. */
const shownScreens = (element) =>
  [...element.shadowRoot.querySelectorAll("[data-screen]")]
    .filter((screen) => !screen.className.includes("slds-hide"))
    .map((screen) => screen.dataset.screen);
const validAll = (element) =>
  element.shadowRoot
    .querySelectorAll("lightning-input, lightning-combobox")
    .forEach((i) => {
      i.reportValidity = () => true;
    });

describe("c-shoresh-camp-setup", () => {
  beforeEach(() => {
    getLabels.mockResolvedValue(LABELS);
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("asks a first-time director to name their camp", async () => {
    getCamps.mockResolvedValueOnce([]).mockResolvedValueOnce([CAMP]);
    getSeasons.mockResolvedValue([]);
    saveRecords.mockResolvedValue(["c1"]);
    const element = await render();
    expect(element.shadowRoot.textContent).toContain(
      "Start by naming your camp."
    );

    const name = q(element, 'lightning-input[data-id="camp-name"]');
    name.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Camp Willow" } })
    );
    validAll(element);
    button(element, "Create camp").click();
    await flush();
    await flush();
    expect(saveRecords).toHaveBeenCalledWith({
      records: [{ sobjectType: "Camp__c", Name: "Camp Willow" }]
    });
    expect(element.shadowRoot.textContent).toContain("Start a new season");
  });

  it("creates a season for the camp", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValueOnce([]).mockResolvedValue([SEASON]);
    saveRecords.mockResolvedValue(["s1"]);
    getSeasonSetup.mockResolvedValue(setupWith({ weeks: [] }));
    const element = await render();

    const fields = element.shadowRoot.querySelectorAll(
      'lightning-input[data-form="new-season"]'
    );
    fields[0].dispatchEvent(
      new CustomEvent("change", { detail: { value: "Summer 2026" } })
    );
    fields[1].dispatchEvent(
      new CustomEvent("change", { detail: { value: "2026-06-29" } })
    );
    fields[2].dispatchEvent(
      new CustomEvent("change", { detail: { value: "2026-08-07" } })
    );
    validAll(element);
    button(element, "Create season").click();
    await flush();
    await flush();

    expect(saveRecords).toHaveBeenCalledWith({
      records: [
        {
          sobjectType: "Season__c",
          Camp__c: "c1",
          Status__c: "Planning",
          Name: "Summer 2026",
          StartDate__c: "2026-06-29",
          EndDate__c: "2026-08-07"
        }
      ]
    });
    expect(getSeasonSetup).toHaveBeenCalledWith({
      campId: "c1",
      seasonId: "s1"
    });
    expect(q(element, '[data-id="fill-weeks"]')).not.toBeNull();
  });

  it("shows the season in the camp words, with its problems on the screen that fixes them", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    const element = await render();

    expect(q(element, '[data-id="camp-name-heading"]').textContent).toBe(
      "Camp Willow"
    );
    expect(q(element, "c-shoresh-program").terms.p("Group")).toBe("Bunks");
    // Roots lists everything; each screen shows only its own.
    const roots = q(element, "c-shoresh-roots");
    expect(roots.problems.map((p) => [p.screen, p.name])).toContainEqual([
      "groups",
      "Juniors"
    ]);
    expect(q(element, '[data-id="problems"]')).toBeNull();
    await openScreen(element, "groups");
    expect(q(element, '[data-id="problems"]').textContent).toContain(
      "Juniors: No Bunks yet."
    );
    await openScreen(element, "weeks");
    expect(q(element, '[data-id="problems"]')).toBeNull();
    const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');
    expect(weeks.addLabel).toBe("Add Week");
    expect(weeks.newRowDefaults).toEqual({ Season__c: "s1", Name: "Week {n}" });
    // Overlapping weeks get a heads-up, in the camp's word.
    expect(weeks.overlapLabel).toBe("Overlaps another week");
    expect(button(element, "Copy this season")).toBeDefined();
  });

  it("fills in weeks from the season dates", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith({ weeks: [] }));
    addWeeksFromSeasonDates.mockResolvedValue();
    const element = await render();
    q(element, '[data-id="fill-weeks"]').click();
    await flush();
    expect(addWeeksFromSeasonDates).toHaveBeenCalledWith({ seasonId: "s1" });
    expect(getSeasonSetup).toHaveBeenCalledTimes(2);
  });

  it("saves what a table sends and shows a server refusal", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    saveRecords.mockRejectedValueOnce({
      body: { message: '"Week 1" already starts on 6/29/2026.' }
    });
    const element = await render();
    const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');
    weeks.dispatchEvent(
      new CustomEvent("save", {
        detail: { records: [{ sobjectType: "Week__c", Name: "Extra" }] }
      })
    );
    await flush();
    expect(saveRecords).toHaveBeenCalledWith({
      records: [{ sobjectType: "Week__c", Name: "Extra" }]
    });
    expect(q(element, '[data-id="error"]').textContent).toContain(
      "already starts on"
    );
  });

  it("adds a program", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith({ programs: [] }));
    saveRecords.mockResolvedValue(["p1"]);
    const element = await render();
    q(element, '[data-id="add-program"]').click();
    await flush();
    expect(saveRecords).toHaveBeenCalledWith({
      records: [
        {
          sobjectType: "Program__c",
          Season__c: "s1",
          Name: "Main",
          SortOrder__c: 1
        }
      ]
    });
  });

  it("deletes only after the director confirms", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    deleteRecord.mockResolvedValue();
    const element = await render();
    const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');

    LightningConfirm.open.mockResolvedValueOnce(false);
    weeks.dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "w1", name: "Week 1" } })
    );
    await flush();
    expect(deleteRecord).not.toHaveBeenCalled();

    LightningConfirm.open.mockResolvedValueOnce(true);
    weeks.dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "w1", name: "Week 1" } })
    );
    await flush();
    expect(deleteRecord).toHaveBeenCalledWith({ recordId: "w1" });
  });

  it("deleting a week says which saved versions go with it", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(
      setupWith({
        schedules: [
          { Id: "s1", Week__c: "w1", Program__c: "p1", Status__c: "Version" },
          { Id: "s2", Week__c: "w1", Program__c: "p1", Status__c: "Version" },
          { Id: "s3", Week__c: "w1", Program__c: "p1", Status__c: "Published" }
        ]
      })
    );
    const element = await render();
    LightningConfirm.open.mockResolvedValue(false);
    q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "w1", name: "Week 1" } })
    );
    await flush();
    expect(LightningConfirm.open.mock.calls[0][0].message).toContain(
      "That includes 2 saved versions."
    );
  });

  it("deleting a season names everything that goes with it", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    LightningConfirm.open.mockResolvedValue(true);
    deleteRecord.mockResolvedValue();
    const element = await render();
    button(element, "Delete season").click();
    await flush();
    expect(LightningConfirm.open.mock.calls[0][0].message).toContain("Bunks");
    expect(deleteRecord).toHaveBeenCalledWith({ recordId: "s1" });
  });

  it("edits the season dates and saves only the season", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    saveRecords.mockResolvedValue(["s1"]);
    const element = await render();
    expect(button(element, "Save season").disabled).toBe(true);
    const end = element.shadowRoot.querySelector(
      'lightning-input[data-form="season"][data-field="EndDate__c"]'
    );
    end.dispatchEvent(
      new CustomEvent("change", { detail: { value: "2026-08-14" } })
    );
    await flush();
    validAll(element);
    button(element, "Save season").click();
    await flush();
    expect(saveRecords.mock.calls[0][0].records[0]).toMatchObject({
      sobjectType: "Season__c",
      Id: "s1",
      EndDate__c: "2026-08-14"
    });
  });

  it("opens the copy panel, and camp words from the menu", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    const element = await render();
    button(element, "Copy this season").click();
    await flush();
    expect(q(element, "c-shoresh-copy-season")).not.toBeNull();
    expect(shownScreens(element)).toEqual([]);

    q(element, "c-shoresh-copy-season").dispatchEvent(
      new CustomEvent("cancel")
    );
    await flush();
    expect(shownScreens(element)).toEqual(["roots"]);
    await openScreen(element, "campWords");
    expect(shownScreens(element)).toEqual(["campWords"]);
    expect(q(element, "c-shoresh-camp-labels").campId).toBe("c1");
  });

  it("goes to the new season after a copy", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([
      SEASON,
      { ...SEASON, Id: "s2", Name: "Summer 2027" }
    ]);
    getSeasonSetup.mockResolvedValue(setupWith());
    const element = await render();
    button(element, "Copy this season").click();
    await flush();
    q(element, "c-shoresh-copy-season").dispatchEvent(
      new CustomEvent("copied", { detail: { seasonId: "s2" } })
    );
    await flush();
    await flush();
    expect(getSeasonSetup).toHaveBeenLastCalledWith({
      campId: "c1",
      seasonId: "s2"
    });
  });

  it("shows a loading failure instead of a blank screen", async () => {
    getCamps.mockRejectedValue({
      body: { message: "You do not have access to Shoresh." }
    });
    const element = await render();
    expect(q(element, '[data-id="error"]').textContent).toContain(
      "You do not have access"
    );
  });

  it("tells the table its save failed, so its typing is not lost", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    saveRecords.mockRejectedValueOnce({ body: { message: "No." } });
    const element = await render();
    const onFailure = jest.fn();
    q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
      new CustomEvent("save", {
        detail: { records: [{ Name: "x" }], onFailure }
      })
    );
    await flush();
    expect(onFailure).toHaveBeenCalled();
  });

  it("flags same names on the season's location types, locations, and activities only", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith({}));
    const element = await render();
    const flagged = (id) =>
      q(element, `c-shoresh-editable-table[data-id="${id}"]`).flagSameNames;
    expect(flagged("location-types")).toBe(true);
    expect(flagged("locations")).toBe(true);
    expect(flagged("activities")).toBe(true);
    expect(flagged("weeks")).toBeFalsy();
  });

  it("saves a table's rows with its Runs in weeks, and reloads", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(
      setupWith({
        weekExceptions: [{ Id: "x1", Week__c: "w1", Location__c: "l1" }]
      })
    );
    saveRowsAndWeeks.mockResolvedValue([]);
    const element = await render();
    const locations = q(
      element,
      'c-shoresh-editable-table[data-id="locations"]'
    );
    expect(locations.weeksHeading).toBe("Open in");
    expect(locations.weeks.map((w) => w.Id)).toEqual(["w1"]);
    expect(locations.weekExceptions.length).toBe(1);
    expect(
      q(element, 'c-shoresh-editable-table[data-id="activities"]').weeksHeading
    ).toBe("Runs in");
    locations.dispatchEvent(
      new CustomEvent("save", {
        detail: {
          records: [{ sobjectType: "Location__c", Name: "Pool" }],
          weeksOff: [{ row: 0, week: "w1" }],
          weeksBackOn: ["x1"]
        }
      })
    );
    await flush();
    expect(saveRowsAndWeeks).toHaveBeenCalledWith({
      records: [{ sobjectType: "Location__c", Name: "Pool" }],
      weeksOff: [{ row: 0, week: "w1" }],
      weeksBackOn: ["x1"]
    });
    expect(saveRecords).not.toHaveBeenCalled();
    expect(getSeasonSetup).toHaveBeenCalledTimes(2);
  });

  it("saves recurring activities with their weeks and who each covers, and shows a refusal", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    saveRowsWeeksAndWho.mockResolvedValue([]);
    const element = await render();
    const recurring = q(
      element,
      'c-shoresh-program[data-id="recurring-activities"]'
    );
    expect(recurring.show).toBe("recurringActivities");
    const detail = {
      records: [{ sobjectType: "RecurringActivity__c", Name: "Swim" }],
      weeksOff: [],
      weeksBackOn: [],
      who: [{ row: 0, targets: ["d1"] }]
    };
    recurring.dispatchEvent(new CustomEvent("save", { detail }));
    await flush();
    expect(saveRowsWeeksAndWho).toHaveBeenCalledWith({
      records: detail.records,
      extras: { weeksOff: [], weeksBackOn: [], who: detail.who }
    });
    expect(saveRowsAndWeeks).not.toHaveBeenCalled();

    const refusal =
      '"Flagpole" and "Swim" would both have Bunk 1 in Period 1 on Monday in Week 1.';
    saveRowsWeeksAndWho.mockRejectedValue({ body: { message: refusal } });
    const onFailure = jest.fn();
    recurring.dispatchEvent(
      new CustomEvent("save", { detail: { ...detail, onFailure } })
    );
    await flush();
    expect(onFailure).toHaveBeenCalled();
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(refusal);
  });

  it("offers a changed fixed activity's fixes in Needs attention, and saves the one chosen", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(
      setupWith({
        programs: [
          {
            program: { Id: "p1", Name: "Main", Monday__c: true },
            timeBlocks: [
              { Id: "t1", Name: "Period 1" },
              { Id: "t9", Name: "Snack" },
              { Id: "t2", Name: "Period 2" }
            ],
            divisions: [],
            fixedActivities: [
              {
                Id: "f1",
                Name: "Rest",
                TimeBlock__c: "t1",
                Length__c: 2,
                LastTimeBlock__c: "t2"
              }
            ]
          }
        ]
      })
    );
    saveRecords.mockResolvedValue(["f1"]);
    const element = await render();
    await openScreen(element, "fixedActivities");
    const buttons = [
      ...element.shadowRoot.querySelectorAll('[data-id="problem-action"]')
    ];
    expect(buttons.map((b) => b.label)).toEqual([
      "Keep Period 1 – Snack",
      "Stretch to Period 1 – Period 2"
    ]);
    buttons[1].click();
    await flush();
    expect(saveRecords).toHaveBeenCalledWith({
      records: [{ sobjectType: "FixedActivity__c", Id: "f1", Length__c: 3 }]
    });
  });

  it("tells a table with weeks when its save failed", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    saveRowsAndWeeks.mockRejectedValue({ body: { message: "No." } });
    const element = await render();
    const onFailure = jest.fn();
    q(element, 'c-shoresh-editable-table[data-id="activities"]').dispatchEvent(
      new CustomEvent("save", {
        detail: { records: [], weeksOff: [], weeksBackOn: ["x1"], onFailure }
      })
    );
    await flush();
    expect(onFailure).toHaveBeenCalled();
    expect(q(element, '[data-id="error"]').textContent).toContain("No.");
  });

  describe("the menu", () => {
    it("lands on Roots and shows one screen at a time", async () => {
      getCamps.mockResolvedValue([CAMP]);
      getSeasons.mockResolvedValue([SEASON]);
      getSeasonSetup.mockResolvedValue(setupWith());
      const element = await render();
      expect(shownScreens(element)).toEqual(["roots"]);
      const screens = [
        "weeks",
        "programs",
        "divisions",
        "groups",
        "timeBlocks",
        "locations",
        "campWords",
        "activities",
        "fixedActivities",
        "recurringActivities",
        "schedules",
        "roots"
      ];
      // One after another, as a director clicks down the menu.
      await screens.reduce(
        (done, screen) =>
          done.then(async () => {
            await openScreen(element, screen);
            expect(shownScreens(element)).toEqual([screen]);
            expect(q(element, "c-shoresh-menu").current).toBe(screen);
          }),
        Promise.resolve()
      );
    });

    it("uses the camp's words and lists what is coming", async () => {
      getCamps.mockResolvedValue([CAMP]);
      getSeasons.mockResolvedValue([SEASON]);
      getSeasonSetup.mockResolvedValue(setupWith());
      const element = await render();
      const items = q(element, "c-shoresh-menu").sections.flatMap((section) =>
        section.items.map((item) => [item.label, item.coming])
      );
      expect(items).toContainEqual(["Bunks", false]);
      expect(items).toContainEqual(["Fixed activities", false]);
      expect(items).toContainEqual(["Recurring activities", false]);
      expect(items).toContainEqual(["Special events", true]);
      expect(items).toContainEqual(["Schedules", false]);
    });

    it("opens the screen a Roots card or attention item points to", async () => {
      getCamps.mockResolvedValue([CAMP]);
      getSeasons.mockResolvedValue([SEASON]);
      getSeasonSetup.mockResolvedValue(setupWith());
      const element = await render();
      q(element, "c-shoresh-roots").dispatchEvent(
        new CustomEvent("navigate", { detail: { screen: "groups" } })
      );
      await flush();
      expect(shownScreens(element)).toEqual(["groups"]);
      // A screen not built yet does not open.
      q(element, "c-shoresh-roots").dispatchEvent(
        new CustomEvent("navigate", { detail: { screen: "specialEvents" } })
      );
      await flush();
      expect(shownScreens(element)).toEqual(["groups"]);
    });

    it("keeps unsaved typing when the director goes to another screen and back", async () => {
      getCamps.mockResolvedValue([CAMP]);
      getSeasons.mockResolvedValue([SEASON]);
      getSeasonSetup.mockResolvedValue(setupWith());
      const element = await render();
      await openScreen(element, "weeks");
      const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');
      const name = weeks.shadowRoot.querySelector(
        'lightning-input[data-field="Name"]'
      );
      name.value = "First week";
      name.dispatchEvent(
        new CustomEvent("change", { detail: { value: "First week" } })
      );
      await flush();
      await openScreen(element, "groups");
      await openScreen(element, "weeks");
      expect(
        q(
          element,
          'c-shoresh-editable-table[data-id="weeks"]'
        ).shadowRoot.querySelector('lightning-input[data-field="Name"]').value
      ).toBe("First week");
      expect(button(weeks, "Save changes").disabled).toBe(false);
    });

    it("before the first season, only camp words opens", async () => {
      getCamps.mockResolvedValue([CAMP]);
      getSeasons.mockResolvedValue([]);
      const element = await render();
      expect(element.shadowRoot.textContent).toContain("Start a new season");
      const menu = q(element, "c-shoresh-menu");
      const open = menu.sections
        .flatMap((section) => section.items)
        .filter((item) => !item.disabled)
        .map((item) => item.key);
      expect(open).toEqual(["campWords"]);
      await openScreen(element, "campWords");
      expect(shownScreens(element)).toEqual(["campWords"]);
      expect(element.shadowRoot.textContent).not.toContain(
        "Start a new season"
      );
      button(element, "New season").click();
      await flush();
      expect(element.shadowRoot.textContent).toContain("Start a new season");
    });
  });
});
