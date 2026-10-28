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

  // DIV-1.2
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

  describe("what its schedules already hold", () => {
    const MOVE = { ...BUNK, Division__c: "d2" };

    it("asks for the bunk's placements when the move takes it out of an activity", () => {
      const want = jest.fn();
      expect(moveNote(MOVE, BUNK, { ...CONTEXT, want })).toBe(
        "Moves to Seniors: Bunk 3 is no longer in Swim (for Juniors) and is now in Archery and Morning circle (for Seniors)."
      );
      expect(want).toHaveBeenCalledWith("g1");
    });

    it("does not ask when the move leaves no activity, or once it has the answer", () => {
      const want = jest.fn();
      const intoBoth = {
        ...CONTEXT,
        activities: [CONTEXT.activities[4]],
        want
      };
      moveNote(MOVE, BUNK, intoBoth);
      moveNote(MOVE, BUNK, {
        ...CONTEXT,
        placements: { g1: { placed: [], complete: true } },
        want
      });
      expect(want).not.toHaveBeenCalled();
    });

    it("says which placements stay, marked as not set up, counting cells", () => {
      const placements = {
        g1: {
          complete: true,
          placed: [
            { activity: "a1", cells: 4 },
            // Activities it keeps (or never had a list) are not its concern.
            { activity: "a3", cells: 2 },
            { activity: "a4", cells: 6 }
          ]
        }
      };
      expect(moveNote(MOVE, BUNK, { ...CONTEXT, placements })).toBe(
        "Moves to Seniors: Bunk 3 is no longer in Swim (for Juniors) and is now in Archery and Morning circle (for Seniors). Its schedules keep Swim (4 cells), marked “Not set up for Bunk 3”."
      );
    });

    it("names each activity it leaves with its own count, one cell said as one", () => {
      const context = {
        ...CONTEXT,
        activities: [
          ...CONTEXT.activities,
          {
            Id: "a6",
            Name: "Boating",
            Eligibilities__r: [{ Division__c: "d1" }]
          }
        ],
        recurringActivities: [],
        placements: {
          g1: {
            complete: true,
            placed: [
              { activity: "a1", cells: 4 },
              { activity: "a6", cells: 1 }
            ]
          }
        }
      };
      expect(moveNote(MOVE, BUNK, context)).toBe(
        "Moves to Seniors: Bunk 3 is no longer in Boating and Swim (for Juniors) and is now in Archery (for Seniors). Its schedules keep Boating (1 cell) and Swim (4 cells), marked “Not set up for Bunk 3”."
      );
    });

    it("says when its schedules could not all be read, or not at all", () => {
      const head =
        "Moves to Seniors: Bunk 3 is no longer in Swim (for Juniors) and is now in Archery and Morning circle (for Seniors).";
      expect(
        moveNote(MOVE, BUNK, {
          ...CONTEXT,
          placements: { g1: { placed: [], complete: false } }
        })
      ).toBe(`${head} Not every schedule could be read.`);
      expect(
        moveNote(MOVE, BUNK, { ...CONTEXT, placements: { g1: "failed" } })
      ).toBe(`${head} Its schedules could not be checked.`);
    });
  });
});
