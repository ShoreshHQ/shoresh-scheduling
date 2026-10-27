// Any day of the week (Greg, 2026-10-27): a grid that runs Sunday to Thursday, or every day,
// is read as it is, and a season with no weeks gets weeks of that shape.
import { buildProposal, planFor, unplacedLines } from "./data/engine";
import { FIELD } from "c/shoreshSchema";
import { csv, existingSetup, terms } from "./data/samples";
import { programDays, weeksOf } from "c/shoreshImportEngine";
import { firstDayOf, weekOrder } from "../text";
import { dayList } from "../questions";

const ROWS = [
  ["Time", "Bunk 1", "Bunk 2"],
  ["9:00-9:45", "Swim", "Art"],
  ["12:00-12:45", "Lunch", "Lunch"]
];
const SUN_THU = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];
const EVERY_DAY = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

function dated(start, end) {
  const empty = existingSetup();
  return {
    ...empty,
    season: { ...empty.season, StartDate__c: start, EndDate__c: end }
  };
}

/** The proposal with last year's week put in the first week the import adds. */
function imported(days, existing) {
  const files = days.map((d) => csv(`${d}.csv`, ROWS));
  const first = buildProposal({ files, existing, terms, answers: {} });
  const answers = {};
  first.asks
    .filter((a) => a.id.startsWith("week|"))
    .forEach((a) => {
      answers[a.id] = "Week 1";
    });
  return {
    proposal: buildProposal({ files, existing, terms, answers }),
    answers
  };
}

describe("weeks of any days", () => {
  it("start on the first day after the days off", () => {
    expect(firstDayOf(SUN_THU)).toBe(6);
    expect(firstDayOf(["Monday", "Friday"])).toBe(4);
    expect(firstDayOf(EVERY_DAY, 5)).toBe(5);
    expect(weekOrder(["Thursday", "Sunday", "Tuesday"])).toEqual([
      "Sunday",
      "Tuesday",
      "Thursday"
    ]);
  });

  it("are said in the order the week runs", () => {
    expect(dayList(SUN_THU)).toBe("Sunday to Thursday");
    expect(dayList(EVERY_DAY)).toBe("every day");
    expect(dayList(["Saturday", "Sunday"])).toBe("Saturday and Sunday");
    expect(dayList(EVERY_DAY.slice(0, 5))).toBe("Monday to Friday");
  });

  it("Monday to Friday weeks are as before: short first and last weeks kept", () => {
    expect(weeksOf("2026-07-01", "2026-07-12", EVERY_DAY.slice(0, 5))).toEqual([
      { start: "2026-07-01", end: "2026-07-03" },
      { start: "2026-07-06", end: "2026-07-10" }
    ]);
  });

  it("a Sunday-to-Thursday camp gets Sunday-to-Thursday weeks", () => {
    expect(weeksOf("2026-06-28", "2026-07-09", SUN_THU)).toEqual([
      { start: "2026-06-28", end: "2026-07-02" },
      { start: "2026-07-05", end: "2026-07-09" }
    ]);
  });

  it("a camp that runs every day gets 7-day weeks from its first day", () => {
    expect(weeksOf("2026-06-27", "2026-07-08", EVERY_DAY)).toEqual([
      { start: "2026-06-27", end: "2026-07-03" },
      { start: "2026-07-04", end: "2026-07-08" }
    ]);
  });

  it("without a grid, follow the days the programs run; Monday to Friday when none", () => {
    expect(programDays(existingSetup())).toEqual(EVERY_DAY.slice(0, 5));
    // Its day fields as the package names them (namespaced or not).
    const record = { Id: "p1", Name: "Main camp" };
    EVERY_DAY.forEach((d) => {
      record[FIELD.Program[d]] = SUN_THU.includes(d);
    });
    const camp = existingSetup({ programs: [{ program: record }] });
    expect(programDays(camp)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Sunday"
    ]);
  });
});

describe("importing a grid that runs on weekends", () => {
  it("a Sunday-to-Thursday grid keeps every day and adds Sunday-to-Thursday weeks", () => {
    const { proposal, answers } = imported(
      SUN_THU,
      dated("2027-06-27", "2027-07-08")
    );
    expect(unplacedLines(proposal, terms)).toEqual([]);
    expect(proposal.timetables[0].days).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Sunday"
    ]);
    const plan = planFor(proposal, dated("2027-06-27", "2027-07-08"), "s", {
      answers
    });
    const days = "Monday+Tuesday+Wednesday+Thursday+Sunday";
    expect(plan.fillWeeks).toEqual([
      { start: "2027-06-27", name: "Week 1", days },
      { start: "2027-07-04", name: "Week 2", days }
    ]);
    // Each day's grid in date order: Sunday first.
    expect(proposal.versions[0].days.map((d) => d.date)).toEqual([
      "2027-06-27",
      "2027-06-28",
      "2027-06-29",
      "2027-06-30",
      "2027-07-01"
    ]);
  });

  it("a 7-day grid keeps Saturday and Sunday and adds 7-day weeks", () => {
    const { proposal, answers } = imported(
      EVERY_DAY,
      dated("2027-06-26", "2027-07-09")
    );
    expect(unplacedLines(proposal, terms)).toEqual([]);
    expect(proposal.timetables[0].days).toEqual(EVERY_DAY);
    const plan = planFor(proposal, dated("2027-06-26", "2027-07-09"), "s", {
      answers
    });
    expect(plan.fillWeeks.map((w) => w.start)).toEqual([
      "2027-06-26",
      "2027-07-03"
    ]);
    expect(proposal.versions[0].days).toHaveLength(7);
    expect(proposal.versions[0].days[0].date).toBe("2027-06-26");
  });
});
