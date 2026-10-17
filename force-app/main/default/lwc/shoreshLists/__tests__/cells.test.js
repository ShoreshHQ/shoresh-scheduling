// Reading single cells: days and times (slice 4c part B).
import { days, readCell } from "../cells";

const DAYS = { type: "days" };
const TIME = { type: "time" };

describe("days", () => {
  it.each([
    ["Monday, Wednesday", ["Monday", "Wednesday"]],
    ["Mon-Wed", ["Monday", "Tuesday", "Wednesday"]],
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
    ["Mon Wed-Fri", ["Monday", "Wednesday", "Thursday", "Friday"]],
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
      expect(readCell(DAYS, text)).toEqual({ ask: true });
    }
  );

  it("reads T as answered", () => {
    expect(days("M/T/W", "Thursday")).toEqual({
      value: ["Monday", "Wednesday", "Thursday"]
    });
    expect(days("T-F", "Tuesday")).toEqual({
      value: ["Tuesday", "Wednesday", "Thursday", "Friday"]
    });
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
    ["6", { value: 18 * 60, unsure: true }],
    ["15", { value: 15 * 60 }]
  ])("%s", (text, expected) => {
    expect(readCell(TIME, text)).toEqual(expected);
  });

  it.each(["0", "24", "99"])("can't read %s", (text) => {
    expect(readCell(TIME, text)).toEqual({
      problem: `"${text}" isn't a camp-day time`
    });
  });
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
