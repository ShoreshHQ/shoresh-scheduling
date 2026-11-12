import {
  article,
  buildTerms,
  capital,
  guessPlural,
  shortDate,
  SHORT_DAYS
} from "c/shoreshTerms";

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

// CORE-1.34
describe("a word the camp left standard follows the camp's word it belongs to", () => {
  const camp = (rows) =>
    buildTerms([
      ...rows,
      {
        term: "ElectiveSet",
        singular: "Elective set",
        plural: "Elective sets",
        isCustom: false
      },
      {
        term: "GroupsThatFit",
        singular: "Groups that fit",
        plural: "Groups that fit",
        isCustom: false
      },
      {
        term: "GroupsAtOnce",
        singular: "Groups at once",
        plural: "Groups at once",
        isCustom: false
      }
    ]);

  it("Elective set reads as the camp's Elective words, Groups that fit as its Group plural", () => {
    const t = camp([
      { term: "Elective", singular: "Chug", plural: "Chugim", isCustom: true },
      { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
    ]);
    expect(t.s("ElectiveSet")).toBe("Chug");
    expect(t.p("ElectiveSet")).toBe("Chugim");
    expect(t.pIn("ElectiveSet")).toBe("Chugim");
    expect(t.s("GroupsThatFit")).toBe("Bunks that fit");
    expect(t.p("GroupsAtOnce")).toBe("Bunks at once");
  });

  it("keeps the standard words while the camp's word is standard, and the camp's own when it set one", () => {
    const t = camp([]);
    expect(t.s("ElectiveSet")).toBe("Elective set");
    expect(t.pIn("GroupsThatFit")).toBe("groups that fit");
    const own = buildTerms([
      { term: "Elective", singular: "Chug", plural: "Chugim", isCustom: true },
      {
        term: "ElectiveSet",
        singular: "Block",
        plural: "Blocks",
        isCustom: true
      }
    ]);
    expect(own.p("ElectiveSet")).toBe("Blocks");
  });
});

// CORE-1.35
describe("one plural rule before the camp words load", () => {
  it("adds es after s, x, z, ch and sh, keeps the same-in-plural words, and says Seat / Seats", () => {
    const t = buildTerms(undefined);
    expect(t.s("Seats")).toBe("Seat");
    expect(t.p("Seats")).toBe("Seats");
    expect(t.p("Station")).toBe("Stations");
    expect(t.p("Activity")).toBe("Activities");
    expect(t.p("Day")).toBe("Days");
    expect(t.p("Lunch")).toBe("Lunches");
    expect(t.p("TimesPerWeek")).toBe("Times per week");
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
    expect(guessPlural("Seat", "Seat", "Seats")).toBe("Seats");
    // CORE-1.35: the camp's "Spot" for Seat guesses "Spots" (word walk W1).
    expect(guessPlural("Spot", "Seat", "Seats")).toBe("Spots");
    expect(guessPlural("Activity", "Activity", "Activities")).toBe(
      "Activities"
    );
    expect(guessPlural("activity", "Activity", "Activities")).toBe(
      "activities"
    );
    expect(guessPlural("Unit", "Division", "Divisions")).toBe("Units");
  });

  it("keeps the word unchanged when the standard word is the same in the plural", () => {
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

describe("small words", () => {
  it("says a or an, starts with a capital, and shortens a day", () => {
    expect(article("activity")).toBe("an activity");
    expect(article("group")).toBe("a group");
    expect(capital("swim")).toBe("Swim");
    expect(SHORT_DAYS.Wednesday).toBe("Wed");
  });
});

describe("shortDate", () => {
  // CORE-6.10
  it("reads month first: a calendar day as it is, a moment as the day it was here", () => {
    expect(shortDate("2026-07-03")).toBe("Jul 3");
    expect(shortDate("2026-10-14")).toBe("Oct 14");
    expect(shortDate(new Date(2026, 9, 14, 12).toISOString())).toBe("Oct 14");
  });

  it("says nothing for what it can't read", () => {
    for (const value of [
      null,
      undefined,
      "",
      "bad",
      "2026-13-03",
      "2026-07-00"
    ]) {
      expect(shortDate(value)).toBe("");
    }
  });
});
