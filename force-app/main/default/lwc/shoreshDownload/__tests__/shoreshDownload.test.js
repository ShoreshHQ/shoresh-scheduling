// Saving sheets as an Excel file: the file holds the sheets as given, and reads back.
import * as XLSX from "xlsx";
import { downloadWorkbook, fileNameOf } from "c/shoreshDownload";

describe("c-shoresh-download", () => {
  let clicked;
  beforeEach(() => {
    window.XLSX = XLSX;
    clicked = [];
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function click() {
        clicked.push({ href: this.href, download: this.download });
      });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete window.XLSX;
  });

  it("saves the sheets, named as given, with the rows as given", async () => {
    await downloadWorkbook(
      {},
      [
        {
          name: "Activities",
          rows: [
            ["Activity", "Length"],
            ["Swim", 2]
          ]
        },
        { name: "Runs in: weeks?", rows: [["Kind"]] }
      ],
      fileNameOf("Activities - Summer 2027")
    );
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("Activities - Summer 2027.xlsx");
    const base64 = clicked[0].href.split("base64,")[1];
    const wb = XLSX.read(base64, { type: "base64" });
    expect(wb.SheetNames).toEqual(["Activities", "Runs in  weeks"]);
    expect(
      XLSX.utils.sheet_to_json(wb.Sheets.Activities, { header: 1 })
    ).toEqual([
      ["Activity", "Length"],
      ["Swim", 2]
    ]);
  });

  it("file names leave out what computers refuse", () => {
    expect(fileNameOf('Bunks: "Week 1/2"')).toBe("Bunks Week 1 2.xlsx");
  });
});
