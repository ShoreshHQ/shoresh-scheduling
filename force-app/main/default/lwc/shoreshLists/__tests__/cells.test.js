// Reading single cells: days and times (slice 4c part B).
import { days, readCell } from "../cells";

const DAYS = { type: "days" };
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
    ["T/T", ["Tuesday", "Thursday"]]
  ])("%s", (text, expected) => {
    expect(readCell(DAYS, text)).toEqual({ value: expected });
  });

  it.each([
    ["Saturday", "Saturday isn't a camp day"],
    ["Mon, Funday", '"Funday" isn\'t a day'],
    ["Fri-Mon", '"Fri-Mon" goes backwards'],
    ["Sun", "Sunday isn't a camp day"],
    ["Saturdays", "Saturday isn't a camp day"],
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
      from: "Tuesday",
      to: "Friday"
    });
  });

  it.each([
    ["T-Th", "Tuesday", "Thursday"],
    ["Tue-Thu", "Tuesday", "Thursday"],
    ["M-W", "Monday", "Wednesday"],
    ["Mon, Wed-Fri", "Wednesday", "Friday"]
  ])("asks whether %s is a range or two days", (text, from, to) => {
    expect(readCell(DAYS, text)).toEqual({ ask: "dash", from, to });
  });

  it("reads a two-day dash as answered", () => {
    expect(days("T-Th", { dash: "range" })).toEqual({
      value: ["Tuesday", "Wednesday", "Thursday"]
    });
    expect(days("T-Th", { dash: "list" })).toEqual({
      value: ["Tuesday", "Thursday"]
    });
  });

  it.each([
    ["W-F-M", '"W-F-M" goes backwards'],
    ["Th-T", '"Th-T" goes backwards'],
    ["M--F", '"M--F" isn\'t a day']
  ])("can't read %s", (text, problem) => {
    expect(readCell(DAYS, text)).toEqual({ problem });
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
