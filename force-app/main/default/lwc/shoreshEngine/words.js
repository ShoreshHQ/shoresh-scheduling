import { buildTerms } from "c/shoreshTerms";
import {
  BUDGET,
  BUSY,
  FULL,
  MIN_COST,
  NONE_FOR,
  NO_FIT,
  RULE,
  SEARCHED
} from "./week";

/**
 * The hover reason for one rule a placement bends, in camp words. Manual Build reuses these words
 * for its dots (ADR 0010), so both schedules say the same thing: keep them here, and change them
 * for both.
 *
 * rule: a RULE value, BUSY (the group is busy at an overlapping time), NO_FIT (a gap no
 * activity's length fits), FULL (everything set up for the group is taken then) or NONE_FOR
 * (nothing running this week is set up for the group), SEARCHED, MIN_COST or BUDGET (what the
 * step 8 search found for a cell left Open). groupName: the group the cell belongs to. placeName: the activity's place
 * when it has one with a size set, else null. groupsAtOnce: the activity's limit. terms: the
 * camp's words (c/shoreshTerms); model words when left out. inUseBy: what other programs are
 * doing at the place then, by name, as the desktop names them ("Pool in use by Teen swim",
 * buildSchedule.js); otherProgram: another program's groups count toward the limit of groups at
 * once (the same activity, so it is the program, not a name, that tells the director why).
 */
export function reasonFor(
  rule,
  { groupName, placeName, groupsAtOnce, terms, inUseBy, otherProgram } = {}
) {
  const t = terms || buildTerms([]);
  switch (rule) {
    case RULE.WEEKLY_MAX:
      return "Over its weekly limit";
    case RULE.ONCE_A_DAY:
      return "Twice in a day";
    case RULE.ELIGIBILITY:
      return `Not set up for ${groupName}`;
    case RULE.GROUPS_AT_ONCE:
      return `Over its limit of ${groupsAtOnce} ${
        groupsAtOnce === 1 ? t.sIn("Group") : t.pIn("Group")
      } at once${otherProgram ? `, with another ${t.sIn("Program")}` : ""}`;
    case RULE.SAME_DIVISION:
      return placeName
        ? `Shares ${placeName} with another ${t.sIn("Division")}`
        : `With another ${t.sIn("Division")} at the same time`;
    case RULE.PLACE_CAPACITY:
      return `More ${t.pIn("Group")} at ${placeName} than fit${
        inUseBy && inUseBy.length ? `, in use by ${listed(inUseBy)}` : ""
      }`;
    case NO_FIT:
      return `No ${t.sIn("Activity")} fits this ${t.sIn("Gap")}`;
    case BUSY:
      return "Already busy then";
    case FULL:
      return `Everything for ${groupName} is taken then`;
    case SEARCHED:
      return `No arrangement of the day fits another ${t.sIn("Activity")} here`;
    case MIN_COST:
      return `Filling it would take a ${t.sIn("Group")} below a weekly minimum`;
    case BUDGET:
      return "Not enough time to try every arrangement";
    case NONE_FOR:
      return `No ${t.sIn("Activity")} this ${t.sIn("Week")} is set up for ${groupName}`;
    default:
      return "";
  }
}

/**
 * A setup field left blank that the engine took as 1 (care plan step 1): never 0, never a reason
 * to stop, always said. field: "atOnce" (an activity's groups at once) or "fit" (a place's groups
 * that fit); name: the activity's or the place's.
 */
export function blankSetupNote(field, name, terms) {
  const t = terms || buildTerms([]);
  // The field's own label, as the setup screen shows it (c/shoreshCampLabels).
  const label = t.s(field === "fit" ? "GroupsThatFit" : "GroupsAtOnce");
  return `${name}: ${label} is blank, so it counts as 1`;
}

/** "Swim", "Swim and Archery", "Swim, Archery and Canoeing" (the desktop's joinEnglishList). */
function listed(names) {
  if (names.length <= 2) {
    return names.join(" and ");
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
