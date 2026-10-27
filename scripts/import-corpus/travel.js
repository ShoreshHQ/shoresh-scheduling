// Level 1, "divisions travel together" (docs/import/corpus.md): ordinary one-week camps whose
// divisions move as one, every group of a division at the same activity, rotating through more
// activities than the week has periods, so a division may have an activity only once or twice a
// week. Set times are by division: Lunch in two sittings every day, and sometimes Swim at its own
// period for each division every day. Everything is invented; the same seed gives the same camp.
//
// This is the shape where one division at an activity once looks like a set time, and divisions
// taking turns at one activity on one day looks like a staggered set time: both are activities.
import {
  ACTIVITIES,
  CAMP_KINDS,
  CAMP_WORDS,
  DIVISION_SETS,
  GROUP_STYLES,
  LABEL_STYLES,
  LAYOUT_CHOICES,
  OPENINGS,
  TIME_STYLES,
  WEEKS,
  blocksFor,
  groupNames,
  randomFrom
} from "./camps";

/** How many camps the "divisions travel together" variant has. */
export const TRAVEL_SIZE = 40;

/** A step through the activities that never brings a division back to one slot on two days. */
function dayStep(r, n, days) {
  const ok = (k) =>
    Array.from({ length: days - 1 }, (_, i) => i + 1).every(
      (diff) => (k * diff) % n !== 0
    );
  const steps = Array.from({ length: n - 1 }, (_, i) => i + 1).filter(ok);
  return r.pick(steps);
}

/** One camp whose divisions travel together, and its true answer. */
export function travellingCamp(seed) {
  const r = randomFrom(seed * 6151 + 3);
  const [layout, format, split] = LAYOUT_CHOICES[seed % LAYOUT_CHOICES.length];
  const divisionNames = r
    .pick(DIVISION_SETS.filter((s) => s.length >= 3))
    .slice(0, r.int(2, 4));
  const divisions = divisionNames.map((name) => ({ name, size: r.int(2, 4) }));
  const style = r.pick(GROUP_STYLES);
  const opening = r.chance(0.6) ? r.pick(OPENINGS) : null;
  const blocks = blocksFor(r, opening);
  // Lunch in two sittings: the Lunch block for the first divisions, the next period for the rest.
  const lunch = blocks.findIndex((b) => b.fixed === "Lunch");
  blocks[lunch] = { ...blocks[lunch], fixed: null };
  const days = r.pick(WEEKS);
  const periods = blocks.filter((b) => !b.fixed && b.name !== "Lunch").length;
  const swim = r.chance(0.5) && periods >= divisions.length + 2;
  const pool = r.shuffle(ACTIVITIES.filter((a) => a !== "Swim"));
  // Each division has a slot of its own for every activity it does in a day: the Lunch block or
  // its second sitting, and the periods.
  const n = r.int(periods + 2, Math.min(14, pool.length));
  const activities = pool.slice(0, n);
  const step = dayStep(r, n, days.length);
  const firstSitting = Math.ceil(divisions.length / 2);
  const swimFrom = r.int(0, periods - divisions.length);
  const camp = {
    id: `L1T-${String(seed).padStart(3, "0")}`,
    level: 1,
    variant: "travel",
    name: `${r.pick(CAMP_WORDS[0])} ${r.pick(CAMP_WORDS[1])} ${r.pick(CAMP_KINDS)}`,
    layout,
    format,
    split,
    timeStyle: r.pick(TIME_STYLES),
    labelStyle: r.pick(LABEL_STYLES),
    shortDays: r.chance(0.3),
    days,
    blocks,
    divisions: groupNames(r, divisions, style),
    fixed: blocks.filter((b) => b.fixed).map((b) => b.fixed),
    recurring: swim ? ["Lunch", "Swim"] : ["Lunch"],
    // Every bunk of a division always at the same thing: one group each (rule 8, Greg).
    oneGroupPerDivision: true
  };
  camp.groups = camp.divisions.flatMap((d) =>
    d.groups.map((g) => ({ name: g, division: d.name }))
  );
  const divisionAt = camp.groups.map((g) =>
    camp.divisions.findIndex((d) => d.name === g.division)
  );
  camp.cell = (g, d, b) => {
    const block = blocks[b];
    if (block.fixed) return block.fixed;
    const v = divisionAt[g];
    // The periods before this block (the Lunch block not counted).
    const p = blocks
      .slice(0, b)
      .filter((x) => !x.fixed && x.name !== "Lunch").length;
    const second = v >= firstSitting;
    if (b === lunch && !second) return "Lunch";
    if (b === lunch + 1 && second) return "Lunch";
    if (swim && block.name !== "Lunch" && p === swimFrom + v) return "Swim";
    // The Lunch block is one more slot for the second sitting.
    const slot = block.name === "Lunch" ? periods : p;
    return activities[(v + slot + d * step) % n];
  };
  const shown = new Set();
  camp.groups.forEach((_, g) =>
    days.forEach((_d, d) =>
      blocks.forEach((_b, b) => shown.add(camp.cell(g, d, b)))
    )
  );
  camp.activities = activities.filter((a) => shown.has(a));
  camp.divisionsInFile =
    camp.divisions.length > 1 &&
    (layout !== "byActivity" || style === "divisionNumber");
  return camp;
}

/** The variant's camps: `count` camps from seed 1. */
export function travellingCamps(count) {
  return Array.from({ length: count }, (_, i) => travellingCamp(i + 1));
}
