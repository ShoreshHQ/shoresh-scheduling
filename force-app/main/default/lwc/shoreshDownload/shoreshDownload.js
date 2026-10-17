/**
 * Saves sheets as an Excel file in the browser (slice 4c part C), with SheetJS (the static
 * resource, loaded only when a file is saved). sheets: [{ name, rows }], rows already in the
 * import's layout and guarded against spreadsheet formulas (c/shoreshLists export.js).
 */
import { loadScript } from "lightning/platformResourceLoader";
import SHEETJS from "@salesforce/resourceUrl/SheetJS";
import { sheetName } from "c/shoreshLists";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function downloadWorkbook(component, sheets, fileName) {
  await loadScript(component, SHEETJS);
  // SheetJS puts itself on window when its script runs.
  const XLSX = window.XLSX;
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      sheetName(name)
    );
  });
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const link = document.createElement("a");
  link.href = `data:${XLSX_TYPE};base64,${base64}`;
  link.download = fileName;
  link.click();
}

/** A file name from a title: no characters a computer's file names refuse. */
export function fileNameOf(title) {
  const clean = String(title)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${clean}.xlsx`;
}
