import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import saveSlots from "@salesforce/apex/GeneratedScheduleController.saveSlots";
import setLocksOnServer from "@salesforce/apex/GeneratedScheduleController.setLocks";
import addActivityOnServer from "@salesforce/apex/GeneratedScheduleController.addActivity";
import getSetupChanges from "@salesforce/apex/SetupMatchController.getSetupChanges";
import updateToMatchSetupOnServer from "@salesforce/apex/SetupMatchController.updateToMatchSetup";
import { reasonOf } from "c/shoreshErrors";
import { notesText } from "c/shoreshEngine";
import { loadedOf, locksOf, saveRequestOf } from "./build";

export {
  ACTION,
  buildForAgent,
  engineInputOf,
  inputFor,
  locksOf
} from "./build";

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
 *   { scheduleId, revision, option, notPlaced, published, engineNotes, input }
 *   scheduleId: the Generated draft, or null before the week's first save
 *   revision: what the draft was saved at; saveWeek sends it back
 *   option: the option the draft was built with (1 when it has none yet)
 *   notPlaced: a blank week's fixed or recurring activities whose slot was taken
 *   published: the week's published schedule beside the draft ({ id, publishedAt, publishedBy,
 *     changedSince }), or null when it has none (or nothing is generated yet)
 *   engineNotes: what the engine said about the week it last built, kept with it (notesOf,
 *     c/shoreshEngine notes.js), or null: none, a restored week, or not the shape it keeps
 *   input: generateWeek's input, without option, mode and terms (the screen adds them)
 * and rejects when the week can't be opened (the screen says what didn't happen: failed()).
 */
export async function loadWeek(programId, weekId) {
  const r = await getInputs({ programId, weekId });
  return loadedOf(r, programId, weekId);
}

/**
 * Saves the week the engine built (its result's days) over what was loaded, with what the engine
 * said about it (engineNotes: notesOf of its result; null for Start over, which builds nothing).
 * Resolves to one of
 *   { status: SAVED, scheduleId, revision, versionId, published, loaded }: loaded is the week
 *     to go on with (what was built, the new revision, the locks kept: none after Start over);
 *     versionId is the version Rebuild, Try another or Start over kept first, or null;
 *     published is the week's published schedule beside the week as saved now, or null
 *   { status: CONFLICT, message }: someone else saved the week since; nothing was written
 *   { status: REFUSED, message }: the server refused it; message is why, in Shoresh's own words
 *     or "Try again." (reasonOf), for the screen to put after what didn't happen (failed())
 */
export async function saveWeek(
  loaded,
  { action, option, days, engineNotes = null }
) {
  const request = saveRequestOf(loaded, {
    action,
    option,
    days,
    engineNotes
  });

  let result;
  try {
    result = await saveWeekOnServer({ request });
  } catch (e) {
    return { status: REFUSED, message: reasonOf(e) };
  }
  if (result.conflict) {
    return { status: CONFLICT, message: result.message };
  }
  return {
    status: SAVED,
    scheduleId: result.scheduleId,
    revision: result.revision,
    versionId: result.versionId || null,
    published: result.published || null,
    // The week to go on with: what was built, at the new revision, with the locks the server
    // kept (none after Start over), replaced together.
    loaded: {
      ...loaded,
      scheduleId: result.scheduleId,
      revision: result.revision,
      engineNotes,
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

/**
 * Each run names its cells' locks as the screen saw them, so nobody's Lock is lost unseen. A run
 * that already names them (the week editor's: the locks on screen when the director made the
 * edit, ADR 0008) keeps its own; never the newer locks of the week as loaded now, which would
 * cover a lock that arrived while the edit waited.
 */
function withLocksSeen(loaded, edits) {
  return (edits || []).map((edit) => ({
    ...edit,
    runs: (edit.runs || []).map((run) => ({
      ...run,
      locksBefore:
        run.locksBefore ||
        (run.blockIds || []).map((blockId) => {
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
 * engineNotes, when given: the engine's notes without the reasons of the cells these edits change
 * (notesWithout), kept with the week when nobody else saved it since; left out, they stay as kept.
 */
export async function saveEdits(loaded, edits, engineNotes) {
  try {
    const result = await saveSlots({
      request: {
        scheduleId: loaded.scheduleId,
        edits: withLocksSeen(loaded, edits),
        revision: loaded.revision,
        engineNotes: engineNotes === undefined ? null : notesText(engineNotes)
      }
    });
    return {
      status: SAVED,
      conflicts: result.conflicts || [],
      schedule: result.schedule,
      loaded: withWeek(loaded, result.schedule, result.revision || "")
    };
  } catch (e) {
    return { status: REFUSED, message: reasonOf(e) };
  }
}

/**
 * "Add <name> to activities" from a cell of the Generated draft (as Manual Build's): resolves to
 * the season's activity by that name, made if there is none ({ id, name, length, notFor, record },
 * ManualBuildController's ActivityOption), or rejects with the server's reason.
 */
export function addActivity({ scheduleId, name }) {
  return addActivityOnServer({ scheduleId, name });
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
    return { status: REFUSED, message: reasonOf(e) };
  }
}

/** Why "Update to match setup" was refused, with nothing changed (SetupMatch). */
export const CHANGED_SINCE = "changedSince";
export const SETUP_CHANGED = "setupChanged";

/**
 * What setup changed since the Generated draft's week was built (Manual Build's SetupMatch, ADR
 * 0010 §56): resolves to { changes, dots, revisions, closedActivityIds, awayGroupIds, problem } (SetupMatch
 * Preview, every list there), or null before the week's first save; rejects when it can't be read.
 */
export async function readSetupChanges(loaded) {
  if (!loaded || !loaded.scheduleId) {
    return null;
  }
  const preview = await getSetupChanges({ scheduleId: loaded.scheduleId });
  return {
    changes: (preview && preview.changes) || [],
    dots: (preview && preview.dots) || [],
    revisions: (preview && preview.revisions) || "",
    closedActivityIds: (preview && preview.closedActivityIds) || [],
    awayGroupIds: (preview && preview.awayGroupIds) || [],
    problem: (preview && preview.problem) || null
  };
}

/**
 * "Update to match setup" on the Generated draft: the chosen changes (keys) of the preview
 * worked out on the week at seenRevisions; versionKept: an earlier update in this opening of the
 * list kept the week as it was already. The draft's locks stay on every cell left as it was.
 * Resolves to { refused: CHANGED_SINCE | SETUP_CHANGED } with nothing changed, or
 * { refused: null, kept } once made (kept: this update kept "Before Update to match setup"); the
 * screen reads the week again (loadWeek). Rejects when the server refuses it.
 */
export async function updateToMatchSetup(
  loaded,
  { keys, seenRevisions, versionKept }
) {
  const result = await updateToMatchSetupOnServer({
    scheduleId: loaded.scheduleId,
    ask: { keys, seenRevisions, versionKept: !!versionKept }
  });
  return {
    refused: (result && result.refused) || null,
    kept: !!(result && result.kept)
  };
}
