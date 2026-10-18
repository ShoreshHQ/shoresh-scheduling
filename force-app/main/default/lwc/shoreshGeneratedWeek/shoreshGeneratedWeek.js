import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import saveSlots from "@salesforce/apex/GeneratedScheduleController.saveSlots";
import setLocksOnServer from "@salesforce/apex/GeneratedScheduleController.setLocks";
import { errorMessage } from "c/shoreshErrors";

/** What a save is for (GeneratedSaves). Rebuild and Start over keep the week as a version first. */
export const ACTION = Object.freeze({
  GENERATE: "Generate",
  REBUILD: "Rebuild",
  TRY_ANOTHER: "TryAnother",
  FILL_OPEN: "FillOpen",
  START_OVER: "StartOver"
});

/** What a lock change does (setLocks). */
export const LOCK = "Lock";
export const UNLOCK = "Unlock";

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
      // Locked cells, as the server stored them (grid format v2); other programs come in G5.
      locks: locksOf(r.days || []),
      otherPrograms: []
    }
  };
}

/**
 * Saves the week the engine built (its result's days) over what was loaded.
 * Resolves to one of
 *   { status: SAVED, scheduleId, revision, versionId, loaded }: loaded is the week to go on
 *     with (what was built, the new revision, the locks kept: none after Start over); versionId
 *     is the version Rebuild, Try another or Start over kept first, or null
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
    versionId: result.versionId || null,
    // The week to go on with: what was built, at the new revision, with the locks the server
    // kept (none after Start over), replaced together.
    loaded: {
      ...loaded,
      scheduleId: result.scheduleId,
      revision: result.revision,
      input: {
        ...loaded.input,
        days: days || [],
        locks: (result.locks || []).map((cell) => ({
          date: cell.dateValue,
          groupId: cell.groupId,
          blockId: cell.blockId
        }))
      }
    }
  };
}

/**
 * generateWeek's input for a build of the loaded week: Start over builds with no locks (it clears
 * them all, after keeping a version); every other build keeps them.
 */
export function inputFor(loaded, action) {
  return action === ACTION.START_OVER
    ? { ...loaded.input, locks: [] }
    : loaded.input;
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

/**
 * The engine's locks ({ date, groupId, blockId }) from the days as the server sends them: each
 * day's lock rows, one per group like its rows, each cell "1" (locked) or empty.
 */
export function locksOf(days) {
  const locks = [];
  for (const day of days) {
    (day.locks || []).forEach((row, g) => {
      String(row)
        .split(",")
        .forEach((cell, b) => {
          if (cell === "1" && day.groups[g] && day.blocks[b]) {
            locks.push({
              date: day.dateValue,
              groupId: day.groups[g].id,
              blockId: day.blocks[b].id
            });
          }
        });
    });
  }
  return locks;
}

/**
 * The week as a hand edit or a lock change left it: its days, their locks and the revision, all
 * replaced together, so a later whole-week save is built on exactly what is saved.
 */
function withWeek(loaded, schedule, revision) {
  const days = (schedule && schedule.days) || [];
  return {
    ...loaded,
    revision,
    input: { ...loaded.input, days, locks: locksOf(days) }
  };
}

/** Whether a cell was locked in the week as loaded (the screen's view of it). */
function lockedIn(loaded, run, blockId) {
  return loaded.input.locks.some(
    (lock) =>
      lock.date === run.day &&
      lock.groupId === run.groupId &&
      lock.blockId === blockId
  );
}

/** Each run names its cells' locks as the screen saw them, so nobody's Lock is lost unseen. */
function withLocksSeen(loaded, edits) {
  return (edits || []).map((edit) => ({
    ...edit,
    runs: (edit.runs || []).map((run) => ({
      ...run,
      locksBefore: (run.blockIds || []).map((blockId) => {
        return lockedIn(loaded, run, blockId) ? "1" : "";
      })
    }))
  }));
}

/**
 * Hand edits on the Generated draft, as Manual Build sends them (c/shoreshManualBuild
 * slotEdits.js runs, each with its blockIds). Every cell an edit changes is locked when it holds
 * something, unlocked when left Open; a run over a cell whose lock changed since is a conflict,
 * like any cell someone else changed. Resolves to
 *   { status: SAVED, conflicts, schedule, loaded }: conflicts as Manual Build's saveSlots;
 *     loaded is the week to go on with (its days and locks as saved now). When someone else
 *     saved the week meanwhile its revision is empty, so a whole-week save from it is a
 *     conflict: loadWeek again before Rebuild, while hand edits can go on from it
 *   { status: REFUSED, message }
 */
export async function saveEdits(loaded, edits) {
  try {
    const result = await saveSlots({
      scheduleId: loaded.scheduleId,
      edits: withLocksSeen(loaded, edits),
      revision: loaded.revision
    });
    return {
      status: SAVED,
      conflicts: result.conflicts || [],
      schedule: result.schedule,
      loaded: withWeek(loaded, result.schedule, result.revision || "")
    };
  } catch (e) {
    return { status: REFUSED, message: errorMessage(e) };
  }
}

/**
 * Lock or unlock (decision 3): changes are [{ action: LOCK | UNLOCK, dateValue, groupId,
 * blockId }]: all three for a cell, dateValue alone for a day, groupId alone for a group, both
 * for a group's day. A lock covers a whole placement; fixed and recurring activities are never
 * locked. Resolves to
 *   { status: SAVED, schedule, loaded }: loaded is the week to go on with
 *   { status: CONFLICT, message }: someone else saved the week since it was loaded; nothing
 *     changed
 *   { status: REFUSED, message }
 */
export async function setLocks(loaded, changes) {
  try {
    const result = await setLocksOnServer({
      scheduleId: loaded.scheduleId,
      changes,
      revision: loaded.revision
    });
    if (result.conflict) {
      return { status: CONFLICT, message: result.message };
    }
    return {
      status: SAVED,
      schedule: result.schedule,
      loaded: withWeek(loaded, result.schedule, result.revision)
    };
  } catch (e) {
    return { status: REFUSED, message: errorMessage(e) };
  }
}
