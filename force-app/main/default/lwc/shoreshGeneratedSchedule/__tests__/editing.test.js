/**
 * What Generated hands the shared week editor (editing.js): the activities it offers to place.
 * Synthetic data only.
 */
import { FIELD } from "c/shoreshSchema";
import { activityOptions } from "../editing";

const A = FIELD.Activity;
const E = FIELD.ActivityEligibility;

const JUNIORS = "a0D000000000001AAA";
const SENIORS = "a0D000000000002AAA";
const BUNK_1 = "a0G000000000001AAA";
const BUNK_2 = "a0G000000000002AAA";
const BUNK_3 = "a0G000000000003AAA";

const days = [
  { groups: [{ id: BUNK_1 }, { id: BUNK_2 }] },
  { groups: [{ id: BUNK_1 }, { id: BUNK_2 }, { id: BUNK_3 }] }
];
const groups = [
  { Id: BUNK_1, [FIELD.Group.Division]: JUNIORS },
  { Id: BUNK_2, [FIELD.Group.Division]: JUNIORS },
  { Id: BUNK_3, [FIELD.Group.Division]: SENIORS }
];

function activity(id, name, fields = {}) {
  return { Id: `a0A00000000000${id}AAA`, Name: name, ...fields };
}
const optionsOf = (activities, eligibilities = []) =>
  activityOptions({ activities, groups, eligibilities }, days);

describe("activityOptions", () => {
  it("offers each activity with its length and times a week", () => {
    const [swim] = optionsOf([
      activity(1, "Swim", {
        [A.Length]: 2,
        [A.TimesPerWeekMin]: 1,
        [A.TimesPerWeekMax]: 3
      })
    ]);
    expect(swim).toEqual({
      id: "a0A000000000001AAA",
      name: "Swim",
      length: 2,
      minPerWeek: 1,
      maxPerWeek: 3,
      notFor: []
    });
  });

  it("no weekly limit is no maximum; missing values are a length of 1 and none a week", () => {
    const [art, drama] = optionsOf([
      activity(1, "Art", { [A.TimesPerWeekMax]: 2, [A.NoWeeklyMax]: true }),
      activity(2, "Drama", { [A.Length]: null, [A.TimesPerWeekMin]: null })
    ]);
    expect(art.maxPerWeek).toBeNull();
    expect(drama.length).toBe(1);
    expect(drama.minPerWeek).toBe(0);
    expect(drama.maxPerWeek).toBeNull();
  });

  it("is in the season's order: sort order first (none last), then name", () => {
    const names = optionsOf([
      activity(1, "Zip line"),
      activity(2, "Archery"),
      activity(3, "Swim", { [A.SortOrder]: 2 }),
      activity(4, "Tennis", { [A.SortOrder]: 1 })
    ]).map((o) => o.name);
    expect(names).toEqual(["Tennis", "Swim", "Archery", "Zip line"]);
  });

  it("notFor lists the week's bunks its who-can-do-it leaves out, by bunk or by division", () => {
    const swim = activity(1, "Swim");
    const art = activity(2, "Art");
    const drama = activity(3, "Drama");
    const options = optionsOf(
      [swim, art, drama],
      [
        { [E.Activity]: swim.Id, [E.Group]: BUNK_1 },
        { [E.Activity]: art.Id, [E.Division]: JUNIORS }
      ]
    );
    const notFor = (name) => options.find((o) => o.name === name).notFor;
    // Swim: Bunk 1 only. Art: the Juniors (Bunks 1 and 2). Drama: no rows, everyone.
    expect(notFor("Swim")).toEqual([BUNK_2, BUNK_3]);
    expect(notFor("Art")).toEqual([BUNK_3]);
    expect(notFor("Drama")).toEqual([]);
  });
});
