// Reading single cells: days and times (slice 4c part B).
import { days, readCell } from "../cells";

const DAYS = { type: "days" };
const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TIME = { type: "time" };

describe("days", () => {
  it.each([
    ["Monday, Wednesday", ["Monday", "Wednesday"]],
    ["Mon-Tue", ["Monday", "Tuesday"]],
    ["Tue/Thu", ["Tuesday", "Thursday"]],
    ["weekdays", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]],
    ["Mon - Fri", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]],
    ["Friday, Monday", ["Monday", "Friday"]],
    ["Monday to Wednesday", ["Monday", "Tuesday", "Wednesday"]],
    // Coordinator, #20 review: letters, run together, spaces, thru, plurals.
    ["M/W/F", ["Monday", "Wednesday", "Friday"]],
    ["M-F", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]],
    ["MWF", ["Monday", "Wednesday", "Friday"]],
    ["Th", ["Thursday"]],
    ["Tu", ["Tuesday"]],
    ["W", ["Wednesday"]],
    ["F", ["Friday"]],
    ["Mon Wed Fri", ["Monday", "Wednesday", "Friday"]],
    ["Mon thru Fri", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]],
    ["Tuesday through Thursday", ["Tuesday", "Wednesday", "Thursday"]],
    ["Wednesdays", ["Wednesday"]],
    ["Mondays and Fridays", ["Monday", "Friday"]],
    ["T/Th", ["Tuesday", "Thursday"]],
    ["TTh", ["Tuesday", "Thursday"]],
    ["MTWThF", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]],
    ["M Tu W T F", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]],
    ["Mon Wed-Thu", ["Monday", "Wednesday", "Thursday"]],
    // Coordinator, #20 round 2: two or more dashes are a list.
    ["Mon-Wed-Fri", ["Monday", "Wednesday", "Friday"]],
    ["M-W-F", ["Monday", "Wednesday", "Friday"]],
    ["Mon - Wed - Fri", ["Monday", "Wednesday", "Friday"]],
    ["Mon thru Wed", ["Monday", "Tuesday", "Wednesday"]],
    // Two lone Ts: Tuesday, then Thursday.
    ["MTWTF", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]],
    ["M T W T F", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]],
    ["TT", ["Tuesday", "Thursday"]],
    ["T/T", ["Tuesday", "Thursday"]],
    // Any day of the week (Greg, 2026-10-27): weekends, and ranges over them.
    ["Saturday", ["Saturday"]],
    ["Sun", ["Sunday"]],
    ["Saturdays", ["Saturday"]],
    ["Sa Su", ["Saturday", "Sunday"]],
    ["Sat/Sun", ["Saturday", "Sunday"]],
    ["Fri thru Mon", ["Monday", "Friday", "Saturday", "Sunday"]],
    ["Sun-Thu", ["Monday", "Tuesday", "Wednesday", "Thursday", "Sunday"]],
    ["Sun-Tue-Thu", ["Tuesday", "Thursday", "Sunday"]],
    [
      "every day",
      [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ]
    ]
  ])("%s", (text, expected) => {
    expect(readCell(DAYS, text)).toEqual({ value: expected });
  });

  it.each([
    ["Mon, Funday", '"Funday" isn\'t a day'],
    ["S", '"S" isn\'t a day'],
    ["M-", '"M-" isn\'t a day'],
    ["Mon to", '"Mon to" isn\'t a day'],
    ["T T T", '"T T T": which T is which?']
  ])("can't read %s", (text, problem) => {
    expect(readCell(DAYS, text)).toEqual({ problem });
  });

  it.each(["T", "M/T/W", "T-F"])(
    "asks whether T is Tuesday or Thursday in %s",
    (text) => {
      expect(readCell(DAYS, text)).toEqual({ ask: "t" });
    }
  );

  it("reads T as answered", () => {
    expect(days("M/T/W", { t: "Thursday" })).toEqual({
      value: ["Monday", "Wednesday", "Thursday"]
    });
    expect(days("T-F", { t: "Thursday" })).toEqual({
      value: ["Thursday", "Friday"]
    });
    // Tuesday to Friday is neither next door nor the whole week: asked next.
    expect(days("T-F", { t: "Tuesday" })).toEqual({
      ask: "dash",
      dashes: [{ text: "T-F", from: "Tuesday", to: "Friday" }]
    });
  });

  it.each([
    ["T-Th", "Tuesday", "Thursday"],
    ["Tue-Thu", "Tuesday", "Thursday"],
    ["M-W", "Monday", "Wednesday"],
    ["Mon, Wed-Fri", "Wednesday", "Friday"]
  ])("asks whether %s is a range or two days", (text, from, to) => {
    expect(readCell(DAYS, text)).toMatchObject({
      ask: "dash",
      dashes: [{ from, to }]
    });
  });

  // Coordinator, #20 round 3.
  it.each([
    ["M\u2014F", "em dash"],
    ["M\u2010F", "Unicode hyphen"],
    ["M\u2011F", "non-breaking hyphen"],
    ["M\u2012F", "figure dash"],
    ["M\u2212F", "minus sign"],
    ["Mon \u2013 Fri", "en dash"]
  ])("reads %s (%s) as a dash", (text) => {
    expect(readCell(DAYS, text)).toEqual({ value: WEEK });
  });

  // Own probe of odd spellings, #20 round 3.
  it.each([
    ["Mo We Fr", ["Monday", "Wednesday", "Friday"]],
    ["every weekday", WEEK],
    ["M.W.F", ["Monday", "Wednesday", "Friday"]],
    ["mon\u2014fri", WEEK],
    ["Mon\u00a0-\u00a0Fri", WEEK],
    ["tues & thurs", ["Tuesday", "Thursday"]],
    ["Tue/Thu/", ["Tuesday", "Thursday"]],
    ["Th-F", ["Thursday", "Friday"]]
  ])("reads %s", (text, expected) => {
    expect(readCell(DAYS, text)).toEqual({ value: expected });
  });

  it.each([
    ["Mon~Fri", '"Mon~Fri" isn\'t a day'],
    ["Mon\u2026Fri", '"Mon\u2026Fri" isn\'t a day'],
    ["MonWedFri", '"MonWedFri" isn\'t a day'],
    ["R", '"R" isn\'t a day']
  ])("shows %s as unreadable rather than guess", (text, problem) => {
    expect(readCell(DAYS, text)).toEqual({ problem });
  });

  // Coordinator, #20 round 4: only periods are dropped from a day word.
  it.each(["M~F", "M?", "M1", "Wed*", "m|w"])(
    "can't read %s rather than drop a character",
    (text) => {
      expect(readCell(DAYS, text).problem).toBeTruthy();
    }
  );

  it.each([
    ["Wed.", ["Wednesday"]],
    ["M.W.F", ["Monday", "Wednesday", "Friday"]]
  ])("still reads %s", (text, expected) => {
    expect(readCell(DAYS, text)).toEqual({ value: expected });
  });

  it("asks about an em-dash two-day dash too", () => {
    expect(readCell(DAYS, "Tu\u2014Th")).toEqual({
      ask: "dash",
      dashes: [{ text: "Tu-Th", from: "Tuesday", to: "Thursday" }]
    });
  });

  it("asks each dash on its own, and reads each answer", () => {
    expect(readCell(DAYS, "M-W/Tu-Th")).toEqual({
      ask: "dash",
      dashes: [
        { text: "M-W", from: "Monday", to: "Wednesday" },
        { text: "Tu-Th", from: "Tuesday", to: "Thursday" }
      ]
    });
    expect(
      days("M-W/Tu-Th", { dashes: { "m-w": "list", "tu-th": "range" } })
    ).toEqual({ value: ["Monday", "Tuesday", "Wednesday", "Thursday"] });
    // One answered, the other still asked.
    expect(days("M-W/Tu-Th", { dashes: { "m-w": "list" } })).toMatchObject({
      ask: "dash",
      dashes: [{ text: "Tu-Th" }]
    });
  });

  it.each([
    ["MW-F", "MW-F", "Wednesday", "Friday"],
    ["M-WF", "M-WF", "Monday", "Wednesday"]
  ])(
    "asks about a dash next to run-together letters: %s",
    (text, dash, from, to) => {
      expect(readCell(DAYS, text)).toEqual({
        ask: "dash",
        dashes: [{ text: dash, from, to }]
      });
    }
  );

  it("reads run-together letters around a dash next door with no question", () => {
    expect(readCell(DAYS, "MW-Th")).toEqual({
      value: ["Monday", "Wednesday", "Thursday"]
    });
  });

  it("reads a two-day dash as answered", () => {
    expect(days("T-Th", { dashes: { "t-th": "range" } })).toEqual({
      value: ["Tuesday", "Wednesday", "Thursday"]
    });
    expect(days("T-Th", { dashes: { "t-th": "list" } })).toEqual({
      value: ["Tuesday", "Thursday"]
    });
  });

  it.each([
    ["W-M-F", '"W-M-F" goes backwards'],
    ["M--F", '"M--F" isn\'t a day']
  ])("can't read %s", (text, problem) => {
    expect(readCell(DAYS, text)).toEqual({ problem });
  });
});

describe("odd times are shown, never guessed (#20 round 3 probe)", () => {
  it.each([
    "9:00-10:00",
    "9:00\u201410:00",
    "9:00\u221210:00",
    "9 - 10",
    "noon",
    "0930",
    "9:5",
    "9:60",
    "\uff11\uff10:\uff10\uff10",
    // Coordinator, #20 round 4.
    "9:00-",
    "9:00 p",
    "9:00 a",
    "9:00 AM-"
  ])("can't read %s", (text) => {
    expect(readCell(TIME, text).problem).toBeTruthy();
  });

  it.each([
    ["9.30am", 570],
    ["9:30 a.m.", 570],
    ["9:00\u00a0AM", 540],
    ["8 PM", 1200],
    ["9:00 pm", 21 * 60],
    ["9:00", 540]
  ])("reads %s", (text, value) => {
    expect(readCell(TIME, text)).toEqual({ value });
  });
});

describe("bare hours (coordinator, #20 review)", () => {
  it.each([
    ["9", { value: 9 * 60 }],
    ["7", { value: 7 * 60 }],
    ["11", { value: 11 * 60 }],
    ["12", { value: 12 * 60 }],
    ["1", { value: 13 * 60 }],
    ["4", { value: 16 * 60 }],
    ["5", { value: 17 * 60, unsure: true }],
    ["6", { value: 18 * 60, unsure: true }]
  ])("%s", (text, expected) => {
    expect(readCell(TIME, text)).toEqual(expected);
  });

  it.each(["0", "13", "15", "20", "23", "24", "99"])(
    "can't read %s",
    (text) => {
      expect(readCell(TIME, text)).toEqual({
        problem: `"${text}" isn't a camp-day time`
      });
    }
  );
});

describe("times", () => {
  it.each([
    ["9:00", 540],
    ["9:00 AM", 540],
    ["1:30", 810],
    ["1:30 PM", 810],
    ["13:30", 810],
    ["12:15", 735],
    ["6:00 PM", 1080],
    ["6:00 am", 360]
  ])("%s", (text, minutes) => {
    expect(readCell(TIME, text)).toEqual({ value: minutes });
  });

  it("5 and 6 o'clock without AM or PM are asked", () => {
    expect(readCell(TIME, "6:00")).toEqual({ value: 1080, unsure: true });
  });

  it.each(["soon", "9ish", "9:00-9:45"])("can't read %s", (text) => {
    expect(readCell(TIME, text).problem).toBe(`"${text}" isn't a time`);
  });
});
