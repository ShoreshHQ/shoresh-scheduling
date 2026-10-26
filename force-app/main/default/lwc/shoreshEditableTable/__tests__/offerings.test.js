/*
 * The shared table with an Electives set's offerings (repo ADR 0018, slice E4): seats in words,
 * the No limit tick, a minimum's quiet blank, a row named by its activity, a proposed row's
 * dashed edge and Confirm, the heading's count of confirmed open offerings, and a kind with no
 * order of its own.
 */
import { createElement } from "lwc";
import ShoreshEditableTable from "c/shoreshEditableTable";
import { bareRecord, nsName, nsRecord } from "shoresh-jest/namespace";

const flush = () => Promise.resolve();

const ACTIVITIES = new Map([
  ["a1", "Archery"],
  ["a2", "Pottery"],
  ["a3", "Ceramics"],
  ["a4", "Woodworking"],
  ["a5", "Photography"],
  ["a6", "Drama"]
]);

const OFFERINGS = [
  { Id: "o1", ElectiveSet__c: "es1", Activity__c: "a1", Seats__c: 12 },
  {
    Id: "o2",
    ElectiveSet__c: "es1",
    Activity__c: "a2",
    Seats__c: 8,
    NoSeatLimit__c: true
  },
  { Id: "o3", ElectiveSet__c: "es1", Activity__c: "a3", Seats__c: 0 },
  {
    Id: "o4",
    ElectiveSet__c: "es1",
    Activity__c: "a4",
    Seats__c: 10,
    MinimumToRun__c: 6,
    Proposed__c: true
  },
  { Id: "o5", ElectiveSet__c: "es1", Activity__c: "a5" },
  { Id: "o9", ElectiveSet__c: "es2", Activity__c: "a6", Seats__c: 4 }
];

function columns() {
  return [
    {
      fieldName: nsName("Activity__c"),
      label: "Offering",
      type: "picklist",
      required: true,
      width: 14,
      options: [...ACTIVITIES].map(([value, label]) => ({ label, value }))
    },
    {
      fieldName: nsName("Seats__c"),
      label: "Seats",
      type: "seats",
      noLimitField: nsName("NoSeatLimit__c"),
      noLimitLabel: "No limit",
      min: 0,
      width: 10
    },
    {
      fieldName: nsName("MinimumToRun__c"),
      label: "Minimum",
      type: "number",
      min: 1,
      placeholder: "No minimum",
      width: 8.5
    }
  ];
}

function render(props = {}) {
  const element = createElement("c-shoresh-editable-table", {
    is: ShoreshEditableTable
  });
  Object.assign(element, {
    title: "Chugim: Offerings",
    heading: "Chugim",
    objectApiName: nsName("Offering__c"),
    addLabel: "Add to Chugim",
    filterField: nsName("ElectiveSet__c"),
    filterValue: "es1",
    columns: columns(),
    rows: nsRecord(OFFERINGS),
    newRowDefaults: nsRecord({ ElectiveSet__c: "es1" }),
    nameFor: (values) => ACTIVITIES.get(values[nsName("Activity__c")]) || "",
    detailsLabel: "Details",
    ...props
  });
  document.body.appendChild(element);
  return element;
}

function listen(element) {
  const sent = [];
  element.addEventListener("save", (event) => {
    sent.push(bareRecord(event.detail));
  });
  return sent;
}

const rows = (element) =>
  [...element.shadowRoot.querySelectorAll("tbody tr[data-row]")].filter(
    (tr) => !tr.dataset.whoRow && !tr.dataset.moreRow
  );

const field = (element, rowIndex, name) =>
  element.shadowRoot.querySelectorAll(`[data-field="${nsName(name)}"]`)[
    rowIndex
  ];

function leave(element, rowIndex) {
  rows(element)[rowIndex].dispatchEvent(
    new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
  );
}

function allValid(element) {
  element.shadowRoot
    .querySelectorAll("lightning-input, lightning-combobox")
    .forEach((input) => {
      input.reportValidity = () => true;
      input.checkValidity = () => true;
    });
}

describe("c-shoresh-editable-table: an elective set's offerings", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("seats read as words at rest: a number (0 too, not closed), No limit, nothing while blank", async () => {
    const element = render();
    await flush();
    const words = [
      ...element.shadowRoot.querySelectorAll('[data-id="seats-text"]')
    ].map((s) => s.textContent);
    // The set's rows, then the blank row (typed in, so nothing to read yet).
    expect(words).toEqual(["12", "No limit", "0", "10", "", ""]);
    // Under the pointer or while edited: the number and the tick, named for the row.
    const seats = field(element, 0, "Seats__c");
    expect(seats.label).toBe("Seats");
    expect(seats.value).toBe(12);
    const noLimit = field(element, 0, "NoSeatLimit__c");
    expect(noLimit.getAttribute("aria-label")).toBe("No limit");
    expect(noLimit.checked).toBe(false);
    // No limit ticked: the number waits, empty.
    expect(field(element, 1, "Seats__c").disabled).toBe(true);
    expect(field(element, 1, "Seats__c").value).toBeNull();
    expect(field(element, 1, "NoSeatLimit__c").checked).toBe(true);
    // The blank row's fields say what they add.
    expect(field(element, 5, "Seats__c").label).toBe("Add to Chugim: Seats");
  });

  it("No limit and seats are the row's own fields, saved with it", async () => {
    const element = render();
    const sent = listen(element);
    await flush();
    const tick = field(element, 0, "NoSeatLimit__c");
    tick.checked = true;
    tick.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(
      element.shadowRoot.querySelectorAll('[data-id="seats-text"]')[0]
        .textContent
    ).toBe("No limit");
    allValid(element);
    leave(element, 0);
    expect(sent[0].record).toEqual({
      sobjectType: "Offering__c",
      Id: "o1",
      NoSeatLimit__c: true
    });
    expect(sent[0].seen).toEqual({
      sobjectType: "Offering__c",
      NoSeatLimit__c: null
    });
  });

  it("typing 0 saves a number, as Salesforce wants it (0 is not closed)", async () => {
    const element = render();
    const sent = listen(element);
    await flush();
    const seats = field(element, 0, "Seats__c");
    seats.value = "0";
    seats.dispatchEvent(new CustomEvent("change", { detail: { value: "0" } }));
    await flush();
    expect(
      element.shadowRoot.querySelectorAll('[data-id="seats-text"]')[0]
        .textContent
    ).toBe("0");
    allValid(element);
    leave(element, 0);
    expect(sent[0].record).toEqual({
      sobjectType: "Offering__c",
      Id: "o1",
      Seats__c: 0
    });
  });

  it("a blank minimum reads No minimum, quietly", async () => {
    const element = render();
    await flush();
    const minimum = field(element, 0, "MinimumToRun__c");
    expect(minimum.placeholder).toBe("No minimum");
    expect(field(element, 3, "MinimumToRun__c").value).toBe(6);
  });

  it("a row is named by its activity: its buttons and what is said", async () => {
    const element = render();
    await flush();
    const deletes = [
      ...element.shadowRoot.querySelectorAll('[data-id="delete"]')
    ].map((b) => b.getAttribute("aria-label"));
    expect(deletes).toEqual([
      "Delete Archery",
      "Delete Pottery",
      "Delete Ceramics",
      "Delete Woodworking",
      "Delete Photography"
    ]);
    const details = element.shadowRoot.querySelector('[data-id="details"]');
    expect(details.getAttribute("aria-label")).toBe("Archery details");
    const handler = jest.fn();
    element.addEventListener("delete", handler);
    element.shadowRoot.querySelector('[data-id="delete"]').click();
    expect(handler.mock.calls[0][0].detail.name).toBe("Archery");
  });

  it("the blank row's choice says what it adds; an offering is added with its set and no order", async () => {
    const element = render();
    const sent = listen(element);
    await flush();
    const pick = field(element, 5, "Activity__c");
    expect(pick.placeholder).toBe("Add to Chugim");
    pick.value = "a6";
    pick.dispatchEvent(new CustomEvent("change", { detail: { value: "a6" } }));
    await flush();
    allValid(element);
    element.shadowRoot.querySelector('[data-id="add"]').click();
    await flush();
    // Offerings have no order of their own: nothing else is sent (no SortOrder).
    expect(sent[0].record).toEqual({
      sobjectType: "Offering__c",
      ElectiveSet__c: "es1",
      Activity__c: "a6"
    });
  });

  it("a proposed offering has a dashed edge and Confirm at its end, saved at once", async () => {
    const element = render({
      rowClasses: { o4: "row_proposed" },
      endActions: nsRecord({
        o4: [
          {
            key: "confirm",
            label: "Confirm",
            changes: { Proposed__c: false }
          }
        ]
      })
    });
    const sent = listen(element);
    await flush();
    expect(rows(element)[3].className).toContain("row_proposed");
    expect(rows(element)[0].className).not.toContain("row_proposed");
    const confirms = [
      ...element.shadowRoot.querySelectorAll('[data-id="end-action"]')
    ];
    expect(confirms.length).toBe(1);
    expect(confirms[0].textContent.trim()).toBe("Confirm");
    expect(confirms[0].getAttribute("aria-label")).toBe("Confirm Woodworking");
    allValid(element);
    confirms[0].click();
    await flush();
    expect(sent[0].record).toEqual({
      sobjectType: "Offering__c",
      Id: "o4",
      Proposed__c: false
    });
    expect(sent[0].seen).toEqual({
      sobjectType: "Offering__c",
      Proposed__c: true
    });
    await expect(element).toBeAccessible();
  });

  it("Confirm shows under the pointer or with the keyboard in the row, as the mock-up draws it, never hidden from Tab", () => {
    // jsdom draws no styles, so the stylesheet itself is read: Confirm fades out at rest (it is
    // never display: none or hidden, which would take it out of Tab) and back in on hover or
    // focus anywhere in its row. The real browser check confirms both in the org.
    const fs = require("fs");
    const path = require("path");
    const css = fs
      .readFileSync(path.join(__dirname, "../shoreshEditableTable.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: m[1].trim().split(/\s*,\s*/),
      body: m[2]
    }));
    const body = (selector) =>
      rules
        .filter((r) => r.selectors.includes(selector))
        .map((r) => r.body)
        .join(";");
    const atRest = body(".end-action");
    expect(atRest).toMatch(/opacity:\s*0\b/);
    expect(atRest).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    expect(body(".row:hover .end-action")).toMatch(/opacity:\s*1\b/);
    expect(body(".row:focus-within .end-action")).toMatch(/opacity:\s*1\b/);
  });

  describe("the cursor after Confirm (WCAG 2.4.3)", () => {
    const CONFIRM = nsRecord({
      o4: [
        { key: "confirm", label: "Confirm", changes: { Proposed__c: false } }
      ]
    });

    /** Confirm pressed from the keyboard; returns its button. */
    async function confirm(element) {
      allValid(element);
      const button = element.shadowRoot.querySelector('[data-id="end-action"]');
      button.focus();
      button.click();
      await flush();
      return button;
    }

    /** The screen reloads the set: the offering confirmed, Confirm gone. Lists what took focus. */
    async function reloadConfirmed(element) {
      const focus = jest.spyOn(HTMLElement.prototype, "focus");
      element.busy = false;
      element.rowClasses = {};
      element.endActions = {};
      element.rows = nsRecord(
        OFFERINGS.map((o) => (o.Id === "o4" ? { ...o, Proposed__c: false } : o))
      );
      await flush();
      await flush();
      const focused = focus.mock.contexts.map(
        (el) => `${el.dataset.rowKey}:${el.dataset.field || el.dataset.id}`
      );
      focus.mockRestore();
      return focused;
    }

    it("Confirm gone once saved: the cursor goes to the offering's first field, not the page", async () => {
      const element = render({
        rowClasses: { o4: "row_proposed" },
        endActions: CONFIRM
      });
      await flush();
      const button = await confirm(element);
      expect(element.shadowRoot.activeElement).toBe(button);
      // The screen is busy while it saves: the button is disabled, and the browser drops it.
      element.busy = true;
      await flush();
      document.body.focus();
      button.blur();
      const focused = await reloadConfirmed(element);
      expect(focused).toEqual([`row-o4:${nsName("Activity__c")}`]);
      expect(
        element.shadowRoot.querySelector('[data-id="end-action"]')
      ).toBeNull();
    });

    it("the director has moved on meanwhile: the cursor is left where it is", async () => {
      const element = render({
        rowClasses: { o4: "row_proposed" },
        endActions: CONFIRM
      });
      await flush();
      await confirm(element);
      const elsewhere = document.createElement("button");
      document.body.appendChild(elsewhere);
      elsewhere.focus();
      const focused = await reloadConfirmed(element);
      expect(focused).toEqual([]);
      expect(document.activeElement).toBe(elsewhere);
    });
  });

  it("the heading's count can be the set's open offerings, not its rows (decision 53)", async () => {
    const element = render({ headingCount: 2 });
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="section-count"]').textContent
    ).toBe("2");
    element.headingCount = undefined;
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="section-count"]').textContent
    ).toBe("5");
  });

  it("seats not filled in carry the needs-a-look corner with its words only, no Looks right", async () => {
    const element = render({
      guesses: {
        o5: {
          [nsName("Seats__c")]: {
            field: "seats",
            words: "Seats not filled in yet",
            name: "Seats for Photography: seats not filled in yet",
            wordsOnly: true
          }
        }
      }
    });
    await flush();
    const mark = element.shadowRoot.querySelector('[data-id="guess"]');
    expect(mark.wordsOnly).toBe(true);
    expect(mark.label).toBe("Seats not filled in yet");
    mark.shadowRoot.querySelector('[data-id="guess-mark"]').click();
    await flush();
    expect(
      mark.shadowRoot.querySelector('[data-id="guess-words"]').textContent
    ).toBe("Seats not filled in yet");
    expect(mark.shadowRoot.querySelector('[data-id="looks-right"]')).toBeNull();
  });
});
