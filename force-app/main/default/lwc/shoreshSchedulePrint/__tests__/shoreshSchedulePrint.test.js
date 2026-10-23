// The printout: a page per day, group or activity, a plain table each; and the page style that
// leaves only it on the paper. Made-up data.
import { createElement } from "lwc";
import ShoreshSchedulePrint from "c/shoreshSchedulePrint";
import { printPages } from "c/shoreshScheduleExport";
import { buildTerms } from "c/shoreshTerms";
import {
  LABELS,
  opened
} from "../../shoreshScheduleViews/__tests__/data/scheduleFixture";

const fs = require("fs");
const path = require("path");

const t = buildTerms(LABELS);

function render(viewKey = "day") {
  const element = createElement("c-shoresh-schedule-print", {
    is: ShoreshSchedulePrint
  });
  element.pages = printPages(
    opened(),
    viewKey,
    [{ Id: "a1", Name: "Swim" }],
    t
  );
  element.week = "Week 1";
  element.version = "Imported from sample-week.xlsx";
  element.corner = "Time block";
  document.body.appendChild(element);
  return element;
}

const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

describe("c-shoresh-schedule-print", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("prints a page per day, each titled, with the week and the version", async () => {
    const element = render("day");
    const pages = qa(element, "section.page");
    expect(pages.map((p) => p.querySelector(".title").textContent)).toEqual([
      "Monday, Jun 29",
      "Tuesday, Jun 30",
      "Wednesday, Jul 1"
    ]);
    expect(pages[0].querySelector(".sub").textContent).toBe(
      "Week 1 · Imported from sample-week.xlsx"
    );
    await expect(element).toBeAccessible();
  });

  it("is a real table: bunks across, time blocks down, a long activity spanning its rows", () => {
    const element = render("day");
    const monday = qa(element, "section.page")[0];
    const heads = [...monday.querySelectorAll("thead th")].map((th) =>
      th.textContent.trim()
    );
    expect(heads).toEqual(["Time block", "Bunk 1", "Bunk 2"]);
    const rows = [...monday.querySelectorAll("tbody tr")];
    expect(rows[0].querySelector("th").getAttribute("scope")).toBe("row");
    const swim = rows[0].querySelector("td");
    expect(swim.textContent.trim()).toBe("Swim");
    expect(swim.getAttribute("rowspan")).toBe("2");
    // Under Swim, only Bunk 2's cell.
    expect(rows[1].querySelectorAll("td")).toHaveLength(1);
  });

  it("says a day that can't be read can't be shown, in place of its table", () => {
    const element = render("day");
    const wednesday = qa(element, "section.page")[2];
    expect(wednesday.querySelector("table")).toBeNull();
    expect(wednesday.querySelector(".problem").textContent).toBe(
      "Can't be shown"
    );
  });

  it("prints a special day's notes under its schedule, and says when it has none yet (ADR 0014 slice 5)", async () => {
    const element = createElement("c-shoresh-schedule-print", {
      is: ShoreshSchedulePrint
    });
    element.pages = [
      {
        key: "day-0",
        title: "Tuesday, Jun 30 · Field Day",
        table: null,
        notes: "Wear blue",
        empty: "Field Day has no schedule yet."
      }
    ];
    element.week = "Week 1";
    element.version = "Published schedule";
    element.corner = "Time block";
    document.body.appendChild(element);
    const page = qa(element, "section.page")[0];
    expect(page.querySelector(".problem").textContent).toBe(
      "Field Day has no schedule yet."
    );
    expect(page.querySelector('[data-id="print-notes"]').textContent).toBe(
      "Wear blue"
    );
    await expect(element).toBeAccessible();
  });

  it("prints a page per bunk from Group View", () => {
    const element = render("group");
    expect(
      qa(element, "section.page").map(
        (p) => p.querySelector(".title").textContent
      )
    ).toEqual(["Bunk 1", "Bunk 2"]);
  });

  it("takes no room on screen and is black on white on paper, a page each", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "../shoreshSchedulePrint.css"),
      "utf8"
    );
    const [screen, paper] = css.split("@media print");
    expect(screen).toMatch(/\.shoresh-print\s*\{\s*display:\s*none;/);
    expect(paper).toMatch(/color:\s*#000/);
    expect(paper).toMatch(/background:\s*#fff/);
    expect(paper).toMatch(/break-after:\s*page/);
  });

  describe("the ShoreshPrint page style", () => {
    const css = fs
      .readFileSync(
        path.join(__dirname, "../../../staticresources/ShoreshPrint.css"),
        "utf8"
      )
      .replace(/\/\*[\s\S]*?\*\//g, "");

    it("changes nothing on screen: every rule is for paper, or the printout's own page size", () => {
      const outside = css
        .replace(/@media print\s*\{([\s\S]*?\}\s*)\}/, "")
        .replace(/@page shoresh-schedule\s*\{[^}]*\}/, "")
        .trim();
      expect(outside).toBe("");
    });

    it("reaches only a page with a printout on it, so other Salesforce pages print as before", () => {
      const inner = css.match(/@media print\s*\{([\s\S]*)\}\s*@page/)[1];
      const selectors = [...inner.matchAll(/([^{}]+)\{[^}]*\}/g)].flatMap((m) =>
        m[1].split(",").map((x) => x.trim())
      );
      expect(selectors.length).toBeGreaterThan(0);
      selectors.forEach((selector) =>
        expect(selector).toMatch(/^body:has\(\.shoresh-print\)/)
      );
    });
  });
});
