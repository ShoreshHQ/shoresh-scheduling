import { createElement } from "lwc";
import ShoreshProgram from "c/shoreshProgram";
import { buildTerms } from "c/shoreshTerms";
import { bareName, bareRecord, nsName, nsRecord } from "shoresh-jest/namespace";
import groupPlacements from "@salesforce/apex/SetupTablesController.groupPlacements";

jest.mock(
  "@salesforce/apex/SetupTablesController.groupPlacements",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

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

async function render(show = "timeBlocks", entry = ENTRY) {
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
    expect(groups.weeksHeading).toBe("Weeks");
    expect(groups.weeks).toEqual([{ Id: "w1", Name: "Week 1" }]);
    expect(bareRecord(groups.weekExceptions)).toEqual([
      { Id: "x1", Week__c: "w1", Group__c: "g1" }
    ]);
  });

  it("each division's groups are a section headed by its name; the column names show once", async () => {
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
    element.activities = nsRecord([]);
    document.body.appendChild(element);
    await flush();
    const tables = () => [
      ...element.shadowRoot.querySelectorAll("c-shoresh-editable-table")
    ];
    expect(tables().map((t) => [t.heading, t.showColumns])).toEqual([
      ["Juniors", true],
      ["Seniors", false]
    ]);
    // With more than one program, each section also names its program.
    element.sectioned = true;
    await flush();
    expect(tables().map((t) => t.heading)).toEqual([
      "Main · Juniors",
      "Main · Seniors"
    ]);
  });

  it("a program's own tables are headed with its name only when the camp has several", async () => {
    const element = await render("timeBlocks");
    const table = () =>
      element.shadowRoot.querySelector("c-shoresh-editable-table");
    expect(table().heading).toBeUndefined();
    expect(table().showColumns).toBe(true);
    element.sectioned = true;
    await flush();
    expect(table().heading).toBe("Main");
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
    // One of the row's details, never a column repeating the section's own division.
    expect(unit.more).toBe(true);
    expect(groups.columns.filter((c) => !c.more).map((c) => c.label)).toEqual([
      "Name",
      "Availability"
    ]);
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
      // The division is one of the row's details, opened from its chevron.
      table.shadowRoot.querySelector('[data-id="more"]').click();
      await flush();
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
      // The division is one of the row's details, opened from its chevron.
      tablesOf(element)[0].shadowRoot.querySelector('[data-id="more"]').click();
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

  describe("a bunk moved to another unit", () => {
    const twoUnits = {
      ...ENTRY,
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors" },
          groups: [{ Id: "g1", Name: "Bunk 1", Division__c: "d1" }]
        },
        {
          division: { Id: "d2", Name: "Seniors" },
          groups: [{ Id: "g2", Name: "Bunk 2", Division__c: "d2" }]
        }
      ],
      recurringActivities: []
    };
    const tablesOf = (element) => [
      ...element.shadowRoot.querySelectorAll("c-shoresh-editable-table")
    ];

    async function renderUnits() {
      const element = createElement("c-shoresh-program", {
        is: ShoreshProgram
      });
      element.entry = nsRecord(twoUnits);
      element.terms = terms;
      element.show = "groups";
      element.activities = nsRecord([
        { Id: "a1", Name: "Swim", Eligibilities__r: [{ Division__c: "d1" }] }
      ]);
      document.body.appendChild(element);
      await flush();
      return element;
    }

    async function moveBunk1(element) {
      const juniors = tablesOf(element)[0];
      juniors.shadowRoot.querySelector('[data-id="more"]').click();
      await flush();
      const unit = juniors.shadowRoot.querySelector(
        `[data-field="${nsName("Division__c")}"]`
      );
      unit.value = "d2";
      unit.dispatchEvent(
        new CustomEvent("change", { detail: { value: "d2" } })
      );
      // The note, the server's answer, then the note again.
      await [...Array(10)].reduce(
        (chain) => chain.then(() => undefined),
        Promise.resolve()
      );
      return juniors;
    }

    const noteOf = (table) => {
      const note = table.shadowRoot.querySelector('[data-id="note"]');
      return note ? note.textContent.trim() : null;
    };

    afterEach(() => groupPlacements.mockReset());

    it("says, before it is saved, what its schedules keep that the new unit is not set up for", async () => {
      groupPlacements.mockResolvedValue({
        complete: true,
        placed: [{ activity: "a1", cells: 3 }]
      });
      const element = await renderUnits();
      const juniors = await moveBunk1(element);
      expect(groupPlacements).toHaveBeenCalledTimes(1);
      expect(groupPlacements).toHaveBeenCalledWith({ groupId: "g1" });
      expect(noteOf(juniors)).toBe(
        "Moves to Seniors: Bunk 1 is no longer in Swim (for Juniors). Its schedules keep Swim (3 cells), marked “Not set up for Bunk 1”."
      );
      await expect(element).toBeAccessible();
    });

    it("says so when its schedules can't be checked", async () => {
      groupPlacements.mockRejectedValue(new Error("offline"));
      const element = await renderUnits();
      const juniors = await moveBunk1(element);
      expect(noteOf(juniors)).toBe(
        "Moves to Seniors: Bunk 1 is no longer in Swim (for Juniors). Its schedules could not be checked."
      );
    });

    it("once saved, takes the cursor to its row in the new unit, and says so", async () => {
      groupPlacements.mockResolvedValue({ complete: true, placed: [] });
      const element = await renderUnits();
      const [juniors] = tablesOf(element);
      // The cursor on the row's own details button.
      juniors.shadowRoot
        .querySelector('[data-id="more"][data-row-key="row-g1"]')
        .focus();
      const saves = jest.fn();
      element.addEventListener("save", saves);
      const onDone = jest.fn();
      // The table sends the row's save while the cursor is still in it.
      juniors.dispatchEvent(new CustomEvent("save", { detail: { onDone } }));
      expect(saves).toHaveBeenCalledTimes(1);
      const detail = saves.mock.calls[0][0].detail;
      // The season comes back with Bunk 1 in Seniors; its old row (and the cursor) are gone.
      element.entry = nsRecord({
        ...twoUnits,
        divisions: [
          { ...twoUnits.divisions[0], groups: [] },
          {
            ...twoUnits.divisions[1],
            groups: [
              { Id: "g1", Name: "Bunk 1", Division__c: "d2" },
              ...twoUnits.divisions[1].groups
            ]
          }
        ]
      });
      await flush();
      const [, seniors] = tablesOf(element);
      const focus = jest.spyOn(HTMLElement.prototype, "focus");
      detail.onDone();
      await flush();
      await flush();
      await flush();
      const focused = focus.mock.contexts.map(
        (el) =>
          `${el.getRootNode().host.heading}:${el.dataset.rowKey}:${el.dataset.field}`
      );
      focus.mockRestore();
      expect(onDone).toHaveBeenCalled();
      expect(focused).toEqual(["Seniors:row-g1:Name"]);
      expect(
        seniors.shadowRoot.querySelector('[data-id="announce"]').textContent
      ).toContain("Bunk 1 moved to Seniors");
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
    const onDeleted = jest.fn();
    table.dispatchEvent(
      new CustomEvent("delete", {
        detail: { recordId: "t1", name: "Period 1", onDeleted }
      })
    );
    expect(bareRecord(saves.mock.calls[0][0].detail)).toEqual({
      records: [{ Id: "t1" }]
    });
    // onDeleted goes up with it, so the table can say so and move the cursor.
    const { onDeleted: passed, ...detail } = deletes.mock.calls[0][0].detail;
    expect(bareRecord(detail)).toEqual({
      recordId: "t1",
      name: "Period 1"
    });
    expect(passed).toBe(onDeleted);
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
      // One section, the whole camp's (docs/design/setup/fixed.html); length and location
      // are the row's details, not columns.
      expect(fixed.heading).toBe("Whole camp");
      expect(fixed.showColumns).toBe(true);
      expect(
        fixed.columns.filter((c) => c.more).map((c) => bareName(c.fieldName))
      ).toEqual(["Length__c", "Location__c"]);
      expect(fixed.columns[1].options).toEqual([
        { label: "Period 1", value: "t1" }
      ]);
      expect(fixed.columns[3].options).toEqual([
        { label: "None", value: "" },
        { label: "Pool", value: "l1" }
      ]);
      expect(fixed.weeksHeading).toBe("Weeks");
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
      // As docs/design/setup/fixed.html: name, who, time, days, (weeks); length and location
      // are the row's details.
      expect(recurring.columns.map((c) => bareName(c.fieldName))).toEqual([
        "Name",
        "Coverages__r",
        "TimeBlock__c",
        "days",
        "Length__c",
        "Location__c"
      ]);
      expect(
        recurring.columns
          .filter((c) => c.more)
          .map((c) => bareName(c.fieldName))
      ).toEqual(["Length__c", "Location__c"]);
      // One days column: a tick for each day the program runs.
      const days = recurring.columns[3];
      expect(days.type).toBe("days");
      expect(days.days.map((d) => [bareName(d.fieldName), d.label])).toEqual([
        ["Monday__c", "Monday"],
        ["Tuesday__c", "Tuesday"],
        ["Wednesday__c", "Wednesday"],
        ["Thursday__c", "Thursday"]
      ]);
      expect(days.every).toBe("Every day");
      const who = recurring.columns[1];
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
        Friday__c: false,
        Saturday__c: false,
        Sunday__c: false
      });
    });

    it("shows Needs attention only while a row needs a look", async () => {
      const element = await render("fixedActivities", {
        ...SET_TIME,
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [{ Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" }]
          }
        ]
      });
      expect(table(element).notesHeading).toBeUndefined();
    });

    it("with several programs, the fixed section is headed by the program", async () => {
      const element = await render("fixedActivities", SET_TIME);
      element.sectioned = true;
      await flush();
      expect(table(element).heading).toBe("Main");
    });

    describe("recurring activities in sections (fixed.html)", () => {
      const TWO = {
        ...SET_TIME,
        divisions: [
          {
            division: { Id: "d1", Name: "Juniors" },
            groups: [
              { Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" },
              { Id: "g2", Name: "Bunk 2", Availability__c: "AllDay" }
            ]
          },
          {
            division: { Id: "d2", Name: "Seniors" },
            groups: [{ Id: "g3", Name: "Bunk 3", Availability__c: "AllDay" }]
          }
        ],
        recurringActivities: [
          { Id: "r1", Name: "Swim", Coverages__r: [{ Group__c: "g1" }] },
          { Id: "r2", Name: "Flag", Coverages__r: [] },
          { Id: "r3", Name: "Lake", Coverages__r: [{ Division__c: "d2" }] }
        ]
      };
      const sections = (element) => [
        ...element.shadowRoot.querySelectorAll(
          'c-shoresh-editable-table[data-id="recurring-activities"]'
        )
      ];

      it("the whole camp's, then one per division, each showing its own rows", async () => {
        const element = await render("recurringActivities", TWO);
        const tables = sections(element);
        expect(tables.map((t) => t.heading)).toEqual([
          "Whole camp",
          "Juniors",
          "Seniors"
        ]);
        // The column names once, above the first section.
        expect(tables.map((t) => !!t.showColumns)).toEqual([
          true,
          false,
          false
        ]);
        // Every section gets every row; each shows its own.
        tables.forEach((t) =>
          expect(t.rows.map((r) => r.Id)).toEqual(["r1", "r2", "r3"])
        );
        expect(
          tables.map((t) => ["r1", "r2", "r3"].filter((id) => t.showsRow(id)))
        ).toEqual([["r2"], ["r1"], ["r3"]]);
      });

      it("covering the whole section reads quietly; a new row starts covering it", async () => {
        const element = await render("recurringActivities", TWO);
        const [all, juniors] = sections(element);
        expect(all.whoRule).toEqual({ ids: [], words: "Every Bunk" });
        expect(all.newRowWho).toEqual([]);
        expect(juniors.whoRule).toEqual({ ids: ["d1"], words: "Every Bunk" });
        expect(juniors.newRowWho).toEqual(["d1"]);
      });

      it("an item across divisions has a section of its own, only while there is one", async () => {
        const element = await render("recurringActivities", {
          ...TWO,
          recurringActivities: [
            ...TWO.recurringActivities,
            {
              Id: "r4",
              Name: "Trip",
              Coverages__r: [{ Group__c: "g2" }, { Division__c: "d2" }]
            }
          ]
        });
        const tables = sections(element);
        expect(tables.map((t) => t.heading)).toEqual([
          "Whole camp",
          "Juniors",
          "Seniors",
          "More than one Unit"
        ]);
        expect(tables[3].showsRow("r4")).toBe(true);
        expect(tables[3].newRowWho).toEqual(["d1", "d2"]);
      });

      it("with several programs, each section is headed with its program", async () => {
        const element = await render("recurringActivities", TWO);
        element.sectioned = true;
        await flush();
        expect(sections(element).map((t) => t.heading)).toEqual([
          "Main · Whole camp",
          "Main · Juniors",
          "Main · Seniors"
        ]);
      });

      it("an item whose who moves it to another section takes the cursor there, and says so", async () => {
        const element = await render("recurringActivities", TWO);
        const [, juniors] = sections(element);
        const saves = jest.fn();
        element.addEventListener("save", saves);
        // In Swim's row: Change, tick Seniors only, Done (the cursor stays on Done).
        const inJuniors = (selector) =>
          juniors.shadowRoot.querySelector(selector);
        inJuniors('[data-id="who-toggle"][data-row-key="row-r1"]').click();
        await flush();
        const picker = inJuniors('[data-id="who-picker"]');
        picker.dispatchEvent(
          new CustomEvent("change", { detail: { value: ["d2"] } })
        );
        await flush();
        juniors.shadowRoot
          .querySelectorAll("lightning-input, lightning-combobox")
          .forEach((input) => {
            input.reportValidity = () => true;
          });
        const done = inJuniors('[data-id="who-toggle"][data-row-key="row-r1"]');
        done.focus();
        done.click();
        await flush();
        expect(saves).toHaveBeenCalledTimes(1);
        const detail = saves.mock.calls[0][0].detail;
        detail.onSaved({});
        // The season comes back with Swim covering Seniors; its old row (and Done) are gone.
        element.entry = nsRecord({
          ...TWO,
          recurringActivities: [
            { Id: "r1", Name: "Swim", Coverages__r: [{ Division__c: "d2" }] },
            ...TWO.recurringActivities.slice(1)
          ]
        });
        await flush();
        const [, newJuniors, newSeniors] = sections(element);
        const focus = jest.spyOn(HTMLElement.prototype, "focus");
        detail.onDone();
        await flush();
        await flush();
        await flush();
        const focused = focus.mock.contexts.map(
          (el) =>
            `${el.getRootNode().host.heading}:${el.dataset.rowKey}:${el.dataset.field}`
        );
        focus.mockRestore();
        expect(newJuniors.showsRow("r1")).toBe(false);
        expect(newSeniors.showsRow("r1")).toBe(true);
        // Back on the same control (Change), in its new section, and the move said.
        expect(focused).toEqual([`Seniors:row-r1:${nsName("Coverages__r")}`]);
        expect(
          newSeniors.shadowRoot.querySelector('[data-id="announce"]')
            .textContent
        ).toContain("Swim moved to Seniors");
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
