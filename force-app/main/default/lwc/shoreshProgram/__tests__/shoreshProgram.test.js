import { createElement } from "lwc";
import ShoreshProgram from "c/shoreshProgram";
import { buildTerms } from "c/shoreshTerms";

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
  element.entry = entry;
  element.terms = terms;
  element.show = show;
  element.weeks = [{ Id: "w1", Name: "Week 1" }];
  element.weekExceptions = [{ Id: "x1", Week__c: "w1", Group__c: "g1" }];
  document.body.appendChild(element);
  await flush();
  return element;
}

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
    expect(groups.newRowDefaults).toEqual({
      Division__c: "d1",
      Availability__c: "AllDay"
    });
    expect(groups.rows).toEqual(ENTRY.divisions[0].groups);
    expect(groups.weeksHeading).toBe("Runs in");
    expect(groups.weeks).toEqual([{ Id: "w1", Name: "Week 1" }]);
    expect(groups.weekExceptions).toEqual([
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
    element.entry = twoUnits;
    element.terms = terms;
    element.show = "groups";
    element.activities = [
      { Name: "Archery", Eligibilities__r: [{ Division__c: "d2" }] }
    ];
    document.body.appendChild(element);
    await flush();
    const groups = element.shadowRoot.querySelector("c-shoresh-editable-table");
    const unit = groups.columns.find((c) => c.fieldName === "Division__c");
    expect(unit.label).toBe("Unit");
    expect(unit.options).toEqual([
      { label: "Juniors", value: "d1" },
      { label: "Seniors", value: "d2" }
    ]);
    const bunk = { Id: "g1", Name: "Bunk 1", Division__c: "d1" };
    expect(groups.draftNote({ ...bunk, Division__c: "d2" }, bunk)).toBe(
      "Moves to Seniors: Bunk 1 is now in Archery (for Seniors)."
    );
  });

  it("flags same names within the program's tables and each unit's bunks", async () => {
    for (const show of ["timeBlocks", "divisions", "groups"]) {
      // eslint-disable-next-line no-await-in-loop
      const element = await render(show);
      const tables = [
        ...element.shadowRoot.querySelectorAll("c-shoresh-editable-table")
      ];
      expect(tables.length).toBeGreaterThan(0);
      tables.forEach((table) => expect(table.flagSameNames).toBe(true));
      document.body.removeChild(element);
    }
  });

  it("offers no division choice when the program has one", async () => {
    const element = await render("groups");
    const groups = element.shadowRoot.querySelector("c-shoresh-editable-table");
    expect(groups.columns.map((c) => c.fieldName)).toEqual([
      "Name",
      "Availability__c"
    ]);
  });

  it("asks for divisions before groups", async () => {
    const element = await render("groups", { ...ENTRY, divisions: [] });
    expect(element.shadowRoot.querySelector("c-shoresh-editable-table")).toBe(
      null
    );
    expect(element.shadowRoot.querySelector("p").textContent).toBe(
      "Main has no Units yet. Add them under Units first."
    );
  });

  it("shows the operating days and saves a change to them", async () => {
    const element = await render();
    const friday = element.shadowRoot.querySelector(
      'lightning-input[data-day="Friday"]'
    );
    expect(friday.checked).toBe(false);
    const handler = jest.fn();
    element.addEventListener("save", handler);

    friday.checked = true;
    friday.dispatchEvent(new CustomEvent("change"));
    await flush();
    const name = element.shadowRoot.querySelector(
      'lightning-input[data-id="name"]'
    );
    name.reportValidity = () => true;
    [...element.shadowRoot.querySelectorAll("lightning-button")]
      .find((b) => b.label === "Save")
      .click();

    expect(handler.mock.calls[0][0].detail.records).toEqual([
      {
        sobjectType: "Program__c",
        Id: "p1",
        Name: "Main",
        Monday__c: true,
        Tuesday__c: true,
        Wednesday__c: true,
        Thursday__c: true,
        Friday__c: true
      }
    ]);
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
    expect(saves.mock.calls[0][0].detail).toEqual({ records: [{ Id: "t1" }] });
    expect(deletes.mock.calls[0][0].detail).toEqual({
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
    expect(deletes.mock.calls[0][0].detail).toEqual({
      recordId: "p1",
      name: "Main"
    });
  });

  it("keeps a typed but unsaved name when something else is saved", async () => {
    const element = await render();
    const name = element.shadowRoot.querySelector(
      'lightning-input[data-id="name"]'
    );
    name.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Typed" } })
    );
    element.entry = { ...ENTRY, timeBlocks: [] };
    await flush();
    expect(
      element.shadowRoot.querySelector('lightning-input[data-id="name"]').value
    ).toBe("Typed");
  });

  it("after its own save, shows the saved name", async () => {
    const element = await render();
    const name = element.shadowRoot.querySelector(
      'lightning-input[data-id="name"]'
    );
    name.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Typed" } })
    );
    name.reportValidity = () => true;
    await flush();
    [...element.shadowRoot.querySelectorAll("lightning-button")]
      .find((b) => b.label === "Save")
      .click();
    element.entry = { ...ENTRY, program: { ...ENTRY.program, Name: "Saved" } };
    await flush();
    expect(
      element.shadowRoot.querySelector('lightning-input[data-id="name"]').value
    ).toBe("Saved");
  });
  it("keeps a new division typed on its screen while saving, and after a failed save", async () => {
    const element = await render("divisions");
    const table = element.shadowRoot.querySelector("c-shoresh-editable-table");
    const tableButton = (label) =>
      [...table.shadowRoot.querySelectorAll("lightning-button")].find(
        (b) => b.label === label
      );
    tableButton("Add Unit").click();
    await flush();
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
      });
    tableButton("Save changes").click();
    // The screen marks itself busy while saving, which redraws this program.
    element.busy = true;
    await flush();
    expect(names().map((n) => n.value)).toEqual(["Juniors", "Seniors"]);
    saves.mock.calls[0][0].detail.onFailure();
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
      element.locations = [{ Id: "l1", Name: "Pool" }];
      await flush();
      const fixed = table(element);
      expect(fixed.dataset.id).toBe("fixed-activities");
      expect(fixed.columns.map((c) => c.fieldName)).toEqual([
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
      expect(fixed.newRowDefaults).toEqual({
        Program__c: "p1",
        Name: "Fixed activity {n}",
        Length__c: 1
      });
      expect(fixed.rowNotes).toEqual({
        f1: "Bunk 2 is afternoon only and is left out."
      });
      expect(fixed.rowActions).toEqual({});
      // Saved as ending in a block since deleted: noted, with the fixes on the row.
      element.entry = {
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
      };
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
      expect(recurring.columns.map((c) => c.fieldName)).toEqual([
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
      expect(recurring.newRowDefaults).toEqual({
        Program__c: "p1",
        Name: "Recurring activity {n}",
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
      expect(element.shadowRoot.textContent).toContain(
        "Main has no time blocks yet."
      );
    });
  });
});
