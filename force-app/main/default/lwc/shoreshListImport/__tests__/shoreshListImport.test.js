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

async function openWith(
  text,
  { screenKey = "activities", setup = SETUP } = {}
) {
  const element = createElement("c-shoresh-list-import", {
    is: ShoreshListImport
  });
  element.screenKey = screenKey;
  element.setup = nsRecord(setup);
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

/** The rail's main button: it says what saving does ("Add 2"). */
const saveOf = (element) => $(element, 'button[data-id="save"]');
const textOf = (node) => node.textContent.replace(/\s+/g, " ").trim();
/** The table's rows of one kind (new, skipped, same, changed, unreadable, asked, leftOut). */
const rowsOf = (element, kind) =>
  $$(element, `tr[data-kind="${kind}"]`).map((tr) => tr.dataset.row);

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
    expect(deleted.textContent).toContain("Deleted before, not brought back");
    expect(deleted.textContent).toContain("Canoeing");
    expect(rowsOf(element, "new")).toEqual(["Hiking"]);
    const button = deleted.querySelector(
      'button[data-key="deleted|Activity||Canoeing"]'
    );
    expect(button.getAttribute("aria-label")).toBe(
      "Bring back Canoeing, activity"
    );
    button.click();
    await flush();
    expect($(element, '[data-id="deleted"]')).toBeNull();
    expect(rowsOf(element, "new")).toEqual(["Canoeing", "Hiking"]);
    saveOf(element).click();
    await flush();
    const plan = bareRecord(JSON.parse(saveList.mock.calls[0][0].plan));
    expect(plan.records.map((r) => r.fields.Name)).toEqual([
      "Canoeing",
      "Hiking"
    ]);
    expect(plan.forget).toEqual(["deleted|Activity||Canoeing"]);
  });

  it("a place deleted before is listed with Bring back; the rows naming it save without it, with the rest", async () => {
    getAnswers.mockResolvedValue([
      { key: "deleted|Location||Lake", answer: "deleted" }
    ]);
    const element = await openWith(
      ["Activity,Location", "Canoeing,Lake", "Hiking,Pool"].join("\n")
    );
    const deleted = $(element, '[data-id="deleted"]');
    expect(deleted.textContent).toContain("Lake");
    expect($(element, '[data-id="also-add"]')).toBeNull();
    expect($(element, '[data-id="waiting"]')).toBeNull();
    const save = saveOf(element);
    expect(save.disabled).toBe(false);
    save.click();
    await flush();
    const plan = bareRecord(JSON.parse(saveList.mock.calls[0][0].plan));
    expect(
      plan.records.map((r) => [r.fields.Name, r.refs.Location__c || null])
    ).toEqual([
      ["Canoeing", null],
      ["Hiking", "l2"]
    ]);
    expect($(element, '[data-id="summary"]').textContent).toContain(
      "Canoeing · no location"
    );
  });

  it("Bring back keeps the cursor on the way: the next Bring back, Save, or the question it opens", async () => {
    const focused = [];
    const spy = jest
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function record() {
        focused.push(this);
      });
    try {
      getAnswers.mockResolvedValue([
        { key: "deleted|Activity||Canoeing", answer: "deleted" },
        { key: "deleted|Activity||Hiking", answer: "deleted" }
      ]);
      const element = await openWith(
        ["Activity,Length", "Canoeing,1", "Hiking,1"].join("\n")
      );
      const bringBack = (key) => $(element, `button[data-key="${key}"]`);
      bringBack("deleted|Activity||Canoeing").click();
      await flush();
      // The clicked button is gone with the row (WCAG 2.4.3): on to the next Bring back.
      expect(focused.pop()).toBe(bringBack("deleted|Activity||Hiking"));
      bringBack("deleted|Activity||Hiking").click();
      await flush();
      // None left, nothing asked: Save.
      expect(focused.pop().dataset.id).toBe("save");

      // A program brought back asks its days: that question takes the cursor.
      getAnswers.mockResolvedValue([
        { key: "deleted|Program||Teens", answer: "deleted" }
      ]);
      const program = await openWith(
        ["Program,Division", "Main,Juniors", "Teens,Hikers"].join("\n"),
        {
          screenKey: "divisions",
          setup: {
            ...SETUP,
            programs: [
              {
                program: { Id: "p1", Name: "Main", Monday__c: true },
                timeBlocks: [],
                divisions: [],
                fixedActivities: [],
                recurringActivities: []
              },
              {
                program: { Id: "p2", Name: "Seniors", Monday__c: true },
                timeBlocks: [],
                divisions: [],
                fixedActivities: [],
                recurringActivities: []
              }
            ]
          }
        }
      );
      $(program, 'button[data-key="deleted|Program||Teens"]').click();
      await flush();
      const target = focused.pop();
      expect(target.closest("[data-card]").dataset.card).toBe(
        "programAdd|teens"
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("a column remembered from before says whose answer it was and when", async () => {
    getAnswers.mockResolvedValue([
      {
        key: "columns|activities|colour",
        answer: "unused",
        byYou: false,
        byName: "Dana Levi",
        answeredOn: "2026-07-03"
      },
      {
        key: "columns|activities|notes",
        answer: "unused",
        byYou: false,
        byName: null,
        answeredOn: "2026-08-14"
      }
    ]);
    const element = await openWith(
      ["Activity,Notes,Colour", "Archery,,red"].join("\n")
    );
    $(element, 'button[data-id="columns"]').click();
    await flush();
    expect($$(element, ".list-heading").map((h) => h.textContent)).toEqual([
      "“Activity”",
      "“Notes”Remembered from a former user's answer on 14 Aug",
      "“Colour”Remembered from Dana's answer on 3 Jul"
    ]);
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
    // A heading not used needs a look: the file's columns are open by themselves.
    const columns = $(element, 'button[data-id="columns"]');
    expect(columns.getAttribute("aria-expanded")).toBe("true");
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
    // The file laid into the table: new rows dashed, the change crossed out beside the new.
    expect(rowsOf(element, "new")).toEqual(["Canoeing", "Hiking"]);
    const archery = $(element, '[data-row="Archery"]');
    expect(archery.dataset.kind).toBe("changed");
    expect(textOf(archery.querySelector(".old"))).toBe("was Bring arm guards");
    expect(archery.textContent).toContain("clears");
    expect(choice("Change", archery).getAttribute("aria-label")).toBe(
      "Change, Archery: Notes: Bring arm guards → none"
    );
    expect(textOf($(element, 'button[data-id="change-all"]'))).toBe(
      "Change all from this file: 1 change, 1 of them clears a value"
    );
    expect(saveOf(element).disabled).toBe(true);
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
    const save = saveOf(element);
    expect(save.disabled).toBe(false);
    expect(textOf(save)).toBe("Add 2");
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
    $(element, 'button[data-id="undo"]').click();
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
    saveOf(element).click();
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
    saveOf(element).click();
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
    const all = $(element, 'button[data-id="change-all"]');
    expect(textOf(all)).toBe("Change the other 1");
    all.click();
    await flush();
    saveOf(element).click();
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
    expect(textOf(saveOf(element))).toBe("Add 3");
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
      saveOf(element).click();
      await flush();
      expect(focused.pop().dataset.id).toBe("saved");
      expect(status().textContent.trim()).toBe("Saved");
      const close = $(element, 'button[data-id="done"]');
      expect(textOf(close)).toBe("Close");
      close.click();
      await flush();
      expect(focused.pop().dataset.id).toBe("open");
    } finally {
      spy.mockRestore();
    }
  });

  it("a new row's blank required cell shows its starting value", async () => {
    const element = await openWith(["Activity,Length", "Canoeing,"].join("\n"));
    const length = $(element, '[data-row="Canoeing"] td.cell_quiet');
    expect(textOf(length)).toBe("1, starting value");
  });
});

describe("laid into the screen's own table (decision 56)", () => {
  // A made-up camp: one program, Juniors (Cedar, Birch) and Inters (Aspen).
  const GROUPS = {
    ...SETUP,
    programs: [
      {
        program: { Id: "p1", Name: "Main", Monday__c: true },
        timeBlocks: [],
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [
              { Id: "g1", Name: "Cedar", Availability__c: "AllDay" },
              { Id: "g2", Name: "Birch", Availability__c: "AllDay" }
            ]
          },
          {
            division: { Id: "d2", Name: "Inters" },
            groups: [{ Id: "g3", Name: "Aspen", Availability__c: "AllDay" }]
          }
        ],
        fixedActivities: [],
        recurringActivities: []
      }
    ]
  };
  const FILE = [
    "Division,Bunk,Availability",
    "Juniors,Cedar,All day",
    "Juniors,Fern,All day",
    "Inters,Aspen,Morning only",
    ",Bunk 12,All day"
  ].join("\n");

  beforeEach(() => {
    getAnswers.mockResolvedValue([]);
    saveList.mockResolvedValue({ added: { Group: 1 }, importId: "imp1" });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  /** Each section of the table: its name, its count, and its rows as [name, kind]. */
  function table(element) {
    return $$(element, ".part").map((part) => ({
      label: part.dataset.partLabel,
      count: part.querySelector(".part-count")
        ? part.querySelector(".part-count").textContent
        : null,
      rows: [...part.querySelectorAll("tr[data-kind]")].map((tr) => [
        tr.dataset.row,
        tr.dataset.kind
      ])
    }));
  }

  it("the bunks set up and the file's rows, in their units: new dashed, a change crossed out, a row it can't use marked", async () => {
    const element = await openWith(FILE, {
      screenKey: "groups",
      setup: GROUPS
    });
    expect(table(element)).toEqual([
      {
        label: "Juniors",
        count: "3",
        rows: [
          ["Cedar", "same"],
          ["Birch", "same"],
          ["Fern", "new"]
        ]
      },
      { label: "Inters", count: "1", rows: [["Aspen", "changed"]] },
      { label: "Review here", count: "0", rows: [["Bunk 12", "unreadable"]] }
    ]);
    // The section's count is read with its name.
    expect(
      $(element, '.part[data-part-label="Juniors"] [role="heading"]')
        .textContent
    ).toContain("Juniors, 3");
    // The column names: the screen's own words, once, above the first section.
    expect(
      $$(element, ".part")[0]
        .querySelector("thead")
        .className.includes("head_hidden")
    ).toBe(false);
    expect(
      $$(element, ".part")[1]
        .querySelector("thead")
        .className.includes("head_hidden")
    ).toBe(true);
    const aspen = $(element, '[data-row="Aspen"]');
    expect(textOf(aspen.querySelector(".old"))).toBe("was All day");
    expect(textOf(aspen.querySelector("td.cell"))).toBe(
      "was All day, now Morning only"
    );
    expect(textOf(aspen.querySelector("th"))).toBe("Changes: Aspen");
    expect(textOf($(element, '[data-row="Fern"] th'))).toBe("New: Fern");
    // The row it can't use: why, and the corner mark.
    const bad = $(element, '[data-row="Bunk 12"]');
    expect(bad.querySelector(".end-note").textContent).toMatch(/^Row 5 · /);
    expect(bad.querySelector(".row-mark")).not.toBeNull();
    // The rail it took the place of: the file, and what saving waits for.
    expect(textOf($(element, '[data-id="file-name"]'))).toBe("activities.csv");
    expect(textOf($(element, '[data-id="waiting"]'))).toContain(
      "1 difference to Keep or Change"
    );
    expect(textOf($(element, 'button[data-id="close"]'))).toBe("Cancel");
  });

  it("Leave out keeps a new row out of the save, and back in when pressed again", async () => {
    const focused = [];
    const spy = jest
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function record() {
        focused.push(this);
      });
    try {
      const element = await openWith(FILE, {
        screenKey: "groups",
        setup: GROUPS
      });
      choice("Change", $(element, '[data-row="Aspen"]')).click();
      await flush();
      expect(textOf(saveOf(element))).toBe("Add 1, change 1");
      const leave = () => $(element, '[data-row="Fern"] button[data-leave]');
      expect(leave().getAttribute("aria-label")).toBe("Leave out Fern");
      expect(leave().getAttribute("aria-pressed")).toBe("false");
      leave().click();
      await flush();
      // Still where it would go, faded, the same button pressed and keeping the cursor.
      expect(rowsOf(element, "skipped")).toEqual(["Fern"]);
      expect(leave().getAttribute("aria-pressed")).toBe("true");
      expect(focused.pop()).toBe(leave());
      expect(textOf(saveOf(element))).toBe("Change 1");
      leave().click();
      await flush();
      expect(rowsOf(element, "new")).toEqual(["Fern"]);
      leave().click();
      await flush();
      saveOf(element).click();
      await flush();
      const plan = bareRecord(JSON.parse(saveList.mock.calls[0][0].plan));
      expect(plan.records).toEqual([
        {
          kind: "Group",
          id: "g3",
          fields: { Availability__c: "MorningOnly" },
          refs: {}
        }
      ]);
      // Leaving a row out is not remembered for the next import.
      expect(plan.remember.map((r) => r.key)).not.toContain(
        expect.stringMatching(/^skip\|/)
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("tells the page when it opens, while a file is reviewed, and when it closes", async () => {
    const told = [];
    const element = createElement("c-shoresh-list-import", {
      is: ShoreshListImport
    });
    element.screenKey = "groups";
    element.variant = "rail";
    element.setup = nsRecord(GROUPS);
    element.terms = buildTerms([]);
    element.addEventListener("listopen", (e) => told.push(e.detail));
    document.body.appendChild(element);
    $(element, 'button[data-id="open"]').click();
    await flush();
    expect(told).toEqual([{ open: true, review: false }]);
    const input = $(element, 'input[data-id="file"]');
    Object.defineProperty(input, "files", {
      value: [file("bunks.csv", FILE)]
    });
    input.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(told.pop()).toEqual({ open: true, review: true });
    $(element, 'button[data-id="close"]').click();
    await flush();
    expect(told.pop()).toEqual({ open: false, review: false });
  });

  it("the file's columns are put away when every heading is known, and open on their button", async () => {
    const element = await openWith(FILE, {
      screenKey: "groups",
      setup: GROUPS
    });
    const columns = $(element, 'button[data-id="columns"]');
    expect(columns.getAttribute("aria-expanded")).toBe("false");
    expect($(element, '[data-id="headings"]')).toBeNull();
    columns.click();
    await flush();
    expect(columns.getAttribute("aria-expanded")).toBe("true");
    expect($$(element, ".list-heading-text").map((h) => h.textContent)).toEqual(
      ["“Division”", "“Bunk”", "“Availability”"]
    );
  });

  it("is accessible with a file laid into the table", async () => {
    const element = await openWith(FILE, {
      screenKey: "groups",
      setup: GROUPS
    });
    await expect(element).toBeAccessible();
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
    // A plain rename is not a problem: no "Review here" part for it.
    expect(
      [...weeks.querySelectorAll(".part")].map((part) => [
        part.dataset.partLabel,
        [...part.querySelectorAll("tr[data-kind]")].map(
          (tr) => `${tr.dataset.row}:${tr.dataset.kind}`
        )
      ])
    ).toEqual([["", ["Opening week:changed"]]]);
    // The rest of the camp, as it is, is counted rather than drawn.
    expect(
      $(element, '[data-section="section-groups"] [data-id="unchanged"]')
        .textContent
    ).toMatch(/^\s*\d+ the same as here\s*$/);
    expect(choice("Change", weeks).getAttribute("aria-pressed")).toBe("false");
    expect(choice("Change", weeks).getAttribute("aria-label")).toBe(
      "Change, Opening week: Name: Week 1 → Opening week"
    );
    expect(weeks.querySelector("h4").textContent).toBe("Weeks");
    choice("Change", weeks).click();
    await flush();
    expect(choice("Change", weeks).getAttribute("aria-pressed")).toBe("true");
    expect(choice("Keep", weeks).getAttribute("aria-pressed")).toBe("false");
    const save = saveOf(element);
    expect(textOf(save)).toBe("Change 1");
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

  it("has no Leave out: a new place another sheet names is added once, with nothing to contradict", async () => {
    const setup = camp();
    const element = await openWorkbook(
      setup,
      workbookBytes(setup, (name, rows) => {
        if (name === "Locations") {
          rows.push(["Probe Lake", "", 1, ""]);
        }
        if (name === "Activities") {
          rows.push([
            "Probe Canoe",
            "Probe Lake",
            1,
            0,
            "No maximum",
            "Low",
            "No",
            "",
            "No limit",
            "No",
            "",
            "Everyone",
            ""
          ]);
        }
      })
    );
    const locations = $(element, '[data-section="section-locations"]');
    expect(
      locations.querySelector('[data-row="Probe Lake"]').dataset.kind
    ).toBe("new");
    // Under the sheet's title (h4), its own headings are one level down.
    expect(locations.querySelector("h4").textContent).toBe("Locations");
    const part = locations.querySelector('[role="heading"]');
    expect(part.getAttribute("aria-level")).toBe("5");
    expect(part.querySelector(".slds-assistive-text").textContent).toBe(
      "No location type, 1"
    );
    // Leaving the place out here would not hold: the Activities sheet would add it back.
    expect($$(element, "button[data-leave]")).toEqual([]);
    expect($(element, '[data-id="also-add"]')).toBeNull();
    expect(textOf(saveOf(element))).toBe("Add 2");
  });

  describe("the Electives list (plan §6.2)", () => {
    const ELECTIVES = {
      ...SETUP,
      electives: {
        sets: [{ Id: "es1", Name: "Chugim" }],
        offerings: [
          {
            Id: "o1",
            ElectiveSet__c: "es1",
            Activity__c: "a1",
            Seats__c: 12,
            NoSeatLimit__c: false,
            MinimumToRun__c: null,
            Proposed__c: false
          }
        ],
        linkedChoices: []
      }
    };

    it("offerings of activities the season doesn't have: the activities are added with them, proposed", async () => {
      const element = await openWith(
        ["Activity,Seats", "Archery,12", "Woodworking,10"].join("\n"),
        { screenKey: "electives", setup: ELECTIVES }
      );
      expect(
        $$(element, '[data-id="also-add"] lightning-input').map((box) => [
          box.label,
          box.checked,
          box.disabled
        ])
      ).toEqual([["Woodworking · activity", true, true]]);
      expect(rowsOf(element, "new")).toEqual(["Woodworking"]);
      saveOf(element).click();
      await flush();
      const plan = bareRecord(JSON.parse(saveList.mock.calls[0][0].plan));
      expect(plan.screen).toBe("electives");
      expect(plan.records.map((r) => [r.kind, r.key])).toEqual([
        ["Activity", "Activity:Woodworking"],
        ["Offering", "Offering:es1:Woodworking"]
      ]);
      expect(plan.records[1].fields).toEqual({
        NoSeatLimit__c: false,
        Seats__c: 10,
        MinimumToRun__c: null,
        Proposed__c: true
      });
    });

    it("a file of camper choices is not read as offerings: it says so and offers Bring in choices", async () => {
      const element = await openWith(
        [
          "Camper ID,Child's name,Chug choice 1,Chug choice 2",
          "SYN-1,Maya Fernwood,Archery,Drama",
          "SYN-2,Eli Marblecrest,Drama,Archery"
        ].join("\n"),
        { screenKey: "electives", setup: ELECTIVES }
      );
      const note = $(element, '[data-id="choices-file"]');
      expect(note.textContent).toContain(
        "activities.csv: that file is camper choices, not offerings. Nothing was saved."
      );
      expect($(element, 'tr[data-kind="new"]')).toBeNull();
      const button = $(element, 'lightning-button[data-id="bring-in-choices"]');
      expect(button.label).toBe("Bring in choices");
      const heard = jest.fn();
      element.addEventListener("bringinchoices", heard);
      button.click();
      await flush();
      expect(heard).toHaveBeenCalledTimes(1);
      expect(saveList).not.toHaveBeenCalled();
      expect($(element, '[data-id="list-import"]')).toBeNull();
    });

    it("its own download is not taken for camper choices", async () => {
      const element = await openWith(
        [
          "Elective set,Activity,Seats,Minimum,Proposed",
          "Chugim,Archery,12,,No"
        ].join("\n"),
        { screenKey: "electives", setup: ELECTIVES }
      );
      expect($(element, '[data-id="choices-file"]')).toBeNull();
      expect(saveOf(element)).not.toBeNull();
    });

    it("downloads as Electives - <season>", async () => {
      window.XLSX = require("xlsx");
      URL.createObjectURL = () => "blob:test";
      URL.revokeObjectURL = () => undefined;
      const saved = [];
      const spy = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function click() {
          saved.push(this);
        });
      const element = createElement("c-shoresh-list-import", {
        is: ShoreshListImport
      });
      element.screenKey = "electives";
      element.setup = nsRecord(ELECTIVES);
      element.terms = buildTerms([]);
      document.body.appendChild(element);
      $(element, 'lightning-button[data-id="download"]').click();
      await flush();
      expect(saved.map((a) => a.download)).toEqual([
        "Electives - Summer 2027.xlsx"
      ]);
      spy.mockRestore();
      delete window.XLSX;
      delete URL.createObjectURL;
      delete URL.revokeObjectURL;
    });
  });
});
