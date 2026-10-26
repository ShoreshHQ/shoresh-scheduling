import { buildTerms } from "c/shoreshTerms";
import { blankSetupNote, floorNote, reasonFor } from "./words";
import { readActivities, readGroups, readLocations } from "./setup";
import {
  BUDGET,
  BUSY,
  FULL,
  LENGTH,
  MIN_COST,
  NO_FIT,
  NONE_FOR,
  OVERLAP,
  SEARCHED,
  TRADE
} from "./week";

/**
 * The engine's notes on a week it built, kept with the saved week (Schedule__c.EngineNotes__c,
 * ADR 0010 "The engine's notes") so the Why list says the same after a reload or on another day
 * (protocol 9.7). Kept as codes and Ids, never sentences: the words are worked out when they are
 * shown, in the camp's words and names as they are then. Shape (version 1):
 *   { v: 1,
 *     open: [[date, groupId, blockId, why, shortGroupId?, shortActivityId?]]: each cell the build
 *       left Open and why (weekRules' code; for MIN_COST, the group and activity a fuller day would
 *       leave short; for TRADE, the group and activity the cell was left Open for),
 *     blank: [[field ("atOnce" or "fit"), activityId or locationId]]: a blank setting taken as 1,
 *     floor: { kind ("frame" or "emptier"), name, built, imported } or null: step 8's floor note,
 *     cut: how many Open cells' reasons were left out to keep it under NOTES_MAX (0 when none) }
 */

export const NOTES_VERSION = 1;
// Under the field's 131,072 characters, with room to spare (the server refuses anything longer).
export const NOTES_MAX = 120000;

// Why a cell is Open (weekRules) -> the words that say so (words.js).
export const OPEN_WHY = Object.freeze({
  [OVERLAP]: BUSY,
  [LENGTH]: NO_FIT,
  [FULL]: FULL,
  [NONE_FOR]: NONE_FOR,
  [SEARCHED]: SEARCHED,
  [MIN_COST]: MIN_COST,
  [BUDGET]: BUDGET,
  [TRADE]: TRADE
});

const BLANK_FIELDS = new Set(["atOnce", "fit"]);

/**
 * The notes to keep for generateWeek's result (or null when there is none): the Open cells past
 * NOTES_MAX are left out, last first, and counted (cut), so a very large camp still saves.
 */
export function notesOf(result) {
  if (!result || !result.ok) {
    return null;
  }
  const floor = result.floor && result.floor.reason ? result.floor : null;
  const notes = {
    v: NOTES_VERSION,
    open: (result.openCells || []).map((c) => {
      const row = [c.date, c.groupId, c.blockId, c.why];
      return c.shortGroupId ? [...row, c.shortGroupId, c.shortActivityId] : row;
    }),
    blank: (result.setupBlank || []).map((b) => [b.field, b.id]),
    floor: floor
      ? {
          // The imported week is only counted once it matches this week's frame.
          kind: floor.imported === null ? "frame" : "emptier",
          name: floor.importedName || null,
          built: floor.built,
          imported: floor.imported
        }
      : null,
    cut: 0
  };
  // Measured once; each row left out takes its text and comma, and cut's count grows a digit.
  let rows = JSON.stringify(notes).length - 1;
  const size = () => rows + String(notes.cut).length;
  while (size() > NOTES_MAX && notes.open.length) {
    rows -= JSON.stringify(notes.open.pop()).length + 1;
    notes.cut += 1;
  }
  return notes;
}

/** The notes as kept on the record (text), or null for none. */
export function notesText(notes) {
  return notes ? JSON.stringify(notes) : null;
}

const isText = (value) => typeof value === "string" && value.length > 0;

/**
 * The notes kept on the record (text) read back, or null when there are none or they are not
 * the shape notesOf makes (another version, damaged): never shown as they are.
 */
export function readNotes(text) {
  if (!isText(text)) {
    return null;
  }
  let notes;
  try {
    notes = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !notes ||
    notes.v !== NOTES_VERSION ||
    !Array.isArray(notes.open) ||
    !Array.isArray(notes.blank)
  ) {
    return null;
  }
  const floor = notes.floor;
  return {
    v: NOTES_VERSION,
    open: notes.open.filter(
      (row) =>
        Array.isArray(row) &&
        (row.length === 4 || row.length === 6) &&
        row.every(isText) &&
        Object.prototype.hasOwnProperty.call(OPEN_WHY, row[3])
    ),
    blank: notes.blank.filter(
      (row) =>
        Array.isArray(row) &&
        row.length === 2 &&
        BLANK_FIELDS.has(row[0]) &&
        isText(row[1])
    ),
    floor:
      floor && (floor.kind === "frame" || floor.kind === "emptier")
        ? {
            kind: floor.kind,
            name: isText(floor.name) ? floor.name : null,
            built: Number.isInteger(floor.built) ? floor.built : 0,
            imported: Number.isInteger(floor.imported) ? floor.imported : 0
          }
        : null,
    cut: Number.isInteger(notes.cut) && notes.cut > 0 ? notes.cut : 0
  };
}

/** The key of an Open cell's row: "date|groupId|blockId", as the Why list keys a cell. */
export function openKey(row) {
  return `${row[0]}|${row[1]}|${row[2]}`;
}

/**
 * What the notes say, for the Why list, in the camp's words (terms) and setup's names now (input:
 * generateWeek's, its groups, activities and locations): { open: "date|groupId|blockId" to the
 * cell's reason, notes: the lines with no cell }. The same words generateWeek gives for the week
 * it built. A row whose group, activity or place is no longer in setup is left out, and so is a
 * blank setting filled in since (the list shows what still needs a look; coordinator, 2026-10-25).
 */
export function whyOf(notes, input, terms) {
  const t = terms || buildTerms([]);
  const groups = readGroups((input && input.groups) || []);
  const named = (records) =>
    new Map((records || []).map((r) => [r.Id, r.Name || ""]));
  const activities = named(input && input.activities);
  const locations = named(input && input.locations);
  const open = new Map();
  ((notes && notes.open) || []).forEach((row) => {
    const [, groupId, , why, shortGroupId, shortActivityId] = row;
    // A cell a fuller day would fill only by leaving a group short names that group and
    // activity (words.js says it plainly without them); every other reason, the cell's group.
    const grp = groups.get(shortGroupId || groupId);
    if (!groups.has(groupId) || (!shortGroupId && !grp)) {
      return;
    }
    open.set(
      openKey(row),
      reasonFor(OPEN_WHY[why], {
        terms: t,
        groupName: grp ? grp.name : "",
        activityName: activities.get(shortActivityId) || ""
      })
    );
  });
  // The settings still blank now, read as the engine reads them (setup.js).
  const blankNow = new Set([
    ...readActivities((input && input.activities) || [], [], null)
      .running.filter((a) => a.atOnceBlank)
      .map((a) => `atOnce|${a.id}`),
    ...readLocations((input && input.locations) || []).blank.map(
      (id) => `fit|${id}`
    )
  ]);
  const lines = [];
  ((notes && notes.blank) || []).forEach(([field, id]) => {
    const name = (field === "fit" ? locations : activities).get(id);
    if (name !== undefined && blankNow.has(`${field}|${id}`)) {
      lines.push(blankSetupNote(field, name, t));
    }
  });
  const floor = notes && notes.floor;
  if (floor) {
    lines.push(floorNote(floor.kind, { ...floor, terms: t }));
  }
  if (notes && notes.cut) {
    lines.push(
      `${notes.cut} more Open ${notes.cut === 1 ? "cell's reason wasn't" : "cells' reasons weren't"} kept with this ${t.sIn("Week")}.`
    );
  }
  return { open, notes: lines };
}

/** The notes without these cells' rows ("date|groupId|blockId"); the same notes when none go. */
export function notesWithout(notes, keys) {
  if (!notes || !keys.size) {
    return notes;
  }
  const open = notes.open.filter((row) => !keys.has(openKey(row)));
  return open.length === notes.open.length ? notes : { ...notes, open };
}
