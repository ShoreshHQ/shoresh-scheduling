import { buildTerms } from "c/shoreshTerms";

const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  {
    term: "TimeBlock",
    singular: "Time block",
    plural: "Time blocks",
    isCustom: false
  },
  { term: "Season", singular: "Season", plural: "Seasons", isCustom: false }
];

describe("buildTerms", () => {
  it("uses the camp word where there is one", () => {
    const t = buildTerms(LABELS);
    expect(t.s("Group")).toBe("Bunk");
    expect(t.p("Group")).toBe("Bunks");
    expect(t.sIn("Group")).toBe("Bunk");
  });

  it("puts model terms in lower case inside a sentence", () => {
    const t = buildTerms(LABELS);
    expect(t.s("TimeBlock")).toBe("Time block");
    expect(t.pIn("TimeBlock")).toBe("time blocks");
  });

  it("shows something sensible before labels arrive", () => {
    const t = buildTerms(undefined);
    expect(t.s("Week")).toBe("Week");
    expect(t.p("Week")).toBe("Weeks");
    expect(t.sIn("Week")).toBe("week");
    expect(t.p("TimeBlock")).toBe("Time blocks");
  });
});
