// One offering's linked choices beside the Electives list (slice E4 read only; slice E8 the
// editor: repo ADR 0018 choices 38 to 44). Names are made up.
import { createElement } from "lwc";
import ShoreshElectiveDetails, {
  divisionsCovered,
  divisionsOf,
  electivesOf,
  seatsNeedingLook,
  seatsLookWords,
  linkedNames,
  offeringNames,
  openCount,
  withPending
} from "c/shoreshElectiveDetails";
import linkedChoicePlaces from "@salesforce/apex/LinkedChoicesController.linkedChoicePlaces";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

jest.mock(
  "@salesforce/apex/LinkedChoicesController.linkedChoicePlaces",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// A few turns, so a save's answer and the next render have both happened.
const flush = () =>
  [...Array(4)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );
const terms = buildTerms([
  {
    term: "LinkedChoice",
    singular: "Linked choice",
    plural: "Linked choices",
    isCustom: false
  },
  {
    term: "Division",
    singular: "Division",
    plural: "Divisions",
    isCustom: false
  }
]);

// 12:30, 1:20 and 2:10 in the afternoon, as Salesforce sends times (milliseconds after midnight).
const at = (hours, minutes) => (hours * 60 + minutes) * 60000;

const SETUP = {
  programs: [
    {
      program: { Id: "p1", Name: "Main" },
      timeBlocks: [
        { Id: "t1", Name: "Period 3", StartTime__c: at(12, 30) },
        { Id: "t2", Name: "Period 4", StartTime__c: at(13, 20) },
        { Id: "t3", Name: "Period 5", StartTime__c: at(14, 10) }
      ],
      divisions: [
        { division: { Id: "d1", Name: "Inters" }, groups: [] },
        { division: { Id: "d2", Name: "Seniors" }, groups: [] },
        { division: { Id: "d3", Name: "Juniors" }, groups: [] }
      ]
    }
  ],
  activities: [
    { Id: "a1", Name: "Pottery" },
    { Id: "a2", Name: "Archery" }
  ],
  electives: {
    sets: [{ Id: "es1", Name: "Chugim" }],
    offerings: [
      {
        Id: "o1",
        ElectiveSet__c: "es1",
        Activity__c: "a1",
        NoSeatLimit__c: true
      },
      { Id: "o2", ElectiveSet__c: "es1", Activity__c: "a2", Seats__c: 12 }
    ],
    linkedChoices: [
      {
        Id: "lc1",
        Name: "Pottery double",
        ElectiveSet__c: "es1",
        Offering__c: "o1",
        AppliesTo__c: "All",
        Times__r: [
          { Id: "x2", Weekday__c: "Tuesday", TimeBlock__c: "t2" },
          { Id: "x1", Weekday__c: "Tuesday", TimeBlock__c: "t1" }
        ]
      },
      {
        Id: "lc2",
        Name: "Pottery Thursday",
        ElectiveSet__c: "es1",
        Offering__c: "o1",
        AppliesTo__c: "OnlyThese",
        Times__r: [{ Id: "x3", Weekday__c: "Thursday", TimeBlock__c: "t3" }],
        Coverages__r: [{ Id: "c1", Division__c: "d2" }]
      }
    ]
  }
};

// Where Chugim sits: Tuesday 12:30 and 1:20 for Inters and Seniors, Thursday 12:30 and 2:10.
const PLACES = {
  complete: true,
  cells: [
    { weekday: "Thursday", blockId: "t1", divisionIds: ["d1", "d2"] },
    { weekday: "Thursday", blockId: "t3", divisionIds: ["d2"] },
    { weekday: "Tuesday", blockId: "t1", divisionIds: ["d1", "d2"] },
    { weekday: "Tuesday", blockId: "t2", divisionIds: ["d1", "d2"] }
  ]
};

function withChoices(linkedChoices) {
  return {
    ...SETUP,
    electives: { ...SETUP.electives, linkedChoices }
  };
}

function render(setup = SETUP) {
  const element = createElement("c-shoresh-elective-details", {
    is: ShoreshElectiveDetails
  });
  element.setup = nsRecord(setup);
  element.terms = terms;
  document.body.appendChild(element);
  return element;
}

async function opened(offeringId = "o1", setup = SETUP) {
  const element = render(setup);
  await flush();
  element.open(offeringId);
  await flush();
  return element;
}

/** Listens for saves; each answers as the page would, saved or refused, when told. */
function saves(element) {
  const sent = [];
  element.addEventListener("save", (event) => sent.push(event.detail));
  return sent;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const all = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const choiceAt = (element, i) => all(element, '[data-id="linked-choice"]')[i];
const cell = (root, id) => root.querySelector(`[data-cell="${id}"]`);

describe("c-shoresh-elective-details", () => {
  beforeEach(() => {
    linkedChoicePlaces.mockResolvedValue(PLACES);
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("is closed until an offering is opened; an unknown one stays closed", async () => {
    const element = render();
    await flush();
    expect(q(element, '[data-id="details"]')).toBeNull();
    expect(element.open("nope")).toBe(false);
    await flush();
    expect(q(element, '[data-id="details"]')).toBeNull();
  });

  it("shows each linked choice: its name on the sheet, its periods on the week where the set sits, who it applies to", async () => {
    const element = render();
    await flush();
    const focus = jest.spyOn(HTMLElement.prototype, "focus");
    expect(element.open("o1")).toBe(true);
    await flush();
    expect(q(element, "[data-heading]").textContent).toBe("Pottery details");
    expect(focus.mock.instances).toContain(q(element, "[data-heading]"));
    focus.mockRestore();
    expect(element.openOfferingId).toBe("o1");
    expect(linkedChoicePlaces).toHaveBeenCalledWith({ electiveSetId: "es1" });

    expect(
      all(element, '[data-id="choice-name"]').map((n) => [n.label, n.value])
    ).toEqual([
      ["Name on the sheet", "Pottery double"],
      ["Name on the sheet", "Pottery Thursday"]
    ]);
    const first = choiceAt(element, 0);
    expect(
      [...first.querySelectorAll("th.day")].map((d) => d.textContent.trim())
    ).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    // Rows: every block where the set sits, by the clock.
    expect(
      [...first.querySelectorAll("th.clock")].map((d) => d.textContent.trim())
    ).toEqual(["12:30", "1:20", "2:10"]);
    // A cell for every place the set sits; the linked ones pressed.
    const periods = [...first.querySelectorAll('[data-id="period"]')];
    expect(
      periods.map((p) => [
        p.getAttribute("aria-label"),
        p.getAttribute("aria-pressed")
      ])
    ).toEqual([
      ["Tuesday 12:30 (Period 3)", "true"],
      ["Thursday 12:30 (Period 3)", "false"],
      ["Tuesday 1:20 (Period 4)", "true"],
      ["Thursday 2:10 (Period 5)", "false"]
    ]);
    const applies = all(element, '[data-id="applies-to"]');
    expect(applies.map((a) => a.value)).toEqual(["All", "OnlyThese"]);
    expect(applies[0].options.map((o) => o.label)).toEqual([
      "All",
      "Only these",
      "All except"
    ]);
    // Only these: the divisions where the set sits, the named one ticked.
    const divisions = all(element, '[data-id="divisions"]');
    expect(divisions).toHaveLength(1);
    expect(divisions[0].label).toBe("Only these divisions");
    expect(divisions[0].options.map((o) => o.label)).toEqual([
      "Inters",
      "Seniors"
    ]);
    expect(divisions[0].value).toEqual(["d2"]);
    const add = q(element, '[data-id="add-linked-choice"]');
    expect(add.disabled).toBe(false);
    expect(add.textContent).toContain("Linked choice");
    expect(add.textContent).not.toContain("Coming");
    await expect(element).toBeAccessible();
  });

  it("ticking a period saves it at once, and shows it before the save comes back", async () => {
    const element = await opened();
    const sent = saves(element);
    const first = choiceAt(element, 0);
    cell(first, "lc1|Thursday|t1").click();
    await flush();
    expect(sent.map((s) => s.edit)).toEqual([
      {
        id: "lc1",
        periodsOn: [{ weekday: "Thursday", blockId: "t1" }],
        periodsOff: []
      }
    ]);
    expect(
      cell(choiceAt(element, 0), "lc1|Thursday|t1").getAttribute("aria-pressed")
    ).toBe("true");
    // Unticking one already linked.
    cell(choiceAt(element, 0), "lc1|Tuesday|t2").click();
    await flush();
    expect(sent[1].edit).toEqual({
      id: "lc1",
      periodsOn: [],
      periodsOff: [{ weekday: "Tuesday", blockId: "t2" }]
    });
    expect(
      cell(choiceAt(element, 0), "lc1|Tuesday|t2").getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("a period unticked where the set isn't keeps its button, so it can be ticked again", async () => {
    // A brand-new set no schedule holds yet: every period shown is one the choice has.
    linkedChoicePlaces.mockResolvedValue({ complete: true, cells: [] });
    const element = await opened();
    const sent = saves(element);
    const id = "lc1|Tuesday|t1";
    cell(choiceAt(element, 0), id).focus();
    cell(choiceAt(element, 0), id).click();
    await flush();
    expect(sent[0].edit).toEqual({
      id: "lc1",
      periodsOn: [],
      periodsOff: [{ weekday: "Tuesday", blockId: "t1" }]
    });
    const unticked = cell(choiceAt(element, 0), id);
    expect(unticked).not.toBeNull();
    expect(unticked.getAttribute("aria-pressed")).toBe("false");
    expect(element.shadowRoot.activeElement).toBe(unticked);
    // Still there once the save is in and the season read again without it.
    sent[0].onSaved("lc1");
    const linked = SETUP.electives.linkedChoices;
    element.setup = nsRecord(
      withChoices([
        { ...linked[0], Times__r: [linked[0].Times__r[0]] },
        linked[1]
      ])
    );
    await flush();
    cell(choiceAt(element, 0), id).click();
    await flush();
    expect(sent[1].edit).toEqual({
      id: "lc1",
      periodsOn: [{ weekday: "Tuesday", blockId: "t1" }],
      periodsOff: []
    });
    // That one refused; closed and opened again, only the periods it has are shown.
    sent[1].onFailure("Linked choice not saved.");
    q(element, '[data-id="close"]').click();
    await flush();
    element.setup = nsRecord(
      withChoices([
        { ...linked[0], Times__r: [linked[0].Times__r[0]] },
        linked[1]
      ])
    );
    element.open("o1");
    await flush();
    expect(cell(choiceAt(element, 0), id)).toBeNull();
  });

  it("a refused save takes its change back and says why", async () => {
    const element = await opened();
    const sent = saves(element);
    cell(choiceAt(element, 0), "lc1|Thursday|t1").click();
    await flush();
    sent[0].onFailure(
      "Linked choice not saved. That period could not be sent."
    );
    await flush();
    expect(
      cell(choiceAt(element, 0), "lc1|Thursday|t1").getAttribute("aria-pressed")
    ).toBe("false");
    const problem = q(element, '[data-id="problem"]');
    expect(problem.getAttribute("role")).toBe("alert");
    expect(problem.textContent).toBe(
      "Linked choice not saved. That period could not be sent."
    );
  });

  it("a saved change stays shown until the season is read again", async () => {
    const element = await opened();
    const sent = saves(element);
    cell(choiceAt(element, 0), "lc1|Thursday|t1").click();
    await flush();
    sent[0].onSaved("lc1");
    await flush();
    expect(
      cell(choiceAt(element, 0), "lc1|Thursday|t1").getAttribute("aria-pressed")
    ).toBe("true");
    // The season read again, with the period saved.
    const linked = SETUP.electives.linkedChoices;
    element.setup = nsRecord(
      withChoices([
        {
          ...linked[0],
          Times__r: [
            ...linked[0].Times__r,
            { Id: "x9", Weekday__c: "Thursday", TimeBlock__c: "t1" }
          ]
        },
        linked[1]
      ])
    );
    await flush();
    expect(
      cell(choiceAt(element, 0), "lc1|Thursday|t1").getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("the name is saved when the field is left or Enter pressed; a blank name is refused", async () => {
    const element = await opened();
    const sent = saves(element);
    const name = all(element, '[data-id="choice-name"]')[0];
    name.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Pottery wheel double " } })
    );
    await flush();
    expect(sent).toEqual([]);
    name.dispatchEvent(new CustomEvent("focusout"));
    await flush();
    expect(sent.map((s) => s.edit)).toEqual([
      { id: "lc1", name: "Pottery wheel double" }
    ]);
    // Leaving again without typing sends nothing more.
    name.dispatchEvent(new CustomEvent("focusout"));
    const other = all(element, '[data-id="choice-name"]')[1];
    other.dispatchEvent(new CustomEvent("change", { detail: { value: "  " } }));
    other.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flush();
    expect(sent).toHaveLength(1);
    expect(q(element, '[data-id="problem"]').textContent).toBe(
      "Give the linked choice a name: it is what a sheet says to choose it."
    );
  });

  it("Applies to and its divisions are saved as they are chosen", async () => {
    const element = await opened();
    const sent = saves(element);
    const applies = all(element, '[data-id="applies-to"]');
    applies[0].dispatchEvent(
      new CustomEvent("change", { detail: { value: "AllExcept" } })
    );
    await flush();
    expect(sent[0].edit).toEqual({ id: "lc1", appliesTo: "AllExcept" });
    // All except shows its divisions to pick.
    const divisions = all(element, '[data-id="divisions"]');
    expect(divisions.map((d) => d.label)).toEqual([
      "All divisions except",
      "Only these divisions"
    ]);
    divisions[1].dispatchEvent(
      new CustomEvent("change", { detail: { value: ["d1"] } })
    );
    await flush();
    expect(sent[1].edit).toEqual({
      id: "lc2",
      divisionsOn: ["d1"],
      divisionsOff: ["d2"]
    });
  });

  it("a new linked choice is made by picking its first period, named as the desktop proposes", async () => {
    const element = await opened("o2");
    expect(all(element, '[data-id="linked-choice"]')).toEqual([]);
    const sent = saves(element);
    const focus = jest.spyOn(HTMLElement.prototype, "focus");
    q(element, '[data-id="add-linked-choice"]').click();
    await flush();
    // The one being made: its outline dashed, the cursor in its name, the name proposed.
    const draft = choiceAt(element, 0);
    expect(draft.className).toContain("choice_draft");
    const name = draft.querySelector('[data-id="choice-name"]');
    expect(focus.mock.instances).toContain(name);
    focus.mockRestore();
    expect(name.placeholder).toBe("Archery");
    expect(q(element, '[data-id="add-linked-choice"]').disabled).toBe(true);
    // Only these, chosen before any period, goes with the first one.
    draft
      .querySelector('[data-id="applies-to"]')
      .dispatchEvent(
        new CustomEvent("change", { detail: { value: "OnlyThese" } })
      );
    await flush();
    choiceAt(element, 0)
      .querySelector('[data-id="divisions"]')
      .dispatchEvent(new CustomEvent("change", { detail: { value: ["d2"] } }));
    await flush();
    expect(sent).toEqual([]);
    cell(choiceAt(element, 0), "draft|Tuesday|t1").click();
    await flush();
    expect(sent.map((s) => s.edit)).toEqual([
      {
        offeringId: "o2",
        name: "Archery",
        appliesTo: "OnlyThese",
        periodsOn: [{ weekday: "Tuesday", blockId: "t1" }],
        divisionsOn: ["d2"]
      }
    ]);
    // While it is made, it waits.
    expect(cell(choiceAt(element, 0), "draft|Tuesday|t2").disabled).toBe(true);
    sent[0].onSaved("lc9");
    element.setup = nsRecord(
      withChoices([
        ...SETUP.electives.linkedChoices,
        {
          Id: "lc9",
          Name: "Archery",
          ElectiveSet__c: "es1",
          Offering__c: "o2",
          AppliesTo__c: "OnlyThese",
          Times__r: [{ Id: "x9", Weekday__c: "Tuesday", TimeBlock__c: "t1" }],
          Coverages__r: [{ Id: "c9", Division__c: "d2" }]
        }
      ])
    );
    const again = jest.spyOn(HTMLElement.prototype, "focus");
    await flush();
    // Made: one linked choice, the cursor still on the period picked.
    const made = all(element, '[data-id="linked-choice"]');
    expect(made).toHaveLength(1);
    expect(made[0].className).not.toContain("choice_draft");
    expect(again.mock.instances).toContain(cell(made[0], "lc9|Tuesday|t1"));
    again.mockRestore();
    expect(q(element, '[data-id="add-linked-choice"]').disabled).toBe(false);
  });

  it("a second linked choice of one activity is named by its first period, never the activity's name again", async () => {
    const element = await opened();
    const sent = saves(element);
    q(element, '[data-id="add-linked-choice"]').click();
    await flush();
    cell(choiceAt(element, 2), "draft|Thursday|t1").click();
    await flush();
    expect(sent[0].edit).toEqual({
      offeringId: "o1",
      name: "Pottery · Thu 12:30",
      appliesTo: "All",
      periodsOn: [{ weekday: "Thursday", blockId: "t1" }],
      divisionsOn: []
    });
    // A refused one can be tried again.
    sent[0].onFailure("Linked choice not saved.");
    await flush();
    expect(cell(choiceAt(element, 2), "draft|Thursday|t1").disabled).toBe(
      false
    );
  });

  it("Cancel drops the one being made; Delete asks the page, naming the linked choice", async () => {
    const element = await opened();
    q(element, '[data-id="add-linked-choice"]').click();
    await flush();
    const cancel = choiceAt(element, 2).querySelector(
      '[data-id="delete-linked-choice"]'
    );
    expect(cancel.textContent.trim()).toBe("Cancel");
    cancel.click();
    await flush();
    expect(all(element, '[data-id="linked-choice"]')).toHaveLength(2);

    const deletes = jest.fn();
    element.addEventListener("delete", deletes);
    const remove = choiceAt(element, 0).querySelector(
      '[data-id="delete-linked-choice"]'
    );
    expect(remove.getAttribute("aria-label")).toBe('Delete "Pottery double"');
    remove.click();
    const detail = deletes.mock.calls[0][0].detail;
    expect(detail.recordId).toBe("lc1");
    expect(detail.name).toBe("Pottery double");
    const focus = jest.spyOn(HTMLElement.prototype, "focus");
    // As the page does it: the season read again (and drawn), then onDeleted.
    element.setup = nsRecord(withChoices([SETUP.electives.linkedChoices[1]]));
    await flush();
    detail.onDeleted();
    await flush();
    expect(focus.mock.instances).toContain(
      q(element, '[data-id="add-linked-choice"]')
    );
    focus.mockRestore();
  });

  it("marks what keeps a linked choice from being placed as a set, where it is", async () => {
    const linked = SETUP.electives.linkedChoices;
    const element = await opened(
      "o1",
      withChoices([
        // Two linked choices of Pottery holding Tuesday 12:30 for the same divisions.
        linked[0],
        {
          Id: "lc3",
          Name: "Pottery double",
          ElectiveSet__c: "es1",
          Offering__c: "o1",
          AppliesTo__c: "OnlyThese",
          Times__r: [
            { Id: "y1", Weekday__c: "Tuesday", TimeBlock__c: "t1" },
            { Id: "y2", Weekday__c: "Wednesday", TimeBlock__c: "t1" }
          ],
          Coverages__r: [{ Id: "c3", Division__c: "d1" }]
        }
      ])
    );
    const first = choiceAt(element, 0);
    const looks = [...first.querySelectorAll('[data-id="period-look"]')];
    expect(looks.map((l) => l.label)).toEqual([
      'Also in "Pottery double", so neither is placed as a set; their periods are filled one at a time'
    ]);
    // Two of one name: a sheet can't tell them apart.
    expect(first.querySelector('[data-id="name-look"]').label).toBe(
      "Another linked choice in Chugim is called this, so a sheet can't tell them apart."
    );
    // A period where the set doesn't sit any more (Wednesday) is still shown, marked.
    const other = choiceAt(element, 1);
    expect(cell(other, "lc3|Wednesday|t1").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(
      [...other.querySelectorAll('[data-id="period-look"]')].map((l) => l.label)
    ).toEqual([
      'Also in "Pottery double", so neither is placed as a set; their periods are filled one at a time',
      "Chugim isn't here on any schedule now"
    ]);
    await expect(element).toBeAccessible();
  });

  it("two offerings' linked choices sharing a period are not marked: each has its own seats (slice E9)", async () => {
    const element = await opened(
      "o1",
      withChoices([
        SETUP.electives.linkedChoices[0],
        {
          Id: "lc3",
          Name: "Archery",
          ElectiveSet__c: "es1",
          Offering__c: "o2",
          AppliesTo__c: "All",
          Times__r: [
            { Id: "y1", Weekday__c: "Tuesday", TimeBlock__c: "t1" },
            { Id: "y2", Weekday__c: "Tuesday", TimeBlock__c: "t2" }
          ]
        }
      ])
    );
    expect(
      choiceAt(element, 0).querySelectorAll('[data-id="period-look"]')
    ).toHaveLength(0);
  });

  it("periods read from last year's file carry the guessed mark, and Looks right asks the page", async () => {
    const element = await opened("o1", {
      ...withChoices([SETUP.electives.linkedChoices[0]]),
      guesses: [{ recordId: "lc1", field: "periods" }]
    });
    const mark = choiceAt(element, 0).querySelector(
      '[data-id="periods-guess"]'
    );
    expect(mark.name).toBe(
      "Periods for Pottery double: guessed from your file"
    );
    expect(mark.label).toBe("Guessed from your file");
    const confirms = jest.fn();
    element.addEventListener("confirmguess", confirms);
    mark.dispatchEvent(new CustomEvent("confirm"));
    const detail = confirms.mock.calls[0][0].detail;
    expect(detail).toMatchObject({ recordId: "lc1", field: "periods" });
    // Done: said, and the cursor on the linked choice's first period.
    const focus = jest.spyOn(HTMLElement.prototype, "focus");
    detail.onDone();
    await flush();
    expect(q(element, '[data-id="status"]').textContent).toBe(
      "Pottery double: looks right"
    );
    expect(focus.mock.instances[0].dataset.choice).toBe("lc1");
    focus.mockRestore();
    await expect(element).toBeAccessible();
  });

  it("two linked choices sharing a period for different divisions are not marked", async () => {
    const element = await opened(
      "o1",
      withChoices([
        {
          ...SETUP.electives.linkedChoices[0],
          AppliesTo__c: "OnlyThese",
          Coverages__r: [{ Id: "c1", Division__c: "d1" }]
        },
        {
          Id: "lc3",
          Name: "Archery double",
          ElectiveSet__c: "es1",
          Offering__c: "o2",
          AppliesTo__c: "AllExcept",
          Times__r: [
            { Id: "y1", Weekday__c: "Tuesday", TimeBlock__c: "t1" },
            { Id: "y2", Weekday__c: "Tuesday", TimeBlock__c: "t2" }
          ],
          Coverages__r: [{ Id: "c3", Division__c: "d1" }]
        }
      ])
    );
    expect(all(element, '[data-id="period-look"]')).toEqual([]);
  });

  it("a set placed nowhere yet says so, and nothing can be added", async () => {
    linkedChoicePlaces.mockResolvedValue({ complete: true, cells: [] });
    const element = await opened("o2");
    expect(q(element, '[data-id="note"]').textContent).toBe(
      "Place Chugim on a schedule first"
    );
    expect(q(element, '[data-id="add-linked-choice"]').disabled).toBe(true);
  });

  it("says when not every schedule could be read", async () => {
    linkedChoicePlaces.mockResolvedValue({ ...PLACES, complete: false });
    const element = await opened("o2");
    expect(q(element, '[data-id="note"]').textContent).toBe(
      "Not every schedule could be read, so some places Chugim sits may be missing."
    );
    linkedChoicePlaces.mockRejectedValue({ body: { message: "No access." } });
    element.open("o1");
    await flush();
    expect(q(element, '[data-id="note"]').textContent).toContain(
      "Where Chugim sits could not be read."
    );
  });

  it("Close says which offering it was; a deleted offering's details close", async () => {
    const element = render();
    await flush();
    element.open("o1");
    await flush();
    const handler = jest.fn();
    element.addEventListener("close", handler);
    q(element, '[data-id="close"]').click();
    await flush();
    expect(handler.mock.calls[0][0].detail).toEqual({ offeringId: "o1" });
    expect(q(element, '[data-id="details"]')).toBeNull();

    element.open("o2");
    await flush();
    element.setup = nsRecord({
      ...SETUP,
      electives: {
        ...SETUP.electives,
        offerings: [SETUP.electives.offerings[0]]
      }
    });
    await flush();
    expect(q(element, '[data-id="details"]')).toBeNull();
  });

  describe("what the screen counts (decision 53)", () => {
    const offerings = nsRecord([
      { Id: "o1", Seats__c: 12 },
      { Id: "o2", NoSeatLimit__c: true },
      { Id: "o3", Seats__c: 0 },
      { Id: "o4", Seats__c: 0, NoSeatLimit__c: true },
      { Id: "o5", Seats__c: 10, Proposed__c: true },
      { Id: "o6" }
    ]);

    it("a set's count is its confirmed offerings: 0 or blank seats don't close one", () => {
      expect(openCount(offerings)).toBe(5);
      expect(openCount([])).toBe(0);
    });

    it("ELECT-6.3: a set's Excel cell names its confirmed offerings, in order", () => {
      const names = offeringNames({
        activities: [
          { Id: "a1", Name: "Archery" },
          { Id: "a2", Name: "Drama" },
          { Id: "a3", Name: "Pottery" }
        ],
        electives: {
          offerings: nsRecord([
            { Id: "o1", ElectiveSet__c: "es1", Activity__c: "a1" },
            {
              Id: "o2",
              ElectiveSet__c: "es1",
              Activity__c: "a3",
              Proposed__c: true
            },
            { Id: "o3", ElectiveSet__c: "es1", Activity__c: "a2" },
            { Id: "o4", ElectiveSet__c: "es2", Activity__c: "a3" }
          ])
        }
      });
      expect([...names]).toEqual([
        ["es1", ["Archery", "Drama"]],
        ["es2", ["Pottery"]]
      ]);
      expect(offeringNames(null).size).toBe(0);
    });

    it("seats need a look when blank or 0 and limited", () => {
      expect(offerings.map((o) => [o.Id, seatsNeedingLook(o)])).toEqual([
        ["o1", null],
        ["o2", null],
        ["o3", "zero"],
        ["o4", null],
        ["o5", null],
        ["o6", "blank"]
      ]);
      expect(seatsLookWords("Archery")).toBe(
        'Choose how many seats "Archery" has'
      );
      expect(seatsLookWords("Archery", "spots")).toBe(
        'Choose how many spots "Archery" has'
      );
    });

    it("reads a season with no electives as empty, and names an offering's linked choices", () => {
      expect(electivesOf(null)).toEqual({
        sets: [],
        offerings: [],
        linkedChoices: []
      });
      expect(linkedNames(nsRecord(SETUP), "o1")).toEqual([
        "Pottery double",
        "Pottery Thursday"
      ]);
      expect(linkedNames(nsRecord(SETUP), "o2")).toEqual([]);
    });
  });

  describe("the editor's working", () => {
    it("who a linked choice is for, of the divisions there (desktop resolveScope)", () => {
      const there = ["d1", "d2", "d3"];
      expect(divisionsCovered("All", ["d1"], there)).toEqual(there);
      expect(divisionsCovered("OnlyThese", ["d1", "d9"], there)).toEqual([
        "d1"
      ]);
      expect(divisionsCovered("AllExcept", ["d1"], there)).toEqual([
        "d2",
        "d3"
      ]);
    });

    it("gestures on their way are laid over what was saved, in order", () => {
      const shown = withPending(
        {
          id: "lc1",
          name: "Pottery double",
          appliesTo: "All",
          periods: ["Tuesday|t1"],
          divisionIds: []
        },
        [
          { periodsOn: [{ weekday: "Tuesday", blockId: "t2" }] },
          { periodsOff: [{ weekday: "Tuesday", blockId: "t1" }] },
          {
            name: "Pottery wheel",
            appliesTo: "OnlyThese",
            divisionsOn: ["d1"]
          },
          { divisionsOff: ["d1"], divisionsOn: ["d2"] }
        ]
      );
      expect(shown.name).toBe("Pottery wheel");
      expect(shown.appliesTo).toBe("OnlyThese");
      expect([...shown.periods]).toEqual(["Tuesday|t2"]);
      expect([...shown.divisionIds]).toEqual(["d2"]);
    });
  });
});

// DIV-1.1
describe("a group in no division", () => {
  it("its holding record is never one of the season's divisions", () => {
    const setup = nsRecord({
      programs: [
        {
          program: { Id: "p1", Name: "Main" },
          divisions: [
            { division: { Id: "d1", Name: "Inters" }, groups: [] },
            {
              division: { Id: "d9", Name: "Tent 1", NoDivision__c: true },
              groups: [{ Id: "g9", Name: "Tent 1" }]
            }
          ]
        }
      ]
    });
    expect(divisionsOf(setup)).toEqual([{ id: "d1", name: "Inters" }]);
  });
});
