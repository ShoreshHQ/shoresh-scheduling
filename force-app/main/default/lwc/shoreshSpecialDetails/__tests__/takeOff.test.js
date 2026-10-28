// Taking a special day off a day in its details (ADR 0014 slice 6; desktop "Placed on" chips'
// x, "Remove from this day"; Director Guide "Take it off a day"): each day it is on has its own
// Take off, what comes back is said, and Put back puts it on that day again. Synthetic data only.
import { createElement } from "lwc";
import ShoreshSpecialDetails from "c/shoreshSpecialDetails";
import putOnDay from "@salesforce/apex/SpecialPlacingController.putOnDay";
import takeOffDay from "@salesforce/apex/SpecialPlacingController.takeOffDay";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

jest.mock(
  "@salesforce/apex/SpecialPlacingController.putOnDay",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SpecialPlacingController.takeOffDay",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const SETUP = {
  weeks: [
    {
      Id: "w1",
      Name: "Week 1",
      StartDate__c: "2026-06-29",
      EndDate__c: "2026-07-03"
    },
    {
      Id: "w2",
      Name: "Week 2",
      StartDate__c: "2026-07-06",
      EndDate__c: "2026-07-10"
    }
  ],
  locations: [],
  special: {
    specialDays: [{ Id: "sd1", Name: "Visiting Day" }],
    specialEvents: [{ Id: "se1", Name: "Carnival" }],
    briefs: [
      {
        itemId: "sd1",
        planned: false,
        rows: 0,
        periods: [],
        days: [
          { weekId: "w1", day: "Friday" },
          { weekId: "w2", day: "Tuesday" }
        ]
      },
      {
        itemId: "se1",
        planned: false,
        rows: 0,
        periods: [],
        days: [{ weekId: "w1", day: "Wednesday" }]
      }
    ]
  }
};

const flush = () =>
  [...Array(6)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(itemId = "sd1") {
  const element = createElement("c-shoresh-special-details", {
    is: ShoreshSpecialDetails
  });
  element.setup = nsRecord(SETUP);
  element.terms = buildTerms([]);
  element.weekWords = { one: "Wk" };
  document.body.appendChild(element);
  await flush();
  element.open(itemId);
  await flush();
  return element;
}

const q = (element, id) =>
  element.shadowRoot.querySelector(`[data-id="${id}"]`);
const all = (element, id) => [
  ...element.shadowRoot.querySelectorAll(`[data-id="${id}"]`)
];

describe("c-shoresh-special-details: take off a day", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("lists each day a special day is on, each with its own Take off", async () => {
    const element = await render();
    const days = all(element, "placed-day");
    expect(days.map((d) => d.querySelector("span").textContent)).toEqual([
      "Wk 1 Fri",
      "Wk 2 Tue"
    ]);
    expect(
      all(element, "take-off").map((b) => b.getAttribute("aria-label"))
    ).toEqual([
      "Take Visiting Day off Friday of Week 1",
      "Take Visiting Day off Tuesday of Week 2"
    ]);
  });

  it("offers no Take off for an event (its days follow the grid)", async () => {
    const element = await render("se1");
    expect(all(element, "take-off")).toEqual([]);
    expect(q(element, "placed-on").textContent.trim()).toBe("Wk 1 Wed");
  });

  it("takes it off, says what comes back, and puts the cursor on Put back", async () => {
    takeOffDay.mockResolvedValue({
      said: 'Tuesday of "Week 2" has its regular schedule again. "Visiting Day" stays saved.'
    });
    const element = await render();
    const placed = jest.fn();
    element.addEventListener("placed", placed);
    all(element, "take-off")[1].click();
    await flush();
    expect(takeOffDay).toHaveBeenCalledWith({
      request: {
        specialDayId: "sd1",
        weekId: "w2",
        day: "Tuesday",
        answer: null
      }
    });
    expect(q(element, "place-said").textContent.trim()).toBe(
      'Tuesday of "Week 2" has its regular schedule again. "Visiting Day" stays saved.'
    );
    expect(placed.mock.calls[0][0].detail).toEqual({ itemId: "sd1" });
    const back = q(element, "put-back");
    expect(back.textContent.trim()).toBe("Put back");
    expect(back.getAttribute("aria-label")).toBe(
      "Put back Visiting Day on Tuesday"
    );
    expect(element.shadowRoot.activeElement).toBe(back);
  });

  it("Put back puts it on that day again", async () => {
    takeOffDay.mockResolvedValue({ said: "off" });
    putOnDay.mockResolvedValue({
      said: '"Visiting Day" is on Tuesday of "Week 2".'
    });
    const element = await render();
    all(element, "take-off")[1].click();
    await flush();
    q(element, "put-back").click();
    await flush();
    expect(putOnDay).toHaveBeenCalledWith({
      request: {
        specialDayId: "sd1",
        weekId: "w2",
        day: "Tuesday",
        answer: null
      }
    });
    expect(q(element, "place-said").textContent.trim()).toBe(
      '"Visiting Day" is on Tuesday of "Week 2".'
    );
    expect(q(element, "put-back")).toBeNull();
  });

  // SPECIAL-4.1
  it("asks before putting back over a special day put there since", async () => {
    takeOffDay.mockResolvedValue({ said: "off" });
    putOnDay.mockResolvedValue({
      asks: 'Tuesday of "Week 2" already has the special day "Color War". Use this one instead? "Color War" stays saved.',
      replaces: "Color War"
    });
    const element = await render();
    all(element, "take-off")[1].click();
    await flush();
    q(element, "put-back").click();
    await flush();
    expect(q(element, "place-ask").textContent.trim()).toMatch(
      /already has the special day "Color War"/
    );
    expect(q(element, "place-week").value).toBe("w2");
    expect(q(element, "place-day").value).toBe("Tuesday");
  });

  it("says so when it couldn't be taken off, and keeps the day", async () => {
    takeOffDay.mockRejectedValue({ body: { message: "No access." } });
    const element = await render();
    all(element, "take-off")[0].click();
    await flush();
    expect(q(element, "place-said").textContent).toMatch(
      /^Visiting Day wasn't taken off Friday of Week 1\. Nothing was changed\./
    );
    expect(q(element, "put-back")).toBeNull();
    expect(all(element, "take-off")).toHaveLength(2);
  });
});
