/**
 * The progress line's words (progressWords.js): what the engine says it is doing (a code and
 * ids), in the camp's words and setup's names, with no machinery in them.
 */
import { NOW } from "c/shoreshEngine";
import { buildTerms } from "c/shoreshTerms";
import { namesOf, possessive, progressLine } from "../progressWords";

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Week", singular: "Session", plural: "Sessions", isCustom: true },
  {
    term: "FixedActivity",
    singular: "All-camp event",
    plural: "All-camp events",
    isCustom: true
  }
]);

// 2026-06-29 is a Monday.
const input = {
  groups: [
    { Id: "g1", Name: "Badgers" },
    { Id: "g2", Name: "Eagles" },
    { Id: "g3", Name: "Bunk 3" }
  ],
  activities: [
    { Id: "a1", Name: "Sports" },
    { Id: "a2", Name: "Playground" },
    { Id: "a3", Name: "Swim" }
  ],
  days: [
    {
      dateValue: "2026-06-29",
      blocks: [
        { id: "b1", name: "Period 1" },
        { id: "b2", name: "Second block" }
      ]
    },
    { dateValue: "2026-06-30", blocks: [{ id: "b1", name: "Period 1" }] }
  ]
};
const names = namesOf(input);

const now = (code, over = {}) => ({
  code,
  step: 8,
  date: null,
  dayIndex: null,
  groupId: null,
  blockId: null,
  activityId: null,
  toActivityId: null,
  ...over
});
const MONDAY = { date: "2026-06-29", dayIndex: 0 };
const say = (code, over) => progressLine(now(code, over), names, terms);

// Words a camp director should never see in it.
const MACHINERY =
  /search|budget|step|algorithm|repair|constraint|slot|engine|code|null|undefined|\bid\b/i;

describe("the progress line", () => {
  it("says each kind of step in plain words, with the camp's names", () => {
    const lines = {
      [NOW.READ]: say(NOW.READ),
      [NOW.FIXED]: say(NOW.FIXED),
      [NOW.OPTIONS]: say(NOW.OPTIONS, {
        ...MONDAY,
        groupId: "g1",
        blockId: "b1"
      }),
      [NOW.PLACE]: say(NOW.PLACE, {
        ...MONDAY,
        groupId: "g1",
        blockId: "b1",
        activityId: "a3"
      }),
      [NOW.FILL]: say(NOW.FILL, { ...MONDAY, groupId: "g3", blockId: "b2" }),
      [NOW.SHORT]: say(NOW.SHORT, { groupId: "g2", activityId: "a3" }),
      [NOW.FULL]: say(NOW.FULL, {
        ...MONDAY,
        groupId: "g2",
        blockId: "b2",
        activityId: "a1",
        toActivityId: "a2"
      }),
      [NOW.MOVE]: say(NOW.MOVE, {
        ...MONDAY,
        groupId: "g2",
        blockId: "b2",
        activityId: "a1",
        toActivityId: "a2"
      }),
      [NOW.SHIFT]: say(NOW.SHIFT, {
        ...MONDAY,
        groupId: "g1",
        blockId: "b2",
        activityId: "a3"
      }),
      [NOW.BLANK]: say(NOW.BLANK, { ...MONDAY, groupId: "g3", blockId: "b1" }),
      [NOW.SEARCH]: say(NOW.SEARCH, {
        ...MONDAY,
        groupId: "g1",
        blockId: "b1"
      }),
      [NOW.SEARCH_DAY]: say(NOW.SEARCH_DAY, MONDAY),
      [NOW.NEEDED]: say(NOW.NEEDED, MONDAY),
      [NOW.ACROSS]: say(NOW.ACROSS, {
        ...MONDAY,
        groupId: "g1",
        blockId: "b1",
        activityId: "a1",
        toActivityId: "a3",
        toDate: "2026-07-02",
        toDayIndex: 1,
        times: 2
      }),
      [NOW.TRADE]: say(NOW.TRADE, {
        ...MONDAY,
        groupId: "g1",
        blockId: "b1",
        toActivityId: "a3",
        forGroupId: "g2"
      }),
      [NOW.AGAIN]: say(NOW.AGAIN),
      [NOW.IMPORTED]: say(NOW.IMPORTED)
    };
    expect(lines).toEqual({
      [NOW.READ]: "Reading your setup",
      [NOW.FIXED]:
        "Putting in what's locked, All-camp events and recurring activities",
      [NOW.OPTIONS]:
        "Finding everything that can go in Period 1 for Badgers on Monday",
      [NOW.PLACE]: "Placing Swim for Badgers in Monday's Period 1",
      [NOW.FILL]: "Finding something for Bunk 3 in Monday's Second block",
      [NOW.SHORT]: "Finding a time for Eagles to have Swim",
      [NOW.FULL]:
        "Sports is full, so moving Eagles to Playground for Monday's Second block",
      [NOW.MOVE]:
        "Moving Eagles from Sports to Playground for Monday's Second block",
      [NOW.SHIFT]: "Moving Badgers' Swim to Monday's Second block",
      [NOW.BLANK]: "Making sure Bunk 3 has something in Monday's Period 1",
      [NOW.SEARCH]: "Checking every way to fill Badgers' Monday",
      [NOW.SEARCH_DAY]: "Checking every way to fill Monday",
      [NOW.NEEDED]: "Rearranging Monday so each Bunk gets what it still needs",
      [NOW.ACROSS]:
        "Moving Badgers' Sports from Monday to Thursday so they get Swim twice",
      [NOW.TRADE]:
        "Leaving Badgers' Period 1 on Monday open, so Eagles gets Swim",
      [NOW.AGAIN]: "Trying a second way, to keep the better Session",
      [NOW.IMPORTED]: "Building from the imported Session, to compare"
    });
    // Every kind of step has its words, none of them machinery.
    Object.values(NOW).forEach((code) => expect(lines[code]).toBeTruthy());
    Object.values(lines).forEach((line) => expect(line).not.toMatch(MACHINERY));
  });

  it("says nothing (the screen keeps its line) for a name the setup no longer has, or nothing told", () => {
    expect(say(NOW.PLACE, { ...MONDAY, groupId: "gone", blockId: "b1" })).toBe(
      null
    );
    expect(say(NOW.SEARCH_DAY, { date: null })).toBe(null);
    expect(say("something new")).toBe(null);
    expect(progressLine(null, names, terms)).toBe(null);
  });

  it("says how often a group gets an activity once a session moves between days", () => {
    const across = (times, over = {}) =>
      say(NOW.ACROSS, {
        ...MONDAY,
        groupId: "g2",
        blockId: "b1",
        activityId: "a2",
        toActivityId: "a3",
        toDate: "2026-06-30",
        toDayIndex: 1,
        times,
        ...over
      });
    expect(across(1)).toBe(
      "Moving Eagles' Playground from Monday to Tuesday so they get Swim once"
    );
    expect(across(3)).toBe(
      "Moving Eagles' Playground from Monday to Tuesday so they get Swim 3 times"
    );
    expect(across(2, { toDate: null })).toBe(null);
    expect(across(null)).toBe(null);
  });

  it("puts the possessive on a name as it is spoken", () => {
    expect(possessive("Badgers")).toBe("Badgers'");
    expect(possessive("Bunk 3")).toBe("Bunk 3's");
    expect(possessive("Monday")).toBe("Monday's");
  });
});
