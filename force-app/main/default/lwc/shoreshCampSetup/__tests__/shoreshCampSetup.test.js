import { createElement } from "lwc";
import ShoreshCampSetup from "c/shoreshCampSetup";
import LightningConfirm from "lightning/confirm";
import getCamps from "@salesforce/apex/SeasonSetupController.getCamps";
import getSeasons from "@salesforce/apex/SeasonSetupController.getSeasons";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import getSeasonSetup from "@salesforce/apex/SeasonSetupController.getSeasonSetup";
import saveRecords from "@salesforce/apex/SeasonSetupController.saveRecords";
import deleteRecord from "@salesforce/apex/SeasonSetupController.deleteRecord";
import addWeeksFromSeasonDates from "@salesforce/apex/SeasonSetupController.addWeeksFromSeasonDates";

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
  "@salesforce/apex/SeasonSetupController.getSeasonSetup",
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
    expect(getSeasonSetup).toHaveBeenCalledWith({ seasonId: "s1" });
    expect(q(element, '[data-id="fill-weeks"]')).not.toBeNull();
  });

  it("shows the season in the camp words, with its problems", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    const element = await render();

    expect(q(element, '[data-id="camp-name-heading"]').textContent).toBe(
      "Camp Willow"
    );
    expect(q(element, "c-shoresh-program").terms.p("Group")).toBe("Bunks");
    expect(q(element, '[data-id="problems"]').textContent).toContain(
      '"Juniors" has no Bunks yet.'
    );
    const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');
    expect(weeks.addLabel).toBe("Add Week");
    expect(weeks.newRowDefaults).toEqual({ Season__c: "s1", Name: "Week 2" });
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

  it("opens the copy panel and the camp words panel", async () => {
    getCamps.mockResolvedValue([CAMP]);
    getSeasons.mockResolvedValue([SEASON]);
    getSeasonSetup.mockResolvedValue(setupWith());
    const element = await render();
    button(element, "Copy this season").click();
    await flush();
    expect(q(element, "c-shoresh-copy-season")).not.toBeNull();

    q(element, "c-shoresh-copy-season").dispatchEvent(
      new CustomEvent("cancel")
    );
    await flush();
    button(element, "Camp words").click();
    await flush();
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
    expect(getSeasonSetup).toHaveBeenLastCalledWith({ seasonId: "s2" });
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
});
