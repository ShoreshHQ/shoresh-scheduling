import { createElement } from "lwc";
import ShoreshSchedules from "c/shoreshSchedules";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import openSchedule from "@salesforce/apex/SchedulesController.openSchedule";
import renameSchedule from "@salesforce/apex/SchedulesController.renameSchedule";
import { buildTerms } from "c/shoreshTerms";
import { loadStyle } from "lightning/platformResourceLoader";
import { downloadWorkbook } from "c/shoreshDownload";
import { nsRecord } from "shoresh-jest/namespace";
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

jest.mock("c/shoreshDownload", () => ({
  ...jest.requireActual("c/shoreshDownload"),
  downloadWorkbook: jest.fn(() => Promise.resolve())
}));

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
  element.setup = nsRecord(setup);
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
    await expect(element).toBeAccessible();
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
    expect(q(element, '[data-id="nothing-open"]').title).toContain(
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
    expect(q(element, '[data-id="nothing-open"]').title).toContain(
      "Nothing saved for Week 1 yet"
    );
    expect(openSchedule).not.toHaveBeenCalled();
  });

  it("asks for weeks first when there are none", async () => {
    const element = await render({ ...SETUP, weeks: [] });
    expect(getVersions).not.toHaveBeenCalled();
    expect(q(element, '[data-id="nothing-open"]').title).toContain(
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
    // Camp words, not "Looking at a Version … read-only".
    const viewing = q(element, '[data-id="viewing"]').textContent;
    expect(viewing).toContain("saved");
    expect(viewing).toContain("view only");
    expect(viewing).not.toContain("read-only");
    expect(viewing).not.toContain("Looking at");
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
    await expect(element).toBeAccessible();
    // The chosen day is said (aria-pressed), not shown by colour alone.
    expect(
      qa(element, '[data-id="day-pills"] button').map((b) =>
        b.getAttribute("aria-pressed")
      )
    ).toEqual(["true", "false", "false"]);
    // Wednesday could not be read: it says so instead of a grid.
    qa(element, '[data-id="day-pills"] button')[2].click();
    await flush();
    expect(
      qa(element, '[data-id="day-pills"] button')[2].getAttribute(
        "aria-pressed"
      )
    ).toBe("true");
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
    expect(
      qa(element, '[data-id="group-pills"] button').map((b) =>
        b.getAttribute("aria-pressed")
      )
    ).toEqual(["false", "true"]);
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
    // The cursor follows: onto the way back, then back onto the card it came from.
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="all-activities"]')
    );
    q(element, '[data-id="all-activities"]').click();
    await flush();
    expect(q(element, '[data-id="activity-cards"]')).not.toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      qa(element, '[data-id="activity-cards"] button')[0]
    );
    await expect(element).toBeAccessible();
  });

  it("a deleted bunk's Group View pill says (removed), as on Generated Schedule", async () => {
    getVersions.mockResolvedValue(VERSIONS);
    openSchedule.mockImplementation((args) =>
      answerFor(args).then((view) => ({
        ...view,
        days: view.days.map((day) => ({
          ...day,
          groups: day.groups.map((grp) => ({
            ...grp,
            gone: grp.id === "g2"
          }))
        }))
      }))
    );
    const element = await render();
    q(element, '[data-view="group"]').click();
    await flush();
    expect(
      qa(element, '[data-id="group-pills"] button').map((b) =>
        b.textContent.replace(/\s+/g, " ").trim()
      )
    ).toEqual(["Bunk 1", "Bunk 2 (removed)"]);
    await expect(element).toBeAccessible();
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
    expect(q(element, '[data-id="nothing-open"]').title).toContain(
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
    element.setup = nsRecord({ ...SETUP });
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
  describe("Export to Excel and Print", () => {
    beforeEach(() => {
      window.print = jest.fn();
    });
    afterEach(() => {
      delete window.print;
    });

    it("sit beside Versions, in its group, once a version is open", async () => {
      getVersions.mockResolvedValue(VERSIONS);
      openSchedule.mockImplementation(answerFor);
      const element = await render();
      const group = q(element, '[aria-label="Versions and export"]');
      expect(group.getAttribute("role")).toBe("group");
      expect(group.querySelector('[data-id="export"]').textContent.trim()).toBe(
        "Export to Excel"
      );
      expect(group.querySelector('[data-id="print"]').textContent.trim()).toBe(
        "Print"
      );
      await expect(element).toBeAccessible();
    });

    it("are not there while nothing is open", async () => {
      getVersions.mockResolvedValue([]);
      const element = await render();
      expect(q(element, '[data-id="export"]')).toBeNull();
      expect(q(element, '[data-id="print"]')).toBeNull();
    });

    it("downloads the version on screen, without asking which: a sheet per day, then the flat ones", async () => {
      getVersions.mockResolvedValue(VERSIONS);
      openSchedule.mockImplementation(answerFor);
      const element = await render();
      q(element, '[data-id="export"]').click();
      await flush();
      expect(downloadWorkbook).toHaveBeenCalledTimes(1);
      const [, sheets, fileName] = downloadWorkbook.mock.calls[0];
      expect(sheets.map((x) => x.name)).toEqual([
        "Monday",
        "Tuesday",
        "Wednesday",
        "All Bunks",
        "All Activities"
      ]);
      expect(fileName).toBe("Week 1 - Before my changes.xlsx");
    });

    it("says a download that failed, and why only in Shoresh's words", async () => {
      getVersions.mockResolvedValue(VERSIONS);
      openSchedule.mockImplementation(answerFor);
      downloadWorkbook.mockRejectedValueOnce(new Error("XLSX is not defined"));
      const element = await render();
      q(element, '[data-id="export"]').click();
      await flush();
      expect(q(element, '[data-id="schedules-error"]').textContent).toBe(
        "The schedule wasn't downloaded. Try again."
      );
    });

    it("prints a page per day from Daily View, and takes the printout away after", async () => {
      getVersions.mockResolvedValue(VERSIONS);
      openSchedule.mockImplementation(answerFor);
      const element = await render();
      expect(q(element, "c-shoresh-schedule-print")).toBeNull();
      let pagesWhilePrinting;
      window.print = jest.fn(() => {
        pagesWhilePrinting = q(element, "c-shoresh-schedule-print").pages;
      });
      q(element, '[data-id="print"]').click();
      await flush();
      expect(loadStyle).toHaveBeenCalledTimes(1);
      expect(loadStyle.mock.calls[0][1]).toContain("ShoreshPrint");
      expect(window.print).toHaveBeenCalledTimes(1);
      expect(pagesWhilePrinting.map((p) => p.title)).toEqual([
        "Monday, Jun 29",
        "Tuesday, Jun 30",
        "Wednesday, Jul 1"
      ]);
      const printout = q(element, "c-shoresh-schedule-print");
      expect(printout.week).toBe("Week 1");
      expect(printout.version).toBe("Before my changes");
      window.dispatchEvent(new CustomEvent("afterprint"));
      await flush();
      expect(q(element, "c-shoresh-schedule-print")).toBeNull();

      // Printing again doesn't load the style again.
      q(element, '[data-id="print"]').click();
      await flush();
      expect(loadStyle).toHaveBeenCalledTimes(1);
      expect(window.print).toHaveBeenCalledTimes(2);
    });

    it("prints a page per bunk from Group View", async () => {
      getVersions.mockResolvedValue(VERSIONS);
      openSchedule.mockImplementation(answerFor);
      const element = await render();
      q(element, '[data-view="group"]').click();
      await flush();
      let titles;
      window.print = jest.fn(() => {
        titles = q(element, "c-shoresh-schedule-print").pages.map(
          (p) => p.title
        );
      });
      q(element, '[data-id="print"]').click();
      await flush();
      expect(titles).toEqual(["Bunk 1", "Bunk 2"]);
    });

    it("still prints when the print style can't be loaded", async () => {
      getVersions.mockResolvedValue(VERSIONS);
      openSchedule.mockImplementation(answerFor);
      loadStyle.mockRejectedValueOnce(new Error("blocked"));
      const element = await render();
      q(element, '[data-id="print"]').click();
      await flush();
      expect(window.print).toHaveBeenCalledTimes(1);
    });

    // aria-disabled, not disabled, while under way: a focused button that turns disabled drops
    // the cursor to the top of the page.
    it("keep the cursor on Print while printing, and a second press does nothing", async () => {
      getVersions.mockResolvedValue(VERSIONS);
      openSchedule.mockImplementation(answerFor);
      const element = await render();
      let whilePrinting;
      window.print = jest.fn(() => {
        const button = q(element, '[data-id="print"]');
        whilePrinting = {
          disabled: button.disabled,
          busy: button.getAttribute("aria-disabled"),
          focused: element.shadowRoot.activeElement === button
        };
        button.click();
      });
      q(element, '[data-id="print"]').focus();
      q(element, '[data-id="print"]').click();
      await flush();
      expect(whilePrinting).toEqual({
        disabled: false,
        busy: "true",
        focused: true
      });
      expect(window.print).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new CustomEvent("afterprint"));
      await flush();
      const button = q(element, '[data-id="print"]');
      expect(button.getAttribute("aria-disabled")).toBe("false");
      expect(element.shadowRoot.activeElement).toBe(button);
    });

    it("keep the cursor on Export while the file is made, and a second press does nothing", async () => {
      getVersions.mockResolvedValue(VERSIONS);
      openSchedule.mockImplementation(answerFor);
      let finish;
      downloadWorkbook.mockImplementationOnce(
        () => new Promise((resolve) => (finish = resolve))
      );
      const element = await render();
      const button = q(element, '[data-id="export"]');
      button.focus();
      button.click();
      await flush();
      expect(button.disabled).toBe(false);
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(element.shadowRoot.activeElement).toBe(button);
      button.click();
      await flush();
      expect(downloadWorkbook).toHaveBeenCalledTimes(1);
      finish();
      await flush();
      expect(button.getAttribute("aria-disabled")).toBe("false");
      expect(element.shadowRoot.activeElement).toBe(button);
    });

    it("can't export or print a version with no days", async () => {
      getVersions.mockResolvedValue(VERSIONS);
      openSchedule.mockImplementation(({ scheduleId }) =>
        answerFor({ scheduleId }).then((v) => ({ ...v, days: [] }))
      );
      const element = await render();
      expect(q(element, '[data-id="no-days"]')).not.toBeNull();
      expect(q(element, '[data-id="export"]').disabled).toBe(true);
      expect(q(element, '[data-id="print"]').disabled).toBe(true);
    });
  });
});
