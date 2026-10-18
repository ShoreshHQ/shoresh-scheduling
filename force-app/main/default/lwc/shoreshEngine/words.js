import { buildTerms } from "c/shoreshTerms";
import { BUSY, NO_FIT, RULE } from "./week";

/**
 * The hover reason for one rule a placement bends, in camp words. Manual Build reuses these words
 * for its dots (ADR 0010), so both schedules say the same thing: keep them here, and change them
 * for both.
 *
 * rule: a RULE value, BUSY (the group is busy at an overlapping time), or NO_FIT (a gap no
 * activity's length fits). groupName: the group the cell belongs to. placeName: the activity's place
 * when it has one with a size set, else null. groupsAtOnce: the activity's limit. terms: the
 * camp's words (c/shoreshTerms); model words when left out.
 */
export function reasonFor(
  rule,
  { groupName, placeName, groupsAtOnce, terms } = {}
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
      } at once`;
    case RULE.SAME_DIVISION:
      return placeName
        ? `Shares ${placeName} with another ${t.sIn("Division")}`
        : `With another ${t.sIn("Division")} at the same time`;
    case RULE.PLACE_CAPACITY:
      return `More ${t.pIn("Group")} at ${placeName} than fit`;
    case NO_FIT:
      return `No ${t.sIn("Activity")} fits this ${t.sIn("Gap")}`;
    case BUSY:
      return "Already busy then";
    default:
      return "";
  }
}
