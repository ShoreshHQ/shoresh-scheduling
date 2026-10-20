import { createElement } from "lwc";
import ShoreshProgram from "c/shoreshProgram";
import { buildTerms } from "c/shoreshTerms";
import { bareName, bareRecord, nsName, nsRecord } from "shoresh-jest/namespace";

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Division", singular: "Unit", plural: "Units", isCustom: true },
  {
    term: "TimeBlock",
    singular: "Time block",
    plural: "Time blocks",
    isCustom: false
  },
  { term: "Program", singular: "Program", plural: "Programs", isCustom: false },
  {
    term: "Availability",
    singular: "Availability",
    plural: "Availability",
    isCustom: false
  }
]);

const ENTRY = {
  program: {
    Id: "p1",
    Name: "Main",
    Monday__c: true,
    Tuesday__c: true,
    Wednesday__c: true,
    Thursday__c: true,
    Friday__c: false
  },
  timeBlocks: [
    {
      Id: "t1",
      Name: "Period 1",
      StartTime__c: 32400000,
      EndTime__c: 35100000,
      PartOfDay__c: "Morning"
    }
  ],
  divisions: [
    {
      division: { Id: "d1", Name: "Juniors" },
      groups: [{ Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" }]
    }
  ]
};

const flush = () => Promise.resolve();

async function render(show = "program", entry = ENTRY) {
  const element = createElement("c-shoresh-program", { is: ShoreshProgram });
  element.entry = nsRecord(entry);
  element.terms = terms;
  element.show = show;
  element.weeks = [{ Id: "w1", Name: "Week 1" }];
  element.weekExceptions = nsRecord([
    { Id: "x1", Week__c: "w1", Group__c: "g1" }
  ]);
  document.body.appendChild(element);
  await flush();
  return element;
}

const nameInput = (element) =>
  element.shadowRoot.querySelector('lightning-input[data-id="name"]');
function typeName(element, value) {
  const name = nameInput(element);
  name.value = value;
  name.dispatchEvent(new CustomEvent("change", { detail: { value } }));
}
const leaveName = (element) =>
  nameInput(element).dispatchEvent(new CustomEvent("focusout"));

describe("c-shoresh-program", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows only the part its screen asks for, in the camp words", async () => {
    const titlesFor = async (show) => {
      const element = await render(show);
      const titles = [
        ...element.shadowRoot.querySelectorAll("c-shoresh-editable-table")
      ].map((t) => t.title);
      const hasForm = !!element.shadowRoot.querySelector(
        'lightning-input[data-id="name"]'
      );
      document.body.removeChild(element);
      return { titles, hasForm };
    };
    expect(await titlesFor("program")).toEqual({ titles: [], hasForm: true });
    expect(await titlesFor("timeBlocks")).toEqual({
      titles: ["Time blocks in Main"],
      hasForm: false
    });
    expect(await titlesFor("divisions")).toEqual({
      titles: ["Units in Main"],
      hasForm: false
    });
    expect(await titlesFor("groups")).toEqual({
      titles: ["Bunks in Juniors"],
      hasForm: false
    });
  });

  it("gives each division's groups their Runs in weeks", async () => {
    const element = await render("groups");
    const groups = element.shadowRoot.querySelector("c-shoresh-editable-table");
    expect(groups.addLabel).toBe("Add Bunk");
    expect(bareName(groups.objectApiName)).toBe("Group__c");
    expect(bareName(groups.sameNameScope)).toBe("Division__c");
    expect(bareRecord(groups.newRowDefaults)).toEqual({
      Division__c: "d1",
      Availability__c: "AllDay"
    });
    expect(bareRecord(groups.rows)).toEqual(ENTRY.divisions[0].groups);
    expect(groups.weeksHeading).toBe("Runs in");
    expect(groups.weeks).toEqual([{ Id: "w1", Name: "Week 1" }]);
    expect(bareRecord(groups.weekExceptions)).toEqual([
      { Id: "x1", Week__c: "w1", Group__c: "g1" }
    ]);
  });

  it("lets a group move to another division of its program, saying what that changes", async () => {
    const twoUnits = {
      ...ENTRY,
      divisions: [
        ...ENTRY.divisions,
        { division: { Id: "d2", Name: "Seniors" }, groups: [] }
      ],
      recurringActivities: []
    };
    const element = createElement("c-shoresh-program", { is: ShoreshProgram });
    element.entry = nsRecord(twoUnits);
    element.terms = terms;
    element.show = "groups";
    element.activities = nsRecord([
      { Id: "a2", Name: "Archery", Eligibilities__r: [{ Division__c: "d2" }] }
    ]);
    document.body.appendChild(element);
    await flush();
    const groups = element.shadowRoot.querySelector("c-shoresh-editable-table");
    const unit = groups.columns.find(
      (c) => c.fieldName === nsName("Division__c")
    );
    expect(unit.label).toBe("Unit");
    expect(unit.options).toEqual([
      { label: "Juniors", value: "d1" },
      { label: "Seniors", value: "d2" }
    ]);
    const bunk = { Id: "g1", Name: "Bunk 1", Division__c: "d1" };
    expect(
      groups.draftNote(nsRecord({ ...bunk, Division__c: "d2" }), nsRecord(bunk))
    ).toBe("Moves to Seniors: Bunk 1 is now in Archery (for Seniors)."); // Headed by what the note says, not a working word like "Moving".
    expect(groups.draftNoteHeading).toBe("What changes");
  });

  it("flags same names within the program's tables and each unit's bunks", async () => {
    const elements = await Promise.all(
      ["timeBlocks", "divisions", "groups"].map((show) => render(show))
    );
    elements.forEach((element) => {
      const tables = [
        ...element.shadowRoot.querySelectorAll("c-shoresh-editable-table")
      ];
      expect(tables.length).toBeGreaterThan(0);
      tables.forEach((table) => expect(table.flagSameNames).toBe(true));
    });
  });

  it("flags a clash between units on both rows while a bunk move is unsaved", async () => {
    const entry = {
      ...ENTRY,
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors" },
          groups: [{ Id: "g1", Name: "Bunk 7", Division__c: "d1" }]
        },
        {
          division: { Id: "d2", Name: "Seniors" },
          groups: [{ Id: "g2", Name: "bunk 7", Division__c: "d2" }]
        }
      ],
      recurringActivities: []
    };
    const flagged = (table) =>
      !!table.shadowRoot.querySelector('[data-id="same-name"]');
    const moveFirstRow = async (table, to) => {
      const unit = table.shadowRoot.querySelector(
        `[data-field="${nsName("Division__c")}"]`
      );
      unit.value = to;
      unit.dispatchEvent(new CustomEvent("change", { detail: { value: to } }));
      await flush();
      await flush();
    };
    const check = async (from, to) => {
      const element = createElement("c-shoresh-program", {
        is: ShoreshProgram
      });
      element.entry = nsRecord(entry);
      element.terms = terms;
      element.show = "groups";
      element.activities = nsRecord([]);
      document.body.appendChild(element);
      await flush();
      const tables = [
        ...element.shadowRoot.querySelectorAll("c-shoresh-editable-table")
      ];
      expect(tables.map(flagged)).toEqual([false, false]);
      await moveFirstRow(tables[from], to);
      expect(tables.map(flagged)).toEqual([true, true]);
      document.body.removeChild(element);
    };
    // Juniors' bunk moved into Seniors, then Seniors' bunk moved into Juniors.
    await check(0, "d2");
    await check(1, "d1");
  });

  describe("an unsaved bunk move that clashes with another unit", () => {
    const twoUnits = {
      ...ENTRY,
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors" },
          groups: [{ Id: "g1", Name: "Bunk 7", Division__c: "d1" }]
        },
        {
          division: { Id: "d2", Name: "Seniors" },
          groups: [{ Id: "g2", Name: "bunk 7", Division__c: "d2" }]
        }
      ],
      recurringActivities: []
    };
    const tablesOf = (element) => [
      ...element.shadowRoot.querySelectorAll("c-shoresh-editable-table")
    ];
    const flagged = (table) =>
      !!table.shadowRoot.querySelector('[data-id="same-name"]');

    async function movedJuniorsBunk() {
      const element = createElement("c-shoresh-program", {
        is: ShoreshProgram
      });
      element.entry = nsRecord(twoUnits);
      element.terms = terms;
      element.show = "groups";
      element.activities = nsRecord([]);
      document.body.appendChild(element);
      await flush();
      const unit = tablesOf(element)[0].shadowRoot.querySelector(
        `[data-field="${nsName("Division__c")}"]`
      );
      unit.value = "d2";
      unit.dispatchEvent(
        new CustomEvent("change", { detail: { value: "d2" } })
      );
      await flush();
      await flush();
      expect(tablesOf(element).map(flagged)).toEqual([true, true]);
      return element;
    }

    it("clears both flags when the move is put back with Escape", async () => {
      const element = await movedJuniorsBunk();
      const juniors = tablesOf(element)[0];
      juniors.shadowRoot
        .querySelector('lightning-input[data-field="Name"]')
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
      await flush();
      await flush();
      expect(tablesOf(element).map(flagged)).toEqual([false, false]);
    });

    it("forgets the move when its unit is deleted", async () => {
      const element = await movedJuniorsBunk();
      element.entry = nsRecord({
        ...twoUnits,
        divisions: [twoUnits.divisions[1]]
      });
      await flush();
      await flush();
      expect(tablesOf(element).map(flagged)).toEqual([false]);
    });
  });

  it("gives time blocks and divisions their own columns and new-row values", async () => {
    const blocks = (await render("timeBlocks")).shadowRoot.querySelector(
      "c-shoresh-editable-table"
    );
    expect(blocks.columns.map((c) => bareName(c.fieldName))).toEqual([
      "Name",
      "StartTime__c",
      "EndTime__c",
      "PartOfDay__c"
    ]);
    expect(bareRecord(blocks.newRowDefaults)).toEqual({
      Program__c: "p1",
      PartOfDay__c: ""
    });
    // As on the desktop: the name may be left blank (the time range is saved), and a new
    // block's part of day follows its start time unless one is chosen.
    const [name, , , partOfDay] = blocks.columns;
    expect(name.required).toBeFalsy();
    expect(partOfDay.required).toBeFalsy();
    expect(partOfDay.options).toEqual([
      { label: "From start time", value: "" },
      { label: "Morning", value: "Morning" },
      { label: "Afternoon", value: "Afternoon" }
    ]);
    expect(bareName(blocks.objectApiName)).toBe("TimeBlock__c");
    const divisions = (await render("divisions")).shadowRoot.querySelector(
      "c-shoresh-editable-table"
    );
    expect(bareRecord(divisions.newRowDefaults)).toEqual({ Program__c: "p1" });
    expect(bareName(divisions.objectApiName)).toBe("Division__c");
  });

  it("offers no division choice when the program has one", async () => {
    const element = await render("groups");
    const groups = element.shadowRoot.querySelector("c-shoresh-editable-table");
    expect(groups.columns.map((c) => bareName(c.fieldName))).toEqual([
      "Name",
      "Availability__c"
    ]);
  });

  it("asks for divisions before groups", async () => {
    const element = await render("groups", { ...ENTRY, divisions: [] });
    expect(element.shadowRoot.querySelector("c-shoresh-editable-table")).toBe(
      null
    );
    // An empty state and a way there, not a sentence of instructions.
    expect(
      element.shadowRoot.querySelector("c-shoresh-empty-state").title
    ).toBe("No Units yet");
    const go = element.shadowRoot.querySelector('[data-id="go-divisions"]');
    expect(go.label).toBe("Units →");
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    go.click();
    expect(handler.mock.calls[0][0].detail).toEqual({ screen: "divisions" });
  });

  it("has no Save button: a ticked day saves at once, with the other days as shown", async () => {
    const element = await render();
    expect(
      [...element.shadowRoot.querySelectorAll("lightning-button")].map(
        (b) => b.label
      )
    ).toEqual(["Delete this program"]);
    const friday = element.shadowRoot.querySelector(
      'lightning-input[data-day="Friday"]'
    );
    expect(friday.checked).toBe(false);
    const handler = jest.fn();
    element.addEventListener("save", handler);

    friday.checked = true;
    friday.dispatchEvent(new CustomEvent("change"));
    await flush();

    const detail = bareRecord(handler.mock.calls[0][0].detail);
    expect(detail.records).toEqual([
      {
        sobjectType: "Program__c",
        Id: "p1",
        Monday__c: true,
        Tuesday__c: true,
        Wednesday__c: true,
        Thursday__c: true,
        Friday__c: true
      }
    ]);
    expect(typeof detail.onSaved).toBe("function");
    expect(typeof detail.onFailure).toBe("function");
  });

  it("the name saves when the director leaves it (or presses Enter), only if it changed", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    const name = nameInput(element);
    name.reportValidity = () => true;
    leaveName(element);
    await flush();
    expect(handler).not.toHaveBeenCalled();
    typeName(element, "Day camp");
    leaveName(element);
    await flush();
    expect(bareRecord(handler.mock.calls[0][0].detail).records).toEqual([
      { sobjectType: "Program__c", Id: "p1", Name: "Day camp" }
    ]);
    typeName(element, "Day camp 2");
    name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flush();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("a blank name is not sent: the field says it needs one", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    const name = nameInput(element);
    name.reportValidity = jest.fn(() => false);
    typeName(element, "");
    leaveName(element);
    await flush();
    expect(name.reportValidity).toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("says Saved quietly once saved, and a refusal next to the field with the typing kept", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    nameInput(element).reportValidity = () => true;
    typeName(element, "Day camp");
    leaveName(element);
    await flush();
    const mark = () =>
      element.shadowRoot
        .querySelector("c-shoresh-saved-mark")
        .shadowRoot.querySelector('[data-id="saved"]');
    handler.mock.calls[0][0].detail.onSaved();
    await flush();
    expect(mark().textContent).toContain("Saved");

    typeName(element, "Overnight");
    await flush();
    expect(mark().textContent).toBe("");
    leaveName(element);
    await flush();
    handler.mock.calls[1][0].detail.onFailure(
      "Programs not saved. Your changes are still here. Try again."
    );
    await flush();
    const why = element.shadowRoot.querySelector('[data-id="name-error"]');
    expect(why.textContent).toContain("Programs not saved.");
    expect(why.getAttribute("role")).toBe("alert");
    // A reload keeps the refused name, and leaving again sends it again.
    element.entry = nsRecord({ ...ENTRY, timeBlocks: [] });
    await flush();
    expect(nameInput(element).value).toBe("Overnight");
    leaveName(element);
    await flush();
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("a refused day shows why under the days, and stays ticked", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    const friday = element.shadowRoot.querySelector(
      'lightning-input[data-day="Friday"]'
    );
    friday.checked = true;
    friday.dispatchEvent(new CustomEvent("change"));
    await flush();
    handler.mock.calls[0][0].detail.onFailure("Not saved.");
    element.entry = nsRecord({ ...ENTRY, timeBlocks: [] });
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="days-error"]').textContent
    ).toContain("Not saved.");
    expect(
      element.shadowRoot.querySelector('lightning-input[data-day="Friday"]')
        .checked
    ).toBe(true);
  });

  it("a refused untick is sent again with the next tick, so the screen and the record agree", async () => {
    // Runs Monday only; the director wants Tuesday only and unticks Monday first.
    const mondayOnly = {
      ...ENTRY,
      program: {
        ...ENTRY.program,
        Tuesday__c: false,
        Wednesday__c: false,
        Thursday__c: false
      }
    };
    const element = await render("program", mondayOnly);
    const handler = jest.fn();
    element.addEventListener("save", handler);
    const day = (name) =>
      element.shadowRoot.querySelector(`lightning-input[data-day="${name}"]`);
    const daysError = () =>
      element.shadowRoot.querySelector('[data-id="days-error"]');

    day("Monday").checked = false;
    day("Monday").dispatchEvent(new CustomEvent("change"));
    await flush();
    handler.mock.calls[0][0].detail.onFailure(
      "Choose at least one day it runs."
    );
    await flush();
    expect(daysError().textContent).toContain("Choose at least one day");

    day("Tuesday").checked = true;
    day("Tuesday").dispatchEvent(new CustomEvent("change"));
    await flush();
    const second = bareRecord(handler.mock.calls[1][0].detail).records[0];
    expect(second).toMatchObject({ Monday__c: false, Tuesday__c: true });
    handler.mock.calls[1][0].detail.onSaved();
    const saved = JSON.parse(JSON.stringify(mondayOnly));
    saved.program.Monday__c = false;
    saved.program.Tuesday__c = true;
    element.entry = nsRecord(saved);
    await flush();
    expect(daysError()).toBeNull();
    expect(day("Monday").checked).toBe(false);
    expect(day("Tuesday").checked).toBe(true);
  });

  it("a refusal answered after a newer save of the days is under way waits for that one", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    const day = (name) =>
      element.shadowRoot.querySelector(`lightning-input[data-day="${name}"]`);
    day("Friday").checked = true;
    day("Friday").dispatchEvent(new CustomEvent("change"));
    day("Monday").checked = false;
    day("Monday").dispatchEvent(new CustomEvent("change"));
    await flush();
    handler.mock.calls[0][0].detail.onFailure("Not saved.");
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="days-error"]')
    ).toBeNull();
    handler.mock.calls[1][0].detail.onFailure("Still not saved.");
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="days-error"]').textContent
    ).toContain("Still not saved.");
  });

  it("passes saves and deletes from its tables up to the screen", async () => {
    const element = await render("timeBlocks");
    const saves = jest.fn();
    const deletes = jest.fn();
    element.addEventListener("save", saves);
    element.addEventListener("delete", deletes);
    const table = element.shadowRoot.querySelector("c-shoresh-editable-table");
    table.dispatchEvent(
      new CustomEvent("save", { detail: { records: [{ Id: "t1" }] } })
    );
    table.dispatchEvent(
      new CustomEvent("delete", {
        detail: { recordId: "t1", name: "Period 1" }
      })
    );
    expect(bareRecord(saves.mock.calls[0][0].detail)).toEqual({
      records: [{ Id: "t1" }]
    });
    expect(bareRecord(deletes.mock.calls[0][0].detail)).toEqual({
      recordId: "t1",
      name: "Period 1"
    });
  });

  it("asks to delete the whole program", async () => {
    const element = await render();
    const deletes = jest.fn();
    element.addEventListener("delete", deletes);
    [...element.shadowRoot.querySelectorAll("lightning-button")]
      .find((b) => b.label === "Delete this program")
      .click();
    expect(bareRecord(deletes.mock.calls[0][0].detail)).toEqual({
      recordId: "p1",
      name: "Main"
    });
  });

  it("keeps a typed but unsaved name when something else is saved", async () => {
    const element = await render();
    typeName(element, "Typed");
    element.entry = nsRecord({ ...ENTRY, timeBlocks: [] });
    await flush();
    expect(nameInput(element).value).toBe("Typed");
  });

  it("a name being saved is not put back by a reload before it, and shows as saved after", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    nameInput(element).reportValidity = () => true;
    typeName(element, "Typed");
    leaveName(element);
    await flush();
    // Another row's save reloads before this one is answered.
    element.entry = nsRecord({ ...ENTRY, timeBlocks: [] });
    await flush();
    expect(nameInput(element).value).toBe("Typed");
    handler.mock.calls[0][0].detail.onSaved();
    element.entry = nsRecord({
      ...ENTRY,
      program: { ...ENTRY.program, Name: "Saved" }
    });
    await flush();
    expect(nameInput(element).value).toBe("Saved");
  });

  it("keeps a new division typed on its screen while saving, and after a failed save", async () => {
    const element = await render("divisions");
    const table = element.shadowRoot.querySelector("c-shoresh-editable-table");
    const names = () => [
      ...table.shadowRoot.querySelectorAll('lightning-input[data-field="Name"]')
    ];
    const typed = names()[1];
    typed.value = "Seniors";
    typed.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Seniors" } })
    );
    await flush();
    const saves = jest.fn();
    element.addEventListener("save", saves);
    table.shadowRoot
      .querySelectorAll("lightning-input, lightning-combobox")
      .forEach((input) => {
        input.reportValidity = () => true;
        input.checkValidity = () => true;
      });
    names()[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(saves).toHaveBeenCalledTimes(1);
    // The screen marks itself busy while saving, which redraws this program.
    element.busy = true;
    await flush();
    expect(names().map((n) => n.value)).toEqual(["Juniors", "Seniors"]);
    const detail = bareRecord(saves.mock.calls[0][0].detail);
    detail.onFailure();
    detail.onDone();
    element.busy = false;
    await flush();
    expect(names().map((n) => n.value)).toEqual(["Juniors", "Seniors"]);
  });

  describe("fixed and recurring activities", () => {
    const SET_TIME = {
      ...ENTRY,
      fixedActivities: [
        {
          Id: "f1",
          Name: "Flagpole",
          TimeBlock__c: "t1",
          Length__c: 1,
          LastTimeBlock__c: "t1"
        }
      ],
      recurringActivities: [
        {
          Id: "r1",
          Name: "Swim",
          TimeBlock__c: "t1",
          Length__c: 1,
          LastTimeBlock__c: "t1",
          Monday__c: true,
          Coverages__r: [{ Group__c: "g1" }]
        }
      ],
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors" },
          groups: [
            { Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" },
            { Id: "g2", Name: "Bunk 2", Availability__c: "AfternoonOnly" }
          ]
        }
      ]
    };
    const table = (element) =>
      element.shadowRoot.querySelector("c-shoresh-editable-table");

    it("lists fixed activities with their time block, length, location, weeks, and who is left out", async () => {
      const element = await render("fixedActivities", SET_TIME);
      element.locations = nsRecord([{ Id: "l1", Name: "Pool" }]);
      await flush();
      const fixed = table(element);
      expect(fixed.dataset.id).toBe("fixed-activities");
      // Who is left out, and changed time blocks: headed as what needs a look, not "Notes".
      expect(fixed.notesHeading).toBe("Needs attention");
      expect(bareName(fixed.objectApiName)).toBe("FixedActivity__c");
      expect(fixed.columns.map((c) => bareName(c.fieldName))).toEqual([
        "Name",
        "TimeBlock__c",
        "Length__c",
        "Location__c"
      ]);
      expect(fixed.columns[1].options).toEqual([
        { label: "Period 1", value: "t1" }
      ]);
      expect(fixed.columns[3].options).toEqual([
        { label: "None", value: "" },
        { label: "Pool", value: "l1" }
      ]);
      expect(fixed.weeksHeading).toBe("Runs in");
      expect(bareRecord(fixed.newRowDefaults)).toEqual({
        Program__c: "p1",
        Length__c: 1
      });
      expect(fixed.rowNotes).toEqual({
        f1: "Bunk 2 is afternoon only and is left out."
      });
      expect(bareRecord(fixed.rowActions)).toEqual({});
      // Saved as ending in a block since deleted: noted, with the fixes on the row.
      element.entry = nsRecord({
        ...SET_TIME,
        fixedActivities: [
          {
            ...SET_TIME.fixedActivities[0],
            Length__c: 2,
            LastTimeBlock__c: null
          }
        ],
        timeBlocks: [
          ...SET_TIME.timeBlocks,
          { Id: "t2", Name: "Period 2", PartOfDay__c: "Morning" }
        ]
      });
      await flush();
      expect(
        table(element).rowActions.f1.map((action) => action.label)
      ).toEqual(["Keep the shorter Period 1", "Extend to Period 2"]);
      expect(table(element).rowNotes.f1).toContain(
        "changed since it was saved"
      );
    });

    it("gives recurring activities a tick for each day the program runs and who they cover", async () => {
      const element = await render("recurringActivities", SET_TIME);
      const recurring = table(element);
      expect(bareName(recurring.objectApiName)).toBe("RecurringActivity__c");
      expect(recurring.columns.map((c) => bareName(c.fieldName))).toEqual([
        "Name",
        "TimeBlock__c",
        "Length__c",
        "Location__c",
        "Monday__c",
        "Tuesday__c",
        "Wednesday__c",
        "Thursday__c",
        "Coverages__r"
      ]);
      const who = recurring.columns[8];
      expect(who.type).toBe("who");
      expect(who.everyone).toBe("Everyone in Main");
      expect(who.options).toEqual([
        { label: "Unit: Juniors", value: "d1" },
        { label: "Bunk 1 (Juniors)", value: "g1" },
        { label: "Bunk 2 (Juniors)", value: "g2" }
      ]);
      expect(bareRecord(recurring.newRowDefaults)).toEqual({
        Program__c: "p1",
        Length__c: 1,
        Monday__c: false,
        Tuesday__c: false,
        Wednesday__c: false,
        Thursday__c: false,
        Friday__c: false
      });
    });

    it("asks for time blocks first", async () => {
      const element = await render("fixedActivities", {
        ...SET_TIME,
        timeBlocks: []
      });
      expect(table(element)).toBeNull();
      expect(
        element.shadowRoot.querySelector("c-shoresh-empty-state").title
      ).toBe("No time blocks yet");
      const go = element.shadowRoot.querySelector('[data-id="go-time-blocks"]');
      expect(go.label).toBe("Time blocks →");
      const handler = jest.fn();
      element.addEventListener("navigate", handler);
      go.click();
      expect(handler.mock.calls[0][0].detail).toEqual({ screen: "timeBlocks" });
    });
  });
});
