// "Put on a day" in a special day's details (ADR 0014 slice 4; desktop "+ Place on a day" and
// ADR 2026-10-09-special-day-binds-to-a-week-day D11.4): the week and the weekday, and a question
// before replacing another special day. Synthetic data only.
import { createElement } from "lwc";
import ShoreshSpecialDetails, { weekdaysOf } from "c/shoreshSpecialDetails";
import putOnDay from "@salesforce/apex/SpecialPlacingController.putOnDay";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

jest.mock(
  "@salesforce/apex/SpecialPlacingController.putOnDay",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const WEEKS = [
  {
    Id: "w1",
    Name: "Week 1",
    StartDate__c: "2026-06-29",
    EndDate__c: "2026-07-03"
  },
  // A short week: Wednesday to Friday.
  {
    Id: "w2",
    Name: "Week 2",
    StartDate__c: "2026-07-08",
    EndDate__c: "2026-07-10"
  }
];
const SETUP = {
  weeks: WEEKS,
  locations: [],
  special: {
    specialDays: [{ Id: "sd1", Name: "Visiting Day" }],
    specialEvents: [{ Id: "se1", Name: "Carnival" }],
    briefs: []
  }
};

const flush = () =>
  [...Array(6)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render() {
  const element = createElement("c-shoresh-special-details", {
    is: ShoreshSpecialDetails
  });
  element.setup = nsRecord(SETUP);
  element.terms = buildTerms([]);
  element.weekWords = { one: "Wk" };
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, id) =>
  element.shadowRoot.querySelector(`[data-id="${id}"]`);
const options = (select) =>
  [...select.querySelectorAll("option")].map((o) => o.value);

describe("c-shoresh-special-details: put on a day", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("knows the weekdays a week has", () => {
    const [full, short] = nsRecord(WEEKS);
    expect(weekdaysOf(full)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday"
    ]);
    expect(weekdaysOf(short)).toEqual(["Wednesday", "Thursday", "Friday"]);
    expect(weekdaysOf(null)).toEqual([]);
  });

  it("is offered for a special day, not an event", async () => {
    const element = await render();
    element.open("se1");
    await flush();
    expect(q(element, "put-on-day")).toBeNull();
    element.open("sd1");
    await flush();
    expect(q(element, "put-on-day").textContent.trim()).toBe("Put on a day");
  });

  it("puts it on the week and day chosen, and says so", async () => {
    putOnDay.mockResolvedValue({
      said: '"Visiting Day" is on Friday of "Week 2".'
    });
    const element = await render();
    const placed = jest.fn();
    element.addEventListener("placed", placed);
    element.open("sd1");
    await flush();
    q(element, "put-on-day").click();
    await flush();
    const week = q(element, "place-week");
    expect(options(week)).toEqual(["w1", "w2"]);
    week.value = "w2";
    week.dispatchEvent(new CustomEvent("change"));
    await flush();
    const day = q(element, "place-day");
    expect(options(day)).toEqual(["Wednesday", "Thursday", "Friday"]);
    day.value = "Friday";
    day.dispatchEvent(new CustomEvent("change"));
    await flush();
    q(element, "put").click();
    await flush();
    expect(putOnDay).toHaveBeenCalledWith({
      request: {
        specialDayId: "sd1",
        weekId: "w2",
        day: "Friday",
        answer: null
      }
    });
    expect(q(element, "place-said").textContent.trim()).toBe(
      '"Visiting Day" is on Friday of "Week 2".'
    );
    expect(placed.mock.calls[0][0].detail).toEqual({ itemId: "sd1" });
    expect(q(element, "place-week")).toBeNull();
  });

  it("asks before replacing another special day, and replaces it on Use", async () => {
    putOnDay
      .mockResolvedValueOnce({
        asks: 'Monday of "Week 1" already has the special day "Color War". Use this one instead? "Color War" stays saved.',
        replaces: "Color War"
      })
      .mockResolvedValueOnce({
        said: '"Visiting Day" is on Monday of "Week 1".'
      });
    const element = await render();
    element.open("sd1");
    await flush();
    q(element, "put-on-day").click();
    await flush();
    q(element, "put").click();
    await flush();
    expect(q(element, "place-ask").textContent.trim()).toMatch(
      /already has the special day "Color War"/
    );
    const use = q(element, "use-instead");
    expect(use.textContent.trim()).toBe("Use Visiting Day");
    use.click();
    await flush();
    expect(putOnDay).toHaveBeenLastCalledWith({
      request: {
        specialDayId: "sd1",
        weekId: "w1",
        day: "Monday",
        answer: "replace"
      }
    });
    expect(q(element, "place-said").textContent.trim()).toBe(
      '"Visiting Day" is on Monday of "Week 1".'
    );
  });

  it("Cancel puts nothing on a day", async () => {
    const element = await render();
    element.open("sd1");
    await flush();
    q(element, "put-on-day").click();
    await flush();
    q(element, "cancel-place").click();
    await flush();
    expect(putOnDay).not.toHaveBeenCalled();
    expect(q(element, "put-on-day")).not.toBeNull();
  });
});
