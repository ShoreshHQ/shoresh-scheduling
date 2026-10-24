// End-of-season Clear as a picture (electives slice E10; repo ADR 0018 choices 55 to 58; Greg's
// decision 59): what goes is what Clear removes, the whole season or one week. Names made up.
import { buildTerms } from "c/shoreshTerms";
import { clearBoard, shortName } from "../clear";
import { PICTURE } from "./data/clear";

const t = buildTerms([
  { term: "Camper", singular: "Camper", plural: "Campers", isCustom: false },
  { term: "Seats", singular: "Seats", plural: "Seats", isCustom: false },
  {
    term: "ElectiveSet",
    singular: "Elective set",
    plural: "Elective sets",
    isCustom: false
  },
  {
    term: "Offering",
    singular: "Offering",
    plural: "Offerings",
    isCustom: false
  }
]);

describe("the picture", () => {
  it("the whole season: every week with anything goes, and every camper", () => {
    const view = clearBoard(PICTURE, null, t);
    expect(view.columns.map((c) => [c.name, c.going])).toEqual([
      ["Week 1", true],
      ["Week 2", true],
      ["Week 3", false]
    ]);
    expect(view.totals).toEqual({
      campers: 52,
      choices: 270,
      seats: 634,
      runs: 3
    });
    expect(view.columns[0].campers).toMatchObject({
      count: 44,
      stay: null,
      name: "Eli K."
    });
    expect(view.columns[0].runs).toMatchObject({
      final: true,
      state: "Final · 14 Oct"
    });
    // A run still being worked on is drawn so, and named.
    expect(view.columns[1].runs).toMatchObject({
      final: false,
      state: "Committed"
    });
    expect(view.working).toEqual(["Chugim · Week 2"]);
    expect(view.nothing).toBe(false);
  });

  it("one week: only that week goes, and of its campers only those no other week has", () => {
    const view = clearBoard(PICTURE, "w1", t);
    expect(view.columns.map((c) => c.going)).toEqual([true, false, false]);
    expect(view.columns.map((c) => c.headClass)).toEqual([
      "clear-week clear-week_going",
      "clear-week",
      "clear-week"
    ]);
    expect(view.columns[0].campers).toMatchObject({ count: 4, stay: 40 });
    expect(view.columns[0].campers.words).toBe(
      "Week 1, campers: 4, goes; 40 stay"
    );
    // Another week is drawn as it is, solid.
    expect(view.columns[1].campers).toMatchObject({ count: 46, stay: null });
    expect(view.columns[1].seats.words).toBe("Week 2, seats: 322, stays");
    expect(view.totals).toEqual({
      campers: 4,
      choices: 132,
      seats: 312,
      runs: 2
    });
    expect(view.working).toEqual([]);
  });

  it("what stays: sets, offerings and linked choices, a few named", () => {
    const view = clearBoard(PICTURE, null, t);
    expect(
      view.stays.map((s) => [
        s.label,
        s.count,
        s.chips.map((c) => c.name),
        s.more
      ])
    ).toEqual([
      ["Elective sets", 2, ["Bechirot", "Chugim"], false],
      ["Offerings", 5, ["Archery", "Drama", "Pottery", "Ropes"], true],
      ["Linked", 1, ["Pottery double"], false]
    ]);
  });

  it("a week with nothing has nothing to clear", () => {
    expect(clearBoard(PICTURE, "w3", t).nothing).toBe(true);
  });

  it("a short name is a first name and an initial", () => {
    expect(shortName("Maya Cohen Levi")).toBe("Maya L.");
    expect(shortName("Maya")).toBe("Maya");
    expect(shortName(null)).toBe("");
  });
});
