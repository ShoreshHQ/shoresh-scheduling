import { FIELD } from "c/shoreshSchema";
import { scheduleOptions } from "c/shoreshElectiveEngine";

const S = FIELD.Schedule;
const schedule = (Id, origin, status, week = "w1", program = "p1") => ({
  Id,
  [S.Origin]: origin,
  [S.Status]: status,
  [S.Week]: week,
  [S.Program]: program
});
const program = (Id, Name) => ({ program: { Id, Name } });

describe("scheduleOptions", () => {
  it("names this week's schedules, never a version or another week's", () => {
    const setup = {
      programs: [program("p1", "Main")],
      schedules: [
        schedule("s1", "Generated", "Published"),
        schedule("s2", "Manual", "Draft"),
        schedule("s3", "Generated", "Version"),
        schedule("s4", "Generated", "Draft", "w2")
      ]
    };
    expect(scheduleOptions(setup, "w1")).toEqual([
      {
        label: "Generated Schedule · Published",
        value: "s1",
        programId: "p1"
      },
      { label: "Manual Build", value: "s2", programId: "p1" }
    ]);
  });

  // ELECT-2.5 (Greg 2026-11-12): Elective seats' and Bring in choices' list never offers a saved
  // version, last year's imported one included; with only that, nothing is offered.
  it("never offers last year's imported version as the week's schedule", () => {
    const setup = {
      programs: [program("p1", "Main")],
      schedules: [
        schedule("v1", "Imported", "Version"),
        schedule("v2", "Manual", "Version")
      ]
    };
    expect(scheduleOptions(setup, "w1")).toEqual([]);
  });

  it("says the program when the camp has more than one", () => {
    const setup = {
      programs: [program("p1", "Main"), program("p2", "Teens")],
      schedules: [schedule("s1", "Manual", "Draft", "w1", "p2")]
    };
    expect(scheduleOptions(setup, "w1")[0].label).toBe("Teens · Manual Build");
  });

  it("offers nothing before there is a setup and a week", () => {
    expect(scheduleOptions(null, "w1")).toEqual([]);
    expect(
      scheduleOptions(
        { schedules: [schedule("s1", "Manual", "Draft", null)] },
        null
      )
    ).toEqual([]);
  });
});
