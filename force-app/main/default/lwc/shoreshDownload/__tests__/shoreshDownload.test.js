// Saving sheets as an Excel file: the file holds the sheets as given, and reads back.
import * as XLSX from "xlsx";
import { downloadWorkbook, fileNameOf } from "c/shoreshDownload";

describe("c-shoresh-download", () => {
  let clicked;
  let blobs;
  let revoked;
  beforeEach(() => {
    jest.useFakeTimers();
    window.XLSX = XLSX;
    clicked = [];
    blobs = new Map();
    revoked = [];
    // jsdom has no object URLs: a stand-in that keeps each Blob by its URL.
    URL.createObjectURL = (blob) => {
      const url = `blob:test/${blobs.size + 1}`;
      blobs.set(url, blob);
      return url;
    };
    URL.revokeObjectURL = (url) => revoked.push(url);
    jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function click() {
        clicked.push({ href: this.href, download: this.download });
      });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete window.XLSX;
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });

  /** The workbook a saved link points at. */
  async function workbookAt(href) {
    const blob = blobs.get(href);
    const bytes = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.readAsArrayBuffer(blob);
    });
    return { wb: XLSX.read(bytes, { type: "array" }), type: blob.type };
  }

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
    const { wb, type } = await workbookAt(clicked[0].href);
    expect(type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    // Let go of once the browser has the file.
    expect(revoked).toEqual([]);
    jest.runAllTimers();
    expect(revoked).toEqual([clicked[0].href]);
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
