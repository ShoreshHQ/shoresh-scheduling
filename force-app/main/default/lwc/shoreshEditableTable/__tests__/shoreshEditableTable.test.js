import { createElement } from "lwc";
import ShoreshEditableTable, { timeText } from "c/shoreshEditableTable";

const COLUMNS = [
  { fieldName: "Name", label: "Name", type: "text", required: true },
  { fieldName: "StartTime__c", label: "Start", type: "time", required: true },
  { fieldName: "EventsOnly__c", label: "Events only", type: "checkbox" },
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
    EventsOnly__c: false,
    PartOfDay__c: "Morning"
  },
  {
    Id: "a2",
    Name: "Lunch",
    StartTime__c: 43200000,
    EventsOnly__c: true,
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
    expect(field(element, 1, "EventsOnly__c").checked).toBe(true);

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
    change(field(element, 0, "EventsOnly__c"), true);
    const handler = jest.fn();
    element.addEventListener("save", handler);
    await flush();
    allValid(element);
    button(element, "Save changes").click();
    expect(handler.mock.calls[0][0].detail.records).toEqual([
      { sobjectType: "TimeBlock__c", Id: "a1", EventsOnly__c: true }
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
});
