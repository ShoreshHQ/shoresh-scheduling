// Excel and Print on Manual Build and Generated Schedule (PUB-6.6): the same menus as the
// Schedules page, for the week on screen, a special day printed as its own schedule. Synthetic
// data only.
import { createElement } from "lwc";
import ShoreshWeekEditor from "c/shoreshWeekEditor";
import { buildTerms } from "c/shoreshTerms";
import { downloadWorkbook } from "c/shoreshDownload";
import { nsRecord } from "shoresh-jest/namespace";
import { GROUPS, draft } from "./data/draftFixture";
import { flush } from "shoresh-jest/flush";

jest.mock("c/shoreshDownload", () => ({
  downloadWorkbook: jest.fn(() => Promise.resolve()),
  fileNameOf: (title) => `${title}.xlsx`
}));

const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];
const SETUP = { activities: [], locations: [] };
const VISITING_DAY = {
  dateValue: "2026-06-30",
  specialDayId: "sd1",
  name: "Visiting Day",
  notes: "Families 10:30 to 3:00",
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

function render(props = {}) {
  const element = createElement("c-shoresh-week-editor", {
    is: ShoreshWeekEditor
  });
  Object.assign(element, {
    terms: buildTerms(LABELS),
    setup: nsRecord(SETUP),
    weekName: "Week 1",
    programName: "Main",
    saveRuns: jest.fn(),
    printName: "Manual Build",
    ...props
  });
  document.body.appendChild(element);
  element.show({ ...draft(), specials: { days: [VISITING_DAY] } }, true);
  return flush().then(() => element);
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const out = (element) => q(element, '[data-id="out"]');
const menu = (element, id) =>
  out(element).shadowRoot.querySelector(`[data-id="${id}"]`);
const choose = (element, id, detail) =>
  menu(element, id).dispatchEvent(new CustomEvent("choose", { detail }));

describe("c-shoresh-week-editor: Excel and Print", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.print;
  });

  it("puts Excel and Print on the rail before Versions and Publish", async () => {
    const element = await render();
    const right = q(element, ".side_right");
    expect(right.querySelector('[data-id="out"]')).toBe(out(element));
    expect(menu(element, "print").choices.map((c) => c.kind)).toEqual([
      "week",
      "day",
      "group"
    ]);
    expect(menu(element, "print").disabled).toBe(false);
  });

  it("prints the week on screen, a special day as its own schedule, named for the screen", async () => {
    const element = await render();
    let printed;
    window.print = jest.fn(() => {
      printed = out(element).shadowRoot.querySelector(
        "c-shoresh-schedule-print"
      );
    });
    choose(element, "print", { kind: "week" });
    await flush();
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(printed.pages.map((p) => p.title)).toEqual([
      "Monday, Jun 29",
      "Tuesday, Jun 30 · Visiting Day"
    ]);
    expect(printed.pages[1].notes).toBe("Families 10:30 to 3:00");
    expect(printed.week).toBe("Week 1");
    expect(printed.version).toBe("Manual Build");
  });

  it("downloads one bunk's week, its file named for the week, screen and bunk", async () => {
    const element = await render();
    choose(element, "export", { kind: "group", key: "g2" });
    await flush();
    const [, sheets, fileName] = downloadWorkbook.mock.calls[0];
    expect(sheets.map((s) => s.name)).toEqual(["Bunk 2"]);
    expect(fileName).toBe("Week 1 - Manual Build - Bunk 2.xlsx");
  });

  it("says a download that failed on the screen's own error line", async () => {
    downloadWorkbook.mockRejectedValueOnce(new Error("XLSX is not defined"));
    const element = await render();
    const said = jest.fn();
    element.addEventListener("errorchange", (e) => said(e.detail.message));
    choose(element, "export", { kind: "week" });
    await flush();
    expect(said).toHaveBeenCalledWith(
      expect.stringMatching(
        /^The schedule wasn't downloaded\. Try again\. For support: [A-Z0-9]{3}-[A-Z0-9]{3}\.$/
      )
    );
  });

  it("is not on a special day's own schedule, nor on a screen that doesn't name itself", async () => {
    expect(out(await render({ planName: "Visiting Day" }))).toBeNull();
    document.body.removeChild(document.body.firstChild);
    expect(out(await render({ printName: undefined }))).toBeNull();
  });
});
