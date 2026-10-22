// Rules Shoresh guessed are marked for a look (Greg, decision 45; ADR 0006 §21). The plan names
// what this import worked out rather than read outright, as the desktop marks it
// (src/utils/ruleProvenance.js, LocationsScreen.jsx, GroupsScreen.jsx): a new activity's times a
// week and who can do it, a new place's groups that fit, and a new group's division when only
// its file's name gave it. The server stores each with the value it saved (Apex SetupGuesses).
import { buildProposal, planFor, questionCards } from "./data/engine";
import { csv, existingSetup, program, terms } from "./data/samples";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const BLOCKS = ["9:00-9:45", "9:50-10:35", "12:00-12:45"];

function rotation(g, d, b) {
  return b === 2
    ? "Lunch (Hall)"
    : ["Swim (Pool)", "Art", "Soccer", "Music"][(g + b + d) % 4];
}

/** One group's week in one file, days across. */
const lone = (name, g = 0) =>
  csv(name, [
    ["Time", ...DAYS],
    ...BLOCKS.map((b, bi) => [b, ...DAYS.map((_, d) => rotation(g, d, bi))])
  ]);

/** An all-camp week with a division row over the group columns: the page states each one. */
const campWeek = (divisionRow, groups) =>
  DAYS.map((day, d) =>
    csv(`Camp ${day}.csv`, [
      ["", ...divisionRow],
      ["Time", ...groups],
      ...BLOCKS.map((b, bi) => [b, ...groups.map((_, g) => rotation(g, d, bi))])
    ])
  );

/** A camp with one program whose Juniors has no groups yet. */
const camp = () =>
  existingSetup({
    programs: [program("p1", "Main", { divisions: [["d1", "Juniors", []]] })]
  });

const propose = (files, existing, answers = {}) =>
  buildProposal({ files, existing, terms, answers });
const guessedOf = (files, existing, answers = {}) =>
  planFor(propose(files, existing, answers), existing, "s1", { answers })
    .guessed;

describe("what the import guessed, for the setup screens", () => {
  it("names every new activity's times a week and who can do it, and only ticked new places' groups that fit", () => {
    const files = campWeek(["Juniors", "Juniors"], ["Bunk 1", "Bunk 2"]);
    const answers = { "place|Pool": "add" };
    const guessed = guessedOf(files, null, answers);
    const activities = guessed.filter((g) => g.kind === "Activity");
    expect(activities.length).toBeGreaterThan(0);
    activities.forEach((g) => {
      expect(g.key).toMatch(/^A\|/);
      expect(g.fields).toEqual(["often", "who"]);
    });
    // The place ticked is added and guessed; the one not ticked (Hall) is not added at all.
    expect(guessed.filter((g) => g.kind === "Location")).toEqual([
      { kind: "Location", key: "L|Pool", fields: ["fits"] }
    ]);
    // A division the page states is read outright, not guessed.
    expect(guessed.filter((g) => g.kind === "Group")).toEqual([]);
  });

  it("a group's division only its file's name gave, left as suggested, is guessed", () => {
    const existing = camp();
    const files = [lone("Juniors - Bunk 1.csv")];
    const unit = questionCards(propose(files, existing), terms, {}).find(
      (c) => c.select === "division"
    );
    // Preselected: the file's name names a division the camp has.
    expect(unit.answer).toBe("Juniors");
    expect(
      guessedOf(files, existing).filter((g) => g.kind === "Group")
    ).toEqual([{ kind: "Group", key: "G|Bunk 1", fields: ["division"] }]);
  });

  it("a division the director chose is theirs, even the one suggested", () => {
    const existing = camp();
    const files = [lone("Juniors - Bunk 1.csv")];
    const unit = questionCards(propose(files, existing), terms, {}).find(
      (c) => c.select === "division"
    );
    const guessed = guessedOf(files, existing, { [unit.id]: "Juniors" });
    expect(guessed.filter((g) => g.kind === "Group")).toEqual([]);
  });

  it("a group the camp already has, and nothing it already has, is never guessed", () => {
    const existing = existingSetup({
      programs: [
        program("p1", "Main", {
          divisions: [["d1", "Juniors", [["g1", "Bunk 1"]]]]
        })
      ],
      activities: ["Swim", "Art", "Soccer", "Music", "Lunch"].map((n, i) => ({
        Id: `a${i}`,
        Name: n
      }))
    });
    const guessed = guessedOf([lone("Juniors - Bunk 1.csv")], existing);
    expect(guessed).toEqual([]);
  });

  it("the same files and answers give the same list", () => {
    const files = campWeek(["Juniors", "Seniors"], ["Bunk 1", "Bunk 2"]);
    const answers = { "place|Pool": "add", "place|Hall": "add" };
    expect(guessedOf(files, null, answers)).toEqual(
      guessedOf([...files].reverse(), null, answers)
    );
  });
});
