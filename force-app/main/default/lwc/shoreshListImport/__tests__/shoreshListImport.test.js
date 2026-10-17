import { createElement } from "lwc";
import ShoreshListImport from "c/shoreshListImport";
import saveList from "@salesforce/apex/ImportController.saveList";
import getAnswers from "@salesforce/apex/ImportController.getAnswers";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import LightningConfirm from "lightning/confirm";
import { buildTerms } from "c/shoreshTerms";

jest.mock(
  "@salesforce/apex/ImportController.saveList",
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
  element.setup = SETUP;
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

  it("shows the columns, what is new, what differs, and waits for Keep or Change", async () => {
    const element = await openWith(
      [
        "Activity,Location,Notes,Colour",
        "Archery,Gym,,red",
        "Canoeing,Lake,,blue",
        "Hiking,Field,maybe,green"
      ].join("\n")
    );
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
    buttonNamed(element, "Keep", $(element, '[data-row="Archery"]')).click();
    await flush();
    const save = $(element, 'lightning-button[data-id="save"]');
    expect(save.disabled).toBe(false);
    expect(save.label).toBe("Add 2");
    save.click();
    await flush();
    const plan = JSON.parse(saveList.mock.calls[0][0].plan);
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
    const plan = JSON.parse(saveList.mock.calls[0][0].plan);
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
    buttonNamed(element, "Keep", archery).click();
    await flush();
    const all = $(element, 'lightning-button[data-id="change-all"]');
    expect(all.label).toBe("Change the other 1");
    all.click();
    await flush();
    $(element, 'lightning-button[data-id="save"]').click();
    await flush();
    const plan = JSON.parse(saveList.mock.calls[0][0].plan);
    expect(plan.records).toEqual([
      { kind: "Activity", id: "a1", fields: { Notes__c: "x" }, refs: {} }
    ]);
  });

  it("a new program's days and a new time block's times are answered in the card", async () => {
    const element = createElement("c-shoresh-list-import", {
      is: ShoreshListImport
    });
    element.screenKey = "fixedActivities";
    element.setup = {
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
    };
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
    element.setup = setup;
    element.terms = buildTerms([]);
    document.body.appendChild(element);
    return element;
  }

  it("saves this screen's list as a file", async () => {
    window.XLSX = require("xlsx");
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
