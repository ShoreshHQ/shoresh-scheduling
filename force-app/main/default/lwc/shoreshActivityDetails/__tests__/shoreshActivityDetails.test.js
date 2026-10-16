import { createElement } from "lwc";
import ShoreshActivityDetails from "c/shoreshActivityDetails";
import { buildTerms } from "c/shoreshTerms";
import LightningConfirm from "lightning/confirm";

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
      EventOnly__c: false,
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
  element.setup = setup;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const button = (element, label) =>
  [...element.shadowRoot.querySelectorAll("lightning-button")].find(
    (b) => b.label === label
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
    .querySelectorAll("lightning-input, lightning-combobox")
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
    expect(button(element, "Save changes").disabled).toBe(true);
  });

  it("nobody chosen means every group", async () => {
    const element = await render();
    change(q(element, '[data-id="activity-picker"]'), "a2");
    await flush();
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual([]);
    expect(q(element, '[data-id="who-note"]').textContent).toContain(
      "every Bunk can do it"
    );
    expect(q(element, '[data-field="EarlyWeekByDay__c"]').value).toBe(
      "Tuesday"
    );
  });

  it("saves the rules and the new list together", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    change(q(element, '[data-id="who-can-do-it"]'), ["d1"]);
    change(q(element, '[data-field="SameDivisionOnly__c"]'), true);
    change(q(element, '[data-field="EarlyWeekCount__c"]'), "2");
    change(q(element, '[data-field="EarlyWeekByDay__c"]'), "Wednesday");
    await flush();
    allValid(element);
    button(element, "Save changes").click();
    const { rules, whoCanDoIt, onFailure } = handler.mock.calls[0][0].detail;
    expect(whoCanDoIt).toEqual(["d1"]);
    expect(rules).toEqual({
      sobjectType: "Activity__c",
      Id: "a1",
      SameDivisionOnly__c: true,
      EarlyWeekCount__c: 2,
      EarlyWeekByDay__c: "Wednesday",
      EventOnly__c: false,
      Notes__c: null
    });
    expect(typeof onFailure).toBe("function");
  });

  it("clearing the early-week day sends nothing, not an empty word", async () => {
    const element = await render();
    change(q(element, '[data-id="activity-picker"]'), "a2");
    await flush();
    change(q(element, '[data-field="EarlyWeekCount__c"]'), "");
    change(q(element, '[data-field="EarlyWeekByDay__c"]'), "");
    await flush();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    button(element, "Save changes").click();
    const { rules } = handler.mock.calls[0][0].detail;
    expect(rules.EarlyWeekCount__c).toBeNull();
    expect(rules.EarlyWeekByDay__c).toBeNull();
  });

  it("keeps unsaved choices when something else on the screen is saved", async () => {
    const element = await render();
    change(q(element, '[data-id="who-can-do-it"]'), ["g1", "g2"]);
    await flush();
    element.setup = { ...SETUP };
    await flush();
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual(["g1", "g2"]);
    expect(button(element, "Save changes").disabled).toBe(false);
  });

  it("cancel puts back what was saved", async () => {
    const element = await render();
    change(q(element, '[data-id="who-can-do-it"]'), []);
    await flush();
    button(element, "Cancel changes").click();
    await flush();
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual(["g2"]);
  });

  it("asks for activities first when there are none", async () => {
    const element = await render({ ...SETUP, activities: [] });
    expect(element.shadowRoot.textContent).toContain(
      "Add activities in the table above"
    );
  });

  it("switching activities with unsaved choices asks first, and staying keeps them", async () => {
    const element = await render();
    change(q(element, '[data-id="who-can-do-it"]'), ["g1", "g2"]);
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
    expect(button(element, "Save changes").disabled).toBe(true);
  });

  it("switching with nothing typed does not ask", async () => {
    const element = await render();
    change(q(element, '[data-id="activity-picker"]'), "a2");
    await flush();
    expect(LightningConfirm.open).not.toHaveBeenCalled();
  });
});
