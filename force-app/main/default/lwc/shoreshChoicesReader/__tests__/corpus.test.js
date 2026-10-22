// The reader against the synthetic corpus (docs/samples/choices): every sheet read from its file
// bytes, compared in full with what the generator says is in it. The number that must be zero is
// "silently wrong": a sheet read differently from what it holds (desktop ADR
// 2026-09-27-elective-preference-etl §8). Exact comparison makes any wrong reading a failure.
import { readChoices } from "c/shoreshChoicesReader";
import { asStated, corpusFrom, expected } from "./data/corpus";

const { manifest, names, sheetFile } = corpusFrom(__dirname);

describe("the synthetic choices corpus", () => {
  it("has 20 to 30 sheets, each of its own shape", () => {
    expect(manifest.length).toBeGreaterThanOrEqual(20);
    expect(manifest.length).toBeLessThanOrEqual(30);
    expect(new Set(manifest.map((m) => m.shape)).size).toBe(manifest.length);
  });

  it("covers every shape the reader is built for", () => {
    const shapes = manifest.map((m) => m.shape).join("\n");
    for (const word of [
      "ranked columns",
      "one row per choice",
      "two-row heading",
      "division only",
      "bunk",
      "blank rows",
      "comments",
      "opt-out",
      "per period",
      "planner",
      "menu",
      "one cell",
      "share a name"
    ]) {
      expect(shapes).toContain(word);
    }
  });

  // Desktop ADR §8.0 clause 4: no gate can spot a real child's name in a file, so this test is the
  // control. Every camper name the corpus states, and every name the reader finds, is made up.
  it("names only made-up campers", () => {
    const madeUp = new Set(
      names.first.flatMap((f) => names.last.map((l) => `${f} ${l}`))
    );
    for (const entry of manifest) {
      const reading = readChoices(sheetFile(entry.file));
      const all = [
        ...entry.campers.map((c) => c.name),
        ...entry.cantTellApart.map((c) => c.name),
        ...reading.campers.map((c) => c.name),
        ...reading.cantTellApart.map((c) => c.name)
      ];
      for (const name of all) {
        expect(madeUp.has(name)).toBe(true);
      }
    }
  });
});

describe.each(manifest.map((m) => [m.file, m]))("%s", (file, entry) => {
  it(`reads ${entry.shape} exactly`, () => {
    expect(asStated(readChoices(sheetFile(file)))).toEqual(expected(entry));
  });
});

describe("the whole corpus", () => {
  it("has no sheet read silently wrong", () => {
    const wrong = manifest.filter(
      (entry) =>
        JSON.stringify(asStated(readChoices(sheetFile(entry.file)))) !==
        JSON.stringify(expected(entry))
    );
    expect(wrong.map((e) => e.file)).toEqual([]);
  });

  it("reads the same file the same way every time", () => {
    for (const entry of manifest) {
      expect(readChoices(sheetFile(entry.file))).toEqual(
        readChoices(sheetFile(entry.file))
      );
    }
  });
});
