/**
 * The week as Generated Schedule checks it for the rail's counter: the days checked by the
 * engine's rules, each Open cell with why, and the draft the week editor measures (its counter's
 * lines come from c/shoreshWeekEditor measure.js and c/shoreshWeekChecks lines.js). Shared by the
 * screen and Shoresh's connector, which reads a week's checks for an agent with this same code
 * (docs/protocol/api.md API-1.30), so the two can never check differently. Pure: no server, no
 * screen.
 */
import { checkGeneratedWeek, whyOf } from "c/shoreshEngine";
import { engineInputOf } from "c/shoreshGeneratedWeek";
import { lockedKeys } from "./locks";
import { openCells } from "./week";
import { activityOptions, awayRows, lockOf } from "./editing";

/**
 * Days checked by the engine's rules with these locks ({ date, groupId, blockId }): { days,
 * checked (with openCells and notes, the Why list's), isAway, locked, shortest }. Each Open cell
 * says the engine's own reason when the build left it Open (engineWhy: c/shoreshEngine whyOf),
 * else what the week as it stands shows. loaded: the week as loadWeek answers it; terms: the
 * camp's words; setup: the season's setup.
 */
export function checkDays(loaded, { terms, setup, engineWhy }, days, locks) {
  const week = checkGeneratedWeek({
    ...engineInputOf(loaded.input, { days, terms, setup }),
    locks
  });
  const locked = lockedKeys(locks);
  // A cell the director locked empty is kept empty: not Open, not to fill (G4 §31).
  const open = openCells(
    week.checkedDays,
    week.isAway,
    terms,
    week.shortest,
    (dateValue, groupId, blockId) =>
      locked.has(`${dateValue}|${groupId}|${blockId}`),
    engineWhy ? engineWhy.open : undefined
  );
  return {
    ...week,
    locked,
    checked: {
      ...week.checked,
      openCells: open,
      // A short week's lowered minimums first (WEEK-4.2), then the engine's own notes.
      notes: [...week.shortWeek, ...(engineWhy ? engineWhy.notes : [])]
    }
  };
}

/** The week as the editor shows it: the days checked, the activities to place, where groups are away. */
export function editorDraftOf(loaded, week) {
  const input = loaded.input;
  return {
    schedule: { schedule: { id: loaded.scheduleId }, days: week.days },
    activities: activityOptions(input, week.days),
    away: awayRows(week.days, week.isAway),
    // The season's special events and the week's special days (ADR 0014 slice 4).
    specials: input.specials || null,
    // What a rainy day reads (outdoors, rain plans, places and other programs), under the names
    // Manual Build's draft gives them (repo docs/adr/0019).
    activityRecords: input.activities || [],
    locationRecords: input.locations || [],
    fixedActivityRecords: input.fixedActivities || [],
    recurringActivityRecords: input.recurringActivities || [],
    otherPrograms: input.otherPrograms || []
  };
}

/**
 * What the counter measures for a week just opened, as the screen hands it on: the week checked,
 * the editor's draft and the check the editor makes of the days it shows (with the locks it was
 * given). { week, draft, checked }.
 */
export function counterWeek(loaded, { terms, setup }) {
  const engineWhy = loaded.engineNotes
    ? whyOf(loaded.engineNotes, loaded.input, terms)
    : null;
  const how = { terms, setup, engineWhy };
  const week = checkDays(loaded, how, loaded.input.days, loaded.input.locks);
  const draft = editorDraftOf(loaded, week);
  const locks = [...lockedKeys(loaded.input.locks)].map(lockOf);
  return {
    week,
    draft,
    checked: checkDays(loaded, how, draft.schedule.days, locks).checked
  };
}
