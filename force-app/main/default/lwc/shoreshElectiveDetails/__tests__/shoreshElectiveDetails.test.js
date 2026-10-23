import { createElement } from "lwc";
import ShoreshElectiveDetails, {
  electivesOf,
  hasBlankSeats,
  isClosed,
  linkedNames,
  openCount
} from "c/shoreshElectiveDetails";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

const flush = () => Promise.resolve();
const terms = buildTerms([]);

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
        { division: { Id: "d2", Name: "Seniors" }, groups: [] }
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
        Offering__c: "o1",
        AppliesTo__c: "OnlyThese",
        Times__r: [{ Id: "x3", Weekday__c: "Thursday", TimeBlock__c: "t3" }],
        Coverages__r: [{ Id: "c1", Division__c: "d2" }]
      }
    ]
  }
};

function render(setup = SETUP) {
  const element = createElement("c-shoresh-elective-details", {
    is: ShoreshElectiveDetails
  });
  element.setup = nsRecord(setup);
  element.terms = terms;
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const all = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

describe("c-shoresh-elective-details", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("is closed until an offering is opened; an unknown one stays closed", async () => {
    const element = render();
    await flush();
    expect(q(element, '[data-id="details"]')).toBeNull();
    expect(element.open("nope")).toBe(false);
    await flush();
    expect(q(element, '[data-id="details"]')).toBeNull();
  });

  it("shows an offering's linked choices read only: the name on the sheet, its periods, who it applies to", async () => {
    const element = render();
    await flush();
    const focus = jest.spyOn(HTMLElement.prototype, "focus");
    expect(element.open("o1")).toBe(true);
    await flush();
    expect(q(element, "[data-heading]").textContent).toBe("Pottery details");
    expect(focus.mock.instances).toContain(q(element, "[data-heading]"));
    focus.mockRestore();
    expect(element.openOfferingId).toBe("o1");

    const names = all(element, '[data-id="choice-name"]').map(
      (n) => n.textContent
    );
    expect(names).toEqual(["Pottery double", "Pottery Thursday"]);
    // The first: Tuesday's two periods, in the day's order, as a small week.
    const first = all(element, '[data-id="linked-choice"]')[0];
    expect(
      [...first.querySelectorAll("th.day")].map((d) => d.textContent.trim())
    ).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(
      [...first.querySelectorAll("th.clock")].map((d) => d.textContent.trim())
    ).toEqual(["12:30", "1:20"]);
    const linked = [...first.querySelectorAll('[data-id="period"]')]
      .filter((p) => p.className.includes("period_on"))
      .map((p) => p.getAttribute("aria-label"));
    expect(linked).toEqual([
      "Tuesday, Period 3 (12:30): linked",
      "Tuesday, Period 4 (1:20): linked"
    ]);
    expect(
      all(element, '[data-id="applies-to"]').map((a) => a.textContent)
    ).toEqual(["Applies to: All", "Applies to: Only these: Seniors"]);
    // The chosen one is raised, as every current choice is (decision 34).
    expect(
      [...first.querySelectorAll(".segment_on")].map((s) => s.textContent)
    ).toEqual(["All"]);
    // The editor's place, waiting for slice E8.
    const add = q(element, '[data-id="add-linked-choice"]');
    expect(add.disabled).toBe(true);
    expect(add.textContent).toContain("Linked choice");
    expect(add.textContent).toContain("Coming");
    await expect(element).toBeAccessible();
  });

  it("an offering with no linked choices shows only the place to add one", async () => {
    const element = render();
    await flush();
    element.open("o2");
    await flush();
    expect(q(element, "[data-heading]").textContent).toBe("Archery details");
    expect(all(element, '[data-id="linked-choice"]')).toEqual([]);
    expect(q(element, '[data-id="add-linked-choice"]')).not.toBeNull();
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

    it("a set's count is its confirmed, open offerings: not proposed, not closed", () => {
      expect(offerings.filter(isClosed).map((o) => o.Id)).toEqual(["o3"]);
      // Blank seats are not closed: not filled in yet.
      expect(openCount(offerings)).toBe(4);
      expect(openCount([])).toBe(0);
    });

    it("seats not filled in: blank and limited", () => {
      expect(offerings.filter(hasBlankSeats).map((o) => o.Id)).toEqual(["o6"]);
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
});
