import { moveNote } from "../groupMoves";

const CONTEXT = {
  divisions: [
    { Id: "d1", Name: "Juniors" },
    { Id: "d2", Name: "Seniors" }
  ],
  activities: [
    { Name: "Swim", Eligibilities__r: [{ Division__c: "d1" }] },
    { Name: "Archery", Eligibilities__r: [{ Division__c: "d2" }] },
    // Named for the bunk itself, so the move changes nothing here.
    {
      Name: "Climbing",
      Eligibilities__r: [{ Division__c: "d1" }, { Group__c: "g1" }]
    },
    { Name: "Art" },
    // Open to both: the group keeps it either way.
    {
      Name: "Canoe",
      Eligibilities__r: [{ Division__c: "d1" }, { Division__c: "d2" }]
    }
  ],
  recurringActivities: [
    { Name: "Morning circle", Coverages__r: [{ Division__c: "d2" }] }
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

  it("says when nothing else changes", () => {
    expect(
      moveNote({ ...BUNK, Division__c: "d2" }, BUNK, {
        ...CONTEXT,
        activities: [],
        recurringActivities: []
      })
    ).toBe(
      "Moves to Seniors. Nothing set up is for Juniors or Seniors by name, so moving changes nothing else."
    );
  });
});
