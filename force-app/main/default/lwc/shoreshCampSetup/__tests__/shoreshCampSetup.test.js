import { createElement } from "lwc";
import ShoreshCampSetup, { seasonContents } from "c/shoreshCampSetup";
import { buildTerms } from "c/shoreshTerms";
import LightningConfirm from "lightning/confirm";
import { loadStyle } from "lightning/platformResourceLoader";
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
import confirmGuess from "@salesforce/apex/SetupGuessesController.confirmGuess";
import openPlan from "@salesforce/apex/SpecialScheduleController.openPlan";
import choicesSetup from "@salesforce/apex/ChoicesImportController.choicesSetup";
import { bareName, bareRecord, nsName, nsRecord } from "shoresh-jest/namespace";

/** The page's address as Lightning hands it to the page (its wire), with this state. */
const pageAddress = (state) =>
  require("lightning/navigation").CurrentPageReference.emit({ state });

/** Every call an Apex mock got, as the screen sent it, with bare names (bareRecord checks). */
const sentTo = (mock) => mock.mock.calls.map((call) => bareRecord(call[0]));

const apex = () => ({ default: jest.fn() });
jest.mock(
  "@salesforce/apex/ChoicesImportController.choicesSetup",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/SpecialScheduleController.openPlan", () => apex(), {
  virtual: true
});
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
  "@salesforce/apex/SetupGuessesController.confirmGuess",
  () => apex(),
  {
    virtual: true
  }
);
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
/**
 * New season or Copy this season: the camp row's small menu (step 3b), opened, then the row
 * chosen, as a director would.
 */
async function seasonAction(element, label) {
  const menu = q(element, '[data-id="season-menu"]');
  menu.shadowRoot.querySelector('[data-id="button"]').click();
  await flush();
  const row = [
    ...element.shadowRoot.querySelectorAll(
      '[data-id="season-menu"] [role="menuitem"]'
    )
  ].find((r) => r.textContent.trim() === label);
  row.click();
  await flush();
}
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

  describe("date boxes' calendar buttons (WCAG 2.5.8, at least 24 by 24)", () => {
    it("loads the date box style once, and marks every date box for it", async () => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
      const element = await render();
      // The season's own dates show once its pencil is pressed.
      q(element, '[data-id="edit-season"]').click();
      await flush();
      // Once each: the date box style and the typefaces (ADR 0015).
      const loaded = loadStyle.mock.calls.map((call) => call[1]);
      expect(
        loaded.filter((url) => url.includes("ShoreshDateBox"))
      ).toHaveLength(1);
      expect(loaded.filter((url) => url.includes("ShoreshFonts"))).toEqual([
        expect.stringMatching(/ShoreshFonts\/fonts\.css$/)
      ]);
      // And the setup tables' fields at rest (ADR 0015 choice 11).
      expect(loaded.filter((url) => url.includes("ShoreshTable"))).toHaveLength(
        1
      );
      expect(loadStyle).toHaveBeenCalledTimes(3);
      const dates = [
        ...element.shadowRoot.querySelectorAll("lightning-input")
      ].filter((input) => input.type === "date");
      expect(dates.length).toBeGreaterThan(0);
      dates.forEach((input) =>
        expect(input.classList.contains("shoresh-date")).toBe(true)
      );
    });

    it("the new season's date boxes are marked too", async () => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([]));
      const element = await render();
      const dates = [
        ...element.shadowRoot.querySelectorAll(
          'lightning-input[data-form="new-season"]'
        )
      ].filter((input) => input.type === "date");
      expect(dates.length).toBe(2);
      dates.forEach((input) =>
        expect(input.classList.contains("shoresh-date")).toBe(true)
      );
    });

    it("a page that can't load the style still opens", async () => {
      loadStyle.mockRejectedValueOnce(new Error("Offline."));
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
      const element = await render();
      expect(q(element, '[data-id="error"]')).toBeNull();
      expect(q(element, "c-shoresh-menu")).not.toBeNull();
    });

    it("the style makes a marked date box's button 24 by 24, and nothing else", () => {
      const fs = require("fs");
      const path = require("path");
      const css = fs
        .readFileSync(
          path.join(__dirname, "../../../staticresources/ShoreshDateBox.css"),
          "utf8"
        )
        .replace(/\/\*[\s\S]*?\*\//g, "");
      const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
        selector: m[1].trim(),
        body: m[2]
      }));
      expect(rules.length).toBeGreaterThan(0);
      rules.forEach((rule) =>
        expect(rule.selector.startsWith(".shoresh-date ")).toBe(true)
      );
      const iconRule = rules.find((r) =>
        /\.slds-button_icon$/.test(r.selector)
      );
      expect(iconRule.body).toMatch(/width:\s*1\.5rem/);
      expect(iconRule.body).toMatch(/height:\s*1\.5rem/);
    });
  });

  describe("setup tables' fields at rest (ADR 0015 choice 11)", () => {
    it("the style reaches only fields in Shoresh's marked cells, and keeps a focus edge and the error edge", () => {
      const fs = require("fs");
      const path = require("path");
      const css = fs
        .readFileSync(
          path.join(__dirname, "../../../staticresources/ShoreshTable.css"),
          "utf8"
        )
        .replace(/\/\*[\s\S]*?\*\//g, "");
      const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
        selectors: m[1].split(",").map((x) => x.trim()),
        body: m[2]
      }));
      expect(rules.length).toBeGreaterThan(0);
      rules.forEach((rule) =>
        rule.selectors.forEach((selector) =>
          expect(selector).toMatch(
            /^(\.shoresh-row\S* )?\.shoresh-(cell|name) /
          )
        )
      );
      const focus = rules.find((r) =>
        r.selectors.some((x) => x.endsWith(".slds-input:focus"))
      );
      expect(focus.body).toMatch(
        /border-color:\s*var\(--shoresh-color-highlight/
      );
      const error = rules.find((r) =>
        r.selectors.some((x) => x.includes(".slds-has-error"))
      );
      expect(error.body).toMatch(/border-color:\s*var\(--slds-g-color-error-1/);
    });
  });

  describe("setup screens in the shared table pattern (ADR 0015 choice 11)", () => {
    const TYPES = [
      { Id: "lt1", Name: "Waterfront" },
      { Id: "lt2", Name: "Fields" }
    ];
    const PLACES = [
      { Id: "l1", Name: "Lake", LocationType__c: "lt1", GroupsThatFit__c: 3 },
      { Id: "l2", Name: "Pool", LocationType__c: "lt1", GroupsThatFit__c: 2 },
      {
        Id: "l3",
        Name: "Upper field",
        LocationType__c: "lt2",
        GroupsThatFit__c: 2
      },
      { Id: "l4", Name: "Shed", GroupsThatFit__c: 1 }
    ];
    async function renderWith(overrides = {}) {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith(overrides)));
      return render();
    }
    const rail = (element, screen) =>
      q(element, `[data-screen="${screen}"] [data-id="setup-rail"]`);
    const count = (element, screen) =>
      rail(element, screen)
        .querySelector('[data-id="count"]')
        .textContent.replace(/\s+/g, " ")
        .trim();
    const sections = (element) =>
      [
        ...element.shadowRoot.querySelectorAll(
          'c-shoresh-editable-table[data-id="locations"]'
        )
      ].map((t) => [t.heading, t.filterValue, t.showColumns]);

    it("each screen's rail counts its list in the camp's words, one or many", async () => {
      const element = await renderWith({
        programs: [
          {
            program: { Id: "p1", Name: "Main", Monday__c: true },
            timeBlocks: [{ Id: "t1", Name: "Period 1" }],
            divisions: [
              {
                division: { Id: "d1", Name: "Juniors" },
                groups: [
                  { Id: "g1", Name: "Cedar" },
                  { Id: "g2", Name: "Birch" }
                ]
              }
            ]
          }
        ],
        locations: PLACES,
        locationTypes: TYPES
      });
      expect(count(element, "weeks")).toBe("1 week");
      expect(count(element, "divisions")).toBe("1 division");
      // A word the camp typed stays as typed.
      expect(count(element, "groups")).toBe("2 Bunks");
      expect(count(element, "timeBlocks")).toBe("1 time block");
      expect(count(element, "locations")).toBe("4 locations");
    });

    it("the rail holds the screen's heading (read out), Saved, and Import a list as rail items", async () => {
      const element = await renderWith();
      await openScreen(element, "groups");
      const groups = rail(element, "groups");
      const heading = groups.querySelector("[data-heading]");
      expect(heading.tagName).toBe("H2");
      expect(heading.classList.contains("slds-assistive-text")).toBe(true);
      expect(groups.querySelector('[data-id="rail-saved"]').silent).toBe(true);
      const list = groups.querySelector("c-shoresh-list-import");
      expect(list.variant).toBe("rail");
      expect(list.screenKey).toBe("groups");
      // The next screen's button is at the end of the list, under the rail.
      const next = q(
        element,
        '[data-screen="groups"] .setup-list [data-id="next"]'
      );
      expect(next.label).toBe("Time blocks →");
      await expect(q(element, '[data-screen="groups"]')).toBeAccessible();
    });

    it("the rail's quiet Saved shows once a row is saved, and goes while the next is on its way", async () => {
      const element = await renderWith();
      await openScreen(element, "weeks");
      const mark = q(element, '[data-screen="weeks"] [data-id="rail-saved"]');
      const said = () =>
        mark.shadowRoot.querySelector('[data-id="saved"]').textContent;
      let answer;
      saveRow.mockImplementation(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          })
      );
      const send = () =>
        q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
          new CustomEvent("save", {
            detail: nsRecord({
              record: { sobjectType: "Week__c", Id: "w1", Name: "Week One" },
              seen: { sobjectType: "Week__c", Name: "Week 1" },
              extras: { weeksOff: [], weeksBackOn: [] },
              onSaved: () => {},
              onFailure: () => {},
              onDone: () => {}
            })
          })
        );
      send();
      await flush();
      expect(said()).toBe("");
      answer(nsRecord({ id: "w1", changed: [] }));
      await flush();
      expect(said()).toContain("Saved");
      send();
      await flush();
      expect(said()).toBe("");
      // Someone else changed it: the table asks, and nothing is Saved yet.
      answer(
        nsRecord({ id: "w1", changed: ["Name"], theirs: { Name: "Wk 1" } })
      );
      await flush();
      expect(said()).toBe("");
    });

    it("locations sit in a section per type, then the places with none, each its own table", async () => {
      const element = await renderWith({
        locations: PLACES,
        locationTypes: TYPES
      });
      await openScreen(element, "locations");
      expect(sections(element)).toEqual([
        ["Waterfront", "lt1", true],
        ["Fields", "lt2", false],
        ["No location type", "", false]
      ]);
      // axe on this screen takes too long for Jest on CI (three tables of places, each with
      // every week's ticks): the real-browser check runs it on Locations in the test org, and
      // c-shoresh-editable-table's own tests run it on a section.
    });

    it("a camp without types has one section with no heading", async () => {
      const element = await renderWith({ locations: PLACES.slice(3) });
      await openScreen(element, "locations");
      expect(sections(element)).toEqual([[undefined, "", true]]);
      expect(q(element, '[data-id="location-filter"]')).toBeNull();
    });

    it("the rail's type choices show one section; All shows them all again", async () => {
      const element = await renderWith({
        locations: PLACES,
        locationTypes: TYPES
      });
      await openScreen(element, "locations");
      const choices = () => [
        ...q(element, '[data-id="location-filter"]').querySelectorAll("button")
      ];
      expect(
        choices().map((b) => [
          b.textContent.trim(),
          b.getAttribute("aria-pressed")
        ])
      ).toEqual([
        ["All", "true"],
        ["Waterfront", "false"],
        ["Fields", "false"],
        ["No location type", "false"]
      ]);
      expect(
        q(element, '[data-id="location-filter"]').getAttribute("role")
      ).toBe("group");
      choices()[2].click();
      await flush();
      expect(sections(element)).toEqual([["Fields", "lt2", true]]);
      expect(choices()[2].getAttribute("aria-pressed")).toBe("true");
      expect(choices()[2].classList.contains("shoresh-raised")).toBe(true);
      choices()[0].click();
      await flush();
      expect(sections(element).length).toBe(3);
    });

    it("No type is offered only while a place has none", async () => {
      const element = await renderWith({
        locations: PLACES.slice(0, 3),
        locationTypes: TYPES
      });
      await openScreen(element, "locations");
      expect(
        [
          ...q(element, '[data-id="location-filter"]').querySelectorAll(
            "button"
          )
        ].map((b) => b.textContent.trim())
      ).toEqual(["All", "Waterfront", "Fields"]);
      expect(sections(element).map(([h]) => h)).toEqual([
        "Waterfront",
        "Fields"
      ]);
    });

    it("a place's row shows what is held there; its type and notes are its details", async () => {
      const element = await renderWith({
        locations: PLACES,
        locationTypes: TYPES,
        activities: [
          { Id: "a1", Name: "Swim", Location__c: "l1" },
          { Id: "a2", Name: "Canoe", Location__c: "l1" },
          { Id: "a3", Name: "Soccer", Location__c: "l3" }
        ]
      });
      await openScreen(element, "locations");
      const table = q(element, 'c-shoresh-editable-table[data-id="locations"]');
      const held = table.columns.find((c) => c.type === "readonly");
      expect(held.label).toBe("Activities held here");
      expect(held.textFor(nsRecord(PLACES[0]))).toBe("Swim, Canoe");
      expect(held.textFor({})).toBe("");
      expect(
        table.columns.filter((c) => c.more).map((c) => bareName(c.fieldName))
      ).toEqual(["LocationType__c", "Notes__c"]);
    });

    describe("a place whose type changes takes the cursor to its new section (WCAG 2.4.3)", () => {
      const tables = (element) => [
        ...element.shadowRoot.querySelectorAll(
          'c-shoresh-editable-table[data-id="locations"]'
        )
      ];
      const tableFor = (element, type) =>
        tables(element).find((t) => t.filterValue === type);
      const inTable = (table, selector) =>
        table.shadowRoot.querySelector(selector);
      /** The place's details open, its type changed, then Enter in its notes. */
      async function moveLake(element, to, id = "l1", from = "lt1") {
        const waterfront = tableFor(element, from);
        inTable(
          waterfront,
          `[data-id="more"][data-row-key="row-${id}"]`
        ).click();
        await flush();
        const type = inTable(
          waterfront,
          `[data-row-key="row-${id}"][data-field="${nsName("LocationType__c")}"]`
        );
        type.value = to;
        type.dispatchEvent(
          new CustomEvent("change", { detail: { value: to } })
        );
        await flush();
        waterfront.shadowRoot
          .querySelectorAll("lightning-input, lightning-combobox")
          .forEach((i) => {
            i.reportValidity = () => true;
            i.checkValidity = () => true;
          });
        const notes = inTable(
          waterfront,
          `[data-row-key="row-${id}"][data-field="${nsName("Notes__c")}"]`
        );
        notes.tabIndex = 0;
        notes.focus();
        expect(waterfront.shadowRoot.activeElement).toBe(notes);
        saveRow.mockResolvedValue(nsRecord({ id, changed: [] }));
        getSeasonSetup.mockResolvedValue(
          nsRecord(
            setupWith({
              locations: PLACES.map((p) => ({
                ...p,
                ...(p.Id === id ? { LocationType__c: to } : {})
              })),
              locationTypes: TYPES
            })
          )
        );
        // The test stand-in for a Salesforce input can't take focus itself: what took it is
        // listed as section:row:field.
        const focus = jest.spyOn(HTMLElement.prototype, "focus");
        notes.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            composed: true
          })
        );
        await flush();
        await flush();
        const focused = focus.mock.contexts.map(
          (el) =>
            `${el.getRootNode().host.dataset.type}:${el.dataset.rowKey}:${bareName(el.dataset.field)}`
        );
        focus.mockRestore();
        expect(saveRow).toHaveBeenCalledTimes(1);
        return { notes, focused };
      }

      it("the same field in the place's row, its details open again, and the move said", async () => {
        const element = await renderWith({
          locations: PLACES,
          locationTypes: TYPES
        });
        await openScreen(element, "locations");
        const { notes, focused } = await moveLake(element, "lt2");
        // Without this, the field with the cursor is gone and the cursor is at the page's top.
        expect(notes.isConnected).toBe(false);
        expect(tableFor(element, "lt1").showsRow("l1")).toBe(false);
        const fields = tableFor(element, "lt2");
        expect(fields.showsRow("l1")).toBe(true);
        expect(focused).toEqual(["lt2:row-l1:Notes__c"]);
        expect(
          inTable(
            fields,
            '[data-id="more"][data-row-key="row-l1"]'
          ).getAttribute("aria-expanded")
        ).toBe("true");
        expect(inTable(fields, '[data-id="announce"]').textContent).toContain(
          "Lake moved to Fields"
        );
      });

      it("while the rail shows only the old type, the cursor stays in that section's blank row", async () => {
        const element = await renderWith({
          locations: PLACES,
          locationTypes: TYPES
        });
        await openScreen(element, "locations");
        [
          ...q(element, '[data-id="location-filter"]').querySelectorAll(
            "button"
          )
        ][1].click();
        await flush();
        expect(tables(element).length).toBe(1);
        const { focused } = await moveLake(element, "");
        const waterfront = tableFor(element, "lt1");
        expect(waterfront.showsRow("l1")).toBe(false);
        expect(focused).toEqual(["lt1:add:Name"]);
        expect(
          inTable(waterfront, '[data-id="announce"]').textContent
        ).toContain("Lake moved to No location type");
      });

      it("from a section that goes with it (the last place with no type): to its new one", async () => {
        const element = await renderWith({
          locations: PLACES,
          locationTypes: TYPES
        });
        await openScreen(element, "locations");
        const { focused } = await moveLake(element, "lt1", "l4", "");
        expect(sections(element).map(([h]) => h)).toEqual([
          "Waterfront",
          "Fields"
        ]);
        expect(focused).toEqual(["lt1:row-l4:Notes__c"]);
        expect(
          inTable(tableFor(element, "lt1"), '[data-id="announce"]').textContent
        ).toContain("Shed moved to Waterfront");
      });
    });
  });

  describe("setup screens, step 3b (ADR 0015 choice 12)", () => {
    const ACTIVITIES = [
      {
        Id: "a1",
        Name: "Archery",
        TimesPerWeekMin__c: 2,
        TimesPerWeekMax__c: 3,
        Eligibilities__r: []
      },
      {
        Id: "a2",
        Name: "Canoe",
        TimesPerWeekMin__c: 1,
        TimesPerWeekMax__c: 7,
        Eligibilities__r: [{ Division__c: "d1" }, { Group__c: "g1" }]
      }
    ];
    const PROGRAMS = [
      {
        program: { Id: "p1", Name: "Main", Monday__c: true },
        timeBlocks: [{ Id: "t1", Name: "Period 1" }],
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [{ Id: "g1", Name: "Cedar" }]
          }
        ],
        fixedActivities: [{ Id: "f1", Name: "Lunch", TimeBlock__c: "t1" }],
        recurringActivities: [
          { Id: "r1", Name: "Swim", TimeBlock__c: "t1" },
          { Id: "r2", Name: "Lake", TimeBlock__c: "t1" }
        ]
      }
    ];
    async function renderWith(overrides = {}, camps = [CAMP]) {
      getCamps.mockResolvedValue(nsRecord(camps));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(
        nsRecord(
          setupWith({
            activities: ACTIVITIES,
            programs: PROGRAMS,
            ...overrides
          })
        )
      );
      return render();
    }
    const railCount = (element, screen) =>
      q(element, `[data-screen="${screen}"] [data-id="count"]`)
        .textContent.replace(/\s+/g, " ")
        .trim();

    it("Activities, Fixed and Recurring activities each have the rail: count, Saved, Import a list", async () => {
      const element = await renderWith();
      expect(railCount(element, "activities")).toBe("2 activities");
      expect(railCount(element, "fixedActivities")).toBe("1 fixed activity");
      expect(railCount(element, "recurringActivities")).toBe(
        "2 recurring activities"
      );
      ["activities", "fixedActivities", "recurringActivities"].forEach(
        (screen) => {
          const rail = q(
            element,
            `[data-screen="${screen}"] [data-id="setup-rail"]`
          );
          expect(rail.querySelector("[data-heading]").tagName).toBe("H2");
          expect(rail.querySelector('[data-id="rail-saved"]').silent).toBe(
            true
          );
          const list = rail.querySelector("c-shoresh-list-import");
          expect([list.variant, list.screenKey]).toEqual(["rail", screen]);
        }
      );
      // Fixed and Recurring are separate screens (decision 42), each with its programs' tables.
      await openScreen(element, "recurringActivities");
      expect(
        q(element, '[data-screen="recurringActivities"] c-shoresh-program').show
      ).toBe("recurringActivities");
      expect(
        q(element, '[data-screen="fixedActivities"] c-shoresh-program').show
      ).toBe("fixedActivities");
      // Their rail, grid and list are the frame's zones, as on the other setup screens.
      expect(q(element, ".body_flush")).not.toBeNull();
    });

    it("how often is on one scale, the camp's highest weekly count; who is quiet Everyone unless limited", async () => {
      const element = await renderWith();
      await openScreen(element, "activities");
      const table = q(
        element,
        'c-shoresh-editable-table[data-id="activities"]'
      );
      const often = table.columns.find((c) => c.type === "often");
      expect(often.scale).toBe(7);
      expect(often.label).toBe("How often");
      expect(bareName(often.maxField)).toBe("TimesPerWeekMax__c");
      expect(bareName(often.noMaxField)).toBe("NoWeeklyMax__c");
      const who = table.columns.find((c) => c.fieldName === "whoCanDoIt");
      const [archery, canoe] = nsRecord(ACTIVITIES);
      expect([who.textFor(archery), who.exceptionFor(archery)]).toEqual([
        "Everyone",
        false
      ]);
      expect([who.textFor(canoe), who.exceptionFor(canoe)]).toEqual([
        "Juniors, Cedar",
        true
      ]);
      expect(table.columns[0].label).toBe("Activity");
    });

    it("an activity's details open beside the table, and its own fields are compared and set as a row's", async () => {
      const answer = nsRecord({ id: "a1", changed: [] });
      saveRow.mockResolvedValue(answer);
      const element = await renderWith();
      await openScreen(element, "activities");
      const details = q(element, "c-shoresh-activity-details");
      // In the zone beside the list, not under it.
      expect(details.parentElement.className).toBe("setup-split");
      const onSaved = jest.fn();
      details.dispatchEvent(
        new CustomEvent("save", {
          detail: {
            record: nsRecord({
              sobjectType: "Activity__c",
              Id: "a1",
              Priority__c: "High"
            }),
            seen: () =>
              nsRecord({
                sobjectType: "Activity__c",
                Id: "a1",
                Name: "Archery",
                Priority__c: "Low"
              }),
            onSaved,
            onFailure: jest.fn(),
            shown: () => true
          }
        })
      );
      await flush();
      await flush();
      // Never last-write-wins (ADR 0011 choice 5): saveRow, with what the field held when seen.
      expect(sentTo(saveRow)).toContainEqual({
        record: { sobjectType: "Activity__c", Id: "a1", Priority__c: "High" },
        seen: {
          sobjectType: "Activity__c",
          Id: "a1",
          Name: "Archery",
          Priority__c: "Low"
        },
        extras: null
      });
      expect(saveRecords).not.toHaveBeenCalled();
      expect(saveActivityDetails).not.toHaveBeenCalled();
      // The panel hears the answer: here saved; else what someone else changed.
      expect(onSaved).toHaveBeenCalledWith(answer);
    });

    it("an activity's field someone else changed since is asked about in its details, never overwritten", async () => {
      const element = await renderWith();
      await openScreen(element, "activities");
      const details = q(element, "c-shoresh-activity-details");
      await details.open(details.setup.activities[0].Id);
      await flush();
      saveRow.mockResolvedValue(
        nsRecord({
          id: null,
          changed: [nsName("Priority__c")],
          theirs: { Id: details.setup.activities[0].Id, Priority__c: "High" }
        })
      );
      const priority = details.shadowRoot.querySelector(
        '[data-field="priority"]'
      );
      priority.value = "Low";
      priority.dispatchEvent(
        new CustomEvent("change", { detail: { value: "Low" } })
      );
      await flush();
      await flush();
      expect(saveRow).toHaveBeenCalledTimes(1);
      expect(saveRecords).not.toHaveBeenCalled();
      const conflict = details.shadowRoot.querySelector('[data-id="conflict"]');
      expect(conflict).not.toBeNull();
      expect(
        [...conflict.querySelectorAll("dd")].map((d) => d.textContent.trim())
      ).toEqual(["High", "Low"]);
    });

    describe("activities grouped by priority (desktop ActivitiesScreen.jsx, decision 45)", () => {
      const sections = (element) => [
        ...element.shadowRoot.querySelectorAll(
          'c-shoresh-editable-table[data-id="activities"]'
        )
      ];
      const section = (element, priority) =>
        q(
          element,
          `c-shoresh-editable-table[data-id="activities"][data-priority="${priority}"]`
        );
      const chevron = (table, id) =>
        table.shadowRoot.querySelector(
          `[data-id="details"][data-row-key="row-${id}"]`
        );
      const withPriorities = (archery, canoe) => ({
        activities: [
          { ...ACTIVITIES[0], Priority__c: archery },
          { ...ACTIVITIES[1], Priority__c: canoe }
        ]
      });

      it("High then Low, each headed with its count, the columns above the first", async () => {
        const element = await renderWith(withPriorities("High", "Low"));
        await openScreen(element, "activities");
        const [high, low] = sections(element);
        expect(sections(element).length).toBe(2);
        expect([high.heading, high.showColumns]).toEqual([
          "High priority",
          true
        ]);
        expect([low.heading, low.showColumns]).toEqual(["Low priority", false]);
        expect(high.title).toBe("Activity catalogue: High priority");
        // Every activity is handed to both, so same-name dots compare across sections.
        expect(high.rows.length).toBe(2);
        expect(low.rows.length).toBe(2);
        expect([high.showsRow("a1"), high.showsRow("a2")]).toEqual([
          true,
          false
        ]);
        expect([low.showsRow("a1"), low.showsRow("a2")]).toEqual([false, true]);
        expect(
          high.shadowRoot.querySelector(".section-count").textContent.trim()
        ).toBe("1");
        // Each blank row starts in its section's priority; the rest are the usual defaults.
        expect(bareRecord(high.newRowDefaults)).toEqual(
          expect.objectContaining({ Priority__c: "High", Length__c: 1 })
        );
        expect(bareRecord(low.newRowDefaults)).toEqual(
          expect.objectContaining({ Priority__c: "Low", Length__c: 1 })
        );
      });

      it("a blank priority is Low; High shows only while it holds an activity", async () => {
        const element = await renderWith(withPriorities(undefined, "Low"));
        await openScreen(element, "activities");
        const only = sections(element);
        expect(only.map((t) => t.dataset.priority)).toEqual(["Low"]);
        expect([only[0].heading, only[0].showColumns]).toEqual([
          "Low priority",
          true
        ]);
        expect([only[0].showsRow("a1"), only[0].showsRow("a2")]).toEqual([
          true,
          true
        ]);
      });

      it("Low stays, holding the blank row new activities start in, when every activity is High", async () => {
        const element = await renderWith(withPriorities("High", "High"));
        await openScreen(element, "activities");
        const [high, low] = sections(element);
        expect([high.dataset.priority, low.dataset.priority]).toEqual([
          "High",
          "Low"
        ]);
        expect([low.showsRow("a1"), low.showsRow("a2")]).toEqual([
          false,
          false
        ]);
        expect(
          low.shadowRoot.querySelector('[data-row-key="add"]')
        ).not.toBeNull();
      });

      it("with no activities, only the empty list: no heading", async () => {
        const element = await renderWith({ activities: [] });
        await openScreen(element, "activities");
        const only = sections(element);
        expect(only.length).toBe(1);
        expect(only[0].heading).toBeUndefined();
        expect(only[0].title).toBe("Activity catalogue");
        expect(
          only[0].shadowRoot.querySelector("c-shoresh-empty-state").title
        ).toBe("No activities yet");
      });

      it("a priority changed in the details moves the row to its section, still marked open; Close goes to its chevron there", async () => {
        saveRow.mockResolvedValue(nsRecord({ id: "a2", changed: [] }));
        const element = await renderWith(withPriorities("High", "High"));
        await openScreen(element, "activities");
        chevron(section(element, "High"), "a2").click();
        await flush();
        await flush();
        const details = q(element, "c-shoresh-activity-details");
        expect(details.openActivityId).toBe("a2");
        // The save, then the season read again with Canoe now Low.
        getSeasonSetup.mockResolvedValue(
          nsRecord(
            setupWith({
              programs: PROGRAMS,
              ...withPriorities("High", "Low")
            })
          )
        );
        const priority = details.shadowRoot.querySelector(
          '[data-field="priority"]'
        );
        priority.value = "Low";
        priority.dispatchEvent(
          new CustomEvent("change", { detail: { value: "Low" } })
        );
        await flush();
        await flush();
        await flush();
        expect(sentTo(saveRow)[0].record).toEqual({
          sobjectType: "Activity__c",
          Id: "a2",
          Priority__c: "Low"
        });
        // Archery keeps High showing, above; Canoe is in Low now, its row still marked open.
        const low = section(element, "Low");
        expect(low.showsRow("a2")).toBe(true);
        expect(section(element, "High").showsRow("a2")).toBe(false);
        expect(chevron(low, "a2").getAttribute("aria-expanded")).toBe("true");
        details.shadowRoot.querySelector('[data-id="close"]').click();
        await flush();
        await flush();
        expect(low.shadowRoot.activeElement).toBe(chevron(low, "a2"));
      });
    });

    describe("the camp and season in the menu's camp row", () => {
      const head = (element) => q(element, '[data-id="camp-head"]');

      it("sits in the menu, not in a row above the rail", async () => {
        const element = await renderWith();
        const menu = q(element, "c-shoresh-menu");
        expect(menu.controls).toBe(true);
        expect(head(element).slot).toBe("camp");
        expect(head(element).parentElement).toBe(menu);
        expect(q(element, '[data-id="frame-head"]')).toBeNull();
        // One camp: its name as words; the season picker and its pencil under it.
        expect(q(element, '[data-id="camp-picker"]')).toBeNull();
        expect(q(element, '[data-id="camp-name"]').textContent).toBe(
          "Camp Willow"
        );
        ["season-picker", "edit-season", "season-menu"].forEach((id) =>
          expect(
            head(element).querySelector(`[data-id="${id}"]`)
          ).not.toBeNull()
        );
        // The season's details open there too, under the pickers.
        q(element, '[data-id="edit-season"]').click();
        await flush();
        expect(
          head(element).querySelector('[data-id="season-form"]')
        ).not.toBeNull();
      });

      it("several camps: the camp's name is its picker", async () => {
        const element = await renderWith({}, [
          CAMP,
          { Id: "c2", Name: "Camp Oak" }
        ]);
        const picker = head(element).querySelector('[data-id="camp-picker"]');
        expect(picker.options.map((o) => o.label)).toEqual([
          "Camp Willow",
          "Camp Oak"
        ]);
        expect(q(element, '[data-id="camp-name"]')).toBeNull();
      });

      it("New season and Copy this season are a small menu, named, held while the page is busy", async () => {
        const element = await renderWith();
        const menu = q(element, '[data-id="season-menu"]');
        expect(menu.menu).toBe(true);
        expect(menu.alternativeText).toBe("Season actions");
        const rows = () => [
          ...element.shadowRoot.querySelectorAll(
            '[data-id="season-menu"] [role="menuitem"]'
          )
        ];
        expect(rows().map((r) => r.textContent.trim())).toEqual([
          "New season",
          "Copy this season"
        ]);
        expect(rows().map((r) => r.dataset.value)).toEqual(["new", "copy"]);
        // While the page is busy (filling in weeks, here) nothing opens from it.
        addWeeksFromSeasonDates.mockReturnValue(new Promise(() => {}));
        const fresh = await renderWith({ weeks: [] });
        await openScreen(fresh, "weeks");
        q(fresh, '[data-id="fill-weeks"]').click();
        await flush();
        expect(
          [
            ...fresh.shadowRoot.querySelectorAll(
              '[data-id="season-menu"] [role="menuitem"]'
            )
          ].map((r) => r.disabled)
        ).toEqual([true, true]);
      });
    });
  });

  describe("the frame (ADR 0015)", () => {
    it("ships Inter and the one mono with their licences, and the style names only those files", () => {
      const fs = require("fs");
      const path = require("path");
      const dir = path.join(__dirname, "../../../staticresources/ShoreshFonts");
      const css = fs.readFileSync(path.join(dir, "fonts.css"), "utf8");
      const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
      expect(urls.length).toBe(8);
      urls.forEach((url) => {
        // Relative, inside the resource: no font server outside the org (CSP).
        expect(url).toMatch(/^files\/[a-z0-9-]+\.woff2$/);
        expect(fs.existsSync(path.join(dir, url))).toBe(true);
      });
      expect(css).toContain('font-family: "Inter"');
      expect(css).toContain('font-family: "JetBrains Mono"');
      expect(css).toContain("font-display: swap");
      ["OFL-Inter.txt", "OFL-JetBrainsMono.txt"].forEach((name) =>
        expect(fs.readFileSync(path.join(dir, name), "utf8")).toContain(
          "SIL Open Font License, Version 1.1"
        )
      );
    });

    it("the menu's foot shows setup changed for the schedule on screen, and opens its list", async () => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
      const element = await render();
      const menu = q(element, "c-shoresh-menu");
      const manual = q(element, '[data-setup-state="manualBuild"]');
      expect(manual.tagName.toLowerCase()).toBe("c-shoresh-manual-build");
      const opened = jest.fn();
      manual.updateToMatchSetup = opened;
      manual.dispatchEvent(
        new CustomEvent("setupstate", {
          detail: { changed: true, busy: false }
        })
      );
      await flush();
      // Only while that screen is shown.
      expect(menu.setupChanged).toBe(false);
      await openScreen(element, "manualBuild");
      expect(menu.setupChanged).toBe(true);
      expect(menu.setupBusy).toBe(false);
      menu.dispatchEvent(new CustomEvent("updatetomatch"));
      expect(opened).toHaveBeenCalledTimes(1);
      // Generated Schedule's own state, separately.
      await openScreen(element, "generatedSchedule");
      expect(menu.setupChanged).toBe(false);
      q(element, '[data-setup-state="generatedSchedule"]').dispatchEvent(
        new CustomEvent("setupstate", { detail: { changed: true, busy: true } })
      );
      await flush();
      expect(menu.setupChanged).toBe(true);
      expect(menu.setupBusy).toBe(true);
    });

    it("the menu's foot drops the old season's setup changed when another season is picked", async () => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
      const element = await render();
      const menu = q(element, "c-shoresh-menu");
      await openScreen(element, "manualBuild");
      q(element, '[data-setup-state="manualBuild"]').dispatchEvent(
        new CustomEvent("setupstate", {
          detail: { changed: true, busy: false }
        })
      );
      await flush();
      expect(menu.setupChanged).toBe(true);
      // The other season's read fails: the old season's notice must not stay up.
      getSeasonSetup.mockRejectedValue({ body: { message: "No luck." } });
      q(element, '[data-id="season-picker"]').dispatchEvent(
        new CustomEvent("change", { detail: { value: "s2" } })
      );
      await flush();
      expect(menu.setupChanged).toBe(false);
    });
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

    // The camp's name and season sit at the top of the menu (ADR 0015).
    const menu = q(element, "c-shoresh-menu");
    expect(menu.campName).toBe("Camp Willow");
    expect(menu.seasonName).toBe("Summer 2026");
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
    expect(q(element, '[data-id="copy-season"]').textContent.trim()).toBe(
      "Copy this season"
    );
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

  it("tells the table once a row is deleted and the season read again, and only then", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const element = await render();
    const weeks = q(element, 'c-shoresh-editable-table[data-id="weeks"]');
    const ask = (onDeleted) =>
      weeks.dispatchEvent(
        new CustomEvent("delete", {
          detail: { recordId: "w1", name: "Week 1", onDeleted }
        })
      );

    // Cancelled: nothing to say.
    const cancelled = jest.fn();
    LightningConfirm.open.mockResolvedValueOnce(nsRecord(false));
    ask(cancelled);
    await flush();
    expect(cancelled).not.toHaveBeenCalled();

    // Refused: nothing was deleted.
    const refused = jest.fn();
    LightningConfirm.open.mockResolvedValueOnce(nsRecord(true));
    deleteRecord.mockRejectedValueOnce({ body: { message: "Locked." } });
    ask(refused);
    await flush();
    expect(refused).not.toHaveBeenCalled();

    // Deleted: after the season is read again, so the row is already gone.
    const reads = getSeasonSetup.mock.calls.length;
    const deleted = jest.fn(() =>
      expect(getSeasonSetup.mock.calls.length).toBe(reads + 1)
    );
    LightningConfirm.open.mockResolvedValueOnce(nsRecord(true));
    deleteRecord.mockResolvedValueOnce();
    ask(deleted);
    await flush();
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it("every setup table's delete goes the same way", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    LightningConfirm.open.mockResolvedValue(nsRecord(true));
    deleteRecord.mockResolvedValue();
    const element = await render();
    const sources = [
      ...element.shadowRoot.querySelectorAll(
        "c-shoresh-editable-table, c-shoresh-program"
      )
    ];
    expect(sources.length).toBeGreaterThan(0);
    // One after another: a second delete while one is under way is ignored.
    await sources.reduce(async (before, source) => {
      await before;
      const onDeleted = jest.fn();
      source.dispatchEvent(
        new CustomEvent("delete", {
          detail: { recordId: "x1", name: "Something", onDeleted }
        })
      );
      await flush();
      expect(onDeleted).toHaveBeenCalledTimes(1);
    }, Promise.resolve());
  });

  describe("deleting a whole program card", () => {
    const card = (id, name) => ({
      program: { Id: id, Name: name, Monday__c: true },
      timeBlocks: [],
      divisions: []
    });
    const programs = (...cards) =>
      nsRecord(setupWith({ programs: cards.map(([id, n]) => card(id, n)) }));
    const live = (element) =>
      q(element, '[data-id="programs-announce"]').textContent.trim();

    /**
     * Deletes `id` from the Programs screen: the season read again comes back with `left`.
     * Returns what took the focus: a card's name box ("name:Main") or a page button.
     */
    async function deleteCard(element, id, name, left) {
      const focus = jest.spyOn(HTMLElement.prototype, "focus");
      getSeasonSetup.mockResolvedValue(programs(...left));
      LightningConfirm.open.mockResolvedValueOnce(nsRecord(true));
      deleteRecord.mockResolvedValueOnce();
      const source = [
        ...element.shadowRoot.querySelectorAll(
          '[data-screen="programs"] c-shoresh-program'
        )
      ].find((c) => c.entry.program.Id === id);
      source.dispatchEvent(
        new CustomEvent("delete", { detail: { recordId: id, name } })
      );
      await flush();
      await flush();
      const focused = focus.mock.contexts.map((el) => {
        if (el.dataset.id === "name") {
          return `name:${el.getRootNode().host.entry.program.Name}`;
        }
        return el.dataset.id || el.tagName.toLowerCase();
      });
      focus.mockRestore();
      return focused;
    }

    beforeEach(() => {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
    });

    it("says so and puts the cursor on the next card's name", async () => {
      getSeasonSetup.mockResolvedValue(
        programs(["p1", "Main"], ["p2", "Teens"], ["p3", "Sports"])
      );
      const element = await render();
      await openScreen(element, "programs");
      const focused = await deleteCard(element, "p2", "Teens", [
        ["p1", "Main"],
        ["p3", "Sports"]
      ]);
      expect(live(element)).toBe("Deleted Teens");
      expect(focused).toEqual(["name:Sports"]);
    });

    it("goes to the card above when the last one is deleted", async () => {
      getSeasonSetup.mockResolvedValue(
        programs(["p1", "Main"], ["p2", "Teens"])
      );
      const element = await render();
      await openScreen(element, "programs");
      const focused = await deleteCard(element, "p2", "Teens", [
        ["p1", "Main"]
      ]);
      expect(live(element)).toBe("Deleted Teens");
      expect(focused).toEqual(["name:Main"]);
    });

    it("goes to Add program when no card is left", async () => {
      getSeasonSetup.mockResolvedValue(programs(["p1", "Main"]));
      const element = await render();
      await openScreen(element, "programs");
      const focused = await deleteCard(element, "p1", "Main", []);
      expect(live(element)).toBe("Deleted Main");
      expect(focused).toEqual(["add-program"]);
    });

    it("says it again when the next delete has the same name", async () => {
      getSeasonSetup.mockResolvedValue(
        programs(["p1", "Main"], ["p2", "Main"], ["p3", "Sports"])
      );
      const element = await render();
      await openScreen(element, "programs");
      await deleteCard(element, "p1", "Main", [
        ["p2", "Main"],
        ["p3", "Sports"]
      ]);
      const first = q(element, '[data-id="programs-announce"]').textContent;
      await deleteCard(element, "p2", "Main", [["p3", "Sports"]]);
      const second = q(element, '[data-id="programs-announce"]').textContent;
      expect(live(element)).toBe("Deleted Main");
      expect(second).not.toBe(first);
    });

    it("says nothing and keeps the cursor when cancelled or refused", async () => {
      getSeasonSetup.mockResolvedValue(
        programs(["p1", "Main"], ["p2", "Teens"])
      );
      const element = await render();
      await openScreen(element, "programs");
      const source = q(element, '[data-screen="programs"] c-shoresh-program');
      const focus = jest.spyOn(HTMLElement.prototype, "focus");
      LightningConfirm.open.mockResolvedValueOnce(nsRecord(false));
      source.dispatchEvent(
        new CustomEvent("delete", { detail: { recordId: "p1", name: "Main" } })
      );
      await flush();
      LightningConfirm.open.mockResolvedValueOnce(nsRecord(true));
      deleteRecord.mockRejectedValueOnce({ body: { message: "Locked." } });
      source.dispatchEvent(
        new CustomEvent("delete", { detail: { recordId: "p1", name: "Main" } })
      );
      await flush();
      const focused = focus.mock.contexts.length;
      focus.mockRestore();
      expect(live(element)).toBe("");
      expect(focused).toBe(0);
    });
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

  it("deleting a week names the special days and events it takes off its days", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(
      nsRecord(
        setupWith({
          special: {
            specialDays: [{ Id: "sd1", Name: "Field Day" }],
            specialEvents: [{ Id: "se1", Name: "Carnival" }],
            briefs: [
              {
                itemId: "sd1",
                planned: false,
                rows: 0,
                periods: [],
                days: [
                  { weekId: "w1", day: "Tuesday" },
                  { weekId: "w2", day: "Friday" }
                ]
              },
              {
                itemId: "se1",
                planned: false,
                rows: 0,
                periods: [],
                days: [
                  { weekId: "w1", day: "Wednesday" },
                  { weekId: "w1", day: "Thursday" }
                ]
              }
            ]
          }
        })
      )
    );
    const element = await render();
    LightningConfirm.open.mockResolvedValue(nsRecord(false));
    q(element, 'c-shoresh-editable-table[data-id="weeks"]').dispatchEvent(
      new CustomEvent("delete", { detail: { recordId: "w1", name: "Week 1" } })
    );
    await flush();
    expect(LightningConfirm.open.mock.calls[0][0].message).toBe(
      'Delete "Week 1"? Anything inside it is deleted too. It takes "Field Day" off Tuesday and "Carnival" off Wednesday and Thursday.'
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
      element.shadowRoot
        .querySelectorAll('lightning-input[data-form="season"]')
        .forEach((input) => {
          input.reportValidity = () => true;
        });
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
      expect(pencil.getAttribute("aria-label")).toBe("Edit Summer 2026");
      // A bare tool of the design system, not Salesforce's blue icon button.
      expect(pencil.className).toContain("shoresh-item_tool");
      expect(pencil.getAttribute("aria-expanded")).toBe("false");
      expect(q(element, '[data-id="season-form"]')).toBeNull();
      await openScreen(element, "weeks");
      expect(
        q(element, '[data-screen="weeks"] [data-form="season"]')
      ).toBeNull();
      expect(button(element, "Delete season")).toBeUndefined();

      pencil.click();
      await flush();
      expect(pencil.getAttribute("aria-expanded")).toBe("true");
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

    it("deleting it asks first, showing what goes with it as counts", async () => {
      deleteRecord.mockResolvedValue();
      const element = await renderSeason();
      button(element, "Delete season").click();
      await flush();
      expect(LightningConfirm.open).not.toHaveBeenCalled();
      const ask = q(element, "c-shoresh-ask");
      expect(ask.heading).toBe("Delete Summer 2026?");
      expect(ask.lines).toEqual([
        "1 Week",
        "1 Program",
        "1 Division",
        "1 Time block"
      ]);
      expect(ask.confirmLabel).toBe("Delete season");
      expect(deleteRecord).not.toHaveBeenCalled();
      ask.dispatchEvent(new CustomEvent("answer", { detail: { yes: true } }));
      await flush();
      expect(deleteRecord).toHaveBeenCalledWith({ recordId: "s1" });
    });

    it("Cancel on delete season deletes nothing", async () => {
      const element = await renderSeason();
      button(element, "Delete season").click();
      await flush();
      q(element, "c-shoresh-ask").dispatchEvent(
        new CustomEvent("answer", { detail: { yes: false } })
      );
      await flush();
      expect(q(element, "c-shoresh-ask")).toBeNull();
      expect(deleteRecord).not.toHaveBeenCalled();
    });

    it("a date saves when the director leaves it, with the other date, and no toast", async () => {
      const element = await renderSeason();
      const toasts = [];
      element.addEventListener("lightning__showtoast", (e) => toasts.push(e));
      typeSeason(element, "end", "2026-08-14");
      await flush();
      expect(saveRecords).not.toHaveBeenCalled();
      leaveSeason(element, "end");
      await flush();
      expect(bareRecord(saveRecords.mock.calls[0][0].records)).toEqual([
        {
          sobjectType: "Season__c",
          Id: "s1",
          StartDate__c: "2026-06-29",
          EndDate__c: "2026-08-14"
        }
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

    it("a refusal that comes after the box was closed with its pencil is said at the top", async () => {
      const element = await renderSeason();
      let refuse;
      saveRecords.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            refuse = reject;
          })
      );
      typeSeason(element, "end", "2026-06-01");
      leaveSeason(element, "end");
      q(element, '[data-id="edit-season"]').click();
      await flush();
      refuse({
        body: { message: "The last day can't be before the first day." }
      });
      await flush();
      expect(q(element, '[data-error="season-end"]')).toBeNull();
      expect(q(element, '[data-id="error"]').textContent).toContain(
        "can't be before the first day"
      );
      // Opened again, the box still shows why, next to the field, with the typing kept.
      q(element, '[data-id="edit-season"]').click();
      await flush();
      expect(q(element, '[data-error="season-end"]').textContent).toContain(
        "can't be before the first day"
      );
      expect(seasonInput(element, "end").value).toBe("2026-06-01");
    });

    it("a refusal that comes after the director picked another season is said at the top", async () => {
      const element = await renderSeason();
      let refuse;
      saveRecords.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            refuse = reject;
          })
      );
      typeSeason(element, "end", "2026-06-01");
      leaveSeason(element, "end");
      await flush();
      getSeasonSetup.mockResolvedValue(
        nsRecord(
          setupWith({ season: { ...SEASON, Id: "s2", Name: "Summer 2027" } })
        )
      );
      q(element, '[data-id="season-picker"]').dispatchEvent(
        new CustomEvent("change", { detail: { value: "s2" } })
      );
      await flush();
      refuse({
        body: { message: "The last day can't be before the first day." }
      });
      await flush();
      // The box shows the other season now: nothing from the first one under its fields.
      expect(q(element, '[data-error="season-end"]')).toBeNull();
      expect(q(element, '[data-id="error"]').textContent).toContain(
        "can't be before the first day"
      );
    });

    it("moving the season later works whichever date is changed first", async () => {
      const element = await renderSeason();
      saveRecords.mockRejectedValueOnce({
        body: { message: "The end date must be on or after the start date." }
      });
      typeSeason(element, "start", "2026-08-17");
      leaveSeason(element, "start");
      await flush();
      expect(q(element, '[data-error="season-start"]').textContent).toContain(
        "on or after the start date"
      );

      typeSeason(element, "end", "2026-09-04");
      leaveSeason(element, "end");
      await flush();
      expect(bareRecord(saveRecords.mock.calls[1][0].records)).toEqual([
        {
          sobjectType: "Season__c",
          Id: "s1",
          StartDate__c: "2026-08-17",
          EndDate__c: "2026-09-04"
        }
      ]);
      // Both dates saved: the first day's old refusal is gone, and nothing is left to send.
      expect(q(element, '[data-error="season-start"]')).toBeNull();
      expect(q(element, '[data-error="season-end"]')).toBeNull();
      expect(seasonMark(element).textContent).toContain("Saved");
      leaveSeason(element, "start");
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
      columns: [
        "Name",
        "GroupsThatFit__c",
        "heldHere",
        "LocationType__c",
        "Notes__c"
      ],
      defaults: { Season__c: "s1", GroupsThatFit__c: 1 }
    });
    expect(bareName(table("locations").filterField)).toBe("LocationType__c");
    await openScreen(element, "activities");
    // As docs/design/setup/activities.html: activity, location, how often (at least and at
    // most, one column), who; the rest is in the details beside the table.
    expect(shape(table("activities"))).toEqual({
      object: "Activity__c",
      columns: ["Name", "Location__c", "TimesPerWeekMin__c", "whoCanDoIt"],
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

  it("counts what a season holds, in the camp's words, saved schedules last", () => {
    const t = buildTerms(LABELS);
    expect(
      seasonContents(
        {
          weeks: [{}, {}],
          locations: [{}],
          activities: [],
          schedules: [{}, {}, {}],
          programs: [
            {
              divisions: [{ groups: [{}, {}] }, { groups: [{}] }],
              timeBlocks: [],
              fixedActivities: [{}],
              recurringActivities: []
            }
          ]
        },
        t
      )
    ).toEqual([
      "2 Weeks",
      "1 Program",
      "2 Divisions",
      "3 Bunks",
      "1 Location",
      "1 Fixed activity",
      "3 saved schedules"
    ]);
    expect(seasonContents({}, t)).toEqual(["Nothing set up in it yet"]);
  });

  it("a screen picked from the menu gets the cursor on its heading", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const element = await render();
    await openScreen(element, "locations");
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-screen="locations"] [data-heading]')
    );
    await openScreen(element, "schedules");
    const heading = q(element, '[data-screen="schedules"] [data-heading]');
    expect(element.shadowRoot.activeElement).toBe(heading);
    // The Schedules page is laid out as Manual Build: its name read out, not shown (the menu
    // shows it), and its rail and grid the frame's own zones.
    expect(heading.classList.contains("slds-assistive-text")).toBe(true);
    expect(q(element, ".body_flush")).not.toBeNull();
  });

  it("picking the screen already open puts the cursor on its heading now, not at a later redraw", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const element = await render();
    const heading = q(element, '[data-screen="weeks"] [data-heading]');
    await openScreen(element, "weeks");
    expect(element.shadowRoot.activeElement).toBe(heading);
    q(element, '[data-id="season-menu"]').focus();
    await openScreen(element, "weeks");
    expect(element.shadowRoot.activeElement).toBe(heading);
    // Nothing left waiting: the next redraw puts the cursor where that action says.
    await seasonAction(element, "New season");
    await flush();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="new-season-title"]')
    );
  });

  it("Roots and Camp words, drawn by their own components, focus their own headings", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const element = await render();
    const roots = q(element, "c-shoresh-roots");
    roots.focusHeading = jest.fn();
    await openScreen(element, "weeks");
    await openScreen(element, "roots");
    expect(roots.focusHeading).toHaveBeenCalled();
  });

  it("opens Bring in choices only from the page's address, never from the menu (electives stay Coming)", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    choicesSetup.mockResolvedValue({ sets: [], runs: [], answers: [] });
    const element = await render();
    expect(shownScreens(element)).toEqual(["roots"]);
    expect(q(element, "c-shoresh-choices-import")).toBeNull();
    expect(
      q(element, "c-shoresh-menu").shadowRoot.querySelector(
        'a[data-screen="bringInChoices"]'
      )
    ).toBeNull();
    // Another screen in the address is not opened this way.
    pageAddress({ c__preview: "weeks" });
    await flush();
    expect(shownScreens(element)).toEqual(["roots"]);
    pageAddress({ c__preview: "bringInChoices" });
    await flush();
    expect(shownScreens(element)).toEqual(["bringInChoices"]);
    expect(q(element, "c-shoresh-choices-import")).not.toBeNull();
    expect(choicesSetup).toHaveBeenCalledWith({ seasonId: "s1" });
  });

  it("reads the season again when Bring in choices adds to it, so every screen has the new activity", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    choicesSetup.mockResolvedValue({ sets: [], runs: [], answers: [] });
    const element = await render();
    pageAddress({ c__preview: "bringInChoices" });
    await flush();
    const reads = getSeasonSetup.mock.calls.length;
    q(element, "c-shoresh-choices-import").dispatchEvent(
      new CustomEvent("seasonchanged")
    );
    await flush();
    expect(getSeasonSetup.mock.calls.length).toBe(reads + 1);
    expect(shownScreens(element)).toEqual(["bringInChoices"]);
  });

  it("an address asking for Bring in choices before the season is read opens it once it is", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    let answer;
    getSeasonSetup.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    choicesSetup.mockResolvedValue({ sets: [], runs: [], answers: [] });
    const element = await render();
    pageAddress({ c__preview: "bringInChoices" });
    await flush();
    answer(nsRecord(setupWith()));
    await flush();
    await flush();
    expect(shownScreens(element)).toEqual(["bringInChoices"]);
  });

  it("a new message at the top is brought into view", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const scrolled = [];
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function record() {
      scrolled.push(this.dataset.id);
    };
    try {
      addWeeksFromSeasonDates.mockRejectedValue({
        body: { message: "No dates." }
      });
      getSeasonSetup.mockResolvedValue(nsRecord(setupWith({ weeks: [] })));
      const element = await render();
      await openScreen(element, "weeks");
      q(element, '[data-id="fill-weeks"]').click();
      await flush();
      expect(q(element, '[data-id="error"]')).not.toBeNull();
      expect(scrolled).toEqual(["error"]);
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("New season: no instructions, cursor on its heading, and back on the button after Cancel", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const focused = [];
    const spy = jest
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function record() {
        focused.push(this);
      });
    try {
      const element = await render();
      await seasonAction(element, "New season");
      await flush();
      expect(focused.pop().dataset.id).toBe("new-season-title");
      expect(element.shadowRoot.textContent).not.toContain("Give it a name");
      expect(element.shadowRoot.textContent).not.toContain("go back and use");
      button(element, "Cancel").click();
      await flush();
      // Back on the camp row's menu that opened it (its rows show only while it is open).
      expect(focused.pop().dataset.id).toBe("button");
      await seasonAction(element, "Copy this season");
      await flush();
      q(element, "c-shoresh-copy-season").dispatchEvent(
        new CustomEvent("cancel")
      );
      await flush();
      expect(focused.pop().dataset.id).toBe("button");
    } finally {
      spy.mockRestore();
    }
  });

  it("opens the copy panel, and camp words from the menu", async () => {
    getCamps.mockResolvedValue(nsRecord([CAMP]));
    getSeasons.mockResolvedValue(nsRecord([SEASON]));
    getSeasonSetup.mockResolvedValue(nsRecord(setupWith()));
    const element = await render();
    await seasonAction(element, "Copy this season");
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
    await seasonAction(element, "Copy this season");
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
    expect(locations.weeksHeading).toBe("Weeks");
    // A place is closed in a week, not off.
    expect(locations.weekWords.off).toBe("Closed");
    expect(locations.weeks.map((w) => w.Id)).toEqual(["w1"]);
    expect(locations.weekExceptions.length).toBe(1);
    expect(
      q(element, 'c-shoresh-editable-table[data-id="activities"]').weeksHeading
    ).toBe("Weeks");
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
      // What didn't happen, then why.
      expect(question.error).toBe(`Nothing was merged into "Pool". ${refusal}`);
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

    it("an activity's details open from its row's Details, and Close goes back to that button", async () => {
      const element = await renderWith(
        setupWith({
          activities: [
            { Id: "a1", Name: "Archery" },
            { Id: "a2", Name: "Swim" }
          ]
        })
      );
      await openScreen(element, "activities");
      const table = q(
        element,
        'c-shoresh-editable-table[data-id="activities"]'
      );
      const details = q(element, "c-shoresh-activity-details");
      expect(details.openActivityId).toBeNull();
      const swim = table.shadowRoot.querySelector(
        '[data-id="details"][data-row-key="row-a2"]'
      );
      expect(swim.getAttribute("aria-label")).toBe("Swim details");
      swim.click();
      await flush();
      await flush();
      expect(details.openActivityId).toBe("a2");
      expect(swim.getAttribute("aria-expanded")).toBe("true");
      details.shadowRoot.querySelector('[data-id="close"]').click();
      await flush();
      await flush();
      expect(details.openActivityId).toBeNull();
      expect(swim.getAttribute("aria-expanded")).toBe("false");
      expect(table.shadowRoot.activeElement).toBe(swim);
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

    it("camp words saved as the director clicks New season or Copy this season: that form stays open", async () => {
      const element = await renderWith();
      await openScreen(element, "campWords");
      const words = q(element, "c-shoresh-camp-labels");
      // Leaving the box starts the save; the click lands before it answers.
      await seasonAction(element, "New season");
      await flush();
      words.dispatchEvent(new CustomEvent("saved"));
      await flush();
      expect(
        q(element, 'lightning-input[data-form="new-season"]')
      ).not.toBeNull();
      expect(shownScreens(element)).toEqual([]);

      button(element, "Cancel").click();
      await flush();
      await seasonAction(element, "Copy this season");
      await flush();
      words.dispatchEvent(new CustomEvent("saved"));
      await flush();
      expect(q(element, "c-shoresh-copy-season")).not.toBeNull();
      expect(shownScreens(element)).toEqual([]);
    });

    it("camp words refused: under the box only while camp words shows, and at the top once it doesn't", async () => {
      const element = await renderWith();
      await openScreen(element, "campWords");
      const words = q(element, "c-shoresh-camp-labels");
      const refused = new CustomEvent("failed", {
        detail: {
          message: "Camp words not saved. Your changes are still here. No."
        }
      });
      words.dispatchEvent(refused);
      await flush();
      expect(q(element, '[data-id="error"]')).toBeNull();

      // The director clicked "Activities →" as they left the box; the refusal comes after.
      q(
        element,
        '[data-screen="campWords"] lightning-button[data-id="next"]'
      ).click();
      await flush();
      words.dispatchEvent(
        new CustomEvent("failed", {
          detail: {
            message: "Camp words not saved. Your changes are still here. No."
          }
        })
      );
      await flush();
      expect(shownScreens(element)).toEqual(["activities"]);
      expect(q(element, '[data-id="error"]').textContent).toContain(
        "Camp words not saved. Your changes are still here. No."
      );
    });

    it("a form field refused after the director went on to the next screen: said at the top too", async () => {
      let refuse;
      saveActivityDetails.mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            refuse = reject;
          })
      );
      const element = await renderWith(
        setupWith({ activities: [{ Id: "a1", Name: "Archery" }] })
      );
      await openScreen(element, "activities");
      const onFailure = jest.fn();
      // Leaving the last field sends it; the click on "Fixed activities →" opens the next screen.
      q(element, "c-shoresh-activity-details").dispatchEvent(
        new CustomEvent("save", {
          detail: {
            rules: nsRecord({ sobjectType: "Activity__c", Id: "a1" }),
            whoCanDoIt: [],
            onSaved: jest.fn(),
            onFailure
          }
        })
      );
      q(
        element,
        '[data-screen="activities"] lightning-button[data-id="next"]'
      ).click();
      await flush();
      refuse({ body: { message: "Pick the day for the early-week count." } });
      await flush();
      const message =
        "Activity details not saved. Your changes are still here. Pick the day for the early-week count.";
      expect(onFailure).toHaveBeenCalledWith(message);
      expect(shownScreens(element)).toEqual(["fixedActivities"]);
      expect(q(element, '[data-id="error"]').textContent).toContain(message);
    });
    it("an activity's details refused after the director picked another activity: said at the top", async () => {
      let refuse;
      saveActivityDetails.mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            refuse = reject;
          })
      );
      const element = await renderWith(
        setupWith({ activities: [{ Id: "a1", Name: "Archery" }] })
      );
      await openScreen(element, "activities");
      const onFailure = jest.fn();
      q(element, "c-shoresh-activity-details").dispatchEvent(
        new CustomEvent("save", {
          detail: {
            rules: nsRecord({ sobjectType: "Activity__c", Id: "a1" }),
            whoCanDoIt: [],
            onSaved: jest.fn(),
            onFailure,
            // The form shows another activity now.
            shown: () => false
          }
        })
      );
      await flush();
      refuse({ body: { message: "Pick the day for the early-week count." } });
      await flush();
      const message =
        "Activity details not saved. Your changes are still here. Pick the day for the early-week count.";
      expect(onFailure).toHaveBeenCalledWith(message);
      expect(shownScreens(element)).toEqual(["activities"]);
      expect(q(element, '[data-id="error"]').textContent).toContain(message);
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
        "recurringActivities",
        "specialEvents"
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
        ["recurringActivities", "Special events →"],
        // The last setup screen: Generated Schedule and Manual Build are equal, so neither is
        // picked.
        ["specialEvents", null]
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

    it("uses the camp's words, with nothing coming just now", async () => {
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
      expect(items).toContainEqual(["Special events", false]);
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
      await seasonAction(element, "New season");
      await flush();
      expect(element.shadowRoot.textContent).toContain("Start a new season");
    });
  });

  describe("rules Shoresh guessed, marked for a look (ADR 0006 §21)", () => {
    const GUESSED = {
      activities: [
        {
          Id: "a1",
          Name: "Archery",
          TimesPerWeekMin__c: 2,
          TimesPerWeekMax__c: 3,
          Eligibilities__r: []
        }
      ],
      locations: [{ Id: "l1", Name: "Pool", GroupsThatFit__c: 2 }],
      programs: [
        {
          program: { Id: "p1", Name: "Main", Monday__c: true },
          timeBlocks: [{ Id: "t1", Name: "Period 1" }],
          divisions: [
            {
              division: { Id: "d1", Name: "Juniors" },
              groups: [
                { Id: "g1", Name: "Cedar" },
                { Id: "g2", Name: "Birch" }
              ]
            }
          ]
        }
      ],
      guesses: [
        { recordId: "a1", field: "often" },
        { recordId: "a1", field: "who" },
        { recordId: "l1", field: "fits" },
        { recordId: "g1", field: "division", value: "Juniors" }
      ]
    };
    async function renderWith(overrides = {}) {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(
        nsRecord(setupWith({ ...GUESSED, ...overrides }))
      );
      return render();
    }
    const table = (element, id) =>
      q(element, `c-shoresh-editable-table[data-id="${id}"]`);

    it("each table gets its marks, on the guessed cell, in the camp's words", async () => {
      const element = await renderWith();
      const activities = table(element, "activities").guesses;
      expect(activities.a1).toEqual({
        [nsName("TimesPerWeekMin__c")]: {
          field: "often",
          words: "Guessed from your file",
          name: "How often for Archery: guessed from your file"
        },
        whoCanDoIt: {
          field: "who",
          words: "Guessed from your file",
          name: "Who for Archery: guessed from your file"
        }
      });
      expect(
        table(element, "locations").guesses.l1[nsName("GroupsThatFit__c")]
      ).toEqual(expect.objectContaining({ field: "fits" }));
      // Why a bunk is in its unit: only the one whose unit came from its file's name.
      const groups = q(
        element,
        '[data-screen="groups"] c-shoresh-program'
      ).guesses;
      expect(groups.g1).toEqual({
        Name: {
          field: "division",
          words: "Juniors guessed from the file name",
          name: "Cedar: Juniors guessed from the file name"
        }
      });
      expect(groups.g2).toBeUndefined();
    });

    it("nothing guessed, nothing marked", async () => {
      const element = await renderWith({ guesses: [] });
      expect(table(element, "activities").guesses).toEqual({});
    });

    it("Looks right: the camp forgets it, the season is read again, then the table is told", async () => {
      confirmGuess.mockResolvedValue(undefined);
      const element = await renderWith();
      const order = [];
      getSeasonSetup.mockImplementation(() => {
        order.push("reload");
        return Promise.resolve(
          nsRecord(setupWith({ ...GUESSED, guesses: [] }))
        );
      });
      table(element, "activities").dispatchEvent(
        new CustomEvent("confirmguess", {
          detail: {
            recordId: "a1",
            field: "often",
            onDone: () => order.push("table told")
          }
        })
      );
      await flush();
      await flush();
      await flush();
      expect(confirmGuess).toHaveBeenCalledWith({
        recordId: "a1",
        field: "often"
      });
      expect(order).toEqual(["reload", "table told"]);
      expect(table(element, "activities").guesses).toEqual({});
    });

    it("a refusal says so and changes nothing", async () => {
      confirmGuess.mockRejectedValue({ body: { message: "Not found." } });
      const element = await renderWith();
      const onDone = jest.fn();
      table(element, "locations").dispatchEvent(
        new CustomEvent("confirmguess", {
          detail: { recordId: "l1", field: "fits", onDone }
        })
      );
      await flush();
      await flush();
      expect(onDone).not.toHaveBeenCalled();
      expect(element.shadowRoot.textContent).toContain(
        "Not marked as looked at. Nothing was changed."
      );
    });
  });
  // ADR 0014 choice 11 (design-research special-r1 special-events.html, decision 47).
  describe("Special events", () => {
    const SPECIAL = {
      specialDays: [
        { Id: "sd1", Name: "Color War", Notes__c: "Teams at breakfast" },
        { Id: "sd2", Name: "Rainy Day" }
      ],
      specialEvents: [
        { Id: "se1", Name: "Carnival", Location__c: "l1" },
        { Id: "se2", Name: "Fire Truck Visit" }
      ],
      briefs: [
        {
          itemId: "sd1",
          planned: true,
          rows: 2,
          periods: [
            {
              name: "Period 1",
              startTime: "09:00",
              endTime: "09:45",
              items: []
            },
            {
              name: "Lunch",
              startTime: "12:00",
              endTime: "12:45",
              items: ["Lunch break"]
            }
          ],
          days: [{ weekId: "w2", day: "Thursday" }]
        },
        { itemId: "sd2", planned: false, rows: 0, periods: [], days: [] },
        {
          itemId: "se1",
          planned: false,
          rows: 0,
          periods: [],
          days: [
            { weekId: "w1", day: "Tuesday" },
            { weekId: "w2", day: "Tuesday" }
          ]
        },
        { itemId: "se2", planned: false, rows: 0, periods: [], days: [] }
      ]
    };
    const WEEKS = [
      { Id: "w1", Name: "Week 1", StartDate__c: "2026-06-29" },
      { Id: "w2", Name: "Week 2", StartDate__c: "2026-07-06" }
    ];
    async function renderSpecial(special = SPECIAL) {
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(
        nsRecord(
          setupWith({
            weeks: WEEKS,
            locations: [{ Id: "l1", Name: "Main field" }],
            special
          })
        )
      );
      const element = await render();
      await openScreen(element, "specialEvents");
      return element;
    }
    const list = (element, kind) =>
      q(element, `c-shoresh-editable-table[data-id="special-${kind}"]`);
    const readonly = (table, column) =>
      [
        ...table.shadowRoot.querySelectorAll(
          `[data-id="readonly"][data-column="${column}"]`
        )
      ].map((cell) => cell.textContent);

    it("opens from the menu: one list of special days and events, counted on the rail", async () => {
      const element = await renderSpecial();
      expect(shownScreens(element)).toEqual(["specialEvents"]);
      const counted = (id) =>
        q(element, `[data-screen="specialEvents"] [data-id="${id}"]`)
          .textContent.replace(/\s+/g, " ")
          .trim();
      expect(counted("count")).toBe("2 special days");
      expect(counted("count-events")).toBe("2 events");
      const days = list(element, "days");
      const events = list(element, "events");
      expect(days.heading).toBe("Special days");
      expect(days.showColumns).toBe(true);
      expect(events.heading).toBe("Events");
      expect(events.showColumns).toBe(false);
      expect(days.objectApiName).toBe(nsName("SpecialDay__c"));
      expect(events.objectApiName).toBe(nsName("SpecialEvent__c"));
      expect(days.addLabel).toBe("Add Special day");
      expect(events.addLabel).toBe("Add Event");
      expect(days.columns.map((c) => c.label)).toEqual([
        "Name",
        "Where",
        "Schedule",
        "Placed on",
        "Notes"
      ]);
      expect(events.columns.map((c) => c.label)).toEqual(
        days.columns.map((c) => c.label)
      );
      // The two lists line up: the same widths, column by column.
      expect(events.columns.map((c) => c.width)).toEqual(
        days.columns.map((c) => c.width)
      );
      // Worked out: where (the whole camp), its time blocks, the days it is on; quiet when none.
      // The blank row has nothing worked out yet.
      expect(readonly(days, "where")).toEqual([
        "Whole camp",
        "Whole camp",
        "Whole camp"
      ]);
      expect(readonly(days, "schedule")).toEqual(["2 time blocks", "None", ""]);
      expect(readonly(days, "placedOn")).toEqual([
        "Wk 2 Thu",
        "Not placed",
        ""
      ]);
      expect(readonly(events, "schedule")).toEqual(["None", "None", ""]);
      expect(readonly(events, "placedOn")).toEqual([
        "Wk 1 Tue, Wk 2 Tue",
        "Not placed",
        ""
      ]);
      const event = events.columns.find((c) => c.label === "Where");
      expect(event.type).toBe("picklist");
      expect(event.options).toEqual([
        { label: "None", value: "" },
        { label: "Main field", value: "l1" }
      ]);
      // axe looks at this screen once, with an item's details open (below): a second whole-page
      // check takes CI's shared runners past the test's time.
    });

    it("a camp's own word for events is used; the default is shortened to Event", async () => {
      getLabels.mockResolvedValue(
        nsRecord([
          ...LABELS,
          {
            term: "SpecialEvent",
            singular: "Happening",
            plural: "Happenings",
            isCustom: true
          }
        ])
      );
      getCamps.mockResolvedValue(nsRecord([CAMP]));
      getSeasons.mockResolvedValue(nsRecord([SEASON]));
      getSeasonSetup.mockResolvedValue(
        nsRecord(
          setupWith({
            weeks: WEEKS,
            special: SPECIAL,
            labels: [
              ...LABELS,
              {
                term: "SpecialEvent",
                singular: "Happening",
                plural: "Happenings",
                isCustom: true
              }
            ]
          })
        )
      );
      const element = await render();
      await openScreen(element, "specialEvents");
      expect(list(element, "events").heading).toBe("Happenings");
      expect(list(element, "events").addLabel).toBe("Add Happening");
    });

    it("a new row starts in the season; a special day added says what it started from", async () => {
      const element = await renderSpecial();
      const days = list(element, "days");
      expect(bareRecord(days.newRowDefaults)).toEqual({ Season__c: "s1" });
      expect(bareRecord(list(element, "events").newRowDefaults)).toEqual({
        Season__c: "s1"
      });
      saveRow.mockResolvedValue(
        nsRecord({
          id: "sd3",
          changed: [],
          seeded: {
            program: "Main",
            timeBlocks: 7,
            broughtIn: ["Lunch", "Rest hour"],
            notEveryDay: ["Swim"],
            notEveryWeek: [],
            otherTimes: [],
            slotTaken: ["Flag · Bunk 3"]
          }
        })
      );
      const onSaved = jest.fn();
      days.dispatchEvent(
        new CustomEvent("save", {
          detail: {
            record: nsRecord({
              sobjectType: "SpecialDay__c",
              Name: "Visiting Day",
              Season__c: "s1",
              SortOrder__c: 3
            }),
            seen: null,
            seenWho: null,
            extras: { weeksOff: [], weeksBackOn: [] },
            onSaved,
            onFailure: jest.fn(),
            onDone: jest.fn()
          }
        })
      );
      await flush();
      await flush();
      expect(sentTo(saveRow)[0].record).toEqual({
        sobjectType: "SpecialDay__c",
        Name: "Visiting Day",
        Season__c: "s1",
        SortOrder__c: 3
      });
      expect(onSaved).toHaveBeenCalled();
      const note = q(element, '[data-id="seeded-note"]');
      expect(note.getAttribute("role")).toBe("status");
      expect(note.textContent).toBe(
        '"Visiting Day" starts from Main\'s 7 time blocks, with Lunch and Rest hour brought in. ' +
          "Not brought in, since they don't run every day: Swim. " +
          "Not brought in, since the time was already taken: Flag · Bunk 3."
      );
    });

    it("an item's details open beside the list from its chevron, and Close goes back to it", async () => {
      const element = await renderSpecial();
      const events = list(element, "events");
      const details = q(element, "c-shoresh-special-details");
      expect(details.openItemId).toBeNull();
      const carnival = events.shadowRoot.querySelector(
        '[data-id="details"][data-row-key="row-se1"]'
      );
      expect(carnival.getAttribute("aria-label")).toBe("Carnival details");
      carnival.click();
      await flush();
      expect(details.openItemId).toBe("se1");
      expect(carnival.getAttribute("aria-expanded")).toBe("true");
      expect(
        details.shadowRoot.querySelector('[data-id="where"]').textContent
      ).toBe("Main field");
      await expect(element).toBeAccessible();
      details.shadowRoot.querySelector('[data-id="close"]').click();
      await flush();
      expect(details.openItemId).toBeNull();
      expect(carnival.getAttribute("aria-expanded")).toBe("false");
      expect(events.shadowRoot.activeElement).toBe(carnival);
    });

    it("Open schedule opens the item's schedule in the list's place; back finds the list as it was", async () => {
      const element = await renderSpecial();
      openPlan.mockResolvedValue({
        itemId: "se1",
        kind: "SpecialEvent",
        name: "Carnival",
        revision: null,
        schedule: {
          schedule: { id: "se1", name: "Carnival" },
          days: [
            {
              dateValue: "2000-01-03",
              blocks: [],
              groups: [],
              items: [],
              rows: [],
              locks: []
            }
          ]
        },
        activities: []
      });
      list(element, "events")
        .shadowRoot.querySelector('[data-id="details"][data-row-key="row-se1"]')
        .click();
      await flush();
      const details = q(element, "c-shoresh-special-details");
      details.shadowRoot.querySelector('[data-id="open-schedule"]').click();
      await flush();
      const schedule = q(element, "c-shoresh-special-schedule");
      expect(schedule.itemId).toBe("se1");
      expect(openPlan).toHaveBeenCalledWith({ itemId: "se1" });
      expect(q(element, '[data-id="special-list"]').className).toBe(
        "slds-hide"
      );
      // Something saved inside: the season is read again on the way back, for the list's counts.
      const reads = getSeasonSetup.mock.calls.length;
      schedule.dispatchEvent(new CustomEvent("changed"));
      schedule.dispatchEvent(
        new CustomEvent("close", { detail: { itemId: "se1" } })
      );
      await flush();
      expect(q(element, "c-shoresh-special-schedule")).toBeNull();
      expect(q(element, '[data-id="special-list"]').className).toBe("");
      expect(details.openItemId).toBe("se1");
      expect(details.shadowRoot.activeElement).toBe(
        details.shadowRoot.querySelector('[data-id="open-schedule"]')
      );
      expect(getSeasonSetup.mock.calls.length).toBe(reads + 1);
    });

    it("a row's delete asks, then deletes it and reads the season again", async () => {
      const element = await renderSpecial();
      LightningConfirm.open.mockResolvedValue(true);
      scheduleUses.mockResolvedValue({ schedules: 0, complete: true });
      deleteRecord.mockResolvedValue();
      const onDeleted = jest.fn();
      list(element, "days").dispatchEvent(
        new CustomEvent("delete", {
          detail: { recordId: "sd2", name: "Rainy Day", onDeleted }
        })
      );
      await flush();
      await flush();
      expect(deleteRecord).toHaveBeenCalledWith({ recordId: "sd2" });
      expect(onDeleted).toHaveBeenCalled();
    });

    it("deleting a season counts its special days and events", () => {
      const t = buildTerms(LABELS);
      expect(
        seasonContents(
          {
            weeks: [],
            programs: [],
            special: {
              specialDays: [{ Id: "sd1" }],
              specialEvents: [{ Id: "se1" }, { Id: "se2" }]
            }
          },
          t
        )
      ).toEqual(["1 Special day", "2 Special events"]);
    });

    it("an empty season shows each section's blank row", async () => {
      const element = await renderSpecial(null);
      expect(list(element, "days").rows).toEqual([]);
      expect(list(element, "events").rows).toEqual([]);
      expect(q(element, '[data-id="count"]')).not.toBeNull();
    });
  });
});
