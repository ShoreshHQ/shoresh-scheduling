// Reading single cells: days and times (slice 4c part B).
import { readCell } from "../cells";

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
    ["Monday to Wednesday", ["Monday", "Tuesday", "Wednesday"]]
  ])("%s", (text, expected) => {
    expect(readCell(DAYS, text)).toEqual({ value: expected });
  });

  it.each([
    ["Saturday", "Saturday isn't a camp day"],
    ["Mon, Funday", '"Funday" isn\'t a day'],
    ["Fri-Mon", '"Fri-Mon" goes backwards']
  ])("can't read %s", (text, problem) => {
    expect(readCell(DAYS, text)).toEqual({ problem });
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
