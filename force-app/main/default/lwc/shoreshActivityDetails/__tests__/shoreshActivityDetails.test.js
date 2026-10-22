import { createElement } from "lwc";
import ShoreshActivityDetails from "c/shoreshActivityDetails";
import { buildTerms } from "c/shoreshTerms";
import LightningConfirm from "lightning/confirm";
import { bareRecord, nsName, nsRecord } from "shoresh-jest/namespace";

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

/** The details, opened (as from the activity's row) on its first activity unless told not to. */
async function render(
  setup = SETUP,
  openId = setup.activities.length ? setup.activities[0].Id : null
) {
  const element = createElement("c-shoresh-activity-details", {
    is: ShoreshActivityDetails
  });
  element.terms = terms;
  element.setup = nsRecord(setup);
  document.body.appendChild(element);
  if (openId) {
    await element.open(openId);
  }
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

  it("shows nothing until an activity is opened from its row; no picker of its own", async () => {
    const element = await render(SETUP, null);
    expect(q(element, '[data-id="details"]')).toBeNull();
    expect(element.openActivityId).toBeNull();
    expect(await element.open("a2")).toBe(true);
    await flush();
    expect(q(element, '[data-id="details"]')).not.toBeNull();
    expect(q(element, '[data-id="activity-picker"]')).toBeNull();
    expect(q(element, "h2").textContent.trim()).toBe("Swim test details");
    expect(element.openActivityId).toBe("a2");
    // The cursor lands on the heading.
    expect(element.shadowRoot.activeElement).toBe(q(element, "[data-heading]"));
  });

  it("shows the activity's choices as ticks, in the camp words (desktop's checkboxes)", async () => {
    const element = await render();
    const who = q(element, '[data-id="who-can-do-it"]');
    // One labelled group of ticks (a fieldset, keyboard-reachable), not a two-list picker.
    expect(who.tagName).toBe("LIGHTNING-CHECKBOX-GROUP");
    expect(q(element, "lightning-dual-listbox")).toBeNull();
    expect(who.value).toEqual(["g2"]);
    expect(who.options.map((o) => o.label)).toEqual([
      "Unit: Juniors",
      "Bunk 1 (Juniors)",
      "Bunk 2 (Juniors)"
    ]);
    // No sentence explaining the ticks: the label says it.
    expect(q(element, '[data-id="who-note"]')).toBeNull();
    expect(who.label).toBe("Who can do it");
    expect(element.shadowRoot.textContent).not.toContain("rules most");
    // One button: the panel's close (an ×, named for what it closes).
    expect(element.shadowRoot.querySelectorAll("lightning-button").length).toBe(
      0
    );
    expect(
      [...element.shadowRoot.querySelectorAll("button")].map((b) => [
        b.dataset.id,
        b.getAttribute("aria-label")
      ])
    ).toEqual([["close", "Close Archery details"]]);
    // A bare tool of the design system (text colour at rest, the highlight on hover and focus),
    // not Salesforce's blue icon button.
    expect(q(element, '[data-id="close"]').className).toContain(
      "shoresh-item_tool"
    );
  });

  it("nobody chosen means every group", async () => {
    const element = await render();
    await element.open("a2");
    await flush();
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual([]);
    expect(q(element, '[data-id="who-can-do-it"]').label).toBe(
      "Who can do it: everyone"
    );
    expect(q(element, '[data-field="earlyDay"]').value).toBe("Tuesday");
  });

  it("Close hides the details and says which activity they were for", async () => {
    const element = await render();
    const closed = jest.fn();
    element.addEventListener("close", closed);
    q(element, '[data-id="close"]').click();
    await flush();
    expect(q(element, '[data-id="details"]')).toBeNull();
    expect(closed.mock.calls[0][0].detail).toEqual({ activityId: "a1" });
  });

  it("an activity deleted meanwhile closes its details", async () => {
    const element = await render();
    element.setup = nsRecord({ ...SETUP, activities: [SETUP.activities[1]] });
    await flush();
    expect(q(element, '[data-id="details"]')).toBeNull();
    expect(element.openActivityId).toBeNull();
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
    expect(q(element, '[data-field="sameDivision"]').value).toBe("same");
    expect(q(element, '[data-field="earlyCount"]').value).toBe(2);
    expect(q(element, '[data-field="earlyDay"]').value).toBe("Wednesday");
    expect(q(element, '[data-field="notes"]').value).toBe("Life jackets");
  });

  it("a tick or a dropdown saves at once; only that rule is sent, with who can do it", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    change(q(element, '[data-field="sameDivision"]'), "same");
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

  it("a tick in who can do it saves at once, the whole list", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    change(q(element, '[data-id="who-can-do-it"]'), ["d1"]);
    await flush();
    const saves = sent(handler);
    expect(saves.map((save) => save.rules)).toEqual([
      { sobjectType: "Activity__c", Id: "a1" }
    ]);
    expect(saves[0].whoCanDoIt).toEqual(["d1"]);
  });

  it("a number and the notes save when the director leaves them", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    allValid(element);
    change(q(element, '[data-field="earlyCount"]'), "2");
    change(q(element, '[data-field="notes"]'), "Helmets");
    await flush();
    expect(handler).not.toHaveBeenCalled();
    leave(q(element, '[data-field="earlyCount"]'));
    leave(q(element, '[data-field="notes"]'));
    await flush();
    const saves = sent(handler);
    expect(saves.map((save) => save.rules)).toEqual([
      {
        sobjectType: "Activity__c",
        Id: "a1",
        EarlyWeekCount__c: 2,
        EarlyWeekByDay__c: null
      },
      { sobjectType: "Activity__c", Id: "a1", Notes__c: "Helmets" }
    ]);
    // Leaving again with nothing changed sends nothing more.
    leave(q(element, '[data-field="notes"]'));
    await flush();
    expect(handler).toHaveBeenCalledTimes(2);
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
    await element.open("a2");
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
    await element.open("a2");
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
    // Another tick sends the list again, as it now shows.
    change(q(element, '[data-id="who-can-do-it"]'), ["g1"]);
    await flush();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(sent(handler)[1].whoCanDoIt).toEqual(["g1"]);
  });

  it("keeps choices being saved when something else on the screen is saved", async () => {
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
    change(q(element, '[data-field="sameDivision"]'), "same");
    await flush();
    element.setup = nsRecord({ ...SETUP });
    await flush();
    expect(q(element, '[data-field="sameDivision"]').value).toBe("same");
    handler.mock.calls[0][0].detail.onSaved();
    const saved = JSON.parse(JSON.stringify(SETUP));
    saved.activities[0].SameDivisionOnly__c = true;
    element.setup = nsRecord(saved);
    await flush();
    expect(q(element, '[data-field="sameDivision"]').value).toBe("same");
  });

  it("with no activities there is nothing to open", async () => {
    const element = await render({ ...SETUP, activities: [] });
    expect(await element.open("a1")).toBe(false);
    expect(q(element, '[data-id="details"]')).toBeNull();
  });

  it("groups the early-in-the-week rule's two fields under one label", async () => {
    const element = await render();
    const group = q(element, '[data-id="early"]');
    expect(group.tagName).toBe("FIELDSET");
    expect(group.querySelector("legend").textContent.trim()).toBe(
      "Early in the week"
    );
    expect(group.querySelector('[data-field="earlyCount"]').label).toBe(
      "How many"
    );
    expect(group.querySelector('[data-field="earlyDay"]').label).toBe("By");
  });

  it("switching activities with a refused change asks first, and staying keeps it", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    change(q(element, '[data-id="who-can-do-it"]'), ["g1", "g2"]);
    await flush();
    handler.mock.calls[0][0].detail.onFailure("Not saved.");
    await flush();
    LightningConfirm.open.mockResolvedValue(false);
    expect(await element.open("a2")).toBe(false);
    await flush();
    expect(LightningConfirm.open).toHaveBeenCalledTimes(1);
    expect(LightningConfirm.open.mock.calls[0][0].message).toBe(
      'Discard your unsaved changes to "Archery"?'
    );
    expect(element.openActivityId).toBe("a1");
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual(["g1", "g2"]);
    // Close asks too.
    q(element, '[data-id="close"]').click();
    await flush();
    expect(LightningConfirm.open).toHaveBeenCalledTimes(2);
    expect(element.openActivityId).toBe("a1");

    LightningConfirm.open.mockResolvedValue(true);
    expect(await element.open("a2")).toBe(true);
    await flush();
    expect(q(element, '[data-id="who-can-do-it"]').value).toEqual([]);
    expect(q(element, '[data-error="who"]')).toBeNull();
  });

  it("a save answered after the director switched activities says it is no longer shown", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    change(q(element, '[data-id="who-can-do-it"]'), ["g1", "g2"]);
    await flush();
    const detail = handler.mock.calls[0][0].detail;
    expect(detail.shown()).toBe(true);
    // Sent, so nothing is unsaved: switching does not ask.
    await element.open("a2");
    await flush();
    expect(LightningConfirm.open).not.toHaveBeenCalled();
    expect(detail.shown()).toBe(false);
    // The refusal is said at the top by the page, not next to another activity's field.
    detail.onFailure("Not saved.");
    await flush();
    expect(q(element, '[data-error="who"]')).toBeNull();
  });

  it("switching with nothing typed does not ask", async () => {
    const element = await render();
    await element.open("a2");
    await flush();
    expect(LightningConfirm.open).not.toHaveBeenCalled();
  });

  describe("the panel beside the table (step 3b, activities.html)", () => {
    const PANEL = {
      ...SETUP,
      activities: [
        {
          Id: "a1",
          Name: "Archery",
          Length__c: 2,
          GroupsAtOnce__c: 3,
          NoGroupLimit__c: false,
          NoWeeklyMax__c: true,
          Priority__c: "High",
          Outdoor__c: true,
          RainPlan__c: "a3",
          SameDivisionOnly__c: true
        },
        { Id: "a2", Name: "Lake", Outdoor__c: true },
        { Id: "a3", Name: "Arts", Outdoor__c: false },
        { Id: "a4", Name: "Drama", Outdoor__c: false }
      ]
    };

    it("holds the table's other fields: length, groups at once, priority, outdoors, rain plan, no weekly maximum", async () => {
      const element = await render(PANEL);
      const value = (key) => {
        const input = q(element, `[data-field="${key}"]`);
        return input.type === "checkbox" ? input.checked : input.value;
      };
      expect(
        [
          "rainPlan",
          "sameDivision",
          "length",
          "priority",
          "groupsAtOnce",
          "noGroupLimit",
          "outdoor",
          "noWeeklyMax"
        ].map((key) => [key, value(key)])
      ).toEqual([
        ["rainPlan", "a3"],
        ["sameDivision", "same"],
        ["length", 2],
        ["priority", "High"],
        ["groupsAtOnce", 3],
        ["noGroupLimit", false],
        ["outdoor", true],
        ["noWeeklyMax", true]
      ]);
      // Bunks together, in the camp's words.
      expect(
        q(element, '[data-field="sameDivision"]').options.map((o) => o.label)
      ).toEqual(["Any Bunks", "Same Unit"]);
      expect(q(element, '[data-field="sameDivision"]').label).toBe(
        "Bunks together"
      );
      // A rain plan: none, or an indoor activity; never itself, never an outdoor one.
      expect(
        q(element, '[data-field="rainPlan"]').options.map((o) => o.label)
      ).toEqual(["None", "Arts", "Drama"]);
      // The name heads the panel; its full name is read out.
      expect(q(element, "h2").textContent).toBe("Archery details");
      await expect(element).toBeAccessible();
    });

    it("a dropdown or tick of the activity's own saves at once, that field only, with what it held when seen", async () => {
      const element = await render(PANEL);
      const handler = jest.fn();
      element.addEventListener("save", handler);
      allValid(element);
      change(q(element, '[data-field="priority"]'), "Low");
      change(q(element, '[data-field="outdoor"]'), false);
      change(q(element, '[data-field="rainPlan"]'), "");
      change(q(element, '[data-field="noWeeklyMax"]'), false);
      await flush();
      const saves = sent(handler);
      expect(saves.map((save) => save.record)).toEqual([
        { sobjectType: "Activity__c", Id: "a1", Priority__c: "Low" },
        { sobjectType: "Activity__c", Id: "a1", Outdoor__c: false },
        { sobjectType: "Activity__c", Id: "a1", RainPlan__c: null },
        { sobjectType: "Activity__c", Id: "a1", NoWeeklyMax__c: false }
      ]);
      // Compared and set, as the table's rows (ADR 0011 choice 5): what each held when seen.
      expect(
        handler.mock.calls.map((call) => bareRecord(call[0].detail.seen()))
      ).toEqual([
        {
          sobjectType: "Activity__c",
          Id: "a1",
          Name: "Archery",
          Priority__c: "High"
        },
        {
          sobjectType: "Activity__c",
          Id: "a1",
          Name: "Archery",
          Outdoor__c: true
        },
        {
          sobjectType: "Activity__c",
          Id: "a1",
          Name: "Archery",
          RainPlan__c: "a3"
        },
        {
          sobjectType: "Activity__c",
          Id: "a1",
          Name: "Archery",
          NoWeeklyMax__c: true
        }
      ]);
      expect(saves[0].records).toBeUndefined();
      // Not a rule: who can do it is not sent with it.
      expect(saves[0].whoCanDoIt).toBeUndefined();
      expect(typeof saves[0].shown).toBe("function");
    });

    it("a number of its own saves on leaving it, or Enter; a blank length is not sent", async () => {
      const element = await render(PANEL);
      const handler = jest.fn();
      element.addEventListener("save", handler);
      allValid(element);
      const length = q(element, '[data-field="length"]');
      change(length, "3");
      await flush();
      expect(handler).not.toHaveBeenCalled();
      length.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      const groups = q(element, '[data-field="groupsAtOnce"]');
      change(groups, "");
      leave(groups);
      await flush();
      expect(sent(handler).map((save) => save.record)).toEqual([
        { sobjectType: "Activity__c", Id: "a1", Length__c: 3 },
        { sobjectType: "Activity__c", Id: "a1", GroupsAtOnce__c: null }
      ]);
      // A blank length: the field says it needs one, nothing is sent.
      change(length, "");
      length.reportValidity = () => false;
      leave(length);
      await flush();
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("a refusal of its own field shows next to that field, and the typing stays", async () => {
      const element = await render(PANEL);
      const handler = jest.fn();
      element.addEventListener("save", handler);
      allValid(element);
      change(q(element, '[data-field="priority"]'), "Low");
      await flush();
      handler.mock.calls[0][0].detail.onFailure("Not saved. No.");
      await flush();
      expect(q(element, '[data-error="priority"]').textContent.trim()).toBe(
        "Not saved. No."
      );
      element.setup = nsRecord({ ...PANEL });
      await flush();
      expect(q(element, '[data-field="priority"]').value).toBe("Low");
    });

    describe("someone else changed the field since it was shown (ADR 0011 choice 5)", () => {
      const theirLength = (length) =>
        nsRecord({
          id: null,
          changed: [nsName("Length__c")],
          theirs: { Id: "a1", Name: "Archery", Length__c: length }
        });
      const dialog = (element) => q(element, '[data-id="conflict"]');

      /** Types 3 into Length (it was 2) and saves it; returns the save the page heard. */
      async function typeLength(element, handler) {
        allValid(element);
        const length = q(element, '[data-field="length"]');
        change(length, "3");
        length.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        await flush();
        return handler.mock.calls[handler.mock.calls.length - 1][0].detail;
      }

      it("nothing is overwritten unseen: the setup tables' question, Theirs and Yours", async () => {
        const element = await render(PANEL);
        const handler = jest.fn();
        element.addEventListener("save", handler);
        const save = await typeLength(element, handler);
        expect(bareRecord(save.seen())).toEqual({
          sobjectType: "Activity__c",
          Id: "a1",
          Name: "Archery",
          Length__c: 2
        });
        save.onSaved(theirLength(4));
        await flush();
        expect(dialog(element)).not.toBeNull();
        expect(q(element, ".slds-modal__title").textContent.trim()).toBe(
          "Changed by someone else"
        );
        expect(q(element, ".conflict-where").textContent.trim()).toBe(
          "Archery · Length"
        );
        expect(q(element, '[data-id="theirs"]').textContent.trim()).toBe("4");
        expect(q(element, '[data-id="yours"]').textContent.trim()).toBe("3");
        // Not saved: no quiet "Saved", and the typing stays.
        expect(savedMark(element).textContent).toBe("");
        expect(q(element, '[data-field="length"]').value).toBe(3);
        // The cursor is on Use yours; Tab stays on the two buttons.
        expect(element.shadowRoot.activeElement.dataset.id).toBe("use-yours");
        dialog(element).dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
        );
        expect(element.shadowRoot.activeElement.dataset.id).toBe("keep-theirs");
        await expect(element).toBeAccessible();
      });

      it("Use yours sends the same change again, naming what is there now", async () => {
        const element = await render(PANEL);
        const handler = jest.fn();
        element.addEventListener("save", handler);
        const first = await typeLength(element, handler);
        first.onSaved(theirLength(4));
        await flush();
        const length = q(element, '[data-field="length"]');
        length.focus = jest.fn();
        q(element, '[data-id="use-yours"]').click();
        await flush();
        expect(dialog(element)).toBeNull();
        expect(handler).toHaveBeenCalledTimes(2);
        const again = handler.mock.calls[1][0].detail;
        expect(bareRecord(again.record)).toEqual({
          sobjectType: "Activity__c",
          Id: "a1",
          Length__c: 3
        });
        expect(bareRecord(again.seen()).Length__c).toBe(4);
        again.onSaved(nsRecord({ id: "a1", changed: [] }));
        await flush();
        expect(savedMark(element).textContent).toContain("Saved");
        // The cursor is back in the field.
        expect(length.focus).toHaveBeenCalled();
      });

      it("Keep theirs (or Escape) shows what someone else saved, and sends nothing", async () => {
        const element = await render(PANEL);
        const handler = jest.fn();
        element.addEventListener("save", handler);
        const save = await typeLength(element, handler);
        save.onSaved(theirLength(4));
        await flush();
        const length = q(element, '[data-field="length"]');
        length.focus = jest.fn();
        dialog(element).dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        await flush();
        expect(dialog(element)).toBeNull();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(length.value).toBe(4);
        expect(length.focus).toHaveBeenCalled();
        // The reload brings theirs; nothing is left unsaved, so switching does not ask.
        element.setup = nsRecord({
          ...PANEL,
          activities: [
            { ...PANEL.activities[0], Length__c: 4 },
            ...PANEL.activities.slice(1)
          ]
        });
        await flush();
        await element.open("a2");
        expect(LightningConfirm.open).not.toHaveBeenCalled();
      });

      it("a tick or a rain plan is named as the director reads it", async () => {
        const element = await render(PANEL);
        const handler = jest.fn();
        element.addEventListener("save", handler);
        change(q(element, '[data-field="rainPlan"]'), "a4");
        await flush();
        handler.mock.calls[0][0].detail.onSaved(
          nsRecord({
            changed: [nsName("RainPlan__c")],
            theirs: { Id: "a1", RainPlan__c: null }
          })
        );
        await flush();
        expect(q(element, ".conflict-where").textContent.trim()).toBe(
          "Archery · Rain plan"
        );
        expect(
          [...element.shadowRoot.querySelectorAll("dd")].map((d) =>
            d.textContent.trim()
          )
        ).toEqual(["None", "Drama"]);
        q(element, '[data-id="keep-theirs"]').click();
        change(q(element, '[data-field="outdoor"]'), false);
        await flush();
        handler.mock.calls[1][0].detail.onSaved(
          nsRecord({
            changed: [nsName("Outdoor__c")],
            theirs: { Id: "a1", Outdoor__c: true }
          })
        );
        await flush();
        expect(
          [...element.shadowRoot.querySelectorAll("dd")].map((d) =>
            d.textContent.trim()
          )
        ).toEqual(["Yes", "No"]);
      });

      it("a save waiting behind another of the same field compares with what that one saved", async () => {
        const element = await render(PANEL);
        const handler = jest.fn();
        element.addEventListener("save", handler);
        const first = await typeLength(element, handler);
        const length = q(element, '[data-field="length"]');
        change(length, "5");
        length.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        await flush();
        const second = handler.mock.calls[1][0].detail;
        first.onSaved(nsRecord({ id: "a1", changed: [] }));
        await flush();
        // Its turn comes after the first is saved: it was seen as 3, the director's own.
        expect(bareRecord(second.seen()).Length__c).toBe(3);
      });
    });
  });
});
