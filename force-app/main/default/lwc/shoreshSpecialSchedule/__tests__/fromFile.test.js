// One special day's or event's schedule from a file (ADR 0014 choice 17): the import's own reader
// gives pages, and the first page becomes time blocks down and columns across. Made-up files.
import { csvFile } from "c/shoreshImportEngine";
import { pagesOf, planFromPage } from "../fromFile";

const SPORTS_DAY = [
  "Time,1st Grade,3rd-4th,5th-6th",
  "9:00-9:45,Opening ceremony,Opening ceremony,Opening ceremony",
  "Relays 9:50-11:20,Swim (Pool),Soccer,",
  "Lunch 11:30,Lunch,Lunch,Lunch",
  "12:30-1:30,Banner painting,Song writing,Banner painting",
  "Period 5,Free,Free,Free"
].join("\n");

describe("planFromPage", () => {
  it("reads time blocks down and columns across, each cell's name", () => {
    const pages = pagesOf(csvFile("Sports Day.csv", SPORTS_DAY));
    expect(pages).toHaveLength(1);
    const { imported, noTimes, places } = planFromPage(pages[0]);
    expect(imported.blocks).toEqual([
      { name: "", startTime: "09:00", endTime: "09:45" },
      { name: "Relays", startTime: "09:50", endTime: "11:20" },
      // Only its start is written: it ends where the next one starts.
      { name: "Lunch", startTime: "11:30", endTime: "12:30" },
      { name: "", startTime: "12:30", endTime: "13:30" }
    ]);
    expect(imported.columns.map((c) => c.name)).toEqual([
      "1st Grade",
      "3rd-4th",
      "5th-6th"
    ]);
    expect(imported.columns[0].cells).toEqual([
      "Opening ceremony",
      "Swim",
      "Lunch",
      "Banner painting"
    ]);
    expect(imported.columns[2].cells[1]).toBe("");
    // Nothing left out quietly: a row with no time, and a place written in a cell.
    expect(noTimes).toEqual(["Period 5"]);
    expect(places).toBe(1);
  });

  it("a cell merged down the rows carries on into them", () => {
    const page = {
      columns: ["Blue", "Gold"],
      rows: [
        { label: "9:00-9:45", cells: ["Opening", "Opening"], spans: [2, 1] },
        { label: "9:45-10:30", cells: ["", "Relay"], spans: [1, 1] },
        { label: "10:30-11:00", cells: ["Swim", ""], spans: [1, 1] }
      ]
    };
    const { imported } = planFromPage(page);
    expect(imported.columns[0].cells).toEqual(["Opening", "^", "Swim"]);
    expect(imported.columns[1].cells).toEqual(["Opening", "Relay", ""]);
  });

  it("a merged cell whose first row has no time doesn't carry into the next", () => {
    const page = {
      columns: ["Blue"],
      rows: [
        { label: "Period 1", cells: ["Opening"], spans: [2] },
        { label: "9:45-10:30", cells: [""], spans: [1] }
      ]
    };
    const { imported, noTimes } = planFromPage(page);
    expect(noTimes).toEqual(["Period 1"]);
    expect(imported.columns[0].cells).toEqual([""]);
  });
});
