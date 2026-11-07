// A season's days by number (ADR 0025): a day's number comes only from its date, and every place
// that says a day says it. Named-days seasons read exactly as before. The data is made up.
import { useSeasonDays } from "c/shoreshImportEngine";
import { FIELD } from "c/shoreshSchema";
import { dayLabel, days } from "c/shoreshScheduleViews";
import { dayNameOf } from "../../shoreshWeekEditor/measure";
import { scheduleSheets } from "c/shoreshScheduleExport";
import { buildTerms } from "c/shoreshTerms";
import { dayWord } from "../../shoreshEngine/checks";
import {
  timeLabel,
  timeOfChoice,
  timeWords
} from "../../shoreshElectiveSeats/seats";
import { whenOf } from "../../shoreshChoicesImport/review";
import {
  numberedDay,
  numberedWeekday,
  setDayNaming,
  spokenWeekday,
  weekdayName
} from "c/shoreshDayNames";
import { opened } from "../../shoreshScheduleViews/__tests__/data/scheduleFixture";

/** A season of these program days, numbered or not. */
function season(runsOn, numbered = true, start = "2027-06-28") {
  return {
    season: {
      [FIELD.Season.NumberedDays]: numbered,
      [FIELD.Season.StartDate]: start
    },
    programs: [
      {
        program: Object.fromEntries(
          runsOn.map((day) => [FIELD.Program[day], true])
        )
      }
    ]
  };
}

const MON_FRI = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const SUN_THU = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"];

describe("a day's number", () => {
  afterEach(() => setDayNaming(null));

  // WEEK-1.5
  it("numbers Monday to Friday from Monday, restarting every week", () => {
    useSeasonDays(season(MON_FRI));
    expect(
      [
        "2027-06-28",
        "2027-06-29",
        "2027-06-30",
        "2027-07-01",
        "2027-07-02"
      ].map(numberedDay)
    ).toEqual(["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"]);
    expect(numberedDay("2027-07-05")).toBe("Day 1");
  });

  // WEEK-1.5
  it("numbers Sunday to Thursday from Sunday", () => {
    useSeasonDays(season(SUN_THU));
    expect(numberedDay("2027-06-27")).toBe("Day 1");
    expect(numberedDay("2027-07-01")).toBe("Day 5");
    expect(numberedDay("2027-07-04")).toBe("Day 1");
  });

  // WEEK-1.5
  it("numbers a short week's first day by its date: a week starting Wednesday starts on Day 3", () => {
    useSeasonDays(season(MON_FRI, true, "2027-06-30"));
    expect(numberedDay("2027-06-30")).toBe("Day 3");
    expect(numberedDay("2027-07-02")).toBe("Day 5");
  });

  // WEEK-1.5
  it("reaches Day 6 in a six-day week", () => {
    useSeasonDays(season([...MON_FRI, "Saturday"]));
    expect(numberedDay("2027-07-03")).toBe("Day 6");
    useSeasonDays(season([...SUN_THU, "Friday"]));
    expect(numberedDay("2027-07-02")).toBe("Day 6");
  });

  // WEEK-1.5
  it("says a stored weekday by its number, and the weekday stays what is stored", () => {
    useSeasonDays(season(SUN_THU));
    expect(numberedWeekday("Monday")).toBe("Day 2");
    expect(spokenWeekday("Monday")).toBe("Day 2");
    expect(spokenWeekday("Not a day")).toBe("Not a day");
    expect(weekdayName("2027-06-28")).toBe("Monday");
  });

  // WEEK-1.5
  it("reads a season from its setup: a camp running every day counts from the season's first day", () => {
    const everyDay = [...MON_FRI, "Saturday", "Sunday"];
    useSeasonDays(season(everyDay, true, "2027-06-30"));
    expect(numberedDay("2027-06-30")).toBe("Day 1");
    expect(numberedDay("2027-06-29")).toBe("Day 7");
  });

  // WEEK-1.6
  it("skips a closed date's number: its neighbours keep their own", () => {
    useSeasonDays(season(MON_FRI));
    // The week's days with Wednesday closed: only the open days are shown.
    const open = ["2027-06-28", "2027-06-29", "2027-07-01", "2027-07-02"];
    expect(open.map(numberedDay)).toEqual(["Day 1", "Day 2", "Day 4", "Day 5"]);
    expect(
      days({
        days: open.map((dateValue) => ({ dateValue, blocks: [], groups: [] }))
      }).map((d) => d.label)
    ).toEqual(["Day 1", "Day 2", "Day 4", "Day 5"]);
  });
});

describe("saying a day", () => {
  afterEach(() => setDayNaming(null));

  // WEEK-1.7
  it("dayLabel says the number and keeps the date beside it", () => {
    useSeasonDays(season(MON_FRI));
    expect(dayLabel("2027-06-30")).toEqual({
      label: "Day 3",
      short: "Day 3",
      sub: "Jun 30"
    });
    expect(dayNameOf("2027-06-30")).toBe("Day 3");
    expect(dayNameOf("2027-06-30", "Field Day")).toBe("Field Day");
    expect(dayWord("2027-06-30")).toBe("Day 3");
  });

  // WEEK-1.7
  it("a download names its sheets by number", () => {
    useSeasonDays(season(MON_FRI));
    const names = scheduleSheets(opened(), [], buildTerms([])).map(
      (sheet) => sheet.name
    );
    expect(names).toContain("Day 1");
    expect(names).not.toContain("Monday");
  });

  // WEEK-1.7
  it("an elective time says the number, and a camper's choice may still name the weekday or the number", () => {
    useSeasonDays(season(MON_FRI));
    const time = { day: "2027-06-29", startTime: "12:30:00.000Z" };
    expect(timeLabel(time)).toBe("Day 2 12:30");
    expect(timeWords(time)).toBe("Day 2 12:30");
    const at = { key: "t", day: "2027-06-29", blockName: "Period 1" };
    const run = { timesOf: () => [at] };
    for (const d of ["Tuesday", "Tue", "Day 2"]) {
      expect(timeOfChoice(run, {}, { d, p: "Period 1" })).toEqual({
        timeKey: "t"
      });
    }
    expect(whenOf({ day: "Tuesday", period: "Period 2" })).toBe(
      "Day 2 · Period 2"
    );
  });

  // WEEK-1.5, WEEK-1.7: the main thing to guard.
  it("a named-days season reads exactly as before", () => {
    useSeasonDays(season(SUN_THU, false));
    expect(dayLabel("2027-06-30")).toEqual({
      label: "Wednesday",
      short: "Wed",
      sub: "Jun 30"
    });
    expect(numberedDay("2027-06-30")).toBeNull();
    expect(numberedWeekday("Wednesday")).toBeNull();
    expect(spokenWeekday("Wednesday")).toBe("Wednesday");
    expect(dayWord("2027-06-30")).toBe("Wednesday");
    expect(whenOf({ day: "Tuesday", period: "Period 2" })).toBe(
      "Tue · Period 2"
    );
    const names = scheduleSheets(opened(), [], buildTerms([])).map(
      (sheet) => sheet.name
    );
    expect(names).toContain("Monday");
  });
});
