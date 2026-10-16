import { createElement } from "lwc";
import ShoreshSchedules from "c/shoreshSchedules";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import openSchedule from "@salesforce/apex/SchedulesController.openSchedule";
import renameSchedule from "@salesforce/apex/SchedulesController.renameSchedule";
import { buildTerms } from "c/shoreshTerms";
import {
  LABELS,
  opened
} from "../../shoreshScheduleViews/__tests__/data/scheduleFixture";

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/SchedulesController.getVersions", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SchedulesController.openSchedule", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/SchedulesController.renameSchedule", () => apex(), {
  virtual: true
});

const SETUP = {
  season: { Id: "se1", Name: "Summer 2026" },
  weeks: [
    { Id: "w1", Name: "Week 1" },
    { Id: "w2", Name: "Week 2" }
  ],
  programs: [{ program: { Id: "p1", Name: "Main" } }],
  activities: [{ Id: "a1", Name: "Swim", Location__c: "l1" }],
  locations: [{ Id: "l1", Name: "Pool" }]
};

// Newest first, as the server sends them.
const VERSIONS = [
  {
    id: "s3",
    name: "Before my changes",
    origin: "Manual",
    reason: "SavedByHand",
    savedAt: "2026-10-16T16:00:00.000Z"
  },
  {
    id: "s2",
    name: "Imported again",
    origin: "Imported",
    reason: "Imported",
    savedAt: "2026-10-16T15:00:00.000Z"
  },
  {
    id: "s1",
    name: "Imported from sample-week.xlsx",
    origin: "Imported",
    reason: "Imported",
    savedAt: "2026-10-16T14:00:00.000Z"
  }
];

/** The server's answer for whichever version is asked for. */
const answerFor = ({ scheduleId }) => {
  const version = VERSIONS.find((v) => v.id === scheduleId);
  const view = opened();
  return Promise.resolve({
    ...view,
    schedule: { ...view.schedule, ...version }
  });
};

/** A server call that answers only when the test says so. */
function later() {
  let answer;
  const promise = new Promise((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(setup = SETUP) {
  const element = createElement("c-shoresh-schedules", {
    is: ShoreshSchedules
  });
  element.terms = buildTerms(LABELS);
  element.setup = setup;
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

describe("c-shoresh-schedules", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("lists the first week's versions and opens the newest by itself", async () => {
    getVersions.mockResolvedValue(VERSIONS);
    openSchedule.mockImplementation(answerFor);
    const element = await render();
    expect(getVersions).toHaveBeenCalledWith({ programId: "p1", weekId: "w1" });
    expect(q(element, "c-shoresh-versions").versions).toEqual(VERSIONS);
    expect(q(element, '[data-id="program"]')).toBeNull(); // one program: no picker
    expect(openSchedule).toHaveBeenCalledTimes(1);
    expect(openSchedule).toHaveBeenCalledWith({ scheduleId: "s3" });
    expect(q(element, '[data-id="viewing"]').textContent).toContain(
      "Before my changes"
    );
    expect(q(element, "c-shoresh-versions").openId).toBe("s3");
    expect(q(element, '[data-id="nothing-open"]')).toBeNull();
  });

  it("never says nothing is saved or open while the newest version is loading", async () => {
    const list = later();
    const version = later();
    getVersions.mockReturnValue(list.promise);
    openSchedule.mockReturnValue(version.promise);
    const element = await render();
    expect(q(element, '[data-id="nothing-open"]')).toBeNull();
    list.answer(VERSIONS);
    await flush();
    expect(q(element, '[data-id="nothing-open"]')).toBeNull();
    expect(q(element, '[data-id="viewing"]')).toBeNull();
    version.answer(await answerFor({ scheduleId: "s3" }));
    await flush();
    expect(q(element, '[data-id="viewing"]')).not.toBeNull();
    expect(q(element, '[data-id="nothing-open"]')).toBeNull();
  });

  it("a week's list that arrives after another week was chosen opens nothing", async () => {
    const weekOne = later();
    getVersions.mockReturnValueOnce(weekOne.promise);
    openSchedule.mockImplementation(answerFor);
    const element = await render();
    getVersions.mockResolvedValueOnce([]);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    weekOne.answer(VERSIONS);
    await flush();
    expect(openSchedule).not.toHaveBeenCalled();
    expect(q(element, "c-shoresh-versions").versions).toEqual([]);
    expect(q(element, '[data-id="nothing-open"]').textContent).toContain(
      "Nothing saved for Week 2 yet"
    );
  });

  it("choosing another program opens that program's newest version", async () => {
    const twoPrograms = {
      ...SETUP,
      programs: [
        { program: { Id: "p1", Name: "Main" } },
        { program: { Id: "p2", Name: "Teens" } }
      ]
    };
    getVersions.mockResolvedValueOnce([]);
    openSchedule.mockImplementation(answerFor);
    const element = await render(twoPrograms);
    expect(q(element, '[data-id="program"]')).not.toBeNull();
    getVersions.mockResolvedValueOnce([VERSIONS[1], VERSIONS[2]]);
    q(element, '[data-id="program"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "p2" } })
    );
    await flush();
    expect(getVersions).toHaveBeenLastCalledWith({
      programId: "p2",
      weekId: "w1"
    });
    expect(openSchedule).toHaveBeenCalledWith({ scheduleId: "s2" });
    expect(q(element, "c-shoresh-versions").openId).toBe("s2");
  });

  it("says when a week has nothing saved yet", async () => {
    getVersions.mockResolvedValue([]);
    const element = await render();
    expect(q(element, '[data-id="nothing-open"]').textContent).toContain(
      "Nothing saved for Week 1 yet"
    );
    expect(openSchedule).not.toHaveBeenCalled();
  });

  it("asks for weeks first when there are none", async () => {
    const element = await render({ ...SETUP, weeks: [] });
    expect(getVersions).not.toHaveBeenCalled();
    expect(q(element, '[data-id="nothing-open"]').textContent).toContain(
      "No weeks yet"
    );
  });

  it("opens a version in Daily View, then Group View and Activity View", async () => {
    getVersions.mockResolvedValue(VERSIONS);
    openSchedule.mockImplementation(answerFor);
    const element = await render();
    expect(q(element, "c-shoresh-versions").openId).toBe("s3");
    q(element, "c-shoresh-versions").dispatchEvent(
      new CustomEvent("open", { detail: { id: "s2" } })
    );
    await flush();
    expect(openSchedule).toHaveBeenLastCalledWith({ scheduleId: "s2" });
    expect(q(element, '[data-id="viewing"]').textContent).toContain(
      "Imported again"
    );
    expect(q(element, "c-shoresh-versions").openId).toBe("s2");
    expect(
      qa(element, ".view-button").map((b) => b.textContent.trim())
    ).toEqual(["Daily View", "Group View", "Activity View"]);
    // Daily View: Monday first, a column per bunk.
    const daily = q(element, '[data-id="daily-grid"]');
    expect(daily.grid.columns.map((c) => c.label)).toEqual([
      "Bunk 1",
      "Bunk 2"
    ]);
    expect(daily.corner).toBe("Time block");
    // Wednesday could not be read: it says so instead of a grid.
    qa(element, '[data-id="day-pills"] button')[2].click();
    await flush();
    expect(q(element, '[data-id="daily-grid"]')).toBeNull();
    expect(element.shadowRoot.textContent).toContain(
      "This day could not be read"
    );

    q(element, '[data-view="group"]').click();
    await flush();
    expect(
      qa(element, '[data-id="group-pills"] button').map((b) =>
        b.textContent.trim()
      )
    ).toEqual(["Bunk 1", "Bunk 2"]);
    qa(element, '[data-id="group-pills"] button')[1].click();
    await flush();
    const group = q(element, '[data-id="group-grid"]');
    expect(group.grid.cells.find((c) => c.key === "0-0").text).toBe("Chugim");

    q(element, '[data-view="activity"]').click();
    await flush();
    const cards = qa(element, '[data-id="activity-cards"] button');
    expect(cards[0].textContent).toContain("Swim");
    expect(cards[0].textContent).toContain("Pool");
    cards[0].click();
    await flush();
    expect(q(element, '[data-id="activity-grid"]').grid.columns).toHaveLength(
      3
    );
    q(element, '[data-id="all-activities"]').click();
    await flush();
    expect(q(element, '[data-id="activity-cards"]')).not.toBeNull();
  });

  it("another week opens its own newest version, or says it has none", async () => {
    getVersions.mockResolvedValueOnce(VERSIONS);
    openSchedule.mockImplementation(answerFor);
    const element = await render();
    getVersions.mockResolvedValueOnce([]);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    expect(getVersions).toHaveBeenLastCalledWith({
      programId: "p1",
      weekId: "w2"
    });
    expect(q(element, '[data-id="viewing"]')).toBeNull();
    expect(q(element, '[data-id="nothing-open"]').textContent).toContain(
      "Nothing saved for Week 2 yet"
    );
    getVersions.mockResolvedValueOnce(VERSIONS);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w1" } })
    );
    await flush();
    expect(openSchedule).toHaveBeenCalledTimes(2);
    expect(q(element, '[data-id="viewing"]')).not.toBeNull();
  });

  it("does not reload when the page hands the same setup again", async () => {
    getVersions.mockResolvedValue(VERSIONS);
    openSchedule.mockImplementation(answerFor);
    const element = await render();
    element.setup = { ...SETUP };
    await flush();
    expect(getVersions).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="viewing"]')).not.toBeNull();
  });

  it("a failed load shows no stale list, and choosing the week again retries", async () => {
    getVersions.mockResolvedValueOnce(VERSIONS);
    const element = await render();
    getVersions.mockRejectedValueOnce({ body: { message: "Lost access." } });
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    expect(q(element, '[data-id="schedules-error"]').textContent).toContain(
      "Lost access."
    );
    expect(q(element, "c-shoresh-versions").versions).toEqual([]);
    expect(q(element, '[data-id="viewing"]')).toBeNull();
    getVersions.mockResolvedValueOnce([]);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    expect(getVersions).toHaveBeenCalledTimes(3);
  });

  it("a version that finishes loading after another week was chosen is not shown", async () => {
    getVersions.mockResolvedValue(VERSIONS);
    let answer;
    openSchedule.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const element = await render();
    // The newest version is still loading when another week is chosen.
    getVersions.mockResolvedValue([]);
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: "w2" } })
    );
    await flush();
    answer(opened());
    await flush();
    expect(q(element, '[data-id="viewing"]')).toBeNull();
  });

  it("renames a version, on screen and in the list", async () => {
    getVersions.mockResolvedValue(VERSIONS);
    openSchedule.mockImplementation(answerFor);
    renameSchedule.mockResolvedValue();
    const element = await render();
    const onDone = jest.fn();
    q(element, "c-shoresh-versions").dispatchEvent(
      new CustomEvent("rename", {
        detail: { id: "s3", name: "Last summer", onDone }
      })
    );
    await flush();
    expect(renameSchedule).toHaveBeenCalledWith({
      scheduleId: "s3",
      name: "Last summer"
    });
    expect(onDone).toHaveBeenCalledWith(true);
    expect(q(element, "c-shoresh-versions").versions[0].name).toBe(
      "Last summer"
    );
    expect(q(element, '[data-id="viewing"]').textContent).toContain(
      "Last summer"
    );
  });

  it("shows a refused rename and keeps the old name", async () => {
    getVersions.mockResolvedValue(VERSIONS);
    renameSchedule.mockRejectedValue({
      body: { message: "Give the version a name." }
    });
    const element = await render();
    const onDone = jest.fn();
    q(element, "c-shoresh-versions").dispatchEvent(
      new CustomEvent("rename", { detail: { id: "s3", name: " ", onDone } })
    );
    await flush();
    expect(onDone).toHaveBeenCalledWith(false);
    expect(q(element, '[data-id="schedules-error"]').textContent).toContain(
      "Give the version a name."
    );
    expect(q(element, "c-shoresh-versions").versions[0].name).toBe(
      "Before my changes"
    );
  });
});
