// "Take off <day>" on a day a special day replaces, from Manual Build (ADR 0014 slice 6): taken
// off on the server for the week shown, then the week and the season are read again, so the
// day's own cells are back. Synthetic data only.
import { createElement } from "lwc";
import ShoreshManualBuild from "c/shoreshManualBuild";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import takeOffDay from "@salesforce/apex/SpecialPlacingController.takeOffDay";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { find } from "shoresh-jest/week-editor";
import {
  GROUPS,
  draft
} from "../../shoreshWeekEditor/__tests__/data/draftFixture";

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/ManualBuildController.getDraft", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/SpecialPlacingController.takeOffDay",
  () => apex(),
  { virtual: true }
);

const SETUP = {
  season: { Id: "se1", Name: "Summer 2026" },
  weeks: [{ Id: "w1", Name: "Week 1" }],
  programs: [{ program: { Id: "p1", Name: "Main" } }],
  activities: [],
  locations: []
};
const VISITING_DAY = {
  dateValue: "2026-06-30",
  day: "Tuesday",
  specialDayId: "sd1",
  name: "Visiting Day",
  notes: "",
  plan: {
    dateValue: "2026-06-30",
    problem: null,
    blocks: [
      { id: "b1", name: "Morning", startTime: "09:00", endTime: "10:20" }
    ],
    groups: GROUPS,
    items: [{ kind: "A", id: "a9", name: "Bunk clean-up", gone: false }],
    rows: ["1", "1"]
  }
};

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

describe("c-shoresh-manual-build: take a special day off", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("takes it off the week shown and reads the week and the season again", async () => {
    getDraft
      .mockResolvedValueOnce({ ...draft(), specials: { days: [VISITING_DAY] } })
      .mockResolvedValue({ ...draft(), specials: { days: [] } });
    takeOffDay.mockResolvedValue({
      said: 'Tuesday of "Week 1" has its regular schedule again. "Visiting Day" stays saved.'
    });
    const element = createElement("c-shoresh-manual-build", {
      is: ShoreshManualBuild
    });
    element.terms = buildTerms([]);
    element.setup = nsRecord(SETUP);
    const seasonChanged = jest.fn();
    element.addEventListener("seasonchanged", seasonChanged);
    document.body.appendChild(element);
    await flush();
    const pills = find(element, '[data-id="day-pills"]').querySelectorAll(
      "button"
    );
    pills[1].click();
    await flush();
    find(element, '[data-id="take-off-special"]').click();
    await flush();
    expect(takeOffDay).toHaveBeenCalledWith({
      request: {
        specialDayId: "sd1",
        weekId: "w1",
        day: "Tuesday",
        answer: null
      }
    });
    expect(seasonChanged).toHaveBeenCalled();
    expect(getDraft).toHaveBeenCalledTimes(2);
    expect(find(element, '[data-id="notice"]').textContent).toBe(
      'Tuesday of "Week 1" has its regular schedule again. "Visiting Day" stays saved.'
    );
    expect(find(element, '[data-id="special-line"]')).toBeNull();
  });
});
