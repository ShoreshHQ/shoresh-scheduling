/*
 * DIV-1.1 (Greg 2026-10-27): a group may be in no division. It is held alone in a division record
 * flagged NoDivision__c (a group's division is how it knows its program). Only the flag says so:
 * CIT alone in division CIT is a division (DIV-3.1). A holding record is never shown as a
 * division: its group shows by its own name.
 */
import { FIELD } from "c/shoreshSchema";

/** Whether a division record only holds a group that has no division. */
export function holdsNoDivision(division) {
  return !!(division && division[FIELD.Division.NoDivision]);
}

/** A season setup entry's divisions without the holding records ({ division, groups }). */
export function realDivisionsOf(entry) {
  return ((entry && entry.divisions) || []).filter(
    (d) => !holdsNoDivision(d.division)
  );
}

/** The division name to show for a group's entry: none for a holding record. */
export function shownDivisionName(entry) {
  return holdsNoDivision(entry.division) ? "" : entry.division.Name;
}
