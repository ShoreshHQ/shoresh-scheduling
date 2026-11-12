import { buildTerms } from "c/shoreshTerms";
import { builtInRows } from "../builtIn";

describe("what Shoresh knew before you came, in camp words", () => {
  it("fits the article to the camp's word: An Edah, a Bunk (word walk W1)", () => {
    const t = buildTerms([
      { term: "Division", singular: "Edah", plural: "Edot", isCustom: true },
      { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
    ]);
    const words = JSON.stringify(builtInRows(t));
    expect(words).toContain("An Edah whose Bunks always move together");
    expect(words).toContain("A Bunk with no Edah beside ones with");
    expect(words).not.toContain("A Edah");
  });
});
