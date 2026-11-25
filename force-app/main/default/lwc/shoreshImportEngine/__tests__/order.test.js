// The import engine's one order for text (INGEST-5.12): never the browser's language.
import { compareNames, compareNumbered } from "../order";

describe("the import engine's order for text", () => {
  it("INGEST-5.12: numbers by value, capitals aside, and the same order whichever way the list starts", () => {
    const groups = ["Bunk 10", "bunk 1", "Bunk 2", "Bunk 02", "Bunk 1"];
    const sorted = [...groups].sort(compareNumbered);
    expect(sorted).toEqual([
      "Bunk 1",
      "bunk 1",
      "Bunk 02",
      "Bunk 2",
      "Bunk 10"
    ]);
    expect([...groups].reverse().sort(compareNumbered)).toEqual(sorted);
    expect(["Week 10", "Week 2", "Week 1"].sort(compareNumbered)).toEqual([
      "Week 1",
      "Week 2",
      "Week 10"
    ]);
    const names = ["שירה", "Zumba", "arts", "Ärt", "Arts"];
    expect([...names].sort(compareNames)).toEqual([
      "Arts",
      "arts",
      "Zumba",
      "Ärt",
      "שירה"
    ]);
    expect([...names].reverse().sort(compareNames)).toEqual(
      [...names].sort(compareNames)
    );
  });
});
