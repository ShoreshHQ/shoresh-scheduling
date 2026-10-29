// docs/import/names-and-divisions.md INGEST-2.9 and review.md INGEST-5.9: a group the file shows
// here only for the morning (or the afternoon) comes in Morning only (Afternoon only), and is
// listed under "Shoresh read these as" with All day. Made-up camp only.
import {
  buildProposal,
  planFor,
  questionCards,
  readAsGroups
} from "./data/engine";
import { csv, terms } from "./data/samples";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const BLOCKS = [
  "9:00-9:45",
  "10:00-10:45",
  "11:00-11:45",
  "12:00-12:45",
  "13:00-13:45",
  "14:00-14:45"
];
const LUNCH = 2;
/** The afternoon: blocks from noon (12:00-12:45 on). */
const PM = 3;
const GROUPS = ["Bunk 1", "Bunk 2", "Bunk 3", "Bunk 4"];
const ROTATION = ["Art", "Soccer", "Drama", "Music", "Archery", "Nature"];

function rotation(g, d, b) {
  if (b === LUNCH) return "Lunch";
  return ROTATION[(g + d + b) % ROTATION.length];
}

/** One file per day; cell(g, d, b) is what bunk g has on day d in block b ("" blank). */
function week(cell) {
  return DAYS.map((day, d) =>
    csv(`Camp ${day}.csv`, [
      ["Time", ...GROUPS],
      ...BLOCKS.map((b, bi) => [b, ...GROUPS.map((_, g) => cell(g, d, bi))])
    ])
  );
}

/** Bunks 1 and 2 go home after Lunch: their afternoon cells are blank. */
const halfDay = (g, d, b) => (g < 2 && b >= PM ? "" : rotation(g, d, b));

const propose = (files, answers = {}) =>
  buildProposal({ files, existing: null, terms, answers });

function availabilityOf(p, answers = {}) {
  const plan = planFor(p, null, "a0S000000000001", { answers });
  return Object.fromEntries(
    plan.groups.map((g) => [g.name, g.availability || "AllDay"])
  );
}

function partOfDay(p, answers = {}) {
  return readAsGroups(p, terms, questionCards(p, terms, answers)).find(
    (g) => g.key === "partOfDay"
  );
}

describe("INGEST-2.9: a group here for part of the day", () => {
  it("INGEST-2.9: a group blank every afternoon comes in Morning only, the others all day", () => {
    expect(availabilityOf(propose(week(halfDay)))).toEqual({
      "Bunk 1": "MorningOnly",
      "Bunk 2": "MorningOnly",
      "Bunk 3": "AllDay",
      "Bunk 4": "AllDay"
    });
  });

  it("INGEST-2.9: a group blank every morning comes in Afternoon only", () => {
    const late = (g, d, b) => (g === 3 && b < PM ? "" : rotation(g, d, b));
    expect(availabilityOf(propose(week(late)))["Bunk 4"]).toBe("AfternoonOnly");
  });

  it("INGEST-2.9: its blank afternoons are not gaps: an afternoon item for everyone there is fixed", () => {
    const rest = (g, d, b) => {
      return b === 4 && g >= 2 ? "Rest Hour" : halfDay(g, d, b);
    };
    const p = propose(week(rest));
    expect(p.fixed.map((f) => f.name)).toContain("Rest Hour");
  });

  it("INGEST-2.9 counter-case: blanks on only some afternoons change nothing", () => {
    // Bunk 1 has its afternoon on Monday and Tuesday only: an irregular gap, not a half day.
    const some = (g, d, b) => {
      return g === 0 && b >= PM && d >= 2 ? "" : rotation(g, d, b);
    };
    const p = propose(week(some));
    expect(availabilityOf(p)["Bunk 1"]).toBe("AllDay");
    expect(partOfDay(p)).toBeUndefined();
  });

  it("INGEST-2.9 counter-case: an afternoon no group has anything read in shows no one away", () => {
    const allMorning = (g, d, b) => {
      return b >= PM ? "" : rotation(g, d, b);
    };
    expect(Object.values(availabilityOf(propose(week(allMorning))))).toEqual([
      "AllDay",
      "AllDay",
      "AllDay",
      "AllDay"
    ]);
  });

  it("INGEST-2.9 counter-case: a group in the files on one day only is not read", () => {
    const once = (g, d, b) => {
      return g === 0 && (b >= PM || d > 0) ? "" : rotation(g, d, b);
    };
    expect(availabilityOf(propose(week(once)))["Bunk 1"]).toBe("AllDay");
  });
});

describe("INGEST-2.9 counter-case: blanks that do not start at the afternoon", () => {
  it("INGEST-2.9 counter-case: a group at Lunch at noon, blank after it, is not read: Morning only would drop its Lunch", () => {
    const lunchAtNoon = (g, d, b) => {
      if (b === PM) return "Lunch";
      if (b === LUNCH) return ROTATION[(g + d) % ROTATION.length];
      return g < 2 && b > PM ? "" : rotation(g, d, b);
    };
    expect(availabilityOf(propose(week(lunchAtNoon)))["Bunk 1"]).toBe("AllDay");
  });
});

describe("INGEST-5.9: listed under Shoresh read these as", () => {
  it("INGEST-5.9: listed as here part of the day, with Morning only pressed and All day", () => {
    const group = partOfDay(propose(week(halfDay)));
    expect(group.label).toBe("2 groups here part of the day");
    expect(group.lines.map((l) => [l.name, l.answer])).toEqual([
      ["Bunk 1", "MorningOnly"],
      ["Bunk 2", "MorningOnly"]
    ]);
    expect(group.lines[0].options).toEqual([
      { value: "MorningOnly", label: "Morning only" },
      { value: "AllDay", label: "All day" }
    ]);
  });

  it("INGEST-5.9: All day makes it all day, and the save remembers it", () => {
    const files = week(halfDay);
    const id = partOfDay(propose(files)).lines[0].id;
    const answers = { [id]: "AllDay" };
    const after = propose(files, answers);
    expect(availabilityOf(after, answers)["Bunk 1"]).toBe("AllDay");
    expect(partOfDay(after, answers).lines[0].answer).toBe("AllDay");
    const plan = planFor(after, null, "a0S000000000001", { answers });
    expect(plan.remember).toContainEqual({ key: id, answer: "AllDay" });
  });
});
