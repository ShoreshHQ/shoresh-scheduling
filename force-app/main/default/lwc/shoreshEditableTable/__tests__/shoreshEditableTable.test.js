import { createElement } from "lwc";
import ShoreshEditableTable, { timeText } from "c/shoreshEditableTable";
import { looseKey } from "c/shoreshImportEngine";
import { bareRecord, nsName, nsRecord } from "shoresh-jest/namespace";

const COLUMNS = [
  { fieldName: "Name", label: "Name", type: "text", required: true },
  { fieldName: "StartTime__c", label: "Start", type: "time", required: true },
  { fieldName: "Outdoor__c", label: "Outdoors", type: "checkbox" },
  {
    fieldName: "PartOfDay__c",
    label: "Part of day",
    type: "picklist",
    options: [{ label: "Morning", value: "Morning" }]
  }
];

const ROWS = [
  {
    Id: "a1",
    Name: "Period 1",
    StartTime__c: 32400000,
    Outdoor__c: false,
    PartOfDay__c: "Morning"
  },
  {
    Id: "a2",
    Name: "Lunch",
    StartTime__c: 43200000,
    Outdoor__c: true,
    PartOfDay__c: "Morning"
  }
];

const flush = () => Promise.resolve();

// Properties naming objects or fields, and the records, as a screen of the package hands them
// over (nsName / nsRecord: unchanged normally, shoresh__-prefixed in the namespaced run).
const NAME_PROPS = ["objectApiName", "filterField", "sameNameScope"];
const RECORD_PROPS = ["rows", "weekExceptions", "newRowDefaults", "rowActions"];

function packaged(props) {
  const result = { ...props };
  NAME_PROPS.filter((k) => result[k]).forEach((k) => {
    result[k] = nsName(result[k]);
  });
  RECORD_PROPS.filter((k) => result[k]).forEach((k) => {
    result[k] = nsRecord(result[k]);
  });
  if (result.columns) {
    result.columns = result.columns.map((c) => ({
      ...c,
      fieldName: nsName(c.fieldName)
    }));
  }
  return result;
}

/** An event's detail as the table sent it, with bare names (bareRecord checks the prefix). */
function detailOf(handler, call = 0) {
  return bareRecord(handler.mock.calls[call][0].detail);
}

function render(props = {}) {
  const element = createElement("c-shoresh-editable-table", {
    is: ShoreshEditableTable
  });
  Object.assign(
    element,
    packaged({
      title: "Time blocks",
      objectApiName: "TimeBlock__c",
      addLabel: "Add Time block",
      ...props
    })
  );
  document.body.appendChild(element);
  return element;
}

function field(element, rowIndex, name) {
  return element.shadowRoot.querySelectorAll(`[data-field="${nsName(name)}"]`)[
    rowIndex
  ];
}

function button(element, label) {
  return [...element.shadowRoot.querySelectorAll("lightning-button")].find(
    (b) => b.label === label
  );
}

// The test stand-ins for Salesforce inputs have no validity check of their own.
function allValid(element) {
  element.shadowRoot
    .querySelectorAll("lightning-input, lightning-combobox")
    .forEach((input) => {
      if (!jest.isMockFunction(input.reportValidity)) {
        input.reportValidity = () => true;
      }
    });
}

function change(input, value) {
  if (input.type === "checkbox") {
    input.checked = value;
  } else {
    input.value = value;
  }
  input.dispatchEvent(
    new CustomEvent("change", { detail: { value, checked: value } })
  );
}

describe("c-shoresh-editable-table", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("an object it doesn't know is an error, said on screen and in the console, never a table", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    // A name with no package prefix in the namespaced run, or not Shoresh's at all.
    const element = createElement("c-shoresh-editable-table", {
      is: ShoreshEditableTable
    });
    Object.assign(element, {
      title: "Mystery",
      objectApiName: "Mystery__c",
      columns: COLUMNS,
      rows: ROWS
    });
    document.body.appendChild(element);
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="unknown-object"]').textContent
    ).toContain("can't be shown");
    expect(element.shadowRoot.querySelector("table")).toBeNull();
    expect(element.shadowRoot.querySelector("lightning-button")).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('unknown object "Mystery__c"');
    error.mockRestore();
  });

  it("turns Salesforce times into what the time field shows", () => {
    expect(timeText(32400000)).toBe("09:00:00.000");
    expect(timeText(45900000)).toBe("12:45:00.000");
    expect(timeText("09:00:00.000")).toBe("09:00:00.000");
    expect(timeText(undefined)).toBeUndefined();
  });

  it("shows each row with times readable, whichever setting arrives first", async () => {
    const element = render({ rows: ROWS, columns: COLUMNS });
    await flush();
    expect(field(element, 0, "StartTime__c").value).toBe("09:00:00.000");
    expect(field(element, 1, "Outdoor__c").checked).toBe(true);

    const other = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    expect(field(other, 1, "StartTime__c").value).toBe("12:00:00.000");
  });

  it("shows the empty message when there are no rows", async () => {
    const element = render({
      columns: COLUMNS,
      rows: [],
      emptyMessage: "No time blocks yet."
    });
    await flush();
    expect(element.shadowRoot.textContent).toContain("No time blocks yet.");
  });

  it("sends only what changed for existing rows, and everything for new rows", async () => {
    const element = render({
      columns: COLUMNS,
      rows: ROWS,
      newRowDefaults: { Program__c: "p1", PartOfDay__c: "Morning" }
    });
    await flush();
    expect(button(element, "Save changes").disabled).toBe(true);

    change(field(element, 0, "Name"), "Period One");
    button(element, "Add Time block").click();
    await flush();
    change(field(element, 2, "Name"), "Swim");
    change(field(element, 2, "StartTime__c"), "13:30:00.000");
    await flush();
    expect(button(element, "Save changes").disabled).toBe(false);

    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    button(element, "Save changes").click();

    const { records, onFailure } = detailOf(handler);
    expect(typeof onFailure).toBe("function");
    expect(records).toEqual([
      { sobjectType: "TimeBlock__c", Id: "a1", Name: "Period One" },
      {
        sobjectType: "TimeBlock__c",
        Program__c: "p1",
        PartOfDay__c: "Morning",
        SortOrder__c: 3,
        Name: "Swim",
        StartTime__c: "13:30:00.000Z"
      }
    ]);
  });

  it("changing a value back to what it was is not a change", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    change(field(element, 0, "Name"), "Other");
    change(field(element, 0, "Name"), "Period 1");
    await flush();
    expect(button(element, "Save changes").disabled).toBe(true);
  });

  it("checkboxes send true or false", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    change(field(element, 0, "Outdoor__c"), true);
    const handler = jest.fn();
    element.addEventListener("save", handler);
    await flush();
    allValid(element);
    button(element, "Save changes").click();
    expect(detailOf(handler).records).toEqual([
      { sobjectType: "TimeBlock__c", Id: "a1", Outdoor__c: true }
    ]);
  });

  it("cancel puts back what was saved", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    change(field(element, 0, "Name"), "Changed");
    button(element, "Add Time block").click();
    await flush();
    button(element, "Cancel changes").click();
    await flush();
    expect(element.shadowRoot.querySelectorAll("tbody tr").length).toBe(2);
    expect(field(element, 0, "Name").value).toBe("Period 1");
  });

  it("asks the screen to delete a saved row, and simply drops an unsaved one", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    const handler = jest.fn();
    element.addEventListener("delete", handler);

    element.shadowRoot.querySelectorAll("lightning-button-icon")[0].click();
    expect(detailOf(handler)).toEqual({
      recordId: "a1",
      name: "Period 1"
    });

    button(element, "Add Time block").click();
    await flush();
    element.shadowRoot.querySelectorAll("lightning-button-icon")[2].click();
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot.querySelectorAll("tbody tr").length).toBe(2);
  });

  it("does not save when a required value is missing", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    const name = field(element, 0, "Name");
    change(name, "");
    const handler = jest.fn();
    element.addEventListener("save", handler);
    await flush();
    allValid(element);
    field(element, 0, "Name").reportValidity = jest.fn(() => false);
    button(element, "Save changes").click();
    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps unsaved typing when something else on the screen is saved", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    change(field(element, 0, "Name"), "Typed");
    button(element, "Add Time block").click();
    await flush();
    change(field(element, 2, "Name"), "Unsaved new block");
    // The screen reloads after another table saved: Lunch was renamed elsewhere.
    element.rows = packaged({
      rows: [ROWS[0], { ...ROWS[1], Name: "Lunch (renamed)" }]
    }).rows;
    await flush();
    expect(field(element, 0, "Name").value).toBe("Typed");
    expect(field(element, 1, "Name").value).toBe("Lunch (renamed)");
    expect(field(element, 2, "Name").value).toBe("Unsaved new block");
    expect(button(element, "Save changes").disabled).toBe(false);
  });

  it("after its own save goes through, shows exactly what was saved", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    change(field(element, 0, "Name"), "Period One");
    button(element, "Add Time block").click();
    await flush();
    allValid(element);
    button(element, "Save changes").click();
    element.rows = packaged({
      rows: [
        { ...ROWS[0], Name: "Period One" },
        ROWS[1],
        { Id: "a3", Name: "New" }
      ]
    }).rows;
    await flush();
    expect(element.shadowRoot.querySelectorAll("tbody tr").length).toBe(3);
    expect(button(element, "Save changes").disabled).toBe(true);
  });

  it("if its save fails, typing is still kept on the next reload", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    change(field(element, 0, "Name"), "Typed");
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    button(element, "Save changes").click();
    detailOf(handler).onFailure();
    element.rows = packaged({ rows: ROWS }).rows;
    await flush();
    expect(field(element, 0, "Name").value).toBe("Typed");
  });

  it("numbers new rows so two added together get different names", async () => {
    const element = render({
      columns: COLUMNS,
      rows: ROWS,
      newRowDefaults: { Name: "Week {n}" }
    });
    await flush();
    button(element, "Add Time block").click();
    button(element, "Add Time block").click();
    await flush();
    expect(field(element, 2, "Name").value).toBe("Week 3");
    expect(field(element, 3, "Name").value).toBe("Week 4");
  });

  it("leaves a name that looks like a clock time alone", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    change(field(element, 0, "Name"), "10:30");
    change(field(element, 0, "StartTime__c"), "10:30");
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    button(element, "Save changes").click();
    expect(detailOf(handler).records[0]).toEqual({
      sobjectType: "TimeBlock__c",
      Id: "a1",
      Name: "10:30",
      StartTime__c: "10:30:00.000Z"
    });
  });

  it("keeps typing when the screen hands over the columns again", async () => {
    const element = render({ columns: COLUMNS, rows: ROWS });
    await flush();
    change(field(element, 0, "Name"), "Typed");
    button(element, "Add Time block").click();
    await flush();
    element.columns = packaged({ columns: [...COLUMNS] }).columns;
    await flush();
    expect(field(element, 0, "Name").value).toBe("Typed");
    expect(element.shadowRoot.querySelectorAll("tbody tr").length).toBe(3);
  });

  it("number columns send numbers, and an emptied number as nothing", async () => {
    const element = render({
      objectApiName: "Location__c",
      columns: [
        { fieldName: "Name", label: "Name", type: "text", required: true },
        {
          fieldName: "GroupsThatFit__c",
          label: "Groups that fit",
          type: "number",
          min: 1
        }
      ],
      rows: [
        { Id: "l1", Name: "Pool", GroupsThatFit__c: 2 },
        { Id: "l2", Name: "Field", GroupsThatFit__c: 4 }
      ]
    });
    await flush();
    expect(field(element, 0, "GroupsThatFit__c").min).toBe(1);
    change(field(element, 0, "GroupsThatFit__c"), "3");
    change(field(element, 1, "GroupsThatFit__c"), "");
    await flush();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    button(element, "Save changes").click();
    expect(detailOf(handler).records).toEqual([
      { sobjectType: "Location__c", Id: "l1", GroupsThatFit__c: 3 },
      { sobjectType: "Location__c", Id: "l2", GroupsThatFit__c: null }
    ]);
  });

  it("a picklist of records can leave out the row's own record", async () => {
    const element = render({
      objectApiName: "Activity__c",
      columns: [
        { fieldName: "Name", label: "Name", type: "text" },
        {
          fieldName: "RainPlan__c",
          label: "Rain plan",
          type: "picklist",
          excludeSelf: true,
          options: [
            { label: "None", value: "" },
            { label: "Soccer", value: "a1" },
            { label: "Gym games", value: "a2" }
          ]
        }
      ],
      rows: [
        { Id: "a1", Name: "Soccer" },
        { Id: "a2", Name: "Gym games" }
      ]
    });
    await flush();
    const labels = (i) =>
      field(element, i, "RainPlan__c").options.map((o) => o.label);
    expect(labels(0)).toEqual(["None", "Gym games"]);
    expect(labels(1)).toEqual(["None", "Soccer"]);
  });

  describe("showing only some rows", () => {
    const LOCATION_COLUMNS = [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      {
        fieldName: "LocationType__c",
        label: "Location type",
        type: "picklist",
        options: [
          { label: "None", value: "" },
          { label: "Field", value: "t1" }
        ]
      }
    ];
    const LOCATIONS = [
      { Id: "l1", Name: "Pool" },
      { Id: "l2", Name: "Field A", LocationType__c: "t1" },
      { Id: "l3", Name: "Field B", LocationType__c: "t1" }
    ];
    const names = (element) =>
      [...element.shadowRoot.querySelectorAll('[data-field="Name"]')].map(
        (input) => input.value
      );

    it("shows only the chosen type, or rows with no type", async () => {
      const element = render({
        objectApiName: "Location__c",
        addLabel: "Add Location",
        columns: LOCATION_COLUMNS,
        rows: LOCATIONS,
        filterField: "LocationType__c",
        filterValue: "t1"
      });
      await flush();
      expect(names(element)).toEqual(["Field A", "Field B"]);
      element.filterValue = "";
      await flush();
      expect(names(element)).toEqual(["Pool"]);
      element.filterValue = undefined;
      await flush();
      expect(names(element)).toEqual(["Pool", "Field A", "Field B"]);
    });

    it("hidden rows keep unsaved typing and are still saved; new rows always show", async () => {
      const element = render({
        objectApiName: "Location__c",
        addLabel: "Add Location",
        columns: LOCATION_COLUMNS,
        rows: LOCATIONS,
        newRowDefaults: { Name: "Location {n}" }
      });
      await flush();
      change(field(element, 0, "Name"), "Big pool");
      element.filterField = nsName("LocationType__c");
      element.filterValue = "t1";
      await flush();
      expect(names(element)).toEqual(["Field A", "Field B"]);
      button(element, "Add Location").click();
      await flush();
      expect(names(element)).toEqual(["Field A", "Field B", "Location 4"]);
      const handler = jest.fn();
      element.addEventListener("save", handler);
      allValid(element);
      button(element, "Save changes").click();
      const records = detailOf(handler).records;
      expect(records[0]).toEqual({
        sobjectType: "Location__c",
        Id: "l1",
        Name: "Big pool"
      });
      expect(records[1].Name).toBe("Location 4");
    });

    it("says so when nothing matches", async () => {
      const element = render({
        objectApiName: "Location__c",
        columns: LOCATION_COLUMNS,
        rows: [LOCATIONS[0]],
        filterField: "LocationType__c",
        filterValue: "t1"
      });
      await flush();
      expect(
        element.shadowRoot.querySelector('[data-id="none-shown"]')
      ).not.toBeNull();
    });
  });
  describe("Runs in weeks", () => {
    const GROUP_COLUMNS = [
      { fieldName: "Name", label: "Name", type: "text", required: true }
    ];
    const GROUPS = [
      { Id: "g1", Name: "Bunk 1" },
      { Id: "g2", Name: "Bunk 2" }
    ];
    const WEEKS = [
      { Id: "w1", Name: "Week 1" },
      { Id: "w2", Name: "Week 2" },
      { Id: "w3", Name: "Week 3" }
    ];
    // Bunk 2 does not run in Week 3; an activity's week exception is not this table's.
    const EXCEPTIONS = [
      { Id: "x1", Week__c: "w3", Group__c: "g2" },
      { Id: "x2", Week__c: "w1", Activity__c: "a9" }
    ];

    function renderGroups(props = {}) {
      return render({
        title: "Bunks in Juniors",
        objectApiName: "Group__c",
        addLabel: "Add Bunk",
        columns: GROUP_COLUMNS,
        rows: GROUPS,
        weeks: WEEKS,
        weekExceptions: EXCEPTIONS,
        weeksHeading: "Runs in",
        newRowDefaults: { Division__c: "d1", Name: "Bunk {n}" },
        ...props
      });
    }

    function rowTicks(element, rowIndex) {
      const row = element.shadowRoot.querySelectorAll("tbody tr")[rowIndex];
      return [...row.querySelectorAll("lightning-input[data-week]")];
    }
    const ticks = (element, rowIndex) =>
      rowTicks(element, rowIndex).map((box) => box.checked);
    const tick = (element, rowIndex, weekIndex) =>
      rowTicks(element, rowIndex)[weekIndex];

    function save(element) {
      const handler = jest.fn();
      element.addEventListener("save", handler);
      allValid(element);
      button(element, "Save changes").click();
      return detailOf(handler);
    }

    it("ticks every week a row runs in, under the heading", async () => {
      const element = renderGroups();
      await flush();
      expect(
        element.shadowRoot.querySelector('[data-id="weeks-heading"]')
          .textContent
      ).toContain("Runs in");
      expect(ticks(element, 0)).toEqual([true, true, true]);
      expect(ticks(element, 1)).toEqual([true, true, false]);
      expect(tick(element, 1, 2).label).toBe("Bunk 2 runs in Week 3");
      expect(button(element, "Save changes").disabled).toBe(true);
    });

    it("has no week ticks without a heading", async () => {
      const element = renderGroups({ weeksHeading: undefined });
      await flush();
      expect(
        element.shadowRoot.querySelectorAll("lightning-input[data-week]").length
      ).toBe(0);
    });

    it("unticking stores a week exception; ticking again removes it", async () => {
      const element = renderGroups();
      await flush();
      change(tick(element, 0, 1), false);
      change(tick(element, 1, 2), true);
      await flush();
      const { records, weeksOff, weeksBackOn } = save(element);
      expect(records).toEqual([]);
      expect(weeksOff).toEqual([{ target: "g1", week: "w2" }]);
      expect(weeksBackOn).toEqual(["x1"]);
    });

    it("a new row runs in every week until a week is unticked", async () => {
      const element = renderGroups();
      await flush();
      change(field(element, 0, "Name"), "Bunk One");
      button(element, "Add Bunk").click();
      await flush();
      expect(ticks(element, 2)).toEqual([true, true, true]);
      change(tick(element, 2, 0), false);
      await flush();
      const { records, weeksOff } = save(element);
      expect(records.map((r) => r.Name)).toEqual(["Bunk One", "Bunk 3"]);
      // The new bunk is the second record sent.
      expect(weeksOff).toEqual([{ row: 1, week: "w1" }]);
    });

    it("unticking and ticking again is no change", async () => {
      const element = renderGroups();
      await flush();
      change(tick(element, 0, 0), false);
      change(tick(element, 0, 0), true);
      await flush();
      expect(button(element, "Save changes").disabled).toBe(true);
    });

    it("keeps unsaved ticks when something else is saved, and clears them after its own save", async () => {
      const element = renderGroups();
      await flush();
      change(tick(element, 0, 0), false);
      element.rows = packaged({ rows: [...GROUPS] }).rows;
      element.weekExceptions = packaged({
        weekExceptions: [...EXCEPTIONS]
      }).weekExceptions;
      await flush();
      expect(ticks(element, 0)).toEqual([false, true, true]);

      save(element);
      element.rows = packaged({ rows: [...GROUPS] }).rows;
      element.weekExceptions = packaged({
        weekExceptions: [
          ...EXCEPTIONS,
          { Id: "x3", Week__c: "w1", Group__c: "g1" }
        ]
      }).weekExceptions;
      await flush();
      expect(ticks(element, 0)).toEqual([false, true, true]);
      expect(button(element, "Save changes").disabled).toBe(true);
    });

    it("cancel puts the saved ticks back", async () => {
      const element = renderGroups();
      await flush();
      change(tick(element, 1, 2), true);
      await flush();
      button(element, "Cancel changes").click();
      await flush();
      expect(ticks(element, 1)).toEqual([true, true, false]);
    });

    it("each kind of item reads its own weeks off", async () => {
      const kinds = [
        "Activity__c",
        "Location__c",
        "FixedActivity__c",
        "RecurringActivity__c"
      ];
      // The week exception's field naming each kind of item has the kind's own name.
      const tables = kinds.map((kind) =>
        render({
          objectApiName: kind,
          columns: GROUP_COLUMNS,
          rows: [{ Id: "i1", Name: "Item" }],
          weeks: WEEKS,
          weekExceptions: [{ Id: "x9", Week__c: "w2", [kind]: "i1" }],
          weeksHeading: "Runs in"
        })
      );
      await flush();
      expect(tables.map((element) => ticks(element, 0))).toEqual(
        kinds.map(() => [true, false, true])
      );
    });

    it("sends rows and week ticks together", async () => {
      const element = renderGroups();
      await flush();
      change(field(element, 1, "Name"), "Bunk Two");
      change(tick(element, 1, 0), false);
      await flush();
      const { records, weeksOff, weeksBackOn } = save(element);
      expect(records).toEqual([
        { sobjectType: "Group__c", Id: "g2", Name: "Bunk Two" }
      ]);
      expect(weeksOff).toEqual([{ target: "g2", week: "w1" }]);
      expect(weeksBackOn).toEqual([]);
    });
  });

  describe("who a row covers", () => {
    const WHO = {
      fieldName: "Coverages__r",
      label: "Who",
      type: "who",
      everyone: "Everyone in Main",
      sourceLabel: "Units and Bunks",
      selectedLabel: "Covers",
      options: [
        { label: "Unit: Juniors", value: "d1" },
        { label: "Bunk 1 (Juniors)", value: "g1" },
        { label: "Bunk 2 (Juniors)", value: "g2" }
      ]
    };
    const SWIM = [
      {
        Id: "r1",
        Name: "Swim",
        Monday__c: true,
        Coverages__r: [{ Id: "c1", Group__c: "g1" }]
      },
      { Id: "r2", Name: "Lunch", Monday__c: true }
    ];

    function renderRecurring(rows = SWIM) {
      return render({
        objectApiName: "RecurringActivity__c",
        columns: [
          { fieldName: "Name", label: "Name", type: "text", required: true },
          { fieldName: "Monday__c", label: "Monday", type: "checkbox" },
          WHO
        ],
        rows,
        newRowDefaults: { Program__c: "p1", Monday__c: false },
        notesHeading: "Left out",
        rowNotes: { r1: "Bunk 3 is morning only and is left out." }
      });
    }

    const summaries = (element) =>
      [...element.shadowRoot.querySelectorAll('[data-id="who"]')].map((w) =>
        w.textContent.trim()
      );
    const toggle = (element, row) =>
      element.shadowRoot.querySelectorAll('[data-id="who-toggle"]')[row];
    const picker = (element) =>
      element.shadowRoot.querySelector('[data-id="who-picker"]');

    function save(element) {
      const handler = jest.fn();
      element.addEventListener("save", handler);
      allValid(element);
      button(element, "Save changes").click();
      return detailOf(handler);
    }

    it("shows who each row covers, everyone when it names nobody", async () => {
      const element = renderRecurring();
      await flush();
      expect(summaries(element)).toEqual([
        "Bunk 1 (Juniors)",
        "Everyone in Main"
      ]);
      expect(picker(element)).toBeNull();
    });

    it("an activity's who can do it: its own rows, by division or group", async () => {
      const element = render({
        objectApiName: "Activity__c",
        columns: [
          { fieldName: "Name", label: "Name", type: "text", required: true },
          { ...WHO, fieldName: "Eligibilities__r", everyone: "Everyone" }
        ],
        rows: [
          {
            Id: "a1",
            Name: "Swim",
            Eligibilities__r: [{ Id: "e1", Division__c: "d1" }]
          },
          {
            Id: "a2",
            Name: "Art",
            Eligibilities__r: [{ Id: "e2", Group__c: "g2" }]
          }
        ]
      });
      await flush();
      expect(summaries(element)).toEqual(["Unit: Juniors", "Bunk 2 (Juniors)"]);
    });

    it("opens the picker under the row and sends the new choice with the save", async () => {
      const element = renderRecurring();
      await flush();
      toggle(element, 1).click();
      await flush();
      const listbox = picker(element);
      expect(listbox.options).toEqual(WHO.options);
      expect(listbox.value).toEqual([]);
      expect(listbox.sourceLabel).toBe("Units and Bunks");
      listbox.dispatchEvent(
        new CustomEvent("change", { detail: { value: ["d1"] } })
      );
      await flush();
      expect(summaries(element)[1]).toBe("Unit: Juniors");
      expect(button(element, "Save changes").disabled).toBe(false);
      const detail = save(element);
      expect(detail.records).toEqual([]);
      expect(detail.who).toEqual([{ target: "r2", targets: ["d1"] }]);
    });

    it("a new row is saved with its who, by its place in the rows sent", async () => {
      const element = renderRecurring();
      await flush();
      button(element, "Add Time block").click();
      await flush();
      change(field(element, 2, "Name"), "Gym");
      toggle(element, 2).click();
      await flush();
      picker(element).dispatchEvent(
        new CustomEvent("change", { detail: { value: ["g2"] } })
      );
      await flush();
      const detail = save(element);
      expect(detail.records).toEqual([
        {
          sobjectType: "RecurringActivity__c",
          Program__c: "p1",
          Monday__c: false,
          Name: "Gym",
          SortOrder__c: 3
        }
      ]);
      expect(detail.who).toEqual([{ row: 0, targets: ["g2"] }]);
    });

    it("keeps a chosen who when something else on the screen is saved", async () => {
      const element = renderRecurring();
      await flush();
      toggle(element, 0).click();
      await flush();
      picker(element).dispatchEvent(
        new CustomEvent("change", { detail: { value: ["g1", "g2"] } })
      );
      await flush();
      element.rows = packaged({ rows: SWIM.map((row) => ({ ...row })) }).rows;
      await flush();
      expect(summaries(element)[0]).toBe("Bunk 1 (Juniors), Bunk 2 (Juniors)");
      expect(picker(element)).not.toBeNull();
      button(element, "Cancel changes").click();
      await flush();
      expect(summaries(element)[0]).toBe("Bunk 1 (Juniors)");
    });

    it("a fix offered in a row's note saves just its changes to that row", async () => {
      const element = renderRecurring();
      element.rowActions = packaged({
        rowActions: {
          r2: [
            {
              key: "keep",
              label: "Keep Period 2 – Snack",
              changes: { LastTimeBlock__c: "b9" }
            },
            {
              key: "stretch",
              label: "Stretch to Period 2 – Period 3",
              changes: { Length__c: 3 }
            }
          ]
        }
      }).rowActions;
      await flush();
      const buttons = element.shadowRoot.querySelectorAll(
        '[data-id="row-action"]'
      );
      expect([...buttons].map((b) => b.label)).toEqual([
        "Keep Period 2 – Snack",
        "Stretch to Period 2 – Period 3"
      ]);
      const handler = jest.fn();
      element.addEventListener("save", handler);
      buttons[1].click();
      expect(detailOf(handler).records).toEqual([
        { sobjectType: "RecurringActivity__c", Id: "r2", Length__c: 3 }
      ]);
    });

    it("shows each saved row's note", async () => {
      const element = renderRecurring();
      await flush();
      const notes = [
        ...element.shadowRoot.querySelectorAll('[data-id="note"]')
      ].map((n) => n.textContent.trim());
      expect(notes).toEqual(["Bunk 3 is morning only and is left out.", ""]);
    });
  });

  it("shows a note worked out from a saved row's unsaved values while it applies", async () => {
    const element = render({
      columns: COLUMNS,
      rows: ROWS,
      draftNoteHeading: "Moving",
      draftNote: (values, original) => {
        return values.Name !== original.Name
          ? `Renamed to ${values.Name}`
          : null;
      }
    });
    await flush();
    expect(element.shadowRoot.querySelector('[data-id="note"]')).toBe(null);
    change(field(element, 0, "Name"), "Swim time");
    await flush();
    const notes = [...element.shadowRoot.querySelectorAll('[data-id="note"]')];
    expect(notes.map((n) => n.textContent.trim())).toEqual([
      "Renamed to Swim time",
      ""
    ]);
    expect(element.shadowRoot.textContent).toContain("Moving");
  });

  it("shows a saved-only column as text on a new row", async () => {
    const unit = {
      fieldName: "Division__c",
      label: "Unit",
      type: "picklist",
      savedOnly: true,
      options: [
        { label: "Juniors", value: "d1" },
        { label: "Seniors", value: "d2" }
      ]
    };
    const element = render({
      columns: [COLUMNS[0], unit],
      rows: [{ Id: "g1", Name: "Bunk 1", Division__c: "d1" }],
      newRowDefaults: { Division__c: "d1" }
    });
    await flush();
    button(element, "Add Time block").click();
    await flush();
    expect(
      element.shadowRoot.querySelectorAll("lightning-combobox").length
    ).toBe(1);
    expect(
      element.shadowRoot.querySelector('[data-id="fixed"]').textContent
    ).toBe("Juniors");
  });

  describe("same names", () => {
    const named = (names) =>
      names.map((Name, i) => ({ Id: `r${i}`, Name, PartOfDay__c: "Morning" }));
    const tags = (element) =>
      [...element.shadowRoot.querySelectorAll("tbody tr")].map(
        (tr) => !!tr.querySelector('[data-id="same-name"]')
      );

    it("tags each row whose name another row has, ignoring capitals and spacing", async () => {
      const element = render({
        columns: COLUMNS,
        rows: named(["Swim", "Archery", "  swim "]),
        flagSameNames: true
      });
      await flush();
      expect(tags(element)).toEqual([true, false, true]);
      expect(
        element.shadowRoot.querySelector('[data-id="same-name"]').textContent
      ).toContain("Same name as another");
    });

    it("follows what is typed, and stays off unless asked for", async () => {
      const element = render({
        columns: COLUMNS,
        rows: named(["Swim", "Archery"]),
        flagSameNames: true
      });
      await flush();
      change(field(element, 1, "Name"), "SWIM");
      await flush();
      expect(tags(element)).toEqual([true, true]);
      const plain = render({ columns: COLUMNS, rows: named(["Swim", "swim"]) });
      await flush();
      expect(tags(plain)).toEqual([false, false]);
    });

    it("compares a row moved to another scope with that scope's names", async () => {
      const unit = {
        fieldName: "Division__c",
        label: "Unit",
        type: "picklist",
        options: [
          { label: "Juniors", value: "d1" },
          { label: "Seniors", value: "d2" }
        ]
      };
      const element = render({
        columns: [COLUMNS[0], unit],
        rows: [
          { Id: "g1", Name: "Bunk 1", Division__c: "d1" },
          { Id: "g2", Name: "Bunk 2", Division__c: "d1" }
        ],
        flagSameNames: true,
        sameNameScope: "Division__c",
        sameNamesElsewhere: { d2: ["Bunk 2", "Bunk 9"] }
      });
      await flush();
      expect(tags(element)).toEqual([false, false]);
      change(field(element, 1, "Division__c"), "d2");
      await flush();
      expect(tags(element)).toEqual([false, true]);
    });

    it("matches names exactly as the import's looseKey does", async () => {
      const pairs = [
        ["Bunk  3", "bunk 3"],
        ["Arts & Crafts", "arts and crafts"],
        ["Lunch 1", "Lunch 2"],
        ["Pool", " POOL"]
      ];
      const elements = pairs.map((pair) =>
        render({ columns: COLUMNS, rows: named(pair), flagSameNames: true })
      );
      await flush();
      pairs.forEach((pair, i) => {
        const same = looseKey(pair[0]) === looseKey(pair[1]);
        expect(tags(elements[i])).toEqual([same, same]);
      });
    });
  });

  describe("overlapping weeks", () => {
    const WEEK_COLUMNS = [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      { fieldName: "StartDate__c", label: "Start date", type: "date" },
      { fieldName: "EndDate__c", label: "End date", type: "date" }
    ];
    const weeks = [
      {
        Id: "w1",
        Name: "Week 1",
        StartDate__c: "2027-06-28",
        EndDate__c: "2027-07-02"
      },
      {
        Id: "w2",
        Name: "Week 2",
        StartDate__c: "2027-07-01",
        EndDate__c: "2027-07-09"
      },
      {
        Id: "w3",
        Name: "Week 3",
        StartDate__c: "2027-07-12",
        EndDate__c: "2027-07-16"
      }
    ];
    const tags = (element) =>
      [...element.shadowRoot.querySelectorAll("tbody tr")].map((tr) => {
        const tag = tr.querySelector('[data-id="overlaps"]');
        return tag ? tag.textContent.trim() : null;
      });

    it("tags each week whose dates overlap another's, without blocking Save", async () => {
      const element = render({
        title: "Weeks",
        objectApiName: "Week__c",
        columns: WEEK_COLUMNS,
        rows: weeks,
        overlapLabel: "Overlaps another session"
      });
      await flush();
      expect(tags(element)).toEqual([
        "Overlaps another session",
        "Overlaps another session",
        null
      ]);
      change(field(element, 1, "StartDate__c"), "2027-07-05");
      await flush();
      expect(tags(element)).toEqual([null, null, null]);
      change(field(element, 2, "StartDate__c"), "2027-07-09");
      await flush();
      expect(tags(element)).toEqual([
        null,
        "Overlaps another session",
        "Overlaps another session"
      ]);
      expect(button(element, "Save changes").disabled).toBeFalsy();
    });

    it("stays off unless asked for", async () => {
      const element = render({ columns: WEEK_COLUMNS, rows: weeks });
      await flush();
      expect(tags(element)).toEqual([null, null, null]);
    });
  });
});
