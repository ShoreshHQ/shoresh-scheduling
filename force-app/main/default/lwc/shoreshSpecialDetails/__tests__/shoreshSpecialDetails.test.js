import { createElement } from "lwc";
import ShoreshSpecialDetails, {
  placedOnText,
  scheduleText,
  seededLines
} from "c/shoreshSpecialDetails";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

const terms = buildTerms([
  {
    term: "TimeBlock",
    singular: "Period",
    plural: "Periods",
    isCustom: true
  }
]);
const plain = buildTerms([]);

const WEEKS = [
  { Id: "w1", Name: "Week 1" },
  { Id: "w2", Name: "Week 2" },
  { Id: "w5", Name: "Week 5" }
];
const SETUP = {
  weeks: WEEKS,
  locations: [{ Id: "l1", Name: "Main field" }],
  special: {
    specialDays: [
      {
        Id: "sd1",
        Name: "Color War",
        Notes__c: "Teams announced at breakfast"
      },
      { Id: "sd2", Name: "Rainy Day" }
    ],
    specialEvents: [
      { Id: "se1", Name: "Carnival", Location__c: "l1" },
      { Id: "se2", Name: "Fire Truck Visit" }
    ],
    briefs: [
      {
        itemId: "sd1",
        planned: true,
        rows: 7,
        periods: [
          {
            name: "Opening",
            startTime: "09:00",
            endTime: "09:45",
            items: []
          },
          {
            name: "Lunch",
            startTime: "11:30",
            endTime: "12:20",
            items: ["Lunch", "Rest"]
          }
        ],
        days: [{ weekId: "w5", day: "Thursday" }]
      },
      { itemId: "sd2", planned: false, rows: 0, periods: [], days: [] },
      {
        itemId: "se1",
        planned: false,
        rows: 0,
        periods: [],
        days: [
          { weekId: "w2", day: "Tuesday" },
          { weekId: "w5", day: "Tuesday" }
        ]
      },
      {
        itemId: "se2",
        planned: true,
        rows: 0,
        periods: [],
        problem: "row 2 has 3 cells",
        days: []
      }
    ]
  }
};

const flush = () => Promise.resolve().then(() => Promise.resolve());

async function render(setup = SETUP) {
  const element = createElement("c-shoresh-special-details", {
    is: ShoreshSpecialDetails
  });
  element.setup = nsRecord(setup);
  element.terms = terms;
  element.weekWords = { one: "Wk" };
  document.body.appendChild(element);
  await flush();
  return element;
}

const text = (element, id) => {
  const node = element.shadowRoot.querySelector(`[data-id="${id}"]`);
  return node ? node.textContent.replace(/\s+/g, " ").trim() : null;
};

describe("c-shoresh-special-details", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  describe("words worked out for the list", () => {
    it("the days an item is on, by the week's place in the season", () => {
      const brief = SETUP.special.briefs[2];
      expect(placedOnText(brief, WEEKS, { one: "Wk" })).toBe(
        "Wk 2 Tue, Wk 3 Tue"
      );
      // A camp with its own word for weeks.
      expect(placedOnText(brief, WEEKS, { one: "Session" })).toBe(
        "Session 2 Tue, Session 3 Tue"
      );
      expect(placedOnText(SETUP.special.briefs[1], WEEKS, {})).toBe("");
      // A week gone since is left out, never shown as a wrong number.
      expect(
        placedOnText({ days: [{ weekId: "gone", day: "Monday" }] }, WEEKS, {})
      ).toBe("");
    });

    it("a special day's schedule is its time blocks, an event's its stations", () => {
      expect(scheduleText(SETUP.special.briefs[0], false, terms)).toBe(
        "2 Periods"
      );
      expect(
        scheduleText({ planned: true, periods: [{}], rows: 1 }, false, plain)
      ).toBe("1 time block");
      expect(
        scheduleText({ planned: true, periods: [], rows: 4 }, true, plain)
      ).toBe("4 stations");
      expect(scheduleText(SETUP.special.briefs[1], false, plain)).toBe("");
      expect(scheduleText(SETUP.special.briefs[3], true, plain)).toBe(
        "Can't be read"
      );
    });

    it("what a special day started from, with nothing left out quietly", () => {
      expect(
        seededLines(
          {
            program: "Main",
            timeBlocks: 3,
            broughtIn: ["Lunch"],
            notEveryDay: ["Swim", "Art"],
            notEveryWeek: ["Flag"],
            otherTimes: ["Campfire"],
            slotTaken: []
          },
          "Field Day",
          plain
        )
      ).toEqual([
        '"Field Day" starts from Main\'s 3 time blocks, with Lunch brought in.',
        "Not brought in, since they don't run every day: Swim and Art.",
        "Not brought in, since they don't run every week: Flag.",
        "Not brought in, since they are in other time blocks: Campfire."
      ]);
      expect(
        seededLines(
          { program: "Main", timeBlocks: 1, broughtIn: [] },
          "Field Day",
          plain
        )
      ).toEqual(['"Field Day" starts from Main\'s 1 time block.']);
      expect(
        seededLines({ program: null, timeBlocks: 0 }, "Field Day", plain)
      ).toEqual([
        '"Field Day" has no time blocks yet: there were none to start from.'
      ]);
      expect(seededLines(null, "Field Day", plain)).toEqual([]);
    });
  });

  it("shows nothing until an item is opened", async () => {
    const element = await render();
    expect(element.openItemId).toBeNull();
    expect(element.shadowRoot.querySelector("section")).toBeNull();
    expect(element.open("nope")).toBe(false);
  });

  it("a special day: the whole camp, its day, its notes, its own time blocks with what is in them", async () => {
    const element = await render();
    expect(element.open("sd1")).toBe(true);
    await flush();
    const heading = element.shadowRoot.querySelector("[data-heading]");
    expect(heading.textContent).toBe("Color War details");
    expect(element.shadowRoot.activeElement).toBe(heading);
    expect(text(element, "where")).toBe("Whole camp");
    expect(text(element, "placed-on")).toBe("Wk 3 Thu");
    expect(text(element, "notes")).toBe("Teams announced at breakfast");
    const periods = [
      ...element.shadowRoot.querySelectorAll('[data-id="period"]')
    ].map((p) => p.textContent.replace(/\s+/g, " ").trim());
    expect(periods).toEqual([
      "9:00–9:45Opening",
      "11:30–12:20LunchLunch, Rest"
    ]);
    expect(element.shadowRoot.querySelector(".periods-title").textContent).toBe(
      "Periods"
    );
    // The door to the schedule inside opens it.
    const door = element.shadowRoot.querySelector('[data-id="open-schedule"]');
    expect(door.getAttribute("aria-disabled")).toBeNull();
    expect(door.textContent.trim()).toBe("Open schedule");
    const opened = jest.fn();
    element.addEventListener("openschedule", opened);
    door.click();
    expect(opened.mock.calls[0][0].detail).toEqual({ itemId: "sd1" });
    // Back from it, the cursor is on the door again.
    element.focusOpenSchedule();
    expect(element.shadowRoot.activeElement).toBe(door);
    await expect(element).toBeAccessible();
  });

  it("a special day with no time blocks yet says so, quietly", async () => {
    const element = await render();
    element.open("sd2");
    await flush();
    expect(text(element, "placed-on")).toBe("Not placed");
    expect(text(element, "no-periods")).toBe("No Periods yet");
    expect(text(element, "notes")).toBeNull();
  });

  it("an event: its place, its days, its schedule; one that can't be read says why", async () => {
    const element = await render();
    element.open("se1");
    await flush();
    expect(text(element, "where")).toBe("Main field");
    expect(text(element, "placed-on")).toBe("Wk 2 Tue, Wk 3 Tue");
    expect(text(element, "event-schedule")).toBe("None yet");
    expect(element.shadowRoot.querySelector('[data-id="periods"]')).toBeNull();
    element.open("se2");
    await flush();
    expect(text(element, "where")).toBe("None");
    expect(text(element, "event-schedule")).toBe("Can't be read");
    await expect(element).toBeAccessible();
  });

  it("Close says which item closed; an item deleted elsewhere closes its details", async () => {
    const element = await render();
    element.open("sd1");
    await flush();
    const closed = jest.fn();
    element.addEventListener("close", closed);
    element.shadowRoot.querySelector('[data-id="close"]').click();
    await flush();
    expect(closed.mock.calls[0][0].detail).toEqual({ itemId: "sd1" });
    expect(element.openItemId).toBeNull();
    expect(element.shadowRoot.querySelector("section")).toBeNull();

    element.open("sd2");
    await flush();
    element.setup = nsRecord({
      ...SETUP,
      special: { ...SETUP.special, specialDays: [SETUP.special.specialDays[0]] }
    });
    await flush();
    expect(element.openItemId).toBeNull();
  });
});
