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
    options: [
      { label: "Morning", value: "Morning" },
      { label: "Afternoon", value: "Afternoon" }
    ]
  }
];

const ROWS = [
  {
    Id: "a1",
    Name: "Period 1",
    StartTime__c: 32400000,
    Outdoor__c: false,
    PartOfDay__c: "Morning",
    SortOrder__c: 1
  },
  {
    Id: "a2",
    Name: "Lunch",
    StartTime__c: 43200000,
    Outdoor__c: true,
    PartOfDay__c: "Morning",
    SortOrder__c: 2
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

/** The screen's side: every row the table sends, as sent (bare names). */
function listen(element) {
  const sent = [];
  element.addEventListener("save", (event) => {
    sent.push(bareRecord(event.detail));
  });
  return sent;
}

/** Answers a row save as the screen does: the result, a reload, then done. */
async function answer(element, detail, result, saved) {
  detail.onSaved(result);
  if (saved) {
    element.rows = packaged({ rows: saved }).rows;
  }
  await flush();
  detail.onDone();
  await flush();
}

function field(element, rowIndex, name) {
  return element.shadowRoot.querySelectorAll(`[data-field="${nsName(name)}"]`)[
    rowIndex
  ];
}

/** The table's rows, the blank row last (not the empty state or a who picker). */
function rows(element) {
  return [...element.shadowRoot.querySelectorAll("tbody tr[data-row]")].filter(
    (tr) => !tr.dataset.whoRow
  );
}

function leave(element, rowIndex, to = null) {
  rows(element)[rowIndex].dispatchEvent(
    new FocusEvent("focusout", { bubbles: true, relatedTarget: to })
  );
}

function press(input, key) {
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
  );
}

function addButton(element) {
  return element.shadowRoot.querySelector('[data-id="add"]');
}

// The test stand-ins for Salesforce inputs have no validity check of their own.
function allValid(element) {
  element.shadowRoot
    .querySelectorAll("lightning-input, lightning-combobox")
    .forEach((input) => {
      if (!jest.isMockFunction(input.reportValidity)) {
        input.reportValidity = () => true;
      }
      if (!jest.isMockFunction(input.checkValidity)) {
        input.checkValidity = () => true;
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
    expect(addButton(element)).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('unknown object "Mystery__c"');
    error.mockRestore();
  });

  it("a table given no object at all shows the same error, and can't add a row", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const element = createElement("c-shoresh-editable-table", {
      is: ShoreshEditableTable
    });
    Object.assign(element, { title: "Nothing named", columns: COLUMNS });
    document.body.appendChild(element);
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="unknown-object"]')
    ).not.toBeNull();
    expect(element.shadowRoot.querySelector("lightning-icon").iconName).toBe(
      "utility:error"
    );
    expect(addButton(element)).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
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

  describe("the blank last row", () => {
    it("is always there, under the empty message when nothing is saved yet", async () => {
      const element = render({
        columns: COLUMNS,
        rows: [],
        emptyMessage: "No time blocks yet."
      });
      await flush();
      const empty = element.shadowRoot.querySelector('[data-id="none-shown"]');
      expect(empty.textContent.trim()).toBe("No time blocks yet.");
      expect(rows(element).length).toBe(1);
      expect(field(element, 0, "Name").value).toBeUndefined();
      expect(field(element, 0, "Name").placeholder).toBe("Add Time block");
      // Its fields say what they add, for screen readers.
      expect(field(element, 0, "Name").label).toBe("Add Time block: Name");
      expect(field(element, 0, "StartTime__c").label).toBe(
        "Add Time block: Start"
      );
      // As the desktop's "+ Add", named for what it adds.
      expect(addButton(element).textContent.trim()).toBe("Add");
      // Its spoken name says which table it adds to.
      expect(addButton(element).getAttribute("aria-label")).toBe(
        "Add Time block"
      );

      const full = render({ columns: COLUMNS, rows: ROWS });
      await flush();
      expect(full.shadowRoot.querySelector('[data-id="none-shown"]')).toBe(
        null
      );
      expect(rows(full).length).toBe(3);
    });

    it("starts with the screen's values, and adds on Enter with everything in it", async () => {
      const element = render({
        columns: COLUMNS,
        rows: ROWS,
        newRowDefaults: { Program__c: "p1", PartOfDay__c: "Morning" }
      });
      const sent = listen(element);
      await flush();
      expect(field(element, 2, "PartOfDay__c").value).toBe("Morning");
      expect(addButton(element).disabled).toBe(true);
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30:00.000");
      await flush();
      expect(addButton(element).disabled).toBe(false);
      allValid(element);
      press(field(element, 2, "StartTime__c"), "Enter");
      expect(sent.length).toBe(1);
      expect(sent[0].record).toEqual({
        sobjectType: "TimeBlock__c",
        SortOrder__c: 3,
        Program__c: "p1",
        PartOfDay__c: "Morning",
        Name: "Swim",
        StartTime__c: "13:30:00.000Z"
      });
      expect(sent[0].seen).toBeNull();
      expect(typeof sent[0].onSaved).toBe("function");
      expect(typeof sent[0].onFailure).toBe("function");
      expect(typeof sent[0].onDone).toBe("function");
    });

    it("adds with its button, or when the director leaves it filled in", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      addButton(element).click();
      expect(sent.length).toBe(1);

      const other = render({ columns: COLUMNS, rows: ROWS });
      const otherSent = listen(other);
      await flush();
      change(field(other, 2, "Name"), "Swim");
      change(field(other, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(other);
      leave(other, 2);
      expect(otherSent.length).toBe(1);
    });

    it("moving between its own fields adds nothing", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      leave(element, 2, field(element, 2, "Outdoor__c"));
      expect(sent.length).toBe(0);
    });

    it("left half typed or untouched, adds nothing and keeps the typing", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      allValid(element);
      leave(element, 2);
      change(field(element, 2, "Name"), "Swim");
      await flush();
      allValid(element);
      leave(element, 2);
      press(field(element, 2, "Name"), "Enter");
      expect(sent.length).toBe(0);
      expect(field(element, 2, "Name").value).toBe("Swim");
      expect(addButton(element).disabled).toBe(true);
    });

    it("shows the new row at once, then clears, ready for the next", async () => {
      const element = render({
        columns: COLUMNS,
        rows: ROWS,
        newRowDefaults: { PartOfDay__c: "Morning" }
      });
      const sent = listen(element);
      await flush();
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30:00.000");
      await flush();
      allValid(element);
      press(field(element, 2, "Name"), "Enter");
      await flush();
      expect(addButton(element).disabled).toBe(true);
      sent[0].onSaved({ id: "a3", changed: [] });
      await flush();
      await flush();
      expect(rows(element).length).toBe(4);
      expect(field(element, 2, "Name").value).toBe("Swim");
      expect(field(element, 3, "Name").value).toBeUndefined();
      expect(field(element, 3, "PartOfDay__c").value).toBe("Morning");
      expect(
        element.shadowRoot.querySelector('[data-id="announce"]').textContent
      ).toContain("Swim added");
      // The reload brings the same row: still one of it.
      element.rows = packaged({
        rows: [
          ...ROWS,
          {
            Id: "a3",
            Name: "Swim",
            StartTime__c: 48600000,
            PartOfDay__c: "Morning",
            SortOrder__c: 3
          }
        ]
      }).rows;
      sent[0].onDone();
      await flush();
      expect(rows(element).length).toBe(4);
      expect(field(element, 2, "StartTime__c").value).toBe("13:30:00.000");
    });

    it("is locked while it is being added, so fast entry adds each row once", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      // Swim, Enter …
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      press(field(element, 2, "Name"), "Enter");
      await flush();
      expect(field(element, 2, "Name").disabled).toBe(true);
      expect(field(element, 2, "StartTime__c").disabled).toBe(true);
      // … a second Enter while it is being added sends nothing more.
      press(field(element, 2, "Name"), "Enter");
      leave(element, 2);
      expect(sent.length).toBe(1);
      await answer(element, sent[0], { id: "a3", changed: [] }, [
        ...ROWS,
        { Id: "a3", Name: "Swim", StartTime__c: 48600000, SortOrder__c: 3 }
      ]);
      // … the blank row is empty and open again, with the cursor back in it.
      expect(field(element, 3, "Name").value).toBeUndefined();
      expect(field(element, 3, "Name").disabled).toBe(false);
      // … Archery, Enter.
      change(field(element, 3, "Name"), "Archery");
      change(field(element, 3, "StartTime__c"), "14:30");
      await flush();
      allValid(element);
      press(field(element, 3, "Name"), "Enter");
      expect(sent.map((d) => d.record.Name)).toEqual(["Swim", "Archery"]);
      expect(sent[1].record.StartTime__c).toBe("14:30:00.000Z");
    });

    it("after Enter or +, the cursor is back in the blank row's first field", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      addButton(element).click();
      await flush();
      const focus = jest.spyOn(HTMLElement.prototype, "focus");
      sent[0].onSaved({ id: "a3", changed: [] });
      await flush();
      const focused = focus.mock.contexts.map(
        (el) => `${el.dataset.rowKey}:${el.dataset.field}`
      );
      focus.mockRestore();
      expect(focused).toContain(`add:${nsName("Name")}`);
    });

    it("its required values never show as missing; a value its field refuses stops the add", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      expect(field(element, 2, "Name").required).toBe(false);
      expect(field(element, 0, "Name").required).toBe(true);
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      const time = field(element, 2, "StartTime__c");
      time.reportValidity = jest.fn(() => false);
      press(field(element, 2, "Name"), "Enter");
      expect(time.reportValidity).toHaveBeenCalled();
      expect(sent.length).toBe(0);
    });

    it("refused, keeps what was typed", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      press(field(element, 2, "Name"), "Enter");
      sent[0].onFailure();
      sent[0].onDone();
      await flush();
      expect(rows(element).length).toBe(3);
      expect(field(element, 2, "Name").value).toBe("Swim");
      expect(addButton(element).disabled).toBe(false);
    });

    it("adds with a value left blank when its column doesn't require it, sent as nothing", async () => {
      // Time blocks: a blank name and part of day are filled in on the server.
      const element = render({
        columns: [
          { fieldName: "Name", label: "Name", type: "text" },
          COLUMNS[1],
          {
            ...COLUMNS[3],
            options: [
              { label: "From start time", value: "" },
              ...COLUMNS[3].options
            ]
          }
        ],
        rows: ROWS,
        newRowDefaults: { PartOfDay__c: "" }
      });
      const sent = listen(element);
      await flush();
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      addButton(element).click();
      expect(sent[0].record).toEqual({
        sobjectType: "TimeBlock__c",
        SortOrder__c: 3,
        PartOfDay__c: null,
        StartTime__c: "13:30:00.000Z"
      });
    });

    it("goes after the last row in the order, whatever their numbers", async () => {
      const element = render({
        columns: COLUMNS,
        rows: [
          { ...ROWS[0], SortOrder__c: 4 },
          { ...ROWS[1], SortOrder__c: 9 }
        ]
      });
      const sent = listen(element);
      await flush();
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      addButton(element).click();
      expect(sent[0].record.SortOrder__c).toBe(10);
    });

    it("shows a saved-only column as text", async () => {
      const unit = {
        fieldName: "Division__c",
        label: "Unit",
        type: "picklist",
        required: true,
        savedOnly: true,
        options: [
          { label: "Juniors", value: "d1" },
          { label: "Seniors", value: "d2" }
        ]
      };
      const element = render({
        objectApiName: "Group__c",
        columns: [COLUMNS[0], unit],
        rows: [{ Id: "g1", Name: "Bunk 1", Division__c: "d1" }],
        newRowDefaults: { Division__c: "d1" }
      });
      await flush();
      expect(
        element.shadowRoot.querySelectorAll("lightning-combobox").length
      ).toBe(1);
      expect(
        element.shadowRoot.querySelector('[data-id="fixed"]').textContent
      ).toBe("Juniors");
      change(field(element, 1, "Name"), "Bunk 2");
      await flush();
      expect(addButton(element).disabled).toBe(false);
    });
  });

  describe("saved rows save as you go", () => {
    it("leaving a row sends only what changed, with what the director saw", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "Period One");
      change(field(element, 0, "PartOfDay__c"), "Afternoon");
      await flush();
      allValid(element);
      leave(element, 0, field(element, 0, "Outdoor__c"));
      expect(sent.length).toBe(0);
      leave(element, 0, field(element, 1, "Name"));
      expect(sent.length).toBe(1);
      expect(sent[0].record).toEqual({
        sobjectType: "TimeBlock__c",
        Id: "a1",
        Name: "Period One",
        PartOfDay__c: "Afternoon"
      });
      expect(sent[0].seen).toEqual({
        sobjectType: "TimeBlock__c",
        Name: "Period 1",
        PartOfDay__c: "Morning"
      });
      expect(sent[0].extras).toEqual({ weeksOff: [], weeksBackOn: [] });
    });

    it("Enter saves the row", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 1, "Name"), "Lunch break");
      await flush();
      allValid(element);
      press(field(element, 1, "Name"), "Enter");
      expect(sent.map((d) => d.record.Name)).toEqual(["Lunch break"]);
    });

    it("a row with nothing changed, or changed back, sends nothing", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      allValid(element);
      leave(element, 0);
      change(field(element, 0, "Name"), "Other");
      change(field(element, 0, "Name"), "Period 1");
      await flush();
      leave(element, 0);
      expect(sent.length).toBe(0);
    });

    it("checkboxes send true or false", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Outdoor__c"), true);
      await flush();
      allValid(element);
      leave(element, 0);
      expect(sent[0].record).toEqual({
        sobjectType: "TimeBlock__c",
        Id: "a1",
        Outdoor__c: true
      });
      expect(sent[0].seen).toEqual({
        sobjectType: "TimeBlock__c",
        Outdoor__c: false
      });
    });

    it("Escape in a date or time field closes its picker, and keeps the row's typing", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      await flush();
      change(field(element, 0, "Name"), "Changed");
      await flush();
      press(field(element, 0, "StartTime__c"), "Escape");
      await flush();
      expect(field(element, 0, "Name").value).toBe("Changed");
    });

    it("Escape puts the row back as saved", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "Changed");
      change(field(element, 0, "Outdoor__c"), true);
      await flush();
      press(field(element, 0, "Name"), "Escape");
      await flush();
      expect(field(element, 0, "Name").value).toBe("Period 1");
      expect(field(element, 0, "Outdoor__c").checked).toBe(false);
      allValid(element);
      leave(element, 0);
      expect(sent.length).toBe(0);
    });

    it("does not save a row with a value missing, and shows why", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "");
      await flush();
      allValid(element);
      const name = field(element, 0, "Name");
      name.reportValidity = jest.fn(() => false);
      leave(element, 0);
      expect(name.reportValidity).toHaveBeenCalled();
      expect(sent.length).toBe(0);
      expect(field(element, 0, "Name").value).toBe("");
    });

    it("asks the screen to delete a saved row; the blank row has no delete", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const handler = jest.fn();
      element.addEventListener("delete", handler);
      await flush();
      const deletes = element.shadowRoot.querySelectorAll('[data-id="delete"]');
      expect(deletes.length).toBe(2);
      expect(deletes[0].alternativeText).toBe("Delete Period 1");
      deletes[0].click();
      expect(bareRecord(handler.mock.calls[0][0].detail)).toEqual({
        recordId: "a1",
        name: "Period 1"
      });
    });

    it("leaves a name that looks like a clock time alone", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "10:30");
      change(field(element, 0, "StartTime__c"), "10:30");
      await flush();
      allValid(element);
      leave(element, 0);
      expect(sent[0].record).toEqual({
        sobjectType: "TimeBlock__c",
        Id: "a1",
        Name: "10:30",
        StartTime__c: "10:30:00.000Z"
      });
      expect(sent[0].seen.StartTime__c).toBe("09:00:00.000Z");
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
      const sent = listen(element);
      await flush();
      expect(field(element, 0, "GroupsThatFit__c").min).toBe(1);
      change(field(element, 0, "GroupsThatFit__c"), "3");
      await flush();
      allValid(element);
      leave(element, 0);
      await answer(element, sent[0], { id: "l1", changed: [] });
      change(field(element, 1, "GroupsThatFit__c"), "");
      await flush();
      allValid(element);
      leave(element, 1);
      expect(sent.map((d) => d.record)).toEqual([
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
      expect(labels(2)).toEqual(["None", "Soccer", "Gym games"]);
    });
  });

  describe("one row at a time", () => {
    it("sends the next row only once the screen is done with the last", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "One");
      await flush();
      allValid(element);
      leave(element, 0);
      change(field(element, 1, "Name"), "Two");
      await flush();
      allValid(element);
      leave(element, 1);
      expect(sent.length).toBe(1);
      sent[0].onSaved({ id: "a1", changed: [] });
      element.rows = packaged({
        rows: [{ ...ROWS[0], Name: "One" }, ROWS[1]]
      }).rows;
      await flush();
      expect(sent.length).toBe(1);
      sent[0].onDone();
      await flush();
      expect(sent.map((d) => d.record.Name)).toEqual(["One", "Two"]);
    });

    it("typing while a row is being saved stays, and is saved next against what was saved", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "One");
      await flush();
      allValid(element);
      leave(element, 0);
      change(field(element, 0, "Name"), "Uno");
      await flush();
      allValid(element);
      leave(element, 0);
      await answer(element, sent[0], { id: "a1", changed: [] }, [
        { ...ROWS[0], Name: "One" },
        ROWS[1]
      ]);
      expect(field(element, 0, "Name").value).toBe("Uno");
      expect(sent.length).toBe(2);
      expect(sent[1].record.Name).toBe("Uno");
      expect(sent[1].seen.Name).toBe("One");
    });

    it("keeps unsaved typing when something else on the screen is saved", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      await flush();
      change(field(element, 0, "Name"), "Typed");
      change(field(element, 2, "Name"), "Unsaved new block");
      await flush();
      // The screen reloads after another table saved: Lunch was renamed elsewhere.
      element.rows = packaged({
        rows: [ROWS[0], { ...ROWS[1], Name: "Lunch (renamed)" }]
      }).rows;
      await flush();
      expect(field(element, 0, "Name").value).toBe("Typed");
      expect(field(element, 1, "Name").value).toBe("Lunch (renamed)");
      expect(field(element, 2, "Name").value).toBe("Unsaved new block");
    });

    it("keeps typing when the screen hands over the columns again", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      await flush();
      change(field(element, 0, "Name"), "Typed");
      change(field(element, 2, "Name"), "New");
      await flush();
      element.columns = packaged({ columns: [...COLUMNS] }).columns;
      await flush();
      expect(field(element, 0, "Name").value).toBe("Typed");
      expect(field(element, 2, "Name").value).toBe("New");
    });

    it("a refused save keeps the typing, to be saved again on the next leave", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "Typed");
      await flush();
      allValid(element);
      leave(element, 0);
      sent[0].onFailure();
      element.rows = packaged({ rows: ROWS }).rows;
      sent[0].onDone();
      await flush();
      expect(field(element, 0, "Name").value).toBe("Typed");
      allValid(element);
      leave(element, 0);
      expect(sent.length).toBe(2);
      expect(sent[1].seen.Name).toBe("Period 1");
    });

    /**
     * Property: whatever order the director types, leaves rows, and the screen answers in, at
     * most one row is being saved at a time, nothing typed is lost or saved over by an older
     * value, a save never clashes with the director's own earlier save, and what someone else
     * changed in a field the director never touched stays.
     */
    /* eslint-disable no-await-in-loop -- each step waits for the table to redraw */
    it("save as you go keeps every edit, in order, over many random sessions", async () => {
      const random = seeded(20261017);
      const pick = (list) => list[Math.floor(random() * list.length)];
      const columns = [
        { fieldName: "Name", label: "Name", type: "text", required: true },
        { fieldName: "GroupsThatFit__c", label: "Fits", type: "number" },
        { fieldName: "Notes__c", label: "Notes", type: "text" }
      ];
      for (let run = 0; run < 200; run++) {
        const server = new Map(
          ["l1", "l2", "l3"].map((id, i) => [
            id,
            {
              Id: id,
              Name: `Place ${i}`,
              GroupsThatFit__c: i + 1,
              Notes__c: ""
            }
          ])
        );
        const snapshot = () => [...server.values()].map((r) => ({ ...r }));
        const element = render({
          objectApiName: "Location__c",
          columns,
          rows: snapshot()
        });
        const open = [];
        let clashes = 0;
        element.addEventListener("save", (event) => {
          open.push(bareRecord(event.detail));
          expect(open.length).toBe(1);
        });
        await flush();
        // What the director last typed, and what someone else wrote into Notes.
        const typed = new Map();
        const theirNotes = new Map();
        const finish = async () => {
          const detail = open.shift();
          const now = server.get(detail.record.Id);
          const conflict = Object.keys(detail.seen || {})
            .filter((f) => f !== "sobjectType")
            .some(
              (f) =>
                !sameOnServer(now[f], detail.seen[f]) &&
                !sameOnServer(now[f], detail.record[f])
            );
          if (conflict) {
            clashes += 1;
          } else {
            Object.assign(now, detail.record);
            delete now.sobjectType;
          }
          detail.onSaved({ id: detail.record.Id, changed: [] });
          element.rows = packaged({ rows: snapshot() }).rows;
          await flush();
          detail.onDone();
          await flush();
        };
        for (let step = 0; step < 30; step++) {
          const roll = random();
          const row = Math.floor(random() * 3);
          if (roll < 0.45) {
            const name = pick(["Name", "GroupsThatFit__c"]);
            const value =
              name === "Name"
                ? pick(["Pool", "Lake", "Gym", "Field"]) + step
                : 1 + Math.floor(random() * 5);
            change(field(element, row, name), String(value));
            typed.set(`${row}|${name}`, value);
            await flush();
          } else if (roll < 0.75) {
            allValid(element);
            leave(element, row);
            await flush();
          } else if (roll < 0.9 && open.length) {
            await finish();
          } else {
            const id = `l${row + 1}`;
            const note = `Theirs ${step}`;
            server.get(id).Notes__c = note;
            theirNotes.set(id, note);
          }
        }
        allValid(element);
        for (let row = 0; row < 3; row++) {
          leave(element, row);
          while (open.length) {
            await finish();
          }
        }
        expect(clashes).toBe(0);
        typed.forEach((value, key) => {
          const [row, name] = key.split("|");
          expect(server.get(`l${Number(row) + 1}`)[name]).toEqual(value);
        });
        theirNotes.forEach((note, id) => {
          expect(server.get(id).Notes__c).toBe(note);
        });
        document.body.removeChild(element);
      }
    });
    /* eslint-enable no-await-in-loop */
  });

  describe("changed by someone else", () => {
    async function clash(extra = {}) {
      const element = render({ columns: COLUMNS, rows: ROWS, ...extra });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "PartOfDay__c"), "Afternoon");
      change(field(element, 0, "Name"), "Period One");
      await flush();
      allValid(element);
      leave(element, 0);
      const theirs = { ...ROWS[0], PartOfDay__c: "Morning", Name: "First" };
      sent[0].onSaved(
        nsRecord({ changed: [nsName("Name")], theirs: { ...theirs } })
      );
      element.rows = packaged({ rows: [theirs, ROWS[1]] }).rows;
      await flush();
      sent[0].onDone();
      await flush();
      return { element, sent };
    }

    const dialog = (element) =>
      element.shadowRoot.querySelector('[data-id="conflict"]');

    it("asks, naming the row and the field, theirs and yours", async () => {
      const { element, sent } = await clash();
      expect(dialog(element).textContent).toContain("Changed by someone else");
      expect(dialog(element).querySelector(".conflict-where").textContent).toBe(
        "Period One · Name"
      );
      expect(
        dialog(element).querySelector('[data-id="theirs"]').textContent
      ).toBe("First");
      expect(
        dialog(element).querySelector('[data-id="yours"]').textContent
      ).toBe("Period One");
      // Nothing more is sent while the question is open.
      change(field(element, 1, "Name"), "Lunch break");
      await flush();
      allValid(element);
      leave(element, 1);
      expect(sent.length).toBe(1);
    });

    it("Keep theirs: their value stays, the director's other changes are still saved", async () => {
      const { element, sent } = await clash();
      dialog(element).querySelector('[data-id="keep-theirs"]').click();
      await flush();
      expect(dialog(element)).toBeNull();
      expect(field(element, 0, "Name").value).toBe("First");
      expect(sent.length).toBe(2);
      expect(sent[1].record).toEqual({
        sobjectType: "TimeBlock__c",
        Id: "a1",
        PartOfDay__c: "Afternoon"
      });
    });

    it("Use yours: the same change again, naming what is there now", async () => {
      const { element, sent } = await clash();
      dialog(element).querySelector('[data-id="use-yours"]').click();
      await flush();
      expect(sent.length).toBe(2);
      expect(sent[1].record).toEqual({
        sobjectType: "TimeBlock__c",
        Id: "a1",
        Name: "Period One",
        PartOfDay__c: "Afternoon"
      });
      expect(sent[1].seen).toEqual({
        sobjectType: "TimeBlock__c",
        Name: "First",
        PartOfDay__c: "Morning"
      });
    });

    it("Tab stays on the question's two buttons; afterwards the director is back in the row", async () => {
      const { element } = await clash();
      await flush();
      const keep = dialog(element).querySelector('[data-id="keep-theirs"]');
      const use = dialog(element).querySelector('[data-id="use-yours"]');
      const tab = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true
      });
      keep.focus();
      keep.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      expect(element.shadowRoot.activeElement).toBe(use);
      // The test stand-in for a Salesforce input can't take focus itself.
      const name = field(element, 0, "Name");
      name.focus = jest.fn();
      use.click();
      await flush();
      await flush();
      expect(name.focus).toHaveBeenCalled();
    });

    it("Escape keeps theirs, and the question has the first choice focused", async () => {
      const { element } = await clash();
      await flush();
      expect(
        dialog(element).querySelector('[data-id="keep-theirs"]')
      ).toBeTruthy();
      dialog(element).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flush();
      expect(dialog(element)).toBeNull();
      expect(field(element, 0, "Name").value).toBe("First");
    });

    it("shows choices, ticks and times as the director reads them", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "PartOfDay__c"), "Afternoon");
      change(field(element, 0, "Outdoor__c"), true);
      change(field(element, 0, "StartTime__c"), "13:30:00.000");
      await flush();
      allValid(element);
      leave(element, 0);
      sent[0].onSaved(
        nsRecord({
          changed: [
            nsName("PartOfDay__c"),
            nsName("Outdoor__c"),
            nsName("StartTime__c")
          ],
          theirs: {
            Id: "a1",
            PartOfDay__c: null,
            Outdoor__c: false,
            StartTime__c: 36000000
          }
        })
      );
      await flush();
      const shown = [
        ...element.shadowRoot.querySelectorAll(".conflict-row")
      ].map((row) => [
        row.querySelector('[data-id="theirs"]').textContent,
        row.querySelector('[data-id="yours"]').textContent
      ]);
      expect(shown).toEqual([
        ["None", "Afternoon"],
        ["No", "Yes"],
        ["10:00 AM", "1:30 PM"]
      ]);
    });
  });

  describe("what someone else changed, kept straight", () => {
    // Each of these guards stops an unseen change of someone else's being saved over.
    it("typing again after a reload still compares with what the director first saw", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "One");
      await flush();
      // Someone else renamed it meanwhile; the reload brings theirs under the typing.
      element.rows = packaged({
        rows: [{ ...ROWS[0], Name: "Theirs" }, ROWS[1]]
      }).rows;
      await flush();
      change(field(element, 0, "Name"), "Uno");
      await flush();
      allValid(element);
      leave(element, 0);
      expect(sent[0].seen.Name).toBe("Period 1");
    });

    it("Keep theirs on a time puts back their time as the field shows it", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "StartTime__c"), "13:30:00.000");
      await flush();
      allValid(element);
      leave(element, 0);
      sent[0].onSaved(
        nsRecord({
          changed: [nsName("StartTime__c")],
          theirs: { Id: "a1", StartTime__c: 36000000 }
        })
      );
      sent[0].onDone();
      await flush();
      element.shadowRoot.querySelector('[data-id="keep-theirs"]').click();
      await flush();
      expect(field(element, 0, "StartTime__c").value).toBe("10:00:00.000");
    });

    it("names a choice someone else just added once the reload brings it, never its Id; dates as a director reads them", async () => {
      const columns = [
        COLUMNS[0],
        {
          fieldName: "Location__c",
          label: "Location",
          type: "picklist",
          options: [{ label: "Gym", value: "l1" }]
        },
        { fieldName: "StartDate__c", label: "Start date", type: "date" }
      ];
      const rowList = [
        {
          Id: "a1",
          Name: "Swim",
          Location__c: "l1",
          StartDate__c: "2027-07-05"
        }
      ];
      const element = render({ columns, rows: rowList });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "StartDate__c"), "2027-07-06");
      change(field(element, 0, "Location__c"), "");
      await flush();
      allValid(element);
      leave(element, 0);
      sent[0].onSaved(
        nsRecord({
          changed: [nsName("Location__c"), nsName("StartDate__c")],
          theirs: { Id: "a1", Location__c: "l9", StartDate__c: "2027-07-03" }
        })
      );
      await flush();
      const theirs = () =>
        [...element.shadowRoot.querySelectorAll('[data-id="theirs"]')].map(
          (dd) => dd.textContent
        );
      expect(theirs()).toEqual(["None", "Sat, Jul 3, 2027"]);
      expect(
        element.shadowRoot.querySelectorAll('[data-id="yours"]')[1].textContent
      ).toBe("Tue, Jul 6, 2027");
      element.columns = packaged({
        columns: [
          columns[0],
          {
            ...columns[1],
            options: [...columns[1].options, { label: "Lake", value: "l9" }]
          },
          columns[2]
        ]
      }).columns;
      await flush();
      expect(theirs()[0]).toBe("Lake");
    });

    it("the question takes the focus, says it is a question, and Enter on a row's buttons saves nothing", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "One");
      await flush();
      press(
        element.shadowRoot.querySelectorAll('[data-id="delete"]')[0],
        "Enter"
      );
      expect(sent.length).toBe(0);
      allValid(element);
      leave(element, 0);
      const focus = jest.spyOn(HTMLElement.prototype, "focus");
      sent[0].onSaved(
        nsRecord({ changed: ["Name"], theirs: { Id: "a1", Name: "Theirs" } })
      );
      await flush();
      const focused = focus.mock.contexts.map((el) => el.dataset.id);
      focus.mockRestore();
      expect(focused).toContain("keep-theirs");
      const question = element.shadowRoot.querySelector('[data-id="conflict"]');
      expect(question.getAttribute("role")).toBe("dialog");
      expect(question.getAttribute("aria-modal")).toBe("true");
      expect(question.getAttribute("aria-labelledby")).toBeTruthy();
      expect(question.querySelector("h2").textContent.trim()).toBe(
        "Changed by someone else"
      );
    });
  });

  describe("saving, as the director sees it", () => {
    it("says each save to screen readers, the same words again too", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      const live = element.shadowRoot.querySelector('[data-id="announce"]');
      expect(live.getAttribute("aria-live")).toBe("polite");
      const saveAs = async (name) => {
        change(field(element, 1, "Name"), name);
        await flush();
        allValid(element);
        leave(element, 1);
        const detail = sent[sent.length - 1];
        detail.onSaved({ id: "a2", changed: [] });
        await flush();
        await flush();
        expect(live.textContent.trim()).toBe(`${name} saved`);
        element.rows = packaged({
          rows: [ROWS[0], { ...ROWS[1], Name: name }]
        }).rows;
        detail.onDone();
        await flush();
      };
      await saveAs("Again");
      await saveAs("Lunch");
      // "Lunch saved" again (another change to the same row): the text still changes.
      const before = live.textContent;
      change(field(element, 1, "Outdoor__c"), false);
      await flush();
      leave(element, 1);
      sent[sent.length - 1].onSaved({ id: "a2", changed: [] });
      await flush();
      expect(live.textContent.trim()).toBe("Lunch saved");
      expect(live.textContent).not.toBe(before);
    });

    it("a refused change keeps a mark until it is saved or put back", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 1, "Name"), "Clash");
      await flush();
      allValid(element);
      leave(element, 1);
      sent[0].onFailure();
      sent[0].onDone();
      await flush();
      const marked = () =>
        rows(element).map((tr) => tr.classList.contains("not-saved"));
      expect(marked()).toEqual([false, true, false]);
      expect(
        rows(element)[1].querySelector('[data-id="not-saved"]').textContent
      ).toBe("Not saved");
      press(field(element, 1, "Name"), "Escape");
      await flush();
      expect(marked()).toEqual([false, false, false]);
    });

    it("Escape in a dropdown puts the row back, unless the dropdown used it to close", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      await flush();
      change(field(element, 0, "PartOfDay__c"), "Afternoon");
      await flush();
      const closing = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true
      });
      closing.preventDefault();
      field(element, 0, "PartOfDay__c").dispatchEvent(closing);
      await flush();
      expect(field(element, 0, "PartOfDay__c").value).toBe("Afternoon");
      press(field(element, 0, "PartOfDay__c"), "Escape");
      await flush();
      expect(field(element, 0, "PartOfDay__c").value).toBe("Morning");
    });
  });

  describe("the third look", () => {
    it("a blank row added while another row is saving waits, locked, and goes next", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 0, "Name"), "Period One");
      await flush();
      allValid(element);
      leave(element, 0);
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      press(field(element, 2, "Name"), "Enter");
      await flush();
      expect(sent.length).toBe(1);
      await answer(element, sent[0], { id: "a1", changed: [] }, [
        { ...ROWS[0], Name: "Period One" },
        ROWS[1]
      ]);
      expect(sent.map((d) => d.record.Name)).toEqual(["Period One", "Swim"]);
      expect(field(element, 2, "Name").disabled).toBe(true);
      expect(addButton(element).textContent.trim()).toBe("Adding…");
    });

    it("while the blank row is being added, its ticks and who wait too", async () => {
      const element = render({
        objectApiName: "RecurringActivity__c",
        columns: [
          COLUMNS[0],
          {
            fieldName: "Coverages__r",
            label: "Who",
            type: "who",
            options: [{ label: "Bunk 1", value: "g1" }]
          }
        ],
        rows: [{ Id: "r1", Name: "Swim" }],
        weeks: [{ Id: "w1", Name: "Week 1" }],
        weeksHeading: "Runs in"
      });
      listen(element);
      await flush();
      change(field(element, 1, "Name"), "Art");
      await flush();
      allValid(element);
      press(field(element, 1, "Name"), "Enter");
      await flush();
      const blank = rows(element)[1];
      expect(blank.querySelector("lightning-input[data-week]").disabled).toBe(
        true
      );
      expect(blank.querySelector('[data-id="who-toggle"]').disabled).toBe(true);
      // Every Change button is named for its row.
      expect(
        rows(element)[0]
          .querySelector('[data-id="who-toggle"]')
          .getAttribute("aria-label")
      ).toBe("Change: Who, Swim");
    });

    it("a refused add puts the cursor back where it was: the field, or the Add button", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 2, "Name"), "Carpool");
      change(field(element, 2, "StartTime__c"), "09:00");
      await flush();
      allValid(element);
      press(field(element, 2, "StartTime__c"), "Enter");
      await flush();
      let focus = jest.spyOn(HTMLElement.prototype, "focus");
      sent[0].onFailure();
      sent[0].onDone();
      await flush();
      let focused = focus.mock.contexts.map(
        (el) => el.dataset.field || el.dataset.id
      );
      focus.mockRestore();
      expect(focused).toContain(nsName("StartTime__c"));
      allValid(element);
      addButton(element).click();
      await flush();
      focus = jest.spyOn(HTMLElement.prototype, "focus");
      sent[1].onFailure();
      sent[1].onDone();
      await flush();
      focused = focus.mock.contexts.map((el) => el.dataset.id);
      focus.mockRestore();
      expect(focused).toContain("add");
    });

    it("asks before a week is turned off on a saved row; no puts the tick back", async () => {
      const ask = jest.fn();
      const element = render({
        objectApiName: "Group__c",
        columns: [COLUMNS[0]],
        rows: [{ Id: "g1", Name: "Bunk 1" }],
        weeks: [{ Id: "w1", Name: "Week 1" }],
        weeksHeading: "Runs in",
        beforeWeekOff: ask
      });
      const sent = listen(element);
      await flush();
      const box = () =>
        rows(element)[0].querySelector("lightning-input[data-week]");
      ask.mockResolvedValueOnce(false);
      change(box(), false);
      await flush();
      await flush();
      expect(ask).toHaveBeenCalledWith({
        recordId: "g1",
        name: "Bunk 1",
        weekId: "w1",
        weekName: "Week 1"
      });
      expect(box().checked).toBe(true);
      expect(sent.length).toBe(0);
      ask.mockResolvedValueOnce(true);
      allValid(element);
      change(box(), false);
      await flush();
      await flush();
      expect(sent[0].extras.weeksOff).toEqual([{ target: "g1", week: "w1" }]);
      // The blank row's weeks are not asked about.
      change(
        rows(element)[1].querySelector("lightning-input[data-week]"),
        false
      );
      await flush();
      expect(ask).toHaveBeenCalledTimes(2);
    });

    it("the not-saved mark: kept across a reload, read with each field, and gone once typed back, saved or put back", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      const refuse = async (value) => {
        change(field(element, 1, "Name"), value);
        await flush();
        allValid(element);
        leave(element, 1);
        const detail = sent[sent.length - 1];
        detail.onFailure();
        detail.onDone();
        await flush();
      };
      const marked = () => rows(element)[1].classList.contains("not-saved");
      await refuse("Clash");
      // Another row's save reloads the table: the mark stays.
      element.rows = packaged({ rows: [...ROWS] }).rows;
      await flush();
      expect(marked()).toBe(true);
      expect(field(element, 1, "Name").label).toBe("Name, not saved");
      // Typed back: nothing unsaved; typing again is not marked before any save.
      change(field(element, 1, "Name"), "Lunch");
      await flush();
      change(field(element, 1, "Name"), "Lunch 2");
      await flush();
      expect(marked()).toBe(false);
      // A refusal, then Escape, then new typing: no mark.
      await refuse("Clash");
      press(field(element, 1, "Name"), "Escape");
      change(field(element, 1, "Name"), "Lunch 3");
      await flush();
      expect(marked()).toBe(false);
      // A refusal, then a save that goes through, then new typing: no mark.
      await refuse("Clash");
      leave(element, 1);
      const detail = sent[sent.length - 1];
      detail.onSaved({ id: "a2", changed: [] });
      element.rows = packaged({
        rows: [ROWS[0], { ...ROWS[1], Name: "Clash" }]
      }).rows;
      detail.onDone();
      await flush();
      change(field(element, 1, "Name"), "Lunch 4");
      await flush();
      expect(marked()).toBe(false);
    });

    it("after a refused save, typing back to the saved value is nothing to save", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      const sent = listen(element);
      await flush();
      change(field(element, 1, "Name"), "Clash");
      await flush();
      allValid(element);
      leave(element, 1);
      sent[0].onFailure();
      sent[0].onDone();
      await flush();
      change(field(element, 1, "Name"), "Lunch");
      await flush();
      leave(element, 1);
      expect(sent.length).toBe(1);
    });

    it("the page handing over the same starting values again keeps the blank row's typing", async () => {
      const element = render({
        columns: COLUMNS,
        rows: ROWS,
        newRowDefaults: { PartOfDay__c: "Morning" }
      });
      await flush();
      change(field(element, 2, "Name"), "Half typed");
      await flush();
      element.newRowDefaults = nsRecord({ PartOfDay__c: "Morning" });
      await flush();
      expect(field(element, 2, "Name").value).toBe("Half typed");
    });

    it("leaving a filled-in blank row checks its fields quietly; Enter shows what's wrong", async () => {
      const element = render({ columns: COLUMNS, rows: ROWS });
      listen(element);
      await flush();
      change(field(element, 2, "Name"), "Swim");
      change(field(element, 2, "StartTime__c"), "13:30");
      await flush();
      allValid(element);
      const time = field(element, 2, "StartTime__c");
      time.checkValidity = jest.fn(() => false);
      time.reportValidity = jest.fn(() => false);
      leave(element, 2);
      expect(time.checkValidity).toHaveBeenCalled();
      expect(time.reportValidity).not.toHaveBeenCalled();
    });
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

    it("shows only the chosen type, or rows with no type; the blank row always", async () => {
      const element = render({
        objectApiName: "Location__c",
        addLabel: "Add Location",
        columns: LOCATION_COLUMNS,
        rows: LOCATIONS,
        filterField: "LocationType__c",
        filterValue: "t1"
      });
      await flush();
      expect(names(element)).toEqual(["Field A", "Field B", undefined]);
      element.filterValue = "";
      await flush();
      expect(names(element)).toEqual(["Pool", undefined]);
      element.filterValue = undefined;
      await flush();
      expect(names(element)).toEqual(["Pool", "Field A", "Field B", undefined]);
    });

    it("a row whose type is changed stays until it is saved; the blank row starts with the chosen type", async () => {
      const element = render({
        objectApiName: "Location__c",
        addLabel: "Add Location",
        columns: LOCATION_COLUMNS,
        rows: LOCATIONS,
        filterField: "LocationType__c",
        filterValue: "t1"
      });
      const sent = listen(element);
      await flush();
      expect(field(element, 2, "LocationType__c").value).toBe("t1");
      change(field(element, 0, "LocationType__c"), "");
      await flush();
      expect(names(element)).toEqual(["Field A", "Field B", undefined]);
      allValid(element);
      leave(element, 0);
      expect(sent[0].record).toEqual({
        sobjectType: "Location__c",
        Id: "l2",
        LocationType__c: null
      });
      // Saved: the reload has it with no type, so it leaves this view.
      await answer(element, sent[0], { id: "l2", changed: [] }, [
        LOCATIONS[0],
        { Id: "l2", Name: "Field A" },
        LOCATIONS[2]
      ]);
      expect(names(element)).toEqual(["Field B", undefined]);
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
        element.shadowRoot
          .querySelector('[data-id="none-shown"]')
          .textContent.trim()
      ).toBe("Nothing to show with this choice.");
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
        newRowDefaults: { Division__c: "d1" },
        ...props
      });
    }

    function rowTicks(element, rowIndex) {
      return [
        ...rows(element)[rowIndex].querySelectorAll(
          "lightning-input[data-week]"
        )
      ];
    }
    const ticks = (element, rowIndex) =>
      rowTicks(element, rowIndex).map((box) => box.checked);
    const tick = (element, rowIndex, weekIndex) =>
      rowTicks(element, rowIndex)[weekIndex];

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
      expect(ticks(element, 2)).toEqual([true, true, true]);
      expect(tick(element, 2, 0).label).toBe("Add Bunk runs in Week 1");
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
      const sent = listen(element);
      await flush();
      change(tick(element, 0, 1), false);
      change(tick(element, 1, 2), true);
      await flush();
      allValid(element);
      leave(element, 0);
      await answer(element, sent[0], { id: "g1", changed: [] });
      leave(element, 1);
      expect(sent.map((d) => d.record)).toEqual([
        { sobjectType: "Group__c", Id: "g1" },
        { sobjectType: "Group__c", Id: "g2" }
      ]);
      expect(sent[0].extras).toEqual({
        weeksOff: [{ target: "g1", week: "w2" }],
        weeksBackOn: []
      });
      expect(sent[1].extras).toEqual({ weeksOff: [], weeksBackOn: ["x1"] });
    });

    it("the blank row runs in every week until a week is unticked", async () => {
      const element = renderGroups();
      const sent = listen(element);
      await flush();
      change(field(element, 2, "Name"), "Bunk 3");
      change(tick(element, 2, 0), false);
      await flush();
      allValid(element);
      addButton(element).click();
      expect(sent[0].record.Name).toBe("Bunk 3");
      expect(sent[0].extras.weeksOff).toEqual([{ row: 0, week: "w1" }]);
    });

    it("a tick on a saved row is saved the moment it is clicked, as on the desktop", async () => {
      const element = renderGroups();
      const sent = listen(element);
      await flush();
      allValid(element);
      change(tick(element, 0, 1), false);
      await flush();
      expect(sent.length).toBe(1);
      expect(sent[0].extras.weeksOff).toEqual([{ target: "g1", week: "w2" }]);
      // The blank row's ticks wait for it to be added.
      change(tick(element, 2, 0), false);
      await flush();
      expect(sent.length).toBe(1);
    });

    it("unticking and ticking again is no change", async () => {
      const element = renderGroups();
      const sent = listen(element);
      await flush();
      change(tick(element, 0, 0), false);
      change(tick(element, 0, 0), true);
      await flush();
      allValid(element);
      leave(element, 0);
      expect(sent.length).toBe(0);
    });

    it("keeps unsaved ticks when something else is saved, and drops them once saved", async () => {
      const element = renderGroups();
      const sent = listen(element);
      await flush();
      change(tick(element, 0, 0), false);
      element.rows = packaged({ rows: [...GROUPS] }).rows;
      element.weekExceptions = packaged({
        weekExceptions: [...EXCEPTIONS]
      }).weekExceptions;
      await flush();
      expect(ticks(element, 0)).toEqual([false, true, true]);

      allValid(element);
      leave(element, 0);
      sent[0].onSaved({ id: "g1", changed: [] });
      element.rows = packaged({ rows: [...GROUPS] }).rows;
      element.weekExceptions = packaged({
        weekExceptions: [
          ...EXCEPTIONS,
          { Id: "x3", Week__c: "w1", Group__c: "g1" }
        ]
      }).weekExceptions;
      sent[0].onDone();
      await flush();
      expect(ticks(element, 0)).toEqual([false, true, true]);
      // Someone else ticks it again later: the table shows theirs.
      element.weekExceptions = packaged({
        weekExceptions: [...EXCEPTIONS]
      }).weekExceptions;
      await flush();
      expect(ticks(element, 0)).toEqual([true, true, true]);
      leave(element, 0);
      expect(sent.length).toBe(1);
    });

    it("Escape puts the saved ticks back", async () => {
      const element = renderGroups();
      await flush();
      change(tick(element, 1, 2), true);
      await flush();
      press(field(element, 1, "Name"), "Escape");
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

    it("sends a row and its week ticks together", async () => {
      const element = renderGroups();
      const sent = listen(element);
      await flush();
      change(field(element, 1, "Name"), "Bunk Two");
      change(tick(element, 1, 0), false);
      await flush();
      allValid(element);
      leave(element, 1);
      expect(sent[0].record).toEqual({
        sobjectType: "Group__c",
        Id: "g2",
        Name: "Bunk Two"
      });
      expect(sent[0].extras).toEqual({
        weeksOff: [{ target: "g2", week: "w1" }],
        weeksBackOn: []
      });
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

    function renderRecurring(rowList = SWIM) {
      return render({
        objectApiName: "RecurringActivity__c",
        addLabel: "Add Recurring activity",
        columns: [
          { fieldName: "Name", label: "Name", type: "text", required: true },
          { fieldName: "Monday__c", label: "Monday", type: "checkbox" },
          WHO
        ],
        rows: rowList,
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

    it("shows who each row covers, everyone when it names nobody", async () => {
      const element = renderRecurring();
      await flush();
      expect(summaries(element)).toEqual([
        "Bunk 1 (Juniors)",
        "Everyone in Main",
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
      expect(summaries(element).slice(0, 2)).toEqual([
        "Unit: Juniors",
        "Bunk 2 (Juniors)"
      ]);
    });

    it("opens the picker under the row; Done saves the choice with who it covered", async () => {
      const element = renderRecurring();
      const sent = listen(element);
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
      // Moving from the row into its picker is staying in the row.
      leave(element, 1, picker(element));
      expect(sent.length).toBe(0);
      allValid(element);
      toggle(element, 1).click();
      expect(sent[0].record).toEqual({
        sobjectType: "RecurringActivity__c",
        Id: "r2"
      });
      expect(sent[0].extras.who).toEqual([{ target: "r2", targets: ["d1"] }]);
      expect(sent[0].seenWho).toEqual([]);
    });

    it("who is compared with what the director first saw, across reloads and a save in between", async () => {
      const element = renderRecurring();
      const sent = listen(element);
      await flush();
      toggle(element, 0).click();
      await flush();
      picker(element).dispatchEvent(
        new CustomEvent("change", { detail: { value: ["g2"] } })
      );
      await flush();
      // Someone else's who arrives with a reload, under the director's choice.
      element.rows = packaged({
        rows: [
          { ...SWIM[0], Coverages__r: [{ Id: "c9", Division__c: "d1" }] },
          SWIM[1]
        ]
      }).rows;
      await flush();
      // A second change keeps what was first seen.
      picker(element).dispatchEvent(
        new CustomEvent("change", { detail: { value: ["g1", "g2"] } })
      );
      await flush();
      allValid(element);
      // Leaving into the picker is staying; leaving the picker's row saves.
      const whoRow = element.shadowRoot.querySelector("tr[data-who-row]");
      whoRow.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
      );
      expect(sent.length).toBe(1);
      expect(sent[0].seenWho).toEqual(["g1"]);
      // Changed again while that save is going: compared with what was just sent.
      picker(element).dispatchEvent(
        new CustomEvent("change", { detail: { value: ["g1"] } })
      );
      sent[0].onSaved({ id: "r1", changed: [] });
      element.rows = packaged({
        rows: [
          {
            ...SWIM[0],
            Coverages__r: [
              { Id: "c1", Group__c: "g1" },
              { Id: "c2", Group__c: "g2" }
            ]
          },
          SWIM[1]
        ]
      }).rows;
      sent[0].onDone();
      await flush();
      leave(element, 0);
      expect(sent[1].seenWho).toEqual(["g1", "g2"]);
      expect(sent[1].extras.who).toEqual([{ target: "r1", targets: ["g1"] }]);
    });

    it("someone else changed who: theirs and yours by name", async () => {
      const element = renderRecurring();
      const sent = listen(element);
      await flush();
      toggle(element, 0).click();
      await flush();
      picker(element).dispatchEvent(
        new CustomEvent("change", { detail: { value: ["g2"] } })
      );
      await flush();
      allValid(element);
      toggle(element, 0).click();
      expect(sent[0].seenWho).toEqual(["g1"]);
      sent[0].onSaved({
        changed: [],
        theirs: { Id: "r1" },
        theirWho: ["d1", "g9"]
      });
      sent[0].onDone();
      await flush();
      const dialog = element.shadowRoot.querySelector('[data-id="conflict"]');
      expect(dialog.querySelector(".conflict-where").textContent).toBe(
        "Swim · Who"
      );
      expect(dialog.querySelector('[data-id="theirs"]').textContent).toBe(
        "Unit: Juniors"
      );
      expect(dialog.querySelector('[data-id="yours"]').textContent).toBe(
        "Bunk 2 (Juniors)"
      );
      dialog.querySelector('[data-id="use-yours"]').click();
      await flush();
      expect(sent[1].seenWho).toEqual(["d1", "g9"]);
      expect(sent[1].extras.who).toEqual([{ target: "r1", targets: ["g2"] }]);
    });

    it("the blank row is added with its who", async () => {
      const element = renderRecurring();
      const sent = listen(element);
      await flush();
      change(field(element, 2, "Name"), "Gym");
      toggle(element, 2).click();
      await flush();
      picker(element).dispatchEvent(
        new CustomEvent("change", { detail: { value: ["g2"] } })
      );
      await flush();
      allValid(element);
      addButton(element).click();
      expect(sent[0].record).toEqual({
        sobjectType: "RecurringActivity__c",
        SortOrder__c: 3,
        Program__c: "p1",
        Monday__c: false,
        Name: "Gym"
      });
      expect(sent[0].extras.who).toEqual([{ row: 0, targets: ["g2"] }]);
    });

    it("keeps a chosen who when something else on the screen is saved; Escape puts it back", async () => {
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
      press(field(element, 0, "Name"), "Escape");
      await flush();
      expect(summaries(element)[0]).toBe("Bunk 1 (Juniors)");
    });

    it("a fix offered in a row's note is saved at once", async () => {
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
      const sent = listen(element);
      await flush();
      const buttons = element.shadowRoot.querySelectorAll(
        '[data-id="row-action"]'
      );
      expect([...buttons].map((b) => b.label)).toEqual([
        "Keep Period 2 – Snack",
        "Stretch to Period 2 – Period 3"
      ]);
      allValid(element);
      buttons[1].click();
      expect(sent[0].record).toEqual({
        sobjectType: "RecurringActivity__c",
        Id: "r2",
        Length__c: 3
      });
      expect(sent[0].seen).toEqual({
        sobjectType: "RecurringActivity__c",
        Length__c: null
      });
    });

    it("shows each saved row's note", async () => {
      const element = renderRecurring();
      await flush();
      const notes = [
        ...element.shadowRoot.querySelectorAll('[data-id="note"]')
      ].map((n) => n.textContent.trim());
      expect(notes).toEqual([
        "Bunk 3 is morning only and is left out.",
        "",
        ""
      ]);
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
      "",
      ""
    ]);
    expect(element.shadowRoot.textContent).toContain("Moving");
  });

  describe("same names", () => {
    const named = (names) =>
      names.map((Name, i) => ({ Id: `r${i}`, Name, PartOfDay__c: "Morning" }));
    const tags = (element) =>
      rows(element).map((tr) => !!tr.querySelector('[data-id="same-name"]'));

    it("tags each row whose name another row has, ignoring capitals and spacing", async () => {
      const element = render({
        columns: COLUMNS,
        rows: named(["Swim", "Archery", "  swim "]),
        flagSameNames: true
      });
      await flush();
      expect(tags(element)).toEqual([true, false, true, false]);
      expect(
        element.shadowRoot.querySelector('[data-id="same-name"]').label
      ).toBe("Same name as another");
      // The words are on the dot (hover, focus, tap, screen readers), not beside it.
      expect(
        element.shadowRoot.querySelector('[data-id="same-name"]').focusable
      ).toBe(true);
      expect(rows(element)[0].querySelector("td").textContent).not.toContain(
        "Same name as another"
      );
    });

    it("follows what is typed, the blank row too, and stays off unless asked for", async () => {
      const element = render({
        columns: COLUMNS,
        rows: named(["Swim", "Archery"]),
        flagSameNames: true
      });
      await flush();
      change(field(element, 1, "Name"), "SWIM");
      await flush();
      expect(tags(element)).toEqual([true, true, false]);
      change(field(element, 2, "Name"), "archery");
      change(field(element, 1, "Name"), "Archery");
      await flush();
      expect(tags(element)).toEqual([false, true, true]);
      const plain = render({ columns: COLUMNS, rows: named(["Swim", "swim"]) });
      await flush();
      expect(tags(plain)).toEqual([false, false, false]);
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
        objectApiName: "Group__c",
        columns: [COLUMNS[0], unit],
        rows: [
          { Id: "g1", Name: "Bunk 1", Division__c: "d1" },
          { Id: "g2", Name: "Bunk 2", Division__c: "d1" }
        ],
        flagSameNames: true,
        sameNameScope: "Division__c",
        sameNamesElsewhere: { d2: ["Bunk 2", "Bunk 9"] }
      });
      const moves = jest.fn();
      element.addEventListener("pendingnames", moves);
      await flush();
      expect(tags(element)).toEqual([false, false, false]);
      change(field(element, 1, "Division__c"), "d2");
      await flush();
      expect(tags(element)).toEqual([false, true, false]);
      expect(bareRecord(moves.mock.calls.at(-1)[0].detail)).toEqual({
        moved: { d2: ["Bunk 2"] }
      });
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
        expect(tags(elements[i])).toEqual([same, same, false]);
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
      rows(element).map((tr) => {
        const tag = tr.querySelector('[data-id="overlaps"]');
        return tag ? tag.label : null;
      });

    it("tags each week whose dates overlap another's, without stopping the save", async () => {
      const element = render({
        title: "Weeks",
        objectApiName: "Week__c",
        columns: WEEK_COLUMNS,
        rows: weeks,
        overlapLabel: "Overlaps another session"
      });
      const sent = listen(element);
      await flush();
      expect(tags(element)).toEqual([
        "Overlaps another session",
        "Overlaps another session",
        null,
        null
      ]);
      change(field(element, 1, "StartDate__c"), "2027-07-05");
      await flush();
      expect(tags(element)).toEqual([null, null, null, null]);
      change(field(element, 2, "StartDate__c"), "2027-07-09");
      await flush();
      expect(tags(element)).toEqual([
        null,
        "Overlaps another session",
        "Overlaps another session",
        null
      ]);
      allValid(element);
      leave(element, 2);
      expect(sent.length).toBe(1);
    });

    it("stays off unless asked for", async () => {
      const element = render({ columns: WEEK_COLUMNS, rows: weeks });
      await flush();
      expect(tags(element)).toEqual([null, null, null, null]);
    });
  });
});

/** Equal as the server compares: blanks alike, numbers by value. */
function sameOnServer(a, b) {
  const blank = (v) => v === undefined || v === null || v === "";
  return (blank(a) && blank(b)) || a === b;
}

/** A repeatable stream of numbers in [0, 1) (mulberry32), so a failure can be replayed. */
function seeded(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
