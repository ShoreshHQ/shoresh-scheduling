/**
 * The Excel file's bytes and name, worked out the same way wherever the file is saved: in the
 * browser (shoreshDownload.js) and by the connector on the person's own computer (API-1.86 to
 * API-1.89). XLSX: SheetJS. sheets: [{ name, rows, widths }], rows already guarded against
 * spreadsheet formulas; widths (optional): each column's width in characters.
 */
import { sheetName } from "c/shoreshLists";

export function workbookBytes(XLSX, sheets) {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(({ name, rows, widths }) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    if (widths) {
      sheet["!cols"] = widths.map((wch) => ({ wch }));
    }
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName(name));
  });
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

/** A file name from a title: no characters a computer's file names refuse. */
export function fileNameOf(title) {
  const clean = String(title)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${clean || "Shoresh"}.xlsx`;
}
