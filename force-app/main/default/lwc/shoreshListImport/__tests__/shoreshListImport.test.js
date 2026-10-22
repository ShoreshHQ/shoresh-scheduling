import { createElement } from "lwc";
import ShoreshListImport from "c/shoreshListImport";
import saveList from "@salesforce/apex/ImportController.saveList";
import saveWorkbook from "@salesforce/apex/ImportController.saveWorkbook";
import getAnswers from "@salesforce/apex/ImportController.getAnswers";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import LightningConfirm from "lightning/confirm";
import { buildTerms } from "c/shoreshTerms";
import { bareRecord, nsRecord } from "shoresh-jest/namespace";

jest.mock(
  "@salesforce/apex/ImportController.saveList",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ImportController.saveWorkbook",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ImportController.getAnswers",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ImportController.undoImport",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// A made-up camp: two locations, one activity.
const SETUP = {
  season: { Id: "se1", Name: "Summer 2027", Camp__c: "c1" },
  weeks: [],
  locationTypes: [],
  locations: [
    { Id: "l1", Name: "Gym", GroupsThatFit__c: 2 },
    { Id: "l2", Name: "Pool", GroupsThatFit__c: 1 }
  ],
  activities: [
    {
      Id: "a1",
      Name: "Archery",
      Location__c: "l1",
      Length__c: 1,
      TimesPerWeekMin__c: 2,
      TimesPerWeekMax__c: 3,
      Priority__c: "Low",
      GroupsAtOnce__c: 1,
      Notes__c: "Bring arm guards"
    }
  ],
  programs: []
};

function file(name, text) {
  return { name, text: () => Promise.resolve(text) };
}

const flush = () =>
  [...Array(20)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

async function openWith(text) {
  const element = createElement("c-shoresh-list-import", {
    is: ShoreshListImport
  });
  element.screenKey = "activities";
  element.setup = nsRecord(SETUP);
  element.terms = buildTerms([]);
  document.body.appendChild(element);
  $(element, 'lightning-button[data-id="open"]').click();
  await flush();
  const input = $(element, 'input[data-id="file"]');
  Object.defineProperty(input, "files", {
    value: [file("activities.csv", text)]
  });
  input.dispatchEvent(new CustomEvent("change"));
  await flush();
  return element;
}

function buttonNamed(element, label, within = element.shadowRoot) {
  return [...within.querySelectorAll("lightning-button")].find(
    (b) => b.label === label || (b.label || "").startsWith(label)
  );
}

/** A Keep or Change button (a plain button that says whether it is chosen). */
function choice(label, within) {
  return [...within.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === label
  );
}

describe("c-shoresh-list-import", () => {
  beforeEach(() => {
    getAnswers.mockResolvedValue([]);
    saveList.mockResolvedValue({
      added: { Activity: 1, Location: 1 },
      changed: { Activity: 1 },
      importId: "imp1"
    });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("an activity deleted before is listed with Bring back, not added; brought back, the save forgets the deletion", async () => {
    getAnswers.mockResolvedValue([
      { key: "deleted|Activity||Canoeing", answer: "deleted" }
    ]);
    const element = await openWith(
      ["Activity,Length", "Canoeing,1", "Hiking,1"].join("\n")
    );
    const deleted = $(element, '[data-id="deleted"]');
    expect(deleted.textContent).toContain("Canoeing");
    expect($(element, '[data-id="new"]').textContent).not.toContain("Canoeing");
    const button = deleted.querySelector(
      'button[data-key="deleted|Activity||Canoeing"]'
    );
    expect(button.getAttribute("aria-label")).toBe(
      "Bring back Canoeing, activity"
    );
    button.click();
    await flush();
    expect($(element, '[data-id="deleted"]')).toBeNull();
    expect($(element, '[data-id="new"]').textContent).toContain("Canoeing");
    $(element, 'lightning-button[data-id="save"]').click();
    await flush();
    const plan = bareRecord(JSON.parse(saveList.mock.calls[0][0].plan));
    expect(plan.records.map((r) => r.fields.Name)).toEqual([
      "Canoeing",
      "Hiking"
    ]);
    expect(plan.forget).toEqual(["deleted|Activity||Canoeing"]);
  });

  it("shows the columns, what is new, what differs, and waits for Keep or Change", async () => {
    const element = await openWith(
      [
        "Activity,Location,Notes,Colour",
        "Archery,Gym,,red",
        "Canoeing,Lake,,blue",
        "Hiking,Field,maybe,green"
      ].join("\n")
    );
    // The camp's earlier answers are asked for by the season's camp.
    expect(getAnswers).toHaveBeenCalledWith({ campId: "c1" });
    const headings = $$(element, ".list-heading");
    expect(headings.map((h) => h.textContent)).toEqual([
      "“Activity”",
      "“Location”",
      "“Notes”",
      "“Colour”Not used"
    ]);
    expect(
      $$(element, '[data-id="also-add"] lightning-input').map((box) => [
        box.label,
        box.checked,
        box.disabled
      ])
    ).toEqual([
      ["Field · location", true, true],
      ["Lake · location", true, true]
    ]);
    expect($(element, '[data-id="new"]').textContent).toContain("Canoeing");
    const archery = $(element, '[data-row="Archery"]');
    expect(archery.textContent).toContain("Notes: Bring arm guards → none");
    expect(archery.textContent).toContain("clears");
    expect(buttonNamed(element, "Change all from this file").label).toBe(
      "Change all from this file: 1 change, 1 of them clears a value"
    );
    expect($(element, 'lightning-button[data-id="save"]').disabled).toBe(true);
    expect($(element, '[data-id="waiting"]').textContent).toContain(
      "1 difference to Keep or Change"
    );
  });

  it("saves the list once every difference is answered, then can undo it", async () => {
    const element = await openWith(
      ["Activity,Location,Notes", "Archery,Gym,", "Canoeing,Lake,"].join("\n")
    );
    choice("Keep", $(element, '[data-row="Archery"]')).click();
    await flush();
    const save = $(element, 'lightning-button[data-id="save"]');
    expect(save.disabled).toBe(false);
    expect(save.label).toBe("Add 2");
    save.click();
    await flush();
    const plan = bareRecord(JSON.parse(saveList.mock.calls[0][0].plan));
    expect(plan.files).toBe("activities.csv (Activities)");
    expect(plan.records.map((r) => r.key || r.id)).toEqual([
      "Location:Lake",
      "Activity:Canoeing"
    ]);
    expect($(element, '[data-id="summary"]').textContent).toContain(
      "Added 1 activity"
    );
    LightningConfirm.open = jest.fn().mockResolvedValue(true);
    undoImport.mockResolvedValue({
      removed: 2,
      restored: 0,
      keptEdited: [],
      keptInUse: [],
      gone: []
    });
    $(element, 'lightning-button[data-id="undo"]').click();
    await flush();
    expect(LightningConfirm.open).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Undo activities.csv?",
        message: "Remove 2 · put back 1"
      })
    );
    expect(undoImport).toHaveBeenCalledWith({ importId: "imp1" });
    expect($(element, '[data-id="undone"]')).not.toBeNull();
  });

  it("says why nothing was saved when the server refuses", async () => {
    saveList.mockRejectedValue({
      body: { message: "Canoeing: Must be 1 or more." }
    });
    const element = await openWith(["Activity", "Canoeing"].join("\n"));
    $(element, 'lightning-button[data-id="save"]').click();
    await flush();
    expect($(element, '[data-id="error"]').textContent).toBe(
      "Nothing was saved. Canoeing: Must be 1 or more."
    );
  });

  it("a rain plan to add can be unticked: the row is saved without it", async () => {
    const element = await openWith(
      ["Activity,Rain plan", "Hiking,Movies"].join("\n")
    );
    const box = $(element, '[data-id="also-add"] lightning-input');
    expect([box.label, box.checked, box.disabled]).toEqual([
      "Movies · activity",
      true,
      undefined
    ]);
    box.dispatchEvent(
      new CustomEvent("change", { detail: { checked: false } })
    );
    await flush();
    $(element, 'lightning-button[data-id="save"]').click();
    await flush();
    const plan = bareRecord(JSON.parse(saveList.mock.calls[0][0].plan));
    expect(plan.records.map((r) => [r.key, r.refs.RainPlan__c])).toEqual([
      ["Activity:Hiking", null]
    ]);
    expect($(element, '[data-id="summary"]').textContent).toContain(
      "Hiking · no rain plan"
    );
  });

  it("Change all leaves a Keep already chosen", async () => {
    const element = await openWith(
      ["Activity,Location,Notes", "Archery,Field,x"].join("\n")
    );
    const archery = $(element, '[data-row="Archery"]');
    choice("Keep", archery).click();
    await flush();
    const all = $(element, 'lightning-button[data-id="change-all"]');
    expect(all.label).toBe("Change the other 1");
    all.click();
    await flush();
    $(element, 'lightning-button[data-id="save"]').click();
    await flush();
    const plan = bareRecord(JSON.parse(saveList.mock.calls[0][0].plan));
    expect(plan.records).toEqual([
      { kind: "Activity", id: "a1", fields: { Notes__c: "x" }, refs: {} }
    ]);
  });

  it("a new program's days and a new time block's times are answered in the card", async () => {
    const element = createElement("c-shoresh-list-import", {
      is: ShoreshListImport
    });
    element.screenKey = "fixedActivities";
    element.setup = nsRecord({
      ...SETUP,
      programs: [
        {
          program: { Id: "p1", Name: "Main", Monday__c: true },
          timeBlocks: [],
          divisions: [],
          fixedActivities: [],
          recurringActivities: []
        }
      ]
    });
    element.terms = buildTerms([]);
    document.body.appendChild(element);
    $(element, 'lightning-button[data-id="open"]').click();
    await flush();
    const input = $(element, 'input[data-id="file"]');
    Object.defineProperty(input, "files", {
      value: [
        file(
          "fixed.csv",
          ["Program,Fixed activity,Time block", "Teens,Snack,Break"].join("\n")
        )
      ]
    });
    input.dispatchEvent(new CustomEvent("change"));
    await flush();
    const days = $(element, "lightning-checkbox-group");
    // Monday to Friday, ticked to start with.
    expect(days.value).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday"
    ]);
    days.dispatchEvent(
      new CustomEvent("change", { detail: { value: ["Monday", "Friday"] } })
    );
    buttonNamed(element, "Use these days").click();
    await flush();
    const [start, end] = $$(element, "lightning-input").filter(
      (box) => box.type === "time"
    );
    start.dispatchEvent(
      new CustomEvent("change", { detail: { value: "10:00:00.000" } })
    );
    end.dispatchEvent(
      new CustomEvent("change", { detail: { value: "10:30:00.000" } })
    );
    buttonNamed(element, "Use these times").click();
    await flush();
    const labels = $$(element, '[data-id="also-add"] lightning-input').map(
      (box) => box.label
    );
    expect(labels).toEqual([
      "Teens · program · Monday, Friday",
      "Break · time block · 10:00 AM–10:30 AM"
    ]);
    expect($(element, 'lightning-button[data-id="save"]').label).toBe("Add 3");
  });

  it("keeps the cursor on the way: heading, next question, Save, Saved, then back to the button", async () => {
    const focused = [];
    const spy = jest
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function record() {
        focused.push(this);
      });
    try {
      const element = createElement("c-shoresh-list-import", {
        is: ShoreshListImport
      });
      element.screenKey = "fixedActivities";
      element.setup = nsRecord({
        ...SETUP,
        programs: [
          {
            program: { Id: "p1", Name: "Main", Monday__c: true },
            timeBlocks: [],
            divisions: [],
            fixedActivities: [],
            recurringActivities: []
          }
        ]
      });
      element.terms = buildTerms([]);
      document.body.appendChild(element);
      $(element, 'lightning-button[data-id="open"]').click();
      await flush();
      expect(focused.pop().hasAttribute("data-heading")).toBe(true);
      const status = () => $(element, '[data-id="status"]');
      expect(status().getAttribute("role")).toBe("status");
      const input = $(element, 'input[data-id="file"]');
      Object.defineProperty(input, "files", {
        value: [
          file(
            "fixed.csv",
            ["Program,Fixed activity,Time block", "Teens,Snack,Break"].join(
              "\n"
            )
          )
        ]
      });
      input.dispatchEvent(new CustomEvent("change"));
      await flush();
      buttonNamed(element, "Use these days").click();
      await flush();
      // On to the next open question: the times card's first box.
      const next = focused.pop();
      expect(next.type).toBe("time");
      const [start, end] = $$(element, "lightning-input").filter(
        (box) => box.type === "time"
      );
      start.dispatchEvent(
        new CustomEvent("change", { detail: { value: "10:00:00.000" } })
      );
      end.dispatchEvent(
        new CustomEvent("change", { detail: { value: "10:30:00.000" } })
      );
      buttonNamed(element, "Use these times").click();
      await flush();
      expect(focused.pop().dataset.id).toBe("save");
      $(element, 'lightning-button[data-id="save"]').click();
      await flush();
      expect(focused.pop().dataset.id).toBe("saved");
      expect(status().textContent.trim()).toBe("Saved");
      const close = $(element, 'lightning-button[data-id="done"]');
      expect(close.label).toBe("Close");
      close.click();
      await flush();
      expect(focused.pop().dataset.id).toBe("open");
    } finally {
      spy.mockRestore();
    }
  });

  it("a new row's blank required cell shows its starting value", async () => {
    const element = await openWith(["Activity,Length", "Canoeing,"].join("\n"));
    expect($(element, '[data-id="new"]').textContent).toContain(
      "starting value: Length"
    );
  });
});

describe("Download this list", () => {
  function panel(setup) {
    const element = createElement("c-shoresh-list-import", {
      is: ShoreshListImport
    });
    element.screenKey = "activities";
    element.setup = nsRecord(setup);
    element.terms = buildTerms([]);
    document.body.appendChild(element);
    return element;
  }

  it("saves this screen's list as a file", async () => {
    window.XLSX = require("xlsx");
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => undefined;
    const saved = [];
    const spy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function click() {
        saved.push(this);
      });
    const element = panel(SETUP);
    $(element, 'lightning-button[data-id="download"]').click();
    await flush();
    expect(saved.map((a) => a.download)).toEqual([
      "Activities - Summer 2027.xlsx"
    ]);
    spy.mockRestore();
    delete window.XLSX;
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });

  it("says so in a message when the list can't be written, naming the item", async () => {
    window.XLSX = require("xlsx");
    const toasts = [];
    const element = panel({
      ...SETUP,
      activities: [{ ...SETUP.activities[0], Notes__c: "x".repeat(32768) }]
    });
    element.addEventListener("lightning__showtoast", (e) =>
      toasts.push(e.detail)
    );
    $(element, 'lightning-button[data-id="download"]').click();
    await flush();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe("The list could not be downloaded");
    expect(toasts[0].message).toContain("“Archery”");
    // Ready again afterwards.
    expect($(element, 'lightning-button[data-id="download"]').disabled).toBe(
      false
    );
    delete window.XLSX;
  });
});

describe("Import worksheet (Roots)", () => {
  // The round-trip tests' made-up camp: two programs, two weeks, its own words.
  const { camp } = require("../../shoreshLists/__tests__/data/camp");
  const XLSX = require("xlsx");
  const { campWorkbookSheets, sheetName } = require("c/shoreshLists");

  function workbookBytes(setup, edit) {
    const sheets = campWorkbookSheets(
      nsRecord(setup),
      buildTerms(setup.labels)
    );
    const wb = XLSX.utils.book_new();
    sheets.forEach(({ name, rows }) => {
      if (edit) {
        edit(name, rows);
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(rows),
        sheetName(name)
      );
    });
    return XLSX.write(wb, { type: "array", bookType: "xlsx" });
  }

  async function openWorkbook(setup, bytes) {
    window.XLSX = XLSX;
    getAnswers.mockResolvedValue([]);
    const element = createElement("c-shoresh-list-import", {
      is: ShoreshListImport
    });
    element.workbook = true;
    element.setup = nsRecord({
      ...setup,
      season: { ...setup.season, Name: "Summer 2027" }
    });
    element.terms = buildTerms(setup.labels);
    document.body.appendChild(element);
    $(element, 'lightning-button[data-id="open"]').click();
    await flush();
    const input = $(element, 'input[data-id="file"]');
    Object.defineProperty(input, "files", {
      value: [
        {
          name: "Summer 2027 - camp workbook.xlsx",
          arrayBuffer: () => Promise.resolve(bytes)
        }
      ]
    });
    input.dispatchEvent(new CustomEvent("change"));
    await flush();
    return element;
  }

  afterEach(() => {
    delete window.XLSX;
    jest.clearAllMocks();
  });

  it("opens as Import worksheet, without a list download", () => {
    const element = createElement("c-shoresh-list-import", {
      is: ShoreshListImport
    });
    element.workbook = true;
    element.setup = nsRecord(camp());
    element.terms = buildTerms(camp().labels);
    document.body.appendChild(element);
    expect($(element, 'lightning-button[data-id="open"]').label).toBe(
      "Import worksheet"
    );
    expect($(element, 'lightning-button[data-id="download"]')).toBeNull();
  });

  it("the camp's own workbook: one section per sheet, nothing to change", async () => {
    const setup = camp();
    const element = await openWorkbook(setup, workbookBytes(setup));
    expect($$(element, ".list-sheet-title").map((h) => h.textContent)).toEqual([
      "Camp words",
      "Weeks",
      "Programs",
      "Units",
      "Bunks",
      "Time blocks",
      "Location types",
      "Locations",
      "Activities",
      "Fixed activities",
      "Recurring activities",
      "Runs in"
    ]);
    expect($(element, '[data-id="waiting"]').textContent).toContain(
      "Nothing to change"
    );
  });

  it("a renamed week is a Keep or Change, and Save sends the whole workbook", async () => {
    const setup = camp();
    const element = await openWorkbook(
      setup,
      workbookBytes(setup, (name, rows) => {
        if (name === "Weeks") {
          rows[1][0] = "Opening week";
        }
        if (name === "Runs in") {
          rows[0][4] = "Opening week";
        }
      })
    );
    const weeks = $(element, '[data-section="section-weeks"]');
    expect(weeks.textContent).toContain("Name: Week 1 → Opening week");
    expect(choice("Change", weeks).getAttribute("aria-pressed")).toBe("false");
    expect(choice("Change", weeks).getAttribute("aria-label")).toBe(
      "Change, Opening week: Name: Week 1 → Opening week"
    );
    // Under the sheet's title (h4), its own headings are one level down.
    expect(weeks.querySelector("h4").textContent).toBe("Weeks");
    expect(
      weeks.querySelector('[role="heading"]').getAttribute("aria-level")
    ).toBe("5");
    choice("Change", weeks).click();
    await flush();
    expect(choice("Change", weeks).getAttribute("aria-pressed")).toBe("true");
    expect(choice("Keep", weeks).getAttribute("aria-pressed")).toBe("false");
    const save = $(element, 'lightning-button[data-id="save"]');
    expect(save.label).toBe("Change 1");
    saveWorkbook.mockResolvedValue({
      importId: "i1",
      added: { CampLabel: 1, WeekException: 2 },
      changed: { Week: 1 }
    });
    save.click();
    await flush();
    // What has no camp word of its own is said plainly.
    expect(
      $$(element, '[data-id="summary"] li').map((li) => li.textContent)
    ).toEqual(["Added 1 camp word", "Added 2 weeks off", "Changed 1 week"]);
    const plan = bareRecord(JSON.parse(saveWorkbook.mock.calls[0][0].plan));
    expect(plan.records).toEqual([
      { kind: "Week", id: "w1", fields: { Name: "Opening week" } }
    ]);
    expect($(element, '[data-id="saved"]')).not.toBeNull();
  });
});
