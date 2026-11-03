// Child lists read as Salesforce's own JSON (the connector's) come wrapped as { records: [...] }.
import { buildTerms } from "c/shoreshTerms";
import { CHILDREN } from "c/shoreshSchema";
import { campWorkbookSheets } from "./data/lists";
import { camp } from "./data/camp";

const LISTS = [
  CHILDREN.Activity.Eligibilities,
  CHILDREN.RecurringActivity.Coverages
];

/** The same setup with every who list wrapped as Salesforce's JSON wraps it. */
function wrapped(value) {
  if (Array.isArray(value)) return value.map(wrapped);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      LISTS.includes(k) && Array.isArray(v)
        ? { totalSize: v.length, done: true, records: v.map(wrapped) }
        : wrapped(v)
    ])
  );
}

describe("download setup with who lists wrapped as { records }", () => {
  it("writes the same workbook as with plain lists", () => {
    const s = camp();
    const terms = buildTerms(s.labels);
    expect(campWorkbookSheets(wrapped(s), terms)).toEqual(
      campWorkbookSheets(s, terms)
    );
  });
});
