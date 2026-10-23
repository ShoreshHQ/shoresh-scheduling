// Rainy day in the week editor (repo docs/adr/0019): what it never touches (a day a special day
// replaces, an event, a fixed activity, a locked cell) and what happens when someone else
// changed a cell first. Synthetic data only: draftFixture's Bunk 1 and Bunk 2, Period 1, Period
// 2, Lunch; Soccer is outdoors with Gym games as its rain plan (no limits); Tuesday is Visiting
// Day.
import { createElement } from "lwc";
import ShoreshWeekEditor from "c/shoreshWeekEditor";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { ACTIVITIES, GROUPS, draft } from "./data/draftFixture";

const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];
const EVENT_ID = "a0E000000000001AAA";
const FLAGPOLE = { kind: "F", id: "f1", name: "Flagpole", gone: false };
const SOCCER = { kind: "A", id: "a3", name: "Soccer", gone: false };
const GYM = { kind: "A", id: "a4", name: "Gym games", gone: false };
const CARNIVAL = { kind: "S", id: EVENT_ID, name: "Carnival", gone: false };
const SWIM = { kind: "A", id: "a1", name: "Swim", gone: false };
const ITEMS = [FLAGPOLE, SOCCER, GYM, CARNIVAL, SWIM];
// Rows: 1 Flagpole, 2 Soccer, 3 Gym games, 4 Carnival, 5 Swim.
const MONDAY = "2026-06-29";
const SETUP = nsRecord({
  activities: [],
  locations: [],
  special: {
    specialDays: [],
    specialEvents: [{ Id: EVENT_ID, Name: "Carnival" }],
    briefs: []
  }
});
const RECORDS = nsRecord([
  {
    Id: "a3",
    Name: "Soccer",
    Outdoor__c: true,
    RainPlan__c: "a4",
    NoGroupLimit__c: true
  },
  { Id: "a4", Name: "Gym games", NoGroupLimit__c: true },
  { Id: "a1", Name: "Swim", NoGroupLimit__c: true }
]);
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
      { id: "b1", name: "Morning", startTime: "09:00", endTime: "12:00" }
    ],
    groups: GROUPS,
    items: [{ kind: "A", id: "a9", name: "Open house", gone: false }],
    rows: ["1", "1"]
  }
};

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

function week(mondayRows, tuesdayRows = ["1,2,", "1,2,"]) {
  const start = draft(ITEMS, mondayRows);
  start.schedule.days[1] = {
    ...start.schedule.days[1],
    items: ITEMS,
    rows: tuesdayRows
  };
  return {
    ...start,
    activities: [
      ...ACTIVITIES,
      {
        id: "a4",
        name: "Gym games",
        length: 1,
        notFor: [],
        minPerWeek: 0,
        maxPerWeek: null
      }
    ],
    activityRecords: RECORDS,
    locationRecords: [],
    fixedActivityRecords: [],
    recurringActivityRecords: [],
    otherPrograms: [],
    specials: { days: [VISITING_DAY] }
  };
}

async function render(start, { locks } = {}) {
  const element = createElement("c-shoresh-week-editor", {
    is: ShoreshWeekEditor
  });
  element.terms = buildTerms(LABELS);
  element.setup = SETUP;
  element.weekName = "Week 1";
  element.programName = "Main";
  let shown = null;
  element.addEventListener("statechange", (e) => {
    shown = e.detail.draft;
  });
  const saveRuns = jest.fn(() =>
    Promise.resolve({
      status: "saved",
      conflicts: [],
      schedule: shown.schedule
    })
  );
  const rainyWith = jest.fn(() => Promise.resolve());
  element.saveRuns = saveRuns;
  element.rainyWith = rainyWith;
  if (locks) {
    element.locks = locks;
  }
  document.body.appendChild(element);
  element.show(start, true);
  await flush();
  return { element, saveRuns, rainyWith };
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const sent = (saveRuns, n) => saveRuns.mock.calls[n][0][0];
async function rainy(element, date = MONDAY) {
  q(element, '[data-id="rainy-day"]').click();
  await flush();
  q(element, `[data-id="rainy-day-${date}"]`).click();
  await flush();
}
const toolNotice = (element) => {
  const line = q(element, '[data-id="tool-notice"]');
  return line
    ? [...line.children].map((child) => child.textContent.trim()).join(" ")
    : null;
};

describe("c-shoresh-week-editor: rainy day", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("doesn't offer a day a special day replaces", async () => {
    const { element } = await render(week(["1,2,", "1,2,"]));
    q(element, '[data-id="rainy-day"]').click();
    await flush();
    expect(q(element, `[data-id="rainy-day-${MONDAY}"]`)).not.toBeNull();
    expect(q(element, '[data-id="rainy-day-2026-06-30"]')).toBeNull();
  });

  it("is not offered without a host to keep the version", async () => {
    const { element } = await render(week(["1,2,", "1,2,"]));
    element.rainyWith = null;
    await flush();
    expect(q(element, '[data-id="rainy-day"]')).toBeNull();
  });

  it("never switches an event or a fixed activity", async () => {
    const { element, saveRuns } = await render(week(["1,2,", "1,4,"]));
    await rainy(element);
    expect(sent(saveRuns, 0).runs).toEqual([
      expect.objectContaining({
        groupId: "g1",
        before: ["A:a3"],
        after: ["A:a4"]
      })
    ]);
    expect(toolNotice(element)).toBe(
      "Rainy Monday: 1 switched to rain plans · Undo"
    );
  });

  it("leaves a locked cell as it is and says so (Generated)", async () => {
    const { element, saveRuns } = await render(week(["1,2,", "1,2,"]), {
      locks: [`${MONDAY}|g1|t2`]
    });
    await rainy(element);
    expect(sent(saveRuns, 0).runs).toEqual([
      expect.objectContaining({ groupId: "g2", after: ["A:a4"] })
    ]);
    expect(toolNotice(element)).toBe(
      "Rainy Monday: 1 switched to rain plans, 1 locked, left as is · Undo"
    );
  });

  it("keeps the version first, and works the day out again on the week as it is then", async () => {
    let finish;
    const { element, saveRuns, rainyWith } = await render(
      week(["1,2,", "1,2,"])
    );
    rainyWith.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await rainy(element);
    expect(rainyWith).toHaveBeenCalledWith("Before rainy Monday");
    expect(saveRuns).not.toHaveBeenCalled();
    // While the version is kept, Rainy day… waits.
    expect(q(element, '[data-id="rainy-day"]').disabled).toBe(true);
    finish();
    await flush();
    expect(sent(saveRuns, 0).runs).toHaveLength(2);
  });

  it("after someone else's change, keeps theirs and switches the rest as the same step", async () => {
    const start = week(["1,2,", "1,2,"]);
    const { element, saveRuns } = await render(start);
    // Someone put Swim in Bunk 1's Period 2 first.
    const theirs = week(["1,5,", "1,2,"]).schedule;
    saveRuns.mockResolvedValueOnce({
      status: "saved",
      conflicts: [0],
      schedule: theirs
    });
    await rainy(element);
    const keep = q(element, '[data-id="keep-theirs"]');
    if (keep) {
      keep.click();
      await flush();
    }
    const again = sent(saveRuns, 1);
    expect(again.runs).toEqual([
      expect.objectContaining({ groupId: "g2", after: ["A:a4"] })
    ]);
    expect(again.rain).toEqual([{ day: MONDAY, cells: ["g2|t2|a4|switched"] }]);
    expect(toolNotice(element)).toBe(
      "Rainy Monday, except 1 activity that changed: 1 switched to rain plans · Undo"
    );
  });
});
