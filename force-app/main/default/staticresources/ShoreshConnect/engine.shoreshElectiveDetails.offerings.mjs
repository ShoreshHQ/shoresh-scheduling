/**
 * A season's elective sets and their confirmed offerings, as Electives setup counts them and a
 * schedule's Excel file lists them. Pure, so the connector works a file out with it too
 * (API-1.86, API-1.87).
 */
import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
import { foldName } from "./engine.shoreshImportEngine.shoreshImportEngine.mjs";
import { buildTerms } from "./engine.shoreshTerms.shoreshTerms.mjs";

const OFFER = FIELD.Offering;

/** The season's elective sets (ElectiveMenus.Setup), or an empty one. */
export function electivesOf(setup) {
  const electives = (setup && setup.electives) || {};
  return {
    sets: electives.sets || [],
    offerings: electives.offerings || [],
    linkedChoices: electives.linkedChoices || []
  };
}

/**
 * A set's count, as the grid will show it ("Chugim (4)"): its confirmed offerings (decision 53).
 * 0 or blank seats don't close one (Greg, 2026-10-26: an offering on the table needs seats; the
 * seat run uses no limit and says so): Proposed, or not open to a division or period, is how
 * something isn't offered.
 */
export function openCount(offerings) {
  return (offerings || []).filter((offering) => !offering[OFFER.Proposed])
    .length;
}

/**
 * Each set's confirmed offerings by name, by set Id, in the season's order: what its Excel cell
 * lists ("Chugim (Archery, Drama)"), the same offerings openCount counts.
 */
export function offeringNames(setup) {
  const names = new Map(
    ((setup && setup.activities) || []).map((a) => [a.Id, a.Name])
  );
  const out = new Map();
  electivesOf(setup)
    .offerings.filter((o) => !o[OFFER.Proposed] && names.has(o[OFFER.Activity]))
    .forEach((o) => {
      const set = o[OFFER.ElectiveSet];
      out.set(set, [...(out.get(set) || []), names.get(o[OFFER.Activity])]);
    });
  return out;
}

/**
 * Why a limited offering's seats need a look, or null: "blank" (not filled in yet) or "zero".
 * Either way the seat run places it with no limit and says so (engine care PR 8).
 */
export function seatsNeedingLook(offering) {
  if (offering[OFFER.NoSeatLimit]) {
    return null;
  }
  const seats = offering[OFFER.Seats];
  if (seats === null || seats === undefined || seats === "") {
    return "blank";
  }
  return Number(seats) === 0 ? "zero" : null;
}

/** What to do when seatsNeedingLook says so (Greg, 2026-10-26: the flag says what to do). */
export function seatsLookWords(name, seatsWord = "seats") {
  return `Choose how many ${seatsWord} "${name}" has`;
}

const BLANK = "(blank)";
function asRead(value) {
  return value === null || value === undefined || value === ""
    ? BLANK
    : String(value);
}

/** One row of the list, as an AI reads it, with what to send back as seen to change it. */
function rowForAgent(offering, activity, seatsWord) {
  const seen = {
    seats: asRead(offering[OFFER.Seats]),
    no_seat_limit: offering[OFFER.NoSeatLimit] ? "yes" : "no",
    minimum_to_run: asRead(offering[OFFER.MinimumToRun])
  };
  const look = seatsNeedingLook(offering);
  return {
    activity,
    seats: offering[OFFER.NoSeatLimit] ? "No limit" : seen.seats,
    minimum_to_run:
      seen.minimum_to_run === BLANK ? "No minimum" : seen.minimum_to_run,
    ...(offering[OFFER.Proposed] ? { proposed: true } : {}),
    ...(look ? { look: seatsLookWords(activity, seatsWord) } : {}),
    seen
  };
}

/**
 * A set's rows on the Electives list (API-1.135). read: what /v1/offerings answers ({ elective_set,
 * set_id, setup, labels }). activity: only that row; one the set doesn't offer is said.
 */
export function offeringsForAgent(read, { activity } = {}) {
  const { setup } = read;
  const terms = buildTerms(read.labels);
  const names = new Map(
    ((setup && setup.activities) || []).map((a) => [a.Id, a.Name])
  );
  const rows = electivesOf(setup)
    .offerings.filter((o) => o[OFFER.ElectiveSet] === read.set_id)
    .map((o) =>
      rowForAgent(o, names.get(o[OFFER.Activity]) || "", terms.pIn("Seats"))
    );
  const mine = activity
    ? rows.filter((r) => foldName(r.activity) === foldName(activity))
    : rows;
  return activity && mine.length === 0
    ? {
        error: `${read.elective_set} doesn't offer "${activity}". It offers: ${rows.map((r) => r.activity).join(", ")}.`
      }
    : { elective_set: read.elective_set, offerings: mine };
}
