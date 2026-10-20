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
import saveRow from "@salesforce/apex/SetupTablesController.saveRow";
import scheduleUses from "@salesforce/apex/SetupTablesController.scheduleUses";
import mergeLocations from "@salesforce/apex/SetupTablesController.mergeLocations";
import placedInWeeks from "@salesforce/apex/RunsInController.placedInWeeks";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import saveActivityDetails from "@salesforce/apex/ActivitiesController.saveActivityDetails";
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
jest.mock("@salesforce/apex/ImportController.undoImport", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ActivitiesController.saveActivityDetails",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/RunsInController.placedInWeeks", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SetupTablesController.saveRow", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SetupTablesController.scheduleUses", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/SetupTablesController.mergeLocations",
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
    await expect(element).toBeAccessible();

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
    expect(bareRecord(weeks.newRowDefaults)).toEqual({ Season__c: "s1" });
    // Overlapping weeks get a heads-up, in the camp's word.
    expect(weeks.overlapLabel).toBe("Overlaps another week");
    expect(button(element, "Copy this season")).toBeDefined();
  });

  it("the Bunks screen's problems and table are accessible", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const element = await render();
    await openScreen(element, "groups");
    // Only these two parts: axe over the whole setup screen takes about 5 s on its own.
    await expect(q(element, '[data-id="problems"]')).toBeAccessible();
    // The Bunks screen itself: the other screens are on the page too, hidden.
    await expect(q(element, '[data-screen="groups"]')).toBeAccessible();
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

  it("deleting a bunk or activity some schedules use says how many first", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    deleteRecord.mockResolvedValue();
    const element = await render();
    const activities = q(
      element,
      'c-shoresh-editable-table[data-id="activities"]'
    );
    const asked = async (count, name = "Swim") => {
      if (count instanceof Error) {
        scheduleUses.mockRejectedValueOnce({ body: { message: "No" } });
      } else {
        scheduleUses.mockResolvedValueOnce(count);
      }
      LightningConfirm.open.mockResolvedValueOnce(false);
      activities.dispatchEvent(
        new CustomEvent("delete", { detail: { recordId: "a1", name } })
      );
      await flush();
      await flush();
      const calls = LightningConfirm.open.mock.calls;
      return calls[calls.length - 1][0];
    };
    scheduleUses.mockResolvedValueOnce({ schedules: 2, complete: true });
    let busyWhenAsked;
    LightningConfirm.open.mockImplementationOnce(() => {
      busyWhenAsked = activities.busy;
      return Promise.resolve(true);
    });
    activities.dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "g3", name: "Bunk 3" } })
    );
    await flush();
    await flush();
    expect(scheduleUses).toHaveBeenCalledWith({ recordId: "g3" });
    expect(LightningConfirm.open.mock.calls[0][0]).toMatchObject({
      label: 'Delete "Bunk 3"?',
      message: "Bunk 3 is in 2 schedules. Delete anyway?"
    });
    expect(deleteRecord).toHaveBeenCalledWith({ recordId: "g3" });
    // The question opens without making the page busy: Cancel gives focus back to the row.
    expect(busyWhenAsked).toBe(false);

    expect((await asked({ schedules: 1, complete: true })).message).toBe(
      "Swim is in 1 schedule. Delete anyway?"
    );
    // A season too big to read whole: never a number that might be short.
    expect((await asked({ schedules: 3, complete: false })).message).toBe(
      "Swim is in 3 or more schedules. Delete anyway?"
    );
    // Couldn't count at all, or not all of it: said so, never left out quietly.
    expect((await asked({ schedules: 0, complete: false })).message).toBe(
      "Shoresh couldn't count the schedules Swim is in. Delete anyway?"
    );
    expect((await asked(new Error("refused"))).message).toBe(
      "Shoresh couldn't count the schedules Swim is in. Delete anyway?"
    );
    // In no schedule: the usual question.
    expect((await asked({ schedules: 0, complete: true })).message).toContain(
      'Delete "Swim"?'
    );
    expect(deleteRecord).toHaveBeenCalledTimes(1);
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
            },
            {
              Id: "s5",
              Week__c: "w1",
              Program__c: "p1",
              Status__c: "Draft",
              Origin__c: "Generated"
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
      "That includes its Manual Build, its Generated Schedule and 2 saved versions."
    );
  });

  describe("the season, beside its picker", () => {
    async function renderSeason(setup = setupWith()) {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setup));
      saveRecords.mockResolvedValue(nsRecord(["s1"]));
      const element = await render();
      q(element, '[data-id="edit-season"]').click();
      await flush();
      return element;
    }
    const seasonInput = (element, field) =>
      q(element, `lightning-input[data-form="season"][data-field="${field}"]`);
    function typeSeason(element, field, value) {
      const input = seasonInput(element, field);
      input.reportValidity = () => true;
      input.value = value;
      input.dispatchEvent(new CustomEvent("change", { detail: { value } }));
    }
    const leaveSeason = (element, field) =>
      seasonInput(element, field).dispatchEvent(new CustomEvent("focusout"));
    const seasonMark = (element) =>
      q(
        element,
        'c-shoresh-saved-mark[data-id="season-saved"]'
      ).shadowRoot.querySelector('[data-id="saved"]');

    it("opens from the pencil beside the picker, not on the Weeks screen, and has no Status", async () => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
      const element = await render();
      const pencil = q(element, '[data-id="edit-season"]');
      expect(pencil.alternativeText).toBe("Edit Summer 2026");
      expect(pencil.ariaExpanded).toBe("false");
      expect(q(element, '[data-id="season-form"]')).toBeNull();
      await openScreen(element, "weeks");
      expect(
        q(element, '[data-screen="weeks"] [data-form="season"]')
      ).toBeNull();
      expect(button(element, "Delete season")).toBeUndefined();

      pencil.click();
      await flush();
      expect(pencil.ariaExpanded).toBe("true");
      expect(
        [
          ...element.shadowRoot.querySelectorAll(
            '[data-id="season-form"] [data-field]'
          )
        ].map((input) => [input.dataset.field, input.value])
      ).toEqual([
        ["name", "Summer 2026"],
        ["start", "2026-06-29"],
        ["end", "2026-08-07"]
      ]);
      expect(element.shadowRoot.textContent).not.toContain("Status");
      expect(button(element, "Save season")).toBeUndefined();
      // The box alone: the whole page (every screen) is too slow to check here.
      await expect(q(element, '[data-id="season-form"]')).toBeAccessible();

      pencil.click();
      await flush();
      expect(q(element, '[data-id="season-form"]')).toBeNull();
    });

    it("deleting it names everything that goes with it", async () => {
      LightningConfirm.open.mockResolvedValue(nsRecord(true));
      deleteRecord.mockResolvedValue();
      const element = await renderSeason();
      button(element, "Delete season").click();
      await flush();
      expect(LightningConfirm.open.mock.calls[0][0].message).toContain("Bunks");
      expect(deleteRecord).toHaveBeenCalledWith({ recordId: "s1" });
    });

    it("a date saves when the director leaves it, alone, with no toast", async () => {
      const element = await renderSeason();
      const toasts = [];
      element.addEventListener("lightning__showtoast", (e) => toasts.push(e));
      typeSeason(element, "end", "2026-08-14");
      await flush();
      expect(saveRecords).not.toHaveBeenCalled();
      leaveSeason(element, "end");
      await flush();
      expect(bareRecord(saveRecords.mock.calls[0][0].records)).toEqual([
        { sobjectType: "Season__c", Id: "s1", EndDate__c: "2026-08-14" }
      ]);
      expect(toasts).toEqual([]);
      expect(seasonMark(element).textContent).toContain("Saved");
      expect(seasonMark(element).getAttribute("role")).toBe("status");
    });

    it("a new name saves on leaving (or Enter) and shows in the season picker", async () => {
      const element = await renderSeason();
      getSeasons.mockResolvedValue(
        nsRecord([{ ...SEASON, Name: "Summer 2026 (day camp)" }])
      );
      typeSeason(element, "name", "Summer 2026 (day camp)");
      seasonInput(element, "name").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter" })
      );
      await flush();
      expect(bareRecord(saveRecords.mock.calls[0][0].records)).toEqual([
        { sobjectType: "Season__c", Id: "s1", Name: "Summer 2026 (day camp)" }
      ]);
      expect(
        q(element, '[data-id="season-picker"]').options.map((o) => o.label)
      ).toEqual(["Summer 2026 (day camp)"]);
      // Leaving it afterwards, unchanged, sends nothing more.
      leaveSeason(element, "name");
      await flush();
      expect(saveRecords).toHaveBeenCalledTimes(1);
    });

    it("a blank or impossible value is not sent", async () => {
      const element = await renderSeason();
      typeSeason(element, "name", "");
      seasonInput(element, "name").reportValidity = () => false;
      leaveSeason(element, "name");
      await flush();
      expect(saveRecords).not.toHaveBeenCalled();
    });

    it("a refusal shows under the field in camp words, keeps the typing, and leaving again retries", async () => {
      const element = await renderSeason();
      saveRecords.mockRejectedValueOnce({
        body: { message: "The last day can't be before the first day." }
      });
      typeSeason(element, "end", "2026-06-01");
      leaveSeason(element, "end");
      await flush();
      const why = q(element, '[data-error="season-end"]');
      expect(why.textContent).toContain(
        "Season not saved. Your changes are still here."
      );
      expect(why.textContent).toContain("can't be before the first day");
      expect(why.getAttribute("role")).toBe("alert");
      // Not at the top of the page: it is next to the field it is about.
      expect(q(element, '[data-id="error"]')).toBeNull();
      expect(seasonInput(element, "end").value).toBe("2026-06-01");
      expect(seasonMark(element).textContent).toBe("");
      leaveSeason(element, "end");
      await flush();
      expect(saveRecords).toHaveBeenCalledTimes(2);
    });

    it("typing in one field survives the reload after another field's save", async () => {
      const element = await renderSeason();
      getSeasonSetup.mockResolvedValue(
        nsRecord(
          setupWith({ season: { ...SEASON, StartDate__c: "2026-06-22" } })
        )
      );
      typeSeason(element, "start", "2026-06-22");
      leaveSeason(element, "start");
      typeSeason(element, "name", "Half typed");
      await flush();
      expect(getSeasonSetup).toHaveBeenCalledTimes(2);
      expect(seasonInput(element, "name").value).toBe("Half typed");
      expect(seasonInput(element, "start").value).toBe("2026-06-22");
    });

    it("says which season a copy came from", async () => {
      const element = await renderSeason(
        setupWith({
          season: { ...SEASON, CopiedFrom__r: { Name: "Summer 2025" } }
        })
      );
      expect(q(element, '[data-id="copied-from"]').textContent).toContain(
        "Summer 2025"
      );
    });
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
      defaults: { Season__c: "s1" }
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

  /** A table's row save as the table sends it, with its callbacks watched. */
  function rowSave(fields) {
    const calls = [];
    const note = (name) =>
      jest.fn((...args) => {
        calls.push(name);
        return args;
      });
    return {
      calls,
      detail: {
        seen: null,
        seenWho: null,
        extras: { weeksOff: [], weeksBackOn: [] },
        ...fields,
        onSaved: note("saved"),
        onFailure: note("failure"),
        onDone: note("done")
      }
    };
  }

  it("saves a table's row with its Runs in weeks, tells the table, then reloads", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(
      nsRecord(
        setupWith({
          weekExceptions: [{ Id: "x1", Week__c: "w1", Location__c: "l1" }]
        })
      )
    );
    saveRow.mockResolvedValue(nsRecord({ id: "l1", changed: [] }));
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
    const { detail, calls } = rowSave({
      record: { sobjectType: "Location__c", Id: "l1", Name: "Pool" },
      seen: { sobjectType: "Location__c", Name: "pool" },
      extras: { weeksOff: [{ target: "l1", week: "w1" }], weeksBackOn: [] }
    });
    getSeasonSetup.mockClear();
    locations.dispatchEvent(
      new CustomEvent("save", { detail: nsRecord(detail) })
    );
    await flush();
    await flush();
    expect(sentTo(saveRow)).toEqual([
      {
        record: { sobjectType: "Location__c", Id: "l1", Name: "Pool" },
        seen: { sobjectType: "Location__c", Name: "pool" },
        extras: {
          weeksOff: [{ target: "l1", week: "w1" }],
          weeksBackOn: [],
          seenWho: null
        }
      }
    ]);
    expect(calls).toEqual(["saved", "done"]);
    expect(bareRecord(detail.onSaved.mock.calls[0][0])).toEqual({
      id: "l1",
      changed: []
    });
    expect(getSeasonSetup).toHaveBeenCalledTimes(1);
    expect(saveRecords).not.toHaveBeenCalled();
  });

  /** A promise and the function that answers it, for answering server calls in any order. */
  function deferred() {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it("saves rows from two tables one after the other, tells the table before reloading, and never makes the page busy", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const element = await render();
    await openScreen(element, "locations");
    const order = [];
    const first = deferred();
    saveRow.mockImplementationOnce(() => {
      order.push("save 1");
      return first.promise;
    });
    saveRow.mockImplementationOnce(() => {
      order.push("save 2");
      return Promise.resolve(nsRecord({ id: "l1", changed: [] }));
    });
    getSeasonSetup.mockImplementation(() => {
      order.push("reload");
      return Promise.resolve(nsRecord(setupWith()));
    });
    const types = q(
      element,
      'c-shoresh-editable-table[data-id="location-types"]'
    );
    const locations = q(
      element,
      'c-shoresh-editable-table[data-id="locations"]'
    );
    const one = rowSave({
      record: { sobjectType: "LocationType__c", Id: "t1", Name: "Fields" }
    });
    one.detail.onSaved = jest.fn(() => order.push("table told"));
    const two = rowSave({
      record: { sobjectType: "Location__c", Id: "l1", Name: "Pool" }
    });
    types.dispatchEvent(
      new CustomEvent("save", { detail: nsRecord(one.detail) })
    );
    locations.dispatchEvent(
      new CustomEvent("save", { detail: nsRecord(two.detail) })
    );
    await flush();
    // The second waits for the first; buttons stay usable while rows save.
    expect(order).toEqual(["save 1"]);
    expect(types.busy).toBe(false);
    expect(locations.busy).toBe(false);
    first.resolve(nsRecord({ id: "t1", changed: [] }));
    await flush();
    await flush();
    expect(order).toEqual([
      "save 1",
      "table told",
      "reload",
      "save 2",
      "reload"
    ]);
    getSeasonSetup.mockReset();
  });

  it("an unexpected failure in one row's step is shown, and later rows still save", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    saveRow.mockResolvedValue(nsRecord({ id: "w1", changed: [] }));
    const element = await render();
    const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');
    const broken = rowSave({
      record: { sobjectType: "Week__c", Id: "w1", Name: "A" }
    });
    broken.detail.onDone = () => {
      throw new Error("boom");
    };
    weeks.dispatchEvent(
      new CustomEvent("save", { detail: nsRecord(broken.detail) })
    );
    await flush();
    weeks.dispatchEvent(
      new CustomEvent("save", {
        detail: nsRecord(
          rowSave({ record: { sobjectType: "Week__c", Id: "w1", Name: "B" } })
            .detail
        )
      })
    );
    await flush();
    expect(saveRow).toHaveBeenCalledTimes(2);
    saveRow.mockReset();
  });

  it("a table always hears its row is done, even if telling it of a failure goes wrong", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    saveRow.mockRejectedValueOnce({ body: { message: "No." } });
    const element = await render();
    const { detail } = rowSave({
      record: { sobjectType: "Week__c", Id: "w1", Name: "A" }
    });
    detail.onFailure = () => {
      throw new Error("boom");
    };
    detail.onDone = jest.fn();
    q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
      new CustomEvent("save", { detail: nsRecord(detail) })
    );
    await flush();
    expect(detail.onDone).toHaveBeenCalled();
  });

  it("a season read still on its way is dropped once another camp with no season is chosen", async () => {
    const other = { ...CAMP, Id: "c2", Name: "Camp Two" };
    getCamps.mockResolvedValue(nsRecord([CAMP, other]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const element = await render();
    let answer;
    getSeasonSetup.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    saveRow.mockResolvedValueOnce(nsRecord({ id: "w1", changed: [] }));
    q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
      new CustomEvent("save", {
        detail: nsRecord(
          rowSave({ record: { sobjectType: "Week__c", Id: "w1", Name: "A" } })
            .detail
        )
      })
    );
    await flush();
    getSeasons.mockResolvedValue(nsRecord([]));
    const camps = [
      ...element.shadowRoot.querySelectorAll("lightning-combobox")
    ].find((c) => c.label === "Camp");
    camps.dispatchEvent(new CustomEvent("change", { detail: { value: "c2" } }));
    await flush();
    answer(nsRecord(setupWith()));
    await flush();
    expect(q(element, 'c-shoresh-editable-table[data-id="weeks"]')).toBeNull();
    getSeasonSetup.mockReset();
  });

  it("an older read of the season that answers last is dropped", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const element = await render();
    await openScreen(element, "weeks");
    const older = deferred();
    const newer = deferred();
    getSeasonSetup
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    saveRow.mockResolvedValue(nsRecord({ id: "w1", changed: [] }));
    const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');
    // A save's reload, then a delete's reload, overlapping.
    weeks.dispatchEvent(
      new CustomEvent("save", {
        detail: nsRecord(
          rowSave({ record: { sobjectType: "Week__c", Id: "w1", Name: "A" } })
            .detail
        )
      })
    );
    await flush();
    LightningConfirm.open.mockResolvedValueOnce(true);
    deleteRecord.mockResolvedValueOnce();
    weeks.dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "w9", name: "Week 9" } })
    );
    await flush();
    const newest = setupWith({
      weeks: [
        {
          Id: "w1",
          Name: "Newest",
          StartDate__c: "2026-06-29",
          EndDate__c: "2026-07-03"
        }
      ]
    });
    newer.resolve(nsRecord(newest));
    await flush();
    older.resolve(nsRecord(setupWith()));
    await flush();
    expect(bareRecord(weeks.rows)[0].Name).toBe("Newest");
    getSeasonSetup.mockReset();
    saveRow.mockReset();
  });

  it("passes on what someone else changed, and still reloads", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const theirs = { changed: ["Name"], theirs: { Id: "w1", Name: "First" } };
    saveRow.mockResolvedValue(nsRecord(theirs));
    const element = await render();
    const { detail, calls } = rowSave({
      record: { sobjectType: "Week__c", Id: "w1", Name: "Week One" },
      seen: { sobjectType: "Week__c", Name: "Week 1" }
    });
    getSeasonSetup.mockClear();
    q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
      new CustomEvent("save", { detail: nsRecord(detail) })
    );
    await flush();
    await flush();
    expect(calls).toEqual(["saved", "done"]);
    expect(bareRecord(detail.onSaved.mock.calls[0][0])).toEqual(theirs);
    expect(getSeasonSetup).toHaveBeenCalledTimes(1);
  });

  it("a refused row: the table hears so, and the refusal shows", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const refusal =
      '"Flagpole" and "Swim" would both have Bunk 1 in Period 1 on Monday in Week 1.';
    saveRow.mockRejectedValue({ body: { message: refusal } });
    const element = await render();
    const recurring = q(
      element,
      'c-shoresh-program[data-id="recurring-activities"]'
    );
    expect(recurring.show).toBe("recurringActivities");
    const { detail, calls } = rowSave({
      record: { sobjectType: "RecurringActivity__c", Name: "Swim" },
      extras: {
        weeksOff: [],
        weeksBackOn: [],
        who: [{ row: 0, targets: ["d1"] }]
      }
    });
    getSeasonSetup.mockClear();
    recurring.dispatchEvent(
      new CustomEvent("save", { detail: nsRecord(detail) })
    );
    await flush();
    await flush();
    expect(sentTo(saveRow)[0].extras.who).toEqual([
      { row: 0, targets: ["d1"] }
    ]);
    expect(calls).toEqual(["failure", "done"]);
    // What didn't save and that nothing typed was lost, then why (desktop error shape).
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(
      `Recurring activities not saved. Your changes are still here. ${refusal}`
    );
  });

  it("a row that saved but whose refresh failed never says it wasn't saved", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValueOnce(nsRecord(setupWith()));
    saveRow.mockResolvedValue(nsRecord({ id: "l1", changed: [] }));
    const element = await render();
    getSeasonSetup.mockRejectedValue({ body: { message: "Offline." } });
    const { detail, calls } = rowSave({
      record: { sobjectType: "Location__c", Id: "l1", Name: "Pool" }
    });
    q(element, 'c-shoresh-editable-table[data-id="locations"]').dispatchEvent(
      new CustomEvent("save", { detail: nsRecord(detail) })
    );
    await flush();
    await flush();
    expect(calls).toEqual(["saved", "done"]);
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(
      "Done, but the screen couldn't show it yet. Reload the page. Offline."
    );
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
    // What every table with weeks asks before a saved row's week is unticked (#44's hook).
    const hookOf = (element) =>
      q(element, '[data-screen="groups"] c-shoresh-program').beforeWeekOff;

    beforeEach(() => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(withBunk()));
    });

    it("every table with weeks gets the same question", async () => {
      const element = await render();
      const hook = hookOf(element);
      expect(typeof hook).toBe("function");
      expect(
        q(element, 'c-shoresh-editable-table[data-id="locations"]')
          .beforeWeekOff
      ).toBe(hook);
      expect(
        q(element, 'c-shoresh-editable-table[data-id="activities"]')
          .beforeWeekOff
      ).toBe(hook);
    });

    it("asks first, in the desktop's words, and Turn off anyway goes ahead", async () => {
      placedInWeeks.mockResolvedValue([{ target: "g3", week: "w1", cells: 4 }]);
      const element = await render();
      const answer = hookOf(element)({
        recordId: "g3",
        name: "Bunk 3",
        weekId: "w1",
        weekName: "Week 1"
      });
      await flush();
      expect(sentTo(placedInWeeks)).toEqual([
        { weeksOff: [{ target: "g3", week: "w1" }] }
      ]);
      const ask = q(element, "c-shoresh-ask");
      expect(ask.heading).toBe('Turn off "Bunk 3" for Week 1?');
      expect(ask.lines).toEqual([
        "Placed in 4 cells in Week 1.",
        "They stay until you change them."
      ]);
      expect(ask.confirmLabel).toBe("Turn off anyway");
      ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: true } }));
      await flush();
      expect(q(element, "c-shoresh-ask")).toBeNull();
      await expect(answer).resolves.toBe(true);
    });

    it("Cancel answers no (the table puts the tick back); focus goes back to the tick", async () => {
      placedInWeeks.mockResolvedValue([{ target: "g3", week: "w1", cells: 1 }]);
      const element = await render();
      // Stands in for the tick, which had focus when it was clicked.
      const tick = document.createElement("input");
      tick.type = "checkbox";
      document.body.appendChild(tick);
      tick.focus();
      const answer = hookOf(element)({ recordId: "g3", weekId: "w1" });
      await flush();
      const ask = q(element, "c-shoresh-ask");
      expect(ask.lines[0]).toBe("Placed in 1 cell in Week 1.");
      tick.blur();
      ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: false } }));
      await flush();
      await expect(answer).resolves.toBe(false);
      expect(document.activeElement).toBe(tick);
    });

    it("with nothing placed, switches off without asking", async () => {
      placedInWeeks.mockResolvedValue([]);
      const element = await render();
      const answer = hookOf(element)({ recordId: "g3", weekId: "w1" });
      await flush();
      expect(q(element, "c-shoresh-ask")).toBeNull();
      await expect(answer).resolves.toBe(true);
    });

    it("if the check of what is placed fails, nothing is turned off and it says so", async () => {
      placedInWeeks.mockRejectedValue({
        body: { message: "Shoresh couldn't tell why. Try again." }
      });
      const element = await render();
      const answer = hookOf(element)({ recordId: "g3", weekId: "w1" });
      await flush();
      await expect(answer).resolves.toBe(false);
      expect(q(element, "c-shoresh-ask")).toBeNull();
      expect(q(element, '[data-id="error"]').textContent.trim()).toBe(
        "Not turned off. The week is ticked again. Shoresh couldn't tell why. Try again."
      );
    });

    it("several at once are listed in one question", async () => {
      placedInWeeks.mockResolvedValue([
        { target: "g3", week: "w1", cells: 2 },
        { target: "a1", week: "w1", cells: 3 }
      ]);
      const element = await render();
      const component = element;
      // Several only come from one call (a list import's weeks, say); the wording is shared.
      const answer = hookOf(component)({ recordId: "g3", weekId: "w1" });
      await flush();
      const ask = q(element, "c-shoresh-ask");
      expect(ask.heading).toBe("Turn these off?");
      expect(ask.lines).toEqual([
        '"Bunk 3": placed in 2 cells in Week 1.',
        '"Swim": placed in 3 cells in Week 1.',
        "They stay until you change them."
      ]);
      ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: false } }));
      await answer;
    });
  });

  it("a delete or an Undo that worked never says it didn't, when only the refresh failed", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValueOnce(nsRecord(setupWith()));
    LightningConfirm.open.mockResolvedValue(nsRecord(true));
    deleteRecord.mockResolvedValue();
    undoImport.mockResolvedValue({ removed: 1, restored: 0, kept: [] });
    const element = await render();
    getSeasonSetup.mockRejectedValue({ body: { message: "Offline." } });
    const done =
      "Done, but the screen couldn't show it yet. Reload the page. Offline.";
    q(element, 'c-shoresh-editable-table[data-id="locations"]').dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "l1", name: "Pool" } })
    );
    await flush();
    expect(deleteRecord).toHaveBeenCalled();
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(done);
    q(element, "c-shoresh-roots").dispatchEvent(
      new CustomEvent("undoimport", {
        detail: { importId: "i1", files: "camp.xlsx" }
      })
    );
    await flush();
    expect(undoImport).toHaveBeenCalled();
    expect(q(element, '[data-id="error"]').textContent.trim()).toBe(done);
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

  describe("Same location?", () => {
    const places = () =>
      nsRecord(
        setupWith({
          locations: [
            { Id: "l1", Name: "Pool", GroupsThatFit__c: 1 },
            { Id: "l2", Name: "pool", GroupsThatFit__c: 2 },
            { Id: "l3", Name: "Gym", GroupsThatFit__c: 3 }
          ],
          activities: [
            { Id: "a1", Name: "Swim", Location__c: "l1" },
            { Id: "a2", Name: "Dive", Location__c: "l1" },
            { Id: "a3", Name: "Laps", Location__c: "l2" }
          ]
        })
      );

    async function asked() {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(places());
      const element = await render();
      await openScreen(element, "locations");
      const locations = q(
        element,
        'c-shoresh-editable-table[data-id="locations"]'
      );
      expect(locations.mergeLabel).toBe("Same location?");
      locations.dispatchEvent(
        new CustomEvent("merge", { detail: { recordIds: ["l2", "l1"] } })
      );
      await flush();
      return element;
    }

    it("asks about the matching places, with what fits and happens at each", async () => {
      const element = await asked();
      expect(bareRecord(q(element, "c-shoresh-same-location").places)).toEqual([
        { id: "l2", name: "pool", fits: 2, activities: 1 },
        { id: "l1", name: "Pool", fits: 1, activities: 2 }
      ]);
      // A place deleted meanwhile is left out of the question.
      q(element, 'c-shoresh-editable-table[data-id="locations"]').dispatchEvent(
        new CustomEvent("merge", { detail: { recordIds: ["l1", "gone"] } })
      );
      await flush();
      expect(
        bareRecord(q(element, "c-shoresh-same-location").places).map(
          (p) => p.id
        )
      ).toEqual(["l1"]);
      q(element, 'c-shoresh-editable-table[data-id="locations"]').dispatchEvent(
        new CustomEvent("merge", { detail: { recordIds: ["l2", "l1"] } })
      );
      await flush();
      const table = q(element, 'c-shoresh-editable-table[data-id="locations"]');
      table.focusRowOf = jest.fn();
      q(element, "c-shoresh-same-location").dispatchEvent(
        new CustomEvent("close")
      );
      await flush();
      expect(q(element, "c-shoresh-same-location")).toBeNull();
      expect(table.focusRowOf).toHaveBeenCalledWith("l2");
    });

    it("Merge keeps the chosen place, then reads the season again", async () => {
      const element = await asked();
      mergeLocations.mockResolvedValueOnce();
      getSeasonSetup.mockClear();
      const toasts = [];
      element.addEventListener("lightning__showtoast", (e) => toasts.push(e));
      const table = q(element, 'c-shoresh-editable-table[data-id="locations"]');
      table.focusRowOf = jest.fn();
      q(element, "c-shoresh-same-location").dispatchEvent(
        new CustomEvent("merge", {
          detail: { keepId: "l1", otherIds: ["l2"], groupsThatFit: 2 }
        })
      );
      await flush();
      expect(mergeLocations).toHaveBeenCalledWith({
        keepId: "l1",
        otherIds: ["l2"],
        groupsThatFit: 2
      });
      expect(getSeasonSetup).toHaveBeenCalledTimes(1);
      expect(q(element, "c-shoresh-same-location")).toBeNull();
      expect(table.focusRowOf).toHaveBeenCalledWith("l1");
      expect(toasts.map((t) => t.detail.title)).toContain(
        'Merged into "Pool".'
      );
    });

    it("a refused merge reads the season again and asks about the places as they are now", async () => {
      const element = await asked();
      // An earlier page message doesn't follow into the question.
      expect(q(element, "c-shoresh-same-location").error).toBeNull();
      const refusal = '"Pool" fits 1 Bunk at once …';
      mergeLocations.mockRejectedValueOnce({ body: { message: refusal } });
      getSeasonSetup.mockClear();
      const fresh = places();
      fresh.locations[1] = { ...fresh.locations[1], Name: "pool " };
      getSeasonSetup.mockResolvedValue(fresh);
      q(element, "c-shoresh-same-location").dispatchEvent(
        new CustomEvent("merge", {
          detail: { keepId: "l1", otherIds: ["l2"], groupsThatFit: 1 }
        })
      );
      await flush();
      expect(getSeasonSetup).toHaveBeenCalledTimes(1);
      const question = q(element, "c-shoresh-same-location");
      expect(question.error).toBe(refusal);
      expect(bareRecord(question.places).map((p) => p.name)).toEqual([
        "pool ",
        "Pool"
      ]);
      // Shown once, in the question: not also behind it on the page.
      expect(q(element, '[data-id="error"]')).toBeNull();
      // Keep separate: the refusal goes with the question.
      question.dispatchEvent(new CustomEvent("close"));
      await flush();
      expect(element.shadowRoot.textContent).not.toContain(refusal);
    });

    it("if fewer than two of the places are left, the question closes and the page says why", async () => {
      const element = await asked();
      const refusal =
        "That merge could not be completed — someone may have changed these locations. Try again.";
      mergeLocations.mockRejectedValueOnce({ body: { message: refusal } });
      const fresh = places();
      fresh.locations = fresh.locations.filter((l) => l.Id !== "l2");
      getSeasonSetup.mockResolvedValue(fresh);
      q(element, "c-shoresh-same-location").dispatchEvent(
        new CustomEvent("merge", {
          detail: { keepId: "l1", otherIds: ["l2"], groupsThatFit: 1 }
        })
      );
      await flush();
      expect(q(element, "c-shoresh-same-location")).toBeNull();
      expect(q(element, '[data-id="error"]').textContent).toContain(refusal);
    });

    it("a second Merge while one is being made sends nothing", async () => {
      const element = await asked();
      let answer;
      mergeLocations.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          })
      );
      const question = q(element, "c-shoresh-same-location");
      const merge = new CustomEvent("merge", {
        detail: { keepId: "l1", otherIds: ["l2"], groupsThatFit: 2 }
      });
      question.dispatchEvent(merge);
      await flush();
      expect(question.busy).toBe(true);
      question.dispatchEvent(
        new CustomEvent("merge", {
          detail: { keepId: "l1", otherIds: ["l2"], groupsThatFit: 2 }
        })
      );
      expect(mergeLocations).toHaveBeenCalledTimes(1);
      answer();
      await flush();
    });

    it("merged, but the season couldn't be read back: said as done, not as a refusal", async () => {
      const element = await asked();
      mergeLocations.mockResolvedValueOnce();
      getSeasonSetup.mockRejectedValueOnce({ body: { message: "Offline" } });
      q(element, "c-shoresh-same-location").dispatchEvent(
        new CustomEvent("merge", {
          detail: { keepId: "l1", otherIds: ["l2"], groupsThatFit: 2 }
        })
      );
      await flush();
      expect(q(element, "c-shoresh-same-location")).toBeNull();
      expect(q(element, '[data-id="error"]').textContent.trim()).toContain(
        "Done, but the screen couldn't show it yet. Reload the page."
      );
    });

    it("a second click on Delete while its question is open asks nothing more", async () => {
      const element = await asked();
      q(element, "c-shoresh-same-location").dispatchEvent(
        new CustomEvent("close")
      );
      await flush();
      let answer;
      LightningConfirm.open.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          })
      );
      const locations = q(
        element,
        'c-shoresh-editable-table[data-id="locations"]'
      );
      const del = new CustomEvent("delete", {
        detail: { recordId: "l3", name: "Gym" }
      });
      locations.dispatchEvent(del);
      await flush();
      locations.dispatchEvent(
        new CustomEvent("delete", { detail: { recordId: "l3", name: "Gym" } })
      );
      await flush();
      expect(LightningConfirm.open).toHaveBeenCalledTimes(1);
      answer(false);
      await flush();
      LightningConfirm.open.mockResolvedValueOnce(false);
      locations.dispatchEvent(
        new CustomEvent("delete", { detail: { recordId: "l3", name: "Gym" } })
      );
      await flush();
      expect(LightningConfirm.open).toHaveBeenCalledTimes(2);
    });

    it("speaks of locations in the camp's own word", async () => {
      getLabels.mockResolvedValue(
        nsRecord([
          ...LABELS,
          {
            term: "Location",
            singular: "Area",
            plural: "Areas",
            isCustom: true
          }
        ])
      );
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue({
        ...places(),
        labels: nsRecord([
          ...LABELS,
          {
            term: "Location",
            singular: "Area",
            plural: "Areas",
            isCustom: true
          }
        ])
      });
      const element = await render();
      await openScreen(element, "locations");
      const locations = q(
        element,
        'c-shoresh-editable-table[data-id="locations"]'
      );
      expect(locations.mergeLabel).toBe("Same Area?");
      locations.dispatchEvent(
        new CustomEvent("merge", { detail: { recordIds: ["l2", "l1"] } })
      );
      await flush();
      expect(q(element, "c-shoresh-same-location").title).toBe("Same Area?");
    });
  });

  describe("setup forms save as you go", () => {
    async function renderWith(setup = setupWith()) {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setup));
      return render();
    }
    const programCard = (element) =>
      q(element, '[data-screen="programs"] c-shoresh-program');

    it("a program field: saved, the form told before the reload, no toast", async () => {
      saveRecords.mockResolvedValue(nsRecord(["p1"]));
      const element = await renderWith();
      const toasts = [];
      element.addEventListener("lightning__showtoast", (e) => toasts.push(e));
      const order = [];
      getSeasonSetup.mockImplementation(() => {
        order.push("reload");
        return Promise.resolve(nsRecord(setupWith()));
      });
      programCard(element).dispatchEvent(
        new CustomEvent("save", {
          detail: {
            records: nsRecord([
              { sobjectType: "Program__c", Id: "p1", Friday__c: true }
            ]),
            onSaved: () => order.push("form told"),
            onFailure: jest.fn()
          }
        })
      );
      await flush();
      expect(sentTo(saveRecords)).toEqual([
        { records: [{ sobjectType: "Program__c", Id: "p1", Friday__c: true }] }
      ]);
      expect(order).toEqual(["form told", "reload"]);
      expect(toasts).toEqual([]);
      expect(q(element, "lightning-spinner")).toBeNull();
    });

    it("a refused program field goes back to the form in camp words, not to the top of the page", async () => {
      saveRecords.mockRejectedValueOnce({
        body: { message: "That name is already used. Pick another." }
      });
      const element = await renderWith();
      const onFailure = jest.fn();
      const onSaved = jest.fn();
      programCard(element).dispatchEvent(
        new CustomEvent("save", {
          detail: {
            records: nsRecord([
              { sobjectType: "Program__c", Id: "p1", Name: "Main" }
            ]),
            onSaved,
            onFailure
          }
        })
      );
      await flush();
      expect(onSaved).not.toHaveBeenCalled();
      expect(onFailure).toHaveBeenCalledWith(
        "Programs not saved. Your changes are still here. That name is already used. Pick another."
      );
      expect(q(element, '[data-id="error"]')).toBeNull();
    });

    it("a form field waits for a table row being saved, and goes after it", async () => {
      let finishRow;
      saveRow.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishRow = resolve;
          })
      );
      saveRecords.mockResolvedValue(nsRecord(["p1"]));
      const element = await renderWith();
      q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
        new CustomEvent("save", {
          detail: nsRecord({
            record: { sobjectType: "Week__c", Id: "w1", Name: "A" },
            seen: {},
            extras: {},
            onSaved: jest.fn(),
            onFailure: jest.fn(),
            onDone: jest.fn()
          })
        })
      );
      programCard(element).dispatchEvent(
        new CustomEvent("save", {
          detail: {
            records: nsRecord([{ sobjectType: "Program__c", Id: "p1" }]),
            onSaved: jest.fn(),
            onFailure: jest.fn()
          }
        })
      );
      await flush();
      expect(saveRecords).not.toHaveBeenCalled();
      finishRow(nsRecord({ saved: true }));
      await flush();
      await flush();
      expect(saveRecords).toHaveBeenCalledTimes(1);
    });

    it("an activity details field: saved without a toast; a refusal goes back to the form", async () => {
      saveActivityDetails.mockResolvedValueOnce();
      saveActivityDetails.mockRejectedValueOnce({ body: { message: "No." } });
      const element = await renderWith(
        setupWith({ activities: [{ Id: "a1", Name: "Archery" }] })
      );
      const toasts = [];
      element.addEventListener("lightning__showtoast", (e) => toasts.push(e));
      const details = q(element, "c-shoresh-activity-details");
      const first = { onSaved: jest.fn(), onFailure: jest.fn() };
      const second = { onSaved: jest.fn(), onFailure: jest.fn() };
      const rules = nsRecord({ sobjectType: "Activity__c", Id: "a1" });
      details.dispatchEvent(
        new CustomEvent("save", {
          detail: { rules, whoCanDoIt: ["d1"], ...first }
        })
      );
      details.dispatchEvent(
        new CustomEvent("save", {
          detail: { rules, whoCanDoIt: [], ...second }
        })
      );
      await flush();
      await flush();
      expect(
        saveActivityDetails.mock.calls.map((c) => c[0].whoCanDoIt)
      ).toEqual([["d1"], []]);
      expect(first.onSaved).toHaveBeenCalled();
      expect(second.onFailure).toHaveBeenCalledWith(
        "Activity details not saved. Your changes are still here. No."
      );
      expect(toasts).toEqual([]);
    });

    it("camp words saved: words read again, no toast, and the director stays on the screen they went to", async () => {
      const element = await renderWith();
      const toasts = [];
      element.addEventListener("lightning__showtoast", (e) => toasts.push(e));
      await openScreen(element, "groups");
      const calls = getLabels.mock.calls.length;
      q(element, "c-shoresh-camp-labels").dispatchEvent(
        new CustomEvent("saved")
      );
      await flush();
      expect(getLabels.mock.calls.length).toBeGreaterThan(calls);
      expect(shownScreens(element)).toEqual(["groups"]);
      expect(toasts).toEqual([]);
    });
  });

  describe("each setup screen ends with the next one", () => {
    const nextOn = (element, screen) =>
      q(element, `[data-screen="${screen}"] lightning-button[data-id="next"]`);

    it("in menu order, in camp words, with none after the last", async () => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
      const element = await render();
      const chain = [
        "weeks",
        "programs",
        "divisions",
        "groups",
        "timeBlocks",
        "locations",
        "campWords",
        "activities",
        "fixedActivities",
        "recurringActivities"
      ].map((screen) => {
        const next = nextOn(element, screen);
        return [screen, next ? next.label : null];
      });
      expect(chain).toEqual([
        ["weeks", "Programs →"],
        ["programs", "Divisions →"],
        ["divisions", "Bunks →"],
        ["groups", "Time blocks →"],
        ["timeBlocks", "Locations →"],
        ["locations", "Camp words →"],
        ["campWords", "Activities →"],
        ["activities", "Fixed activities →"],
        ["fixedActivities", "Recurring activities →"],
        // Special events is not built yet; Generated Schedule and Manual Build are equal,
        // so neither is picked.
        ["recurringActivities", null]
      ]);
      expect(nextOn(element, "roots")).toBeNull();
      expect(nextOn(element, "schedules")).toBeNull();
      expect(nextOn(element, "weeks").variant).toBe("brand");
    });

    it("opens the next screen and puts the cursor on its heading", async () => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
      const element = await render();
      await openScreen(element, "weeks");
      nextOn(element, "weeks").click();
      await flush();
      expect(shownScreens(element)).toEqual(["programs"]);
      expect(q(element, "c-shoresh-menu").current).toBe("programs");
      const heading = q(element, '[data-screen="programs"] [data-heading]');
      expect(element.shadowRoot.activeElement).toBe(heading);
      expect(heading.getAttribute("tabindex")).toBe("-1");

      await openScreen(element, "locations");
      nextOn(element, "locations").click();
      await flush();
      expect(shownScreens(element)).toEqual(["campWords"]);
      const words = q(element, "c-shoresh-camp-labels");
      expect(words.shadowRoot.activeElement).toBe(
        words.shadowRoot.querySelector("[data-heading]")
      );
    });

    it("before the first season, camp words has no next (nothing else opens yet)", async () => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([]));
      const element = await render();
      await openScreen(element, "campWords");
      expect(nextOn(element, "campWords")).toBeNull();
    });
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
