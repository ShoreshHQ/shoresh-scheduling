/**
 * A Manual Build week checked, as the week editor checks it when its host gives no check of its
 * own: c/shoreshEngine checkWeek on the draft's own records. Pure: no screen. The week editor
 * checks through here, and so does Shoresh's connector when a person's AI reads a Manual Build
 * week's checks (docs/protocol/api.md API-1.44), so the two can never check differently.
 */
import { campFirstDay, campShortWeek } from "c/shoreshImportEngine";
import {
  checkWeek,
  otherProgramsAt,
  readActivities,
  readElectivePlaces,
  readLocations,
  readOtherPrograms,
  readProgram
} from "c/shoreshEngine";
import { replacedDays } from "./specials";
import { dayNameOf, weekMeasure } from "./measure";

/** Each elective set's places (its offerings' places), for "more groups than fit" (ADR 0018 E5). */
export function electivePlacesOf(setup) {
  // As c/shoreshElectiveDetails electivesOf reads them (that module needs a screen to load).
  const electives = (setup && setup.electives) || {};
  return readElectivePlaces(
    electives.offerings || [],
    (setup || {}).activities
  );
}

/**
 * Where setup puts each fixed and recurring activity this week (the draft's setUpCells, Apex
 * ManualSetUpCells): { "date|groupId|blockId": "F:<Id>" | "^F:<Id>" }, or null when the draft
 * has none (setup places none, or a draft read without them).
 */
export function setUpOf(draft) {
  const cells = (draft && draft.setUpCells) || [];
  return cells.length
    ? Object.fromEntries(cells.map((cell) => [cell.key, cell.slot]))
    : null;
}

/**
 * The days checked. draft: Manual Build's draft (its records, away blocks and activities);
 * weekDays: the days; how: { t, setup, electivePlaces, replaced (the days a special day replaces,
 * by date), dayName(dateValue) }.
 */
export function checkManualDays(draft, weekDays, how) {
  const { t, setup, electivePlaces, replaced, dayName } = how;
  // The week's own length, a replaced day too: a short week is one with fewer days (WEEK-4.2).
  const dayCount = weekDays.length;
  // A day a special day replaces is not checked or counted (ADR 0014 slice 4).
  const days = weekDays.filter((day) => !replaced.has(day.dateValue));
  const records = draft || {};
  const entry = {
    divisions: [{ groups: records.groupRecords || [] }],
    fixedActivities: records.fixedActivityRecords || [],
    recurringActivities: records.recurringActivityRecords || []
  };
  const setUp = setUpOf(records);
  const away = new Set();
  (records.away || []).forEach((row) =>
    row.blockIds.forEach((blockId) => away.add(`${row.groupId}|${blockId}`))
  );
  return checkWeek(
    days,
    {
      activities: readActivities(
        records.activityRecords,
        campShortWeek(setup),
        dayCount
      ),
      locations: readLocations(records.locationRecords),
      ...readProgram(entry),
      // An elective set takes up its offerings' places (ADR 0018 slice E5).
      electivePlaces,
      notFor: new Map(
        (records.activities || []).map((a) => [a.id, a.notFor || []])
      ),
      isAway: (groupId, blockId) => away.has(`${groupId}|${blockId}`),
      // One total per week (LOCK-4.10): setup's fixed and recurring cells are left out whatever
      // they hold, so typing over one or clearing it doesn't change the total.
      setUpAt: setUp
        ? (dateValue, groupId, blockId) =>
            setUp[`${dateValue}|${groupId}|${blockId}`] || null
        : null,
      // The camp's normal first day of the week: an early-week goal counts from it.
      firstDay: campFirstDay(setup),
      ...otherProgramsAt(readOtherPrograms(records.otherPrograms), days)
    },
    { t, dayName }
  );
}

/**
 * The counter's measure of a Manual Build week just opened, as the screen's rail shows it: the
 * editor's check of the draft's days, measured. setupDots: cells setup changed, key to words.
 */
export function manualMeasure(draft, { t, setup, setupDots }) {
  const weekDays = draft.schedule.days;
  const checked = checkManualDays(draft, weekDays, {
    t,
    setup,
    electivePlaces: electivePlacesOf(setup),
    replaced: replacedDays(draft),
    dayName: (dateValue) => dayNameOf(dateValue)
  });
  return weekMeasure({ checked, draft, weekDays, setupDots, planName: null });
}
