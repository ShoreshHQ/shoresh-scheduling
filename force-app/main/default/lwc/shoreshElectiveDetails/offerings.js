/**
 * A season's elective sets and their confirmed offerings, as Electives setup counts them and a
 * schedule's Excel file lists them. Pure, so the connector works a file out with it too
 * (API-1.86, API-1.87).
 */
import { FIELD } from "c/shoreshSchema";

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
