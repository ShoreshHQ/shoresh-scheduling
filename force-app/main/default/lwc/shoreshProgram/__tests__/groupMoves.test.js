import { moveNote as noteFor } from "../groupMoves";
import { nsRecord } from "shoresh-jest/namespace";

// The rows as the package's screens hand them over (unchanged, or prefixed in the namespaced run).
const moveNote = (values, original, context) =>
  noteFor(nsRecord(values), nsRecord(original), nsRecord(context));

const CONTEXT = {
  divisions: [
    { Id: "d1", Name: "Juniors" },
    { Id: "d2", Name: "Seniors" }
  ],
  activities: [
    { Id: "a1", Name: "Swim", Eligibilities__r: [{ Division__c: "d1" }] },
    { Id: "a2", Name: "Archery", Eligibilities__r: [{ Division__c: "d2" }] },
    // Named for the bunk itself, so the move changes nothing here.
    {
      Id: "a3",
      Name: "Climbing",
      Eligibilities__r: [{ Division__c: "d1" }, { Group__c: "g1" }]
    },
    { Id: "a4", Name: "Art" },
    // Open to both: the group keeps it either way.
    {
      Id: "a5",
      Name: "Canoe",
      Eligibilities__r: [{ Division__c: "d1" }, { Division__c: "d2" }]
    }
  ],
  recurringActivities: [
    { Id: "r1", Name: "Morning circle", Coverages__r: [{ Division__c: "d2" }] }
  ]
};

const BUNK = { Id: "g1", Name: "Bunk 3", Division__c: "d1" };

describe("moveNote", () => {
  it("says nothing while the division is unchanged", () => {
    expect(moveNote({ ...BUNK }, BUNK, CONTEXT)).toBe(null);
  });

  it("says which lists the group leaves and joins, for which division", () => {
    expect(moveNote({ ...BUNK, Division__c: "d2" }, BUNK, CONTEXT)).toBe(
      "Moves to Seniors: Bunk 3 is no longer in Swim (for Juniors) and is now in Archery and Morning circle (for Seniors)."
    );
  });

  it("shows no note when the move changes nothing else", () => {
    expect(
      moveNote({ ...BUNK, Division__c: "d2" }, BUNK, {
        ...CONTEXT,
        activities: [],
        recurringActivities: []
      })
    ).toBe(null);
  });

  it("tells two lists with the same name apart (staggered lunches)", () => {
    const lunches = {
      ...CONTEXT,
      activities: [],
      recurringActivities: [
        { Id: "r1", Name: "Lunch", Coverages__r: [{ Division__c: "d1" }] },
        { Id: "r2", Name: "Lunch", Coverages__r: [{ Division__c: "d2" }] }
      ]
    };
    expect(moveNote({ ...BUNK, Division__c: "d2" }, BUNK, lunches)).toBe(
      "Moves to Seniors: Bunk 3 is no longer in Lunch (for Juniors) and is now in Lunch (for Seniors)."
    );
  });
});
