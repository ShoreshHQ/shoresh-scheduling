/**
 * The shared seat examples (staticresources/ShoreshSeatExamples.json), which ElectiveSeatTally
 * must also pass (ElectiveSeatExamplesTest): the engine seats as many as the examples say.
 */
import { assignSeats } from "c/shoreshElectiveEngine";

const { cases } = JSON.parse(
  require("fs").readFileSync(
    require("path").join(
      __dirname,
      "../../../staticresources/ShoreshSeatExamples.json"
    ),
    "utf8"
  )
);

// ELECT-4.4
describe("shared seat examples", () => {
  it.each(cases.map((c) => [c.name, c]))("%s", (name, example) => {
    const locked = Array.from({ length: example.locked }, (_, i) => `l${i}`);
    const wanting = Array.from({ length: example.wanting }, (_, i) => `w${i}`);
    const out = assignSeats({
      campers: [...locked, ...wanting].map((id) => ({ id })),
      times: [{ id: "t1" }],
      offerings: [
        {
          timeId: "t1",
          activityId: "archery",
          key: "archery",
          name: "Archery",
          seats: example.seats,
          noLimit: example.noLimit
        }
      ],
      choices: wanting.map((camperId) => ({
        camperId,
        key: "archery",
        rank: 1
      })),
      locks: locked.map((camperId) => ({
        camperId,
        timeId: "t1",
        activityId: "archery"
      }))
    });
    const placed = out.seats.filter((s) => !s.locked);
    expect(placed).toHaveLength(example.placed);
  });
});
