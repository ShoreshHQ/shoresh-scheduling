/**
 * End-of-season Clear, as a picture (electives slice E10; repo ADR 0018 choices 49 to 52; Greg's
 * decision 59, design-research/electives-r1 clear-b and clear-b-week): the whole summer drawn,
 * weeks across, with rows for Campers, Choices, Seats and Runs; what goes is dashed, faded and its
 * number struck through; Sets, Offerings and Linked stay as solid bars with a padlock. Picking one
 * week dashes only that week. No sentences: the picture says it.
 *
 * Exact (ElectiveClear): what is drawn going is what Clear removes. One week's campers that go are
 * only those no other week has (the rest stay, drawn solid beside them); the whole season's are
 * every camper, so each row's head carries the total that goes. Pure: from ElectiveClear.Picture.
 */
import { shortDate } from "./downloads";

// Decoration only: the seat dots and the 1-2-3 marks are drawn, not counted.
const SEAT_DOTS = 12;
const CHOICE_MARKS = ["1", "2", "3"];

/** "Eli K.": a first name and an initial, for the picture. */
export function shortName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

/**
 * The picture for a scope: weekId (one week) or null (the whole season). Each week: its cells,
 * and whether it goes. Each row's head: how many go. What stays: the bars.
 */
export function clearBoard(picture, weekId, t) {
  const weeks = (picture && picture.weeks) || [];
  const goes = (week) => !weekId || week.weekId === weekId;
  const totals = { campers: 0, choices: 0, seats: 0, runs: 0 };
  const working = [];
  const columns = weeks.map((week) => {
    const going = goes(week);
    const has = week.runs > 0 || week.campers > 0;
    // One week: its campers no other week has go; the rest stay.
    const campersGo = going
      ? weekId
        ? week.campersOnlyHere
        : week.campers
      : 0;
    const campersStay = week.campers - campersGo;
    if (going) {
      totals.choices += week.choices;
      totals.seats += week.seats;
      totals.runs += week.runs;
      totals.campers += weekId ? week.campersOnlyHere : 0;
      working.push(...(week.working || []));
    }
    const final = !(week.working || []).length;
    const goneWord = going ? "goes" : "stays";
    return {
      key: week.weekId,
      name: week.name,
      picked: !!weekId && week.weekId === weekId,
      has,
      going: going && has,
      headClass: going ? "clear-week clear-week_going" : "clear-week",
      campers: {
        count: going ? campersGo : week.campers,
        stay: going && campersStay > 0 ? campersStay : null,
        name: shortName(week.camperName),
        words: `${week.name}, ${t.pIn("Camper")}: ${going ? campersGo : week.campers}, ${goneWord}${
          going && campersStay > 0 ? `; ${campersStay} stay` : ""
        }`
      },
      choices: {
        count: week.choices,
        words: `${week.name}, choices: ${week.choices}, ${goneWord}`
      },
      seats: {
        count: week.seats,
        words: `${week.name}, ${t.sIn("Seats")}: ${week.seats}, ${goneWord}`
      },
      runs: {
        count: week.runs,
        final,
        state: final
          ? `Final${week.lastFinalized ? ` · ${shortDate(week.lastFinalized)}` : ""}`
          : "Committed",
        words: `${week.name}, runs: ${week.runs}${final ? "" : ", not final"}, ${goneWord}`
      }
    };
  });
  // The whole season: every camper goes, those in no run too.
  if (!weekId) totals.campers = (picture && picture.campers) || 0;
  const stays = [
    ["sets", t.p("ElectiveSet"), (picture && picture.sets) || []],
    ["offerings", t.p("Offering"), (picture && picture.offerings) || []],
    ["linked", "Linked", (picture && picture.linked) || []]
  ].map(([key, label, names]) => ({
    key,
    label,
    count: names.length,
    chips: names.slice(0, 4).map((name, i) => ({ key: `${key}${i}`, name })),
    more: names.length > 4,
    words: `${label}: ${names.length}, stay`
  }));
  return {
    columns,
    totals,
    stays,
    working,
    nothing: totals.runs === 0 && totals.campers === 0 && totals.choices === 0,
    seatDots: Array.from({ length: SEAT_DOTS }, (_, i) => ({ key: `d${i}` })),
    choiceMarks: CHOICE_MARKS.map((mark) => ({ key: mark, mark }))
  };
}
