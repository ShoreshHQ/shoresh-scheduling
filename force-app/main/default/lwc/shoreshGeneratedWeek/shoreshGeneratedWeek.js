import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import { errorMessage } from "c/shoreshErrors";
import { readOtherPrograms } from "c/shoreshEngine";

/** What a save is for (GeneratedSaves). Rebuild and Start over keep the week as a version first. */
export const ACTION = Object.freeze({
  GENERATE: "Generate",
  REBUILD: "Rebuild",
  TRY_ANOTHER: "TryAnother",
  FILL_OPEN: "FillOpen",
  START_OVER: "StartOver"
});

/** How a save ended: saved; someone else saved the week since it was loaded; or refused. */
export const SAVED = "saved";
export const CONFLICT = "conflict";
export const REFUSED = "refused";

/**
 * Generated Schedule's data layer (ADR 0010, G2): loads what the engine (c/shoreshEngine
 * generateWeek) needs for a program's week, and saves the week it built. No field names here:
 * the season's records pass through as the server sends them, already carrying the package's
 * prefix (ADR 0009).
 *
 * loadWeek resolves to
 *   { scheduleId, revision, option, notPlaced, input }
 *   scheduleId: the Generated draft, or null before the week's first save
 *   revision: what the draft was saved at; saveWeek sends it back
 *   option: the option the draft was built with (1 when it has none yet)
 *   notPlaced: a blank week's fixed or recurring activities whose slot was taken
 *   input: generateWeek's input, without option, mode and terms (the screen adds them)
 * and rejects when the week can't be opened (errorMessage gives the sentence).
 */
export async function loadWeek(programId, weekId) {
  const r = await getInputs({ programId, weekId });
  return {
    scheduleId: r.scheduleId || null,
    revision: r.revision || "",
    option: r.option || 1,
    notPlaced: r.notPlaced || [],
    input: {
      // The server's own Ids (18 characters): the engine compares them exactly and seeds with them.
      programId: r.programId || programId,
      weekId: r.weekId || weekId,
      days: r.days || [],
      groups: r.groups || [],
      timeBlocks: r.timeBlocks || [],
      activities: r.activities || [],
      eligibilities: r.eligibilities || [],
      locations: r.locations || [],
      fixedActivities: r.fixedActivities || [],
      recurringActivities: r.recurringActivities || [],
      weekExceptions: r.weekExceptions || [],
      // Locks are stored from G4 (grid format v2).
      locks: [],
      // Other programs' published schedules, or fixed and recurring activities, this week (G5).
      otherPrograms: readOtherPrograms(r.otherPrograms)
    }
  };
}

/**
 * Saves the week the engine built (its result's days) over what was loaded.
 * Resolves to one of
 *   { status: SAVED, scheduleId, revision, versionId }: loaded's scheduleId and revision for
 *     the next save; versionId is the version Rebuild or Start over kept first, or null
 *   { status: CONFLICT, message }: someone else saved the week since; nothing was written
 *   { status: REFUSED, message }: the server refused it (a fixed activity moved, ...)
 */
export async function saveWeek(loaded, { action, option, days }) {
  const request = {
    programId: loaded.input.programId,
    weekId: loaded.input.weekId,
    scheduleId: loaded.scheduleId,
    revision: loaded.revision,
    action,
    option,
    days: (days || []).map(dayToSave)
  };
  let result;
  try {
    result = await saveWeekOnServer({ request });
  } catch (e) {
    return { status: REFUSED, message: errorMessage(e) };
  }
  if (result.conflict) {
    return { status: CONFLICT, message: result.message };
  }
  return {
    status: SAVED,
    scheduleId: result.scheduleId,
    revision: result.revision,
    versionId: result.versionId || null
  };
}

/** Only what the server reads: the day, its frame's Ids, and the grid's items and rows. */
function dayToSave(day) {
  return {
    dateValue: day.dateValue,
    blockIds: (day.blocks || []).map((b) => b.id),
    groupIds: (day.groups || []).map((g) => g.id),
    items: (day.items || []).map(({ kind, id, name }) => ({
      kind,
      id: id || "",
      name
    })),
    rows: day.rows || []
  };
}
