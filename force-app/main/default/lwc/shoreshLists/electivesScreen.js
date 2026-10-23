/*
 * The Electives screen's list (plan §6.2, slice E4): the offerings of every elective set, one
 * row each. An offering is named by its activity and belongs to one set, so the list is scoped
 * by set as a program's lists are by program (scope.js resolveSets): the set column can be left
 * out by a camp with one set. An activity the season doesn't have is added with the list, as one
 * added by hand starts.
 *
 * An offering a list adds is proposed unless the file says otherwise (desktop
 * electiveSetPopulate.js: an import only ever proposes; the director confirms on the screen).
 * Seats: a number (0 is closed), "No limit", or blank (not filled in yet); a list without a
 * Seats column offers each new one with no limit, as the desktop's import does.
 *
 * Not on the list: who and where, which are the activity's (the screen shows them, read only),
 * and linked choices (slice E8).
 */
import { FIELD } from "c/shoreshSchema";
import { NONE } from "./cells";

const OFFER = FIELD.Offering;

/** An offering as the list matches it: named by its activity, in its set. */
function offeringRecords(setup) {
  const electives = (setup && setup.electives) || {};
  const setName = new Map((electives.sets || []).map((s) => [s.Id, s.Name]));
  const activityName = new Map(
    ((setup && setup.activities) || []).map((a) => [a.Id, a.Name])
  );
  return (electives.offerings || [])
    .filter((o) => setName.has(o[OFFER.ElectiveSet]))
    .map((o) => ({
      ...o,
      Name: activityName.get(o[OFFER.Activity]) || "",
      _programId: o[OFFER.ElectiveSet],
      _programName: setName.get(o[OFFER.ElectiveSet])
    }))
    .sort(
      (x, y) =>
        x._programName.localeCompare(y._programName) ||
        x.Name.localeCompare(y.Name)
    );
}

export function electivesScreen(t) {
  return {
    key: "electives",
    kind: "Offering",
    term: "Offering",
    // Each row is in an elective set (scope.js resolveSets).
    scope: "set",
    columns: [
      {
        key: "set",
        heading: t.s("ElectiveSet"),
        words: ["elective set", "set", "elective period", "period"],
        type: "text",
        scope: true,
        fromRecord: (r) => r._programName
      },
      {
        // The offering's name is its activity's (an offering's own name is a number).
        key: "name",
        heading: t.s("Activity"),
        words: ["activity", "activity name", "offering", "elective", "chug"],
        type: "text",
        required: true,
        // Resolved to one of the season's activities, or one added with the list (scope.js
        // resolveOfferedActivities); not "activity", which is the activities list's rain plan.
        ref: "offeredActivity",
        refField: OFFER.Activity,
        fromRecord: (r) => r.Name
      },
      {
        key: "seats",
        heading: "Seats",
        words: ["capacity", "spaces", "spots", "places", "max campers"],
        type: "wholeOrNone",
        none: "No limit",
        min: 0,
        // Blank is "not filled in yet", on an offering set up and on a new one alike.
        blankNew: null,
        newValue: NONE,
        fromRecord: (r) => {
          if (r[OFFER.NoSeatLimit]) {
            return NONE;
          }
          const seats = r[OFFER.Seats];
          return seats === null || seats === undefined ? null : seats;
        },
        write: (v) => {
          return v === NONE
            ? { [OFFER.NoSeatLimit]: true, [OFFER.Seats]: null }
            : { [OFFER.NoSeatLimit]: false, [OFFER.Seats]: v ?? null };
        }
      },
      {
        key: "minimum",
        heading: "Minimum",
        words: ["minimum to run", "min", "min campers", "minimum campers"],
        type: "whole",
        min: 1,
        fromRecord: (r) => {
          const minimum = r[OFFER.MinimumToRun];
          return minimum === null || minimum === undefined ? null : minimum;
        },
        write: (v) => ({ [OFFER.MinimumToRun]: v ?? null })
      },
      {
        key: "proposed",
        heading: "Proposed",
        words: ["proposed", "not confirmed"],
        type: "yesNo",
        // A list without this column proposes what it adds.
        newValue: true,
        fromRecord: (r) => !!r[OFFER.Proposed],
        write: (v) => ({ [OFFER.Proposed]: !!v })
      }
    ],
    records: offeringRecords
  };
}
