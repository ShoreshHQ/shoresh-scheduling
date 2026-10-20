import { createElement } from "lwc";
import ShoreshActivityDetails from "c/shoreshActivityDetails";
import { buildTerms } from "c/shoreshTerms";
import LightningConfirm from "lightning/confirm";
import { bareRecord, nsRecord } from "shoresh-jest/namespace";

jest.mock(
  "lightning/confirm",
  () => ({ __esModule: true, default: { open: jest.fn() } }),
  { virtual: true }
);

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  {
    term: "Division",
    singular: "Unit",
    plural: "Units",
    isCustom: true
  },
  {
    term: "Activity",
    singular: "Activity",
    plural: "Activities",
    isCustom: false
  }
]);

const SETUP = {
  programs: [
    {
      program: { Id: "p1", Name: "Main" },
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors" },
          groups: [
            { Id: "g1", Name: "Bunk 1" },
            { Id: "g2", Name: "Bunk 2" }
          ]
        }
      ]
    }
  ],
  activities: [
    {
      Id: "a1",
      Name: "Archery",
      SameDivisionOnly__c: false,
      Eligibilities__r: [{ Id: "e1", Group__c: "g2" }]
    },
    {
      Id: "a2",
      Name: "Swim test",
      EarlyWeekCount__c: 1,
      EarlyWeekByDay__c: "Tuesday"
    }
  ]
};

const flush = () =>
  [...Array(5)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(setup = SETUP) {
  const element = createElement("c-shoresh-activity-details", {
    is: ShoreshActivityDetails
  });
  element.terms = terms;
  element.setup = nsRecord(setup);
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
/** Leaves a field (the cursor goes elsewhere on the page). */
const leave = (input) => input.dispatchEvent(new CustomEvent("focusout"));
/** The saves sent, with bare names. */
const sent = (handler) =>
  handler.mock.calls.map((call) => bareRecord(call[0].detail));
const savedMark = (element) =>
  q(element, "c-shoresh-saved-mark").shadowRoot.querySelector(
    '[data-id="saved"]'
  );

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

function allValid(element) {
  element.shadowRoot
    .querySelectorAll("lightning-input, lightning-combobox, lightning-textarea")
    .forEach((input) => {
      input.reportValidity = () => true;
    });
}

describe("c-shoresh-activity-details", () => {
  afterEach(() => {
    jest.clearAllMocks();
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows the first activity's choices, in the camp words", async () => {
    const element = await render();
    const who = q(element, '[data-id="who-can-do-it"]');
    expect(who.value).toEqual(["g2"]);
    expect(who.options.map((o) => o.label)).toEqual([
      "Unit: Juniors",
      "Bunk 1 (Juniors)",
      "Bunk 2 (Juniors)"
    ]);
    expect(q(element, '[data-id="who-note"]').textContent).toContain(
      "Only the chosen Units and Bunks"
    );
    expect(element.shadowRoot.querySelectorAll("lightning-button").length).toBe(
      0
    );
  });

  it("nobody chosen means every group", async () => {
    const element = await render();
    change(q(element, '[data-id="activity-picker"]'), "a2");
    await flush();
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual([]);
    expect(q(element, '[data-id="who-note"]').textContent).toContain(
      "every Bunk can do it"
    );
    expect(q(element, '[data-field="earlyDay"]').value).toBe("Tuesday");
  });

  it("shows each saved rule and who can do it, by division or group", async () => {
    const element = await render({
      ...SETUP,
      activities: [
        {
          Id: "a3",
          Name: "Canoe",
          SameDivisionOnly__c: true,
          EarlyWeekCount__c: 2,
          EarlyWeekByDay__c: "Wednesday",
          Notes__c: "Life jackets",
          Eligibilities__r: [
            { Id: "e2", Division__c: "d1" },
            { Id: "e3", Group__c: "g2" }
          ]
        }
      ]
    });
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual(["d1", "g2"]);
    expect(q(element, '[data-field="sameDivision"]').checked).toBe(true);
    expect(q(element, '[data-field="earlyCount"]').value).toBe(2);
    expect(q(element, '[data-field="earlyDay"]').value).toBe("Wednesday");
    expect(q(element, '[data-field="notes"]').value).toBe("Life jackets");
  });

  it("a tick or a dropdown saves at once; only that rule is sent, with who can do it", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    change(q(element, '[data-field="sameDivision"]'), true);
    change(q(element, '[data-field="earlyDay"]'), "Wednesday");
    await flush();
    const saves = sent(handler);
    expect(saves.map((save) => save.rules)).toEqual([
      { sobjectType: "Activity__c", Id: "a1", SameDivisionOnly__c: true },
      // The early-week day goes with its count: the server takes both or neither.
      {
        sobjectType: "Activity__c",
        Id: "a1",
        EarlyWeekCount__c: null,
        EarlyWeekByDay__c: "Wednesday"
      }
    ]);
    // The server replaces the list, so it always goes whole.
    expect(saves[0].whoCanDoIt).toEqual(["g2"]);
    expect(typeof saves[0].onSaved).toBe("function");
    expect(typeof saves[0].onFailure).toBe("function");
  });

  it("a number, the notes, and who can do it save when the director leaves them", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    const who = q(element, '[data-id="who-can-do-it"]');
    change(who, ["d1"]);
    change(q(element, '[data-field="earlyCount"]'), "2");
    change(q(element, '[data-field="notes"]'), "Helmets");
    await flush();
    expect(handler).not.toHaveBeenCalled();
    leave(who);
    leave(q(element, '[data-field="earlyCount"]'));
    leave(q(element, '[data-field="notes"]'));
    await flush();
    const saves = sent(handler);
    expect(saves.map((save) => save.rules)).toEqual([
      { sobjectType: "Activity__c", Id: "a1" },
      {
        sobjectType: "Activity__c",
        Id: "a1",
        EarlyWeekCount__c: 2,
        EarlyWeekByDay__c: null
      },
      { sobjectType: "Activity__c", Id: "a1", Notes__c: "Helmets" }
    ]);
    expect(saves[0].whoCanDoIt).toEqual(["d1"]);
    // Leaving again with nothing changed sends nothing more.
    leave(who);
    await flush();
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("moving inside the who list (to its buttons) is not leaving it", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    const who = q(element, '[data-id="who-can-do-it"]');
    change(who, ["d1"]);
    // Focus moving to the list's own buttons is seen from outside as focus on the list itself
    // (the browser retargets it to the component).
    who.dispatchEvent(
      new FocusEvent("focusout", { relatedTarget: who, bubbles: true })
    );
    await flush();
    expect(handler).not.toHaveBeenCalled();
  });

  it("an early count the field refuses is not sent", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    const count = q(element, '[data-field="earlyCount"]');
    count.reportValidity = () => false;
    change(count, "0");
    leave(count);
    await flush();
    expect(handler).not.toHaveBeenCalled();
  });

  it("clearing the early-week day sends nothing, not an empty word", async () => {
    const element = await render();
    change(q(element, '[data-id="activity-picker"]'), "a2");
    await flush();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    change(q(element, '[data-field="earlyCount"]'), "");
    leave(q(element, '[data-field="earlyCount"]'));
    change(q(element, '[data-field="earlyDay"]'), "");
    await flush();
    const [first, second] = sent(handler);
    expect(first.rules.EarlyWeekCount__c).toBeNull();
    expect(second.rules.EarlyWeekByDay__c).toBeNull();
  });

  it("an early-week rule can be set one field at a time: a refused count goes again with the day", async () => {
    // Archery has neither the count nor the day.
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    const count = q(element, '[data-field="earlyCount"]');
    change(count, "2");
    leave(count);
    await flush();
    handler.mock.calls[0][0].detail.onFailure(
      "Give both how many times and by which day, or neither."
    );
    await flush();
    expect(q(element, '[data-error="earlyCount"]').textContent).toContain(
      "Give both"
    );
    change(q(element, '[data-field="earlyDay"]'), "Wednesday");
    await flush();
    expect(sent(handler)[1].rules).toEqual({
      sobjectType: "Activity__c",
      Id: "a1",
      EarlyWeekCount__c: 2,
      EarlyWeekByDay__c: "Wednesday"
    });
    handler.mock.calls[1][0].detail.onSaved();
    await flush();
    expect(q(element, '[data-error="earlyCount"]')).toBeNull();
    expect(savedMark(element).textContent).toContain("Saved");
  });

  it("an early-week rule can be cleared one field at a time", async () => {
    const element = await render();
    change(q(element, '[data-id="activity-picker"]'), "a2");
    await flush();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    change(q(element, '[data-field="earlyDay"]'), "");
    await flush();
    handler.mock.calls[0][0].detail.onFailure("Give both, or neither.");
    await flush();
    expect(q(element, '[data-error="earlyDay"]').textContent).toContain(
      "Give both"
    );
    const count = q(element, '[data-field="earlyCount"]');
    change(count, "");
    leave(count);
    await flush();
    expect(sent(handler)[1].rules).toEqual({
      sobjectType: "Activity__c",
      Id: "a2",
      EarlyWeekCount__c: null,
      EarlyWeekByDay__c: null
    });
    handler.mock.calls[1][0].detail.onSaved();
    await flush();
    expect(q(element, '[data-error="earlyDay"]')).toBeNull();
  });

  it("says Saved quietly once the screen saved it", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    change(q(element, '[data-field="sameDivision"]'), true);
    await flush();
    expect(savedMark(element).textContent).toBe("");
    handler.mock.calls[0][0].detail.onSaved();
    await flush();
    expect(savedMark(element).textContent).toContain("Saved");
    expect(savedMark(element).getAttribute("role")).toBe("status");
    // Changing something again takes the mark away until that is saved.
    change(q(element, '[data-field="notes"]'), "x");
    await flush();
    expect(savedMark(element).textContent).toBe("");
  });

  it("a refusal shows next to the field, and what was typed stays to save again", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    const who = q(element, '[data-id="who-can-do-it"]');
    change(who, ["g1", "g2"]);
    leave(who);
    await flush();
    handler.mock.calls[0][0].detail.onFailure(
      "Activity details not saved. Your changes are still here. Try again."
    );
    await flush();
    const why = q(element, '[data-error="who"]');
    expect(why.textContent).toContain("Activity details not saved.");
    expect(why.getAttribute("role")).toBe("alert");
    // A reload from something else saved keeps it.
    element.setup = nsRecord({ ...SETUP });
    await flush();
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual(["g1", "g2"]);
    leave(q(element, '[data-id="who-can-do-it"]'));
    await flush();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(sent(handler)[1].whoCanDoIt).toEqual(["g1", "g2"]);
  });

  it("keeps unsaved choices when something else on the screen is saved", async () => {
    const element = await render();
    change(q(element, '[data-id="who-can-do-it"]'), ["g1", "g2"]);
    await flush();
    element.setup = nsRecord({ ...SETUP });
    await flush();
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual(["g1", "g2"]);
  });

  it("a choice being saved is not put back by a reload that answers before it", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    change(q(element, '[data-field="sameDivision"]'), true);
    await flush();
    element.setup = nsRecord({ ...SETUP });
    await flush();
    expect(q(element, '[data-field="sameDivision"]').checked).toBe(true);
    handler.mock.calls[0][0].detail.onSaved();
    const saved = JSON.parse(JSON.stringify(SETUP));
    saved.activities[0].SameDivisionOnly__c = true;
    element.setup = nsRecord(saved);
    await flush();
    expect(q(element, '[data-field="sameDivision"]').checked).toBe(true);
  });

  it("asks for activities first when there are none", async () => {
    const element = await render({ ...SETUP, activities: [] });
    expect(element.shadowRoot.textContent).toContain(
      "Add activities in the table above"
    );
  });

  it("switching activities with a refused change asks first, and staying keeps it", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    change(q(element, '[data-id="who-can-do-it"]'), ["g1", "g2"]);
    leave(q(element, '[data-id="who-can-do-it"]'));
    await flush();
    handler.mock.calls[0][0].detail.onFailure("Not saved.");
    await flush();
    LightningConfirm.open.mockResolvedValue(false);
    change(q(element, '[data-id="activity-picker"]'), "a2");
    await flush();
    expect(LightningConfirm.open).toHaveBeenCalledTimes(1);
    expect(LightningConfirm.open.mock.calls[0][0].message).toBe(
      'Discard your unsaved changes to "Archery"?'
    );
    expect(q(element, '[data-id="activity-picker"]').value).toBe("a1");
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual(["g1", "g2"]);

    LightningConfirm.open.mockResolvedValue(true);
    change(q(element, '[data-id="activity-picker"]'), "a2");
    await flush();
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual([]);
    expect(q(element, '[data-error="who"]')).toBeNull();
  });

  it("switching with nothing typed does not ask", async () => {
    const element = await render();
    change(q(element, '[data-id="activity-picker"]'), "a2");
    await flush();
    expect(LightningConfirm.open).not.toHaveBeenCalled();
  });
});
