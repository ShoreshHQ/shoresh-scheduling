import { createElement } from "lwc";
import ShoreshEditableTable, { timeText } from "c/shoreshEditableTable";

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

function render(props = {}) {
  const element = createElement("c-shoresh-editable-table", {
    is: ShoreshEditableTable
  });
  Object.assign(element, {
    title: "Time blocks",
    objectApiName: "TimeBlock__c",
    addLabel: "Add Time block",
    ...props
  });
  document.body.appendChild(element);
  return element;
}

function field(element, rowIndex, name) {
  return element.shadowRoot.querySelectorAll(`[data-field="${name}"]`)[
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

    const { records, onFailure } = handler.mock.calls[0][0].detail;
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
    expect(handler.mock.calls[0][0].detail.records).toEqual([
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
    expect(handler.mock.calls[0][0].detail).toEqual({
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
    element.rows = [ROWS[0], { ...ROWS[1], Name: "Lunch (renamed)" }];
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
    element.rows = [
      { ...ROWS[0], Name: "Period One" },
      ROWS[1],
      { Id: "a3", Name: "New" }
    ];
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
    handler.mock.calls[0][0].detail.onFailure();
    element.rows = ROWS;
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
    expect(handler.mock.calls[0][0].detail.records[0]).toEqual({
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
    element.columns = [...COLUMNS];
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
    expect(handler.mock.calls[0][0].detail.records).toEqual([
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
      element.filterField = "LocationType__c";
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
      const records = handler.mock.calls[0][0].detail.records;
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
      return handler.mock.calls[0][0].detail;
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
      element.rows = [...GROUPS];
      element.weekExceptions = [...EXCEPTIONS];
      await flush();
      expect(ticks(element, 0)).toEqual([false, true, true]);

      save(element);
      element.rows = [...GROUPS];
      element.weekExceptions = [
        ...EXCEPTIONS,
        { Id: "x3", Week__c: "w1", Group__c: "g1" }
      ];
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
});
