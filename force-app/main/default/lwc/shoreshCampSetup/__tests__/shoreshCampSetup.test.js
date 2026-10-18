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
import placedInWeeks from "@salesforce/apex/RunsInController.placedInWeeks";
import { bareName, bareRecord, nsRecord } from "shoresh-jest/namespace";

/** Every call an Apex mock got, as the screen sent it, with bare names (bareRecord checks). */
const sentTo = (mock) => mock.mock.calls.map((call) => bareRecord(call[0]));

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
jest.mock(
  "@salesforce/apex/RunsInController.placedInWeeks",
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
    getLabels.mockResolvedValue(nsRecord(LABELS));
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("asks a first-time director to name their camp", async () => {
    getCamps
      .mockResolvedValueOnce(nsRecord([]))
      .mockResolvedValueOnce(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([]));
    saveRecords.mockResolvedValue(nsRecord(["c1"]));
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
    expect(sentTo(saveRecords)).toContainEqual({
      records: [{ sobjectType: "Camp__c", Name: "Camp Willow" }]
    });
    expect(element.shadowRoot.textContent).toContain("Start a new season");
  });

  it("creates a season for the camp", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons
      .mockResolvedValueOnce(nsRecord([]))
      .mockResolvedValue(nsRecord([SEASON]));
    saveRecords.mockResolvedValue(nsRecord(["s1"]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith({ weeks: [] })));
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
    await flush();
    // The form shows what was typed.
    expect(
      [
        ...element.shadowRoot.querySelectorAll(
          'lightning-input[data-form="new-season"]'
        )
      ].map((f) => f.value)
    ).toEqual(["Summer 2026", "2026-06-29", "2026-08-07"]);
    validAll(element);
    button(element, "Create season").click();
    await flush();
    await flush();

    expect(sentTo(saveRecords)).toContainEqual({
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
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
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
    expect(bareRecord(weeks.newRowDefaults)).toEqual({
      Season__c: "s1",
      Name: "Week {n}"
    });
    // Overlapping weeks get a heads-up, in the camp's word.
    expect(weeks.overlapLabel).toBe("Overlaps another week");
    expect(button(element, "Copy this season")).toBeDefined();
  });

  it("fills in weeks from the season dates", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith({ weeks: [] })));
    addWeeksFromSeasonDates.mockResolvedValue();
    const element = await render();
    q(element, '[data-id="fill-weeks"]').click();
    await flush();
    expect(addWeeksFromSeasonDates).toHaveBeenCalledWith({ seasonId: "s1" });
    expect(getSeasonSetup).toHaveBeenCalledTimes(2);
  });

  it("saves what a table sends and shows a server refusal", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    saveRecords.mockRejectedValueOnce({
      body: { message: '"Week 1" already starts on 6/29/2026.' }
    });
    const element = await render();
    const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');
    weeks.dispatchEvent(
      new CustomEvent("save", {
        detail: nsRecord({
          records: [{ sobjectType: "Week__c", Name: "Extra" }]
        })
      })
    );
    await flush();
    expect(sentTo(saveRecords)).toContainEqual({
      records: [{ sobjectType: "Week__c", Name: "Extra" }]
    });
    expect(q(element, '[data-id="error"]').textContent).toContain(
      "already starts on"
    );
  });

  it("adds a program", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith({ programs: [] })));
    saveRecords.mockResolvedValue(nsRecord(["p1"]));
    const element = await render();
    q(element, '[data-id="add-program"]').click();
    await flush();
    expect(sentTo(saveRecords)).toContainEqual({
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
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    deleteRecord.mockResolvedValue();
    const element = await render();
    const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');

    LightningConfirm.open.mockResolvedValueOnce(nsRecord(false));
    weeks.dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "w1", name: "Week 1" } })
    );
    await flush();
    expect(deleteRecord).not.toHaveBeenCalled();

    LightningConfirm.open.mockResolvedValueOnce(nsRecord(true));
    weeks.dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "w1", name: "Week 1" } })
    );
    await flush();
    expect(deleteRecord).toHaveBeenCalledWith({ recordId: "w1" });
  });

  it("deleting a week says which saved versions go with it", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(
      nsRecord(
        setupWith({
          schedules: [
            { Id: "s1", Week__c: "w1", Program__c: "p1", Status__c: "Version" },
            { Id: "s2", Week__c: "w1", Program__c: "p1", Status__c: "Version" },
            {
              Id: "s3",
              Week__c: "w1",
              Program__c: "p1",
              Status__c: "Published"
            },
            {
              Id: "s4",
              Week__c: "w1",
              Program__c: "p1",
              Status__c: "Draft",
              Origin__c: "Manual"
            }
          ]
        })
      )
    );
    const element = await render();
    LightningConfirm.open.mockResolvedValue(nsRecord(false));
    q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "w1", name: "Week 1" } })
    );
    await flush();
    expect(LightningConfirm.open.mock.calls[0][0].message).toContain(
      "That includes its Manual Build and 2 saved versions."
    );
  });

  it("deleting a season names everything that goes with it", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    LightningConfirm.open.mockResolvedValue(nsRecord(true));
    deleteRecord.mockResolvedValue();
    const element = await render();
    button(element, "Delete season").click();
    await flush();
    expect(LightningConfirm.open.mock.calls[0][0].message).toContain("Bunks");
    expect(deleteRecord).toHaveBeenCalledWith({ recordId: "s1" });
  });

  it("edits the season dates and saves only the season", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    saveRecords.mockResolvedValue(nsRecord(["s1"]));
    const element = await render();
    expect(button(element, "Save season").disabled).toBe(true);
    const end = element.shadowRoot.querySelector(
      'lightning-input[data-form="season"][data-field="end"]'
    );
    end.dispatchEvent(
      new CustomEvent("change", { detail: { value: "2026-08-14" } })
    );
    await flush();
    validAll(element);
    button(element, "Save season").click();
    await flush();
    expect(bareRecord(saveRecords.mock.calls[0][0].records)[0]).toEqual({
      sobjectType: "Season__c",
      Id: "s1",
      Name: "Summer 2026",
      StartDate__c: "2026-06-29",
      EndDate__c: "2026-08-14",
      Status__c: "Planning"
    });
  });

  it("shows the saved season in its form, and a changed status is saved", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    saveRecords.mockResolvedValue(nsRecord(["s1"]));
    const element = await render();
    const input = (field) =>
      element.shadowRoot.querySelector(
        `[data-form="season"][data-field="${field}"]`
      );
    expect(
      ["name", "start", "end", "status"].map((field) => input(field).value)
    ).toEqual(["Summer 2026", "2026-06-29", "2026-08-07", "Planning"]);
    input("status").dispatchEvent(
      new CustomEvent("change", { detail: { value: "Active" } })
    );
    await flush();
    validAll(element);
    button(element, "Save season").click();
    await flush();
    expect(bareRecord(saveRecords.mock.calls[0][0].records)[0]).toMatchObject({
      Status__c: "Active"
    });
  });

  it("renames a season and saves the new name with its dates", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    saveRecords.mockResolvedValue(nsRecord(["s1"]));
    const element = await render();
    element.shadowRoot
      .querySelector('[data-form="season"][data-field="name"]')
      .dispatchEvent(
        new CustomEvent("change", {
          detail: { value: "Summer 2026 (day camp)" }
        })
      );
    await flush();
    validAll(element);
    button(element, "Save season").click();
    await flush();
    expect(bareRecord(saveRecords.mock.calls[0][0].records)[0]).toEqual({
      sobjectType: "Season__c",
      Id: "s1",
      Name: "Summer 2026 (day camp)",
      StartDate__c: "2026-06-29",
      EndDate__c: "2026-08-07",
      Status__c: "Planning"
    });
  });

  it("says which season a copy came from", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(
      nsRecord(
        setupWith({
          season: { ...SEASON, CopiedFrom__r: { Name: "Summer 2025" } }
        })
      )
    );
    const element = await render();
    expect(q(element, '[data-id="copied-from"]').textContent).toContain(
      "Summer 2025"
    );
  });

  it("deleting a program says which saved versions go with it", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(
      nsRecord(
        setupWith({
          schedules: [
            { Id: "v1", Week__c: "w9", Program__c: "p1", Status__c: "Version" }
          ]
        })
      )
    );
    const element = await render();
    await openScreen(element, "programs");
    LightningConfirm.open.mockResolvedValue(false);
    q(element, "c-shoresh-program").dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "p1", name: "Main" } })
    );
    await flush();
    expect(LightningConfirm.open.mock.calls[0][0].message).toContain(
      "That includes 1 saved version."
    );
  });

  it("gives each table its own object, columns, and new-row values", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(
      nsRecord(setupWith({ locationTypes: [], locations: [], activities: [] }))
    );
    const element = await render();
    const table = (id) =>
      q(element, `c-shoresh-editable-table[data-id="${id}"]`);
    const shape = (t) => ({
      object: bareName(t.objectApiName),
      columns: t.columns.map((c) => bareName(c.fieldName)),
      defaults: bareRecord(t.newRowDefaults)
    });
    expect(shape(table("weeks"))).toEqual({
      object: "Week__c",
      columns: ["Name", "StartDate__c", "EndDate__c"],
      defaults: { Season__c: "s1", Name: "Week {n}" }
    });
    await openScreen(element, "locations");
    expect(shape(table("location-types"))).toMatchObject({
      object: "LocationType__c",
      defaults: { Season__c: "s1" }
    });
    expect(shape(table("locations"))).toMatchObject({
      object: "Location__c",
      columns: ["Name", "LocationType__c", "GroupsThatFit__c", "Notes__c"],
      defaults: { Season__c: "s1", GroupsThatFit__c: 1 }
    });
    expect(bareName(table("locations").filterField)).toBe("LocationType__c");
    await openScreen(element, "activities");
    expect(shape(table("activities"))).toEqual({
      object: "Activity__c",
      columns: [
        "Name",
        "Location__c",
        "Length__c",
        "TimesPerWeekMin__c",
        "TimesPerWeekMax__c",
        "NoWeeklyMax__c",
        "Priority__c",
        "Outdoor__c",
        "RainPlan__c",
        "GroupsAtOnce__c",
        "NoGroupLimit__c"
      ],
      defaults: {
        Season__c: "s1",
        Name: "Activity {n}",
        Length__c: 1,
        TimesPerWeekMin__c: 1,
        TimesPerWeekMax__c: 1,
        Priority__c: "Low",
        Outdoor__c: false,
        GroupsAtOnce__c: 1,
        NoWeeklyMax__c: false,
        NoGroupLimit__c: false
      }
    });
  });

  it("opens the copy panel, and camp words from the menu", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
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
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(
      nsRecord([SEASON, { ...SEASON, Id: "s2", Name: "Summer 2027" }])
    );
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
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
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    saveRecords.mockRejectedValueOnce({ body: { message: "No." } });
    const element = await render();
    const onFailure = jest.fn();
    q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
      new CustomEvent("save", {
        detail: nsRecord({ records: [{ Name: "x" }], onFailure })
      })
    );
    await flush();
    expect(onFailure).toHaveBeenCalled();
  });

  it("flags same names on the season's location types, locations, and activities only", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith({})));
    const element = await render();
    const flagged = (id) =>
      q(element, `c-shoresh-editable-table[data-id="${id}"]`).flagSameNames;
    expect(flagged("location-types")).toBe(true);
    expect(flagged("locations")).toBe(true);
    expect(flagged("activities")).toBe(true);
    expect(flagged("weeks")).toBeFalsy();
  });

  it("saves a table's rows with its Runs in weeks, and reloads", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(
      nsRecord(
        setupWith({
          weekExceptions: [{ Id: "x1", Week__c: "w1", Location__c: "l1" }]
        })
      )
    );
    saveRowsAndWeeks.mockResolvedValue(nsRecord([]));
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
        detail: nsRecord({
          records: [{ sobjectType: "Location__c", Name: "Pool" }],
          weeksOff: [{ row: 0, week: "w1" }],
          weeksBackOn: ["x1"]
        })
      })
    );
    await flush();
    expect(sentTo(saveRowsAndWeeks)).toContainEqual({
      records: [{ sobjectType: "Location__c", Name: "Pool" }],
      weeksOff: [{ row: 0, week: "w1" }],
      weeksBackOn: ["x1"]
    });
    expect(saveRecords).not.toHaveBeenCalled();
    expect(getSeasonSetup).toHaveBeenCalledTimes(2);
  });

  it("saves recurring activities with their weeks and who each covers, and shows a refusal", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    saveRowsWeeksAndWho.mockResolvedValue(nsRecord([]));
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
    recurring.dispatchEvent(
      new CustomEvent("save", {
        detail: nsRecord(detail)
      })
    );
    await flush();
    expect(sentTo(saveRowsWeeksAndWho)).toContainEqual({
      records: detail.records,
      extras: { weeksOff: [], weeksBackOn: [], who: detail.who }
    });
    expect(saveRowsAndWeeks).not.toHaveBeenCalled();

    const refusal =
      '"Flagpole" and "Swim" would both have Bunk 1 in Period 1 on Monday in Week 1.';
    saveRowsWeeksAndWho.mockRejectedValue({ body: { message: refusal } });
    const onFailure = jest.fn();
    recurring.dispatchEvent(
      new CustomEvent("save", {
        detail: nsRecord({ ...detail, onFailure })
      })
    );
    await flush();
    expect(onFailure).toHaveBeenCalled();
    // What didn't save and that nothing typed was lost, then why (desktop error shape).
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(
      `Recurring activities not saved. Your changes are still here. ${refusal}`
    );
  });

  it("offers a changed fixed activity's fixes in Needs attention, and saves the one chosen", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(
      nsRecord(
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
      )
    );
    saveRecords.mockResolvedValue(nsRecord(["f1"]));
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
    expect(sentTo(saveRecords)).toContainEqual({
      records: [{ sobjectType: "FixedActivity__c", Id: "f1", Length__c: 3 }]
    });
  });

  describe("turning something off for a week it is placed in (desktop ExclusionConfirmDialog)", () => {
    const withBunk = () =>
      setupWith({
        programs: [
          {
            program: { Id: "p1", Name: "Main", Monday__c: true },
            timeBlocks: [{ Id: "t1", Name: "Period 1" }],
            divisions: [
              {
                division: { Id: "d1", Name: "Juniors" },
                groups: [{ Id: "g3", Name: "Bunk 3" }]
              }
            ]
          }
        ],
        activities: [{ Id: "a1", Name: "Swim" }]
      });
    const turnOff = (element, weeksOff, onFailure) => {
      q(element, '[data-screen="groups"] c-shoresh-program').dispatchEvent(
        new CustomEvent("save", {
          detail: nsRecord({
            records: [],
            weeksOff,
            weeksBackOn: [],
            onFailure
          })
        })
      );
    };

    beforeEach(() => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(withBunk()));
      saveRowsAndWeeks.mockResolvedValue(nsRecord([]));
    });

    it("asks first, in the desktop's words, and Turn off anyway saves", async () => {
      placedInWeeks.mockResolvedValue([{ target: "g3", week: "w1", slots: 4 }]);
      const element = await render();
      turnOff(element, [{ target: "g3", week: "w1" }]);
      await flush();
      expect(sentTo(placedInWeeks)).toEqual([
        { weeksOff: [{ target: "g3", week: "w1" }] }
      ]);
      const ask = q(element, "c-shoresh-ask");
      expect(ask.heading).toBe('Turn off "Bunk 3" for Week 1?');
      expect(ask.lines).toEqual([
        "Placed in 4 slots in Week 1.",
        "They stay until you change them."
      ]);
      expect(ask.confirmLabel).toBe("Turn off anyway");
      expect(saveRowsAndWeeks).not.toHaveBeenCalled();
      ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: true } }));
      await flush();
      expect(q(element, "c-shoresh-ask")).toBeNull();
      expect(sentTo(saveRowsAndWeeks)).toEqual([
        {
          records: [],
          weeksOff: [{ target: "g3", week: "w1" }],
          weeksBackOn: []
        }
      ]);
    });

    it("Cancel saves nothing and keeps the typing", async () => {
      placedInWeeks.mockResolvedValue([{ target: "g3", week: "w1", slots: 1 }]);
      const element = await render();
      const onFailure = jest.fn();
      turnOff(element, [{ target: "g3", week: "w1" }], onFailure);
      await flush();
      const ask = q(element, "c-shoresh-ask");
      expect(ask.lines[0]).toBe("Placed in 1 slot in Week 1.");
      ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: false } }));
      await flush();
      expect(saveRowsAndWeeks).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalled();
    });

    it("with nothing placed, switches off without asking", async () => {
      placedInWeeks.mockResolvedValue([]);
      const element = await render();
      turnOff(element, [{ target: "g3", week: "w1" }]);
      await flush();
      expect(q(element, "c-shoresh-ask")).toBeNull();
      expect(saveRowsAndWeeks).toHaveBeenCalled();
    });

    it("a new row has nothing placed, so it isn't counted", async () => {
      const element = await render();
      turnOff(element, [{ row: 0, week: "w1" }]);
      await flush();
      expect(placedInWeeks).not.toHaveBeenCalled();
      expect(saveRowsAndWeeks).toHaveBeenCalled();
    });

    it("several at once are listed in one question", async () => {
      placedInWeeks.mockResolvedValue([
        { target: "g3", week: "w1", slots: 2 },
        { target: "a1", week: "w1", slots: 3 }
      ]);
      const element = await render();
      turnOff(element, [
        { target: "g3", week: "w1" },
        { target: "a1", week: "w1" }
      ]);
      await flush();
      const ask = q(element, "c-shoresh-ask");
      expect(ask.heading).toBe("Turn these off?");
      expect(ask.lines).toEqual([
        '"Bunk 3": placed in 2 slots in Week 1.',
        '"Swim": placed in 3 slots in Week 1.',
        "They stay until you change them."
      ]);
    });
  });

  it("a save that worked but whose refresh failed never says it wasn't saved", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValueOnce(nsRecord(setupWith()));
    saveRowsAndWeeks.mockResolvedValue(nsRecord([]));
    const element = await render();
    getSeasonSetup.mockRejectedValue({ body: { message: "Offline." } });
    const onFailure = jest.fn();
    q(element, 'c-shoresh-editable-table[data-id="locations"]').dispatchEvent(
      new CustomEvent("save", {
        detail: nsRecord({
          records: [{ sobjectType: "Location__c", Name: "Pool" }],
          weeksOff: [],
          weeksBackOn: [],
          onFailure
        })
      })
    );
    await flush();
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(
      "Done, but the screen couldn't show it yet. Reload the page. Offline."
    );
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("tells a table with weeks when its save failed", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    saveRowsAndWeeks.mockRejectedValue({ body: { message: "No." } });
    const element = await render();
    const onFailure = jest.fn();
    q(element, 'c-shoresh-editable-table[data-id="activities"]').dispatchEvent(
      new CustomEvent("save", {
        detail: nsRecord({
          records: [],
          weeksOff: [],
          weeksBackOn: ["x1"],
          onFailure
        })
      })
    );
    await flush();
    expect(onFailure).toHaveBeenCalled();
    expect(q(element, '[data-id="error"]').textContent).toContain("No.");
  });

  describe("the menu", () => {
    it("lands on Roots and shows one screen at a time", async () => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
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
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
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
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
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
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
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
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([]));
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
