import { buildTerms, guessPlural } from "c/shoreshTerms";

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

describe("guessPlural (Camp words, wiki decision 56)", () => {
  it("adds s, es after s, x, z, ch and sh, and ies after a consonant and y", () => {
    expect(guessPlural("Bunk")).toBe("Bunks");
    expect(guessPlural("Chug")).toBe("Chugs");
    expect(guessPlural("Class")).toBe("Classes");
    expect(guessPlural("Box")).toBe("Boxes");
    expect(guessPlural("Lunch")).toBe("Lunches");
    expect(guessPlural("Activity")).toBe("Activities");
    expect(guessPlural("Day")).toBe("Days");
    expect(guessPlural("  Period ")).toBe("Periods");
  });

  it("gives the standard word its own plural, starting as typed", () => {
    expect(guessPlural("Seats", "Seats", "Seats")).toBe("Seats");
    expect(guessPlural("Activity", "Activity", "Activities")).toBe(
      "Activities"
    );
    expect(guessPlural("activity", "Activity", "Activities")).toBe(
      "activities"
    );
    expect(guessPlural("Unit", "Division", "Divisions")).toBe("Units");
  });

  it("keeps the word unchanged when the standard word is the same in the plural", () => {
    expect(guessPlural("Spots", "Seats", "Seats")).toBe("Spots");
    expect(guessPlural("Spaces", "Seats", "Seats")).toBe("Spaces");
    expect(guessPlural("Max at once", "Groups at once", "Groups at once")).toBe(
      "Max at once"
    );
    expect(guessPlural("Per week", "Times per week", "Times per week")).toBe(
      "Per week"
    );
    expect(guessPlural("Open slots", "Availability", "availability")).toBe(
      "Open slots"
    );
  });

  it("guesses nothing for nothing", () => {
    expect(guessPlural("")).toBe("");
    expect(guessPlural("   ")).toBe("");
    expect(guessPlural(undefined)).toBe("");
  });
});
