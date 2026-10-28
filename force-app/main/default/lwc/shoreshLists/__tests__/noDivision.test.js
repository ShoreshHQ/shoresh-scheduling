// DIV-1.1: a group in no division is held in a division record flagged NoDivision__c. Lists and
// the camp workbook never show that record as a division: the group has no division there.
import * as XLSX from "xlsx";
import { buildTerms } from "c/shoreshTerms";
import { workbookFile } from "c/shoreshImportEngine";
import { nsRecord } from "shoresh-jest/namespace";
import { whoTargets } from "../who";
import {
  campWorkbookSheets,
  listPlan,
  listProposal,
  listRows,
  sheetName
} from "./data/lists";
import { camp } from "./data/camp";

function held() {
  const setup = camp();
  setup.programs[0].divisions.push({
    division: { Id: "d9", Name: "Tent 1", NoDivision__c: true },
    groups: [{ Id: "g9", Name: "Tent 1", Availability__c: "AllDay" }]
  });
  return setup;
}
const terms = buildTerms(camp().labels);

describe("a group in no division in lists (DIV-1.1)", () => {
  // DIV-1.1
  it("the divisions list never names a holding record", () => {
    const rows = listRows("divisions", held(), terms);
    expect(rows.flat()).not.toContain("Tent 1");
  });

  // DIV-1.1
  it("the groups list shows the group with no division", () => {
    const rows = listRows("groups", held(), terms);
    const tent = rows.find((r) => r.includes("Tent 1"));
    expect(tent.filter((c) => c === "Tent 1")).toEqual(["Tent 1"]);
  });

  // DIV-1.1
  it("who lists name the group alone, never its holding record", () => {
    const setup = held();
    const { byId } = whoTargets(nsRecord(setup));
    expect(byId.has("d9")).toBe(false);
    expect(byId.get("g9").spellings).toEqual(["Tent 1", "Tent 1 (Main)"]);
  });

  // DIV-1.1
  it("the camp workbook writes the group with no division", () => {
    const sheets = campWorkbookSheets(held(), terms);
    const cells = sheets
      .flatMap((s) => s.rows)
      .filter((r) => r.includes("Tent 1"));
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((r) =>
      expect(r.filter((c) => c === "Tent 1")).toEqual(["Tent 1"])
    );
  });

  // DIV-1.1
  it("the groups list reads back with no changes", () => {
    const rows = listRows("groups", held(), terms);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows),
      sheetName("List")
    );
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const file = workbookFile(XLSX, "camp.xlsx", new Uint8Array(data));
    const p = listProposal({
      screenKey: "groups",
      file,
      setup: held(),
      terms,
      answers: {}
    });
    expect(p.rows.filter((r) => r.status !== "unchanged")).toEqual([]);
  });

  const fileOf = (rows) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows),
      sheetName("List")
    );
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return workbookFile(XLSX, "camp.xlsx", new Uint8Array(data));
  };

  /** The groups list with a new Tent 1 row whose division cell is `cell`. */
  const withTent = (setup, cell) => {
    const rows = listRows("groups", setup, terms);
    const tent = [...rows[1]];
    tent[rows[0].indexOf("Unit")] = cell;
    tent[rows[0].indexOf("Bunk")] = "Tent 1";
    const p = listProposal({
      screenKey: "groups",
      file: fileOf([...rows, tent]),
      setup,
      terms,
      answers: {}
    });
    return { p, row: p.rows.find((r) => r.name === "Tent 1") };
  };
  const expectInNone = ({ p, row }) => {
    expect([row.status, row.problems]).toEqual(["new", []]);
    const plan = listPlan(p, {}, "s1", "camp.xlsx");
    const holder = plan.records.find((r) => r.kind === "Division");
    expect(holder.fields).toEqual({ Name: "Tent 1", NoDivision__c: true });
    const group = plan.records.find(
      (r) => r.kind === "Group" && r.fields.Name === "Tent 1"
    );
    expect(group.refs.Division__c).toBe(holder.key);
  };

  // DIV-1.1
  ["No division", "No Unit"].forEach((cell) => {
    it(`a new group written "${cell}" is added in no division`, () => {
      expect.hasAssertions();
      expectInNone(withTent(camp(), cell));
    });
  });

  // DIV-1.1
  it("a new group with a blank division, where the program has divisions, can't be used", () => {
    const { row } = withTent(camp(), "");
    expect(row.problems).toEqual(["Unit is blank"]);
  });

  // DIV-1.1
  it("a new group with a blank division, where the program has none, is added in no division", () => {
    const setup = camp();
    setup.programs[0].divisions = [
      {
        division: { Id: "d9", Name: "Bunk 1", NoDivision__c: true },
        groups: [{ Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" }]
      }
    ];
    expect.hasAssertions();
    expectInNone(withTent(setup, ""));
  });
});
