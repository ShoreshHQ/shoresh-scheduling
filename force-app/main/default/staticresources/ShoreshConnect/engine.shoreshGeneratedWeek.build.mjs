import {
  MODE,
  generateWeek,
  notesOf,
  notesText,
  readNotes,
  readOtherPrograms
} from "./engine.shoreshEngine.shoreshEngine.mjs";
import {
  campFirstDay,
  campShortWeek,
  nameDaysFor
} from "./engine.shoreshImportEngine.shoreshImportEngine.mjs";
import { buildTerms } from "./engine.shoreshTerms.shoreshTerms.mjs";

/**
 * Building a week without the server: what Generated Schedule reads turned into the engine's
 * input, and the week it built turned into what the save reads. Shared by Generated Schedule
 * (through shoreshGeneratedWeek.js) and Shoresh's connector, which builds a week for an agent
 * with this same code (docs/protocol/api.md API-1.19), so the two can never build differently.
 */

/** What a save is for (GeneratedSaves). Rebuild and Start over keep the week as a version first. */
export const ACTION = Object.freeze({
  GENERATE: "Generate",
  REBUILD: "Rebuild",
  TRY_ANOTHER: "TryAnother",
  FILL_OPEN: "FillOpen",
  START_OVER: "StartOver"
});

/** The week as loadWeek answers it, from what getInputs answered (r). */
export function loadedOf(r, programId, weekId) {
  return {
    scheduleId: r.scheduleId || null,
    revision: r.revision || "",
    option: r.option || 1,
    notPlaced: r.notPlaced || [],
    published: r.published || null,
    engineNotes: readNotes(r.engine && r.engine.notes),
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
      // Locked cells, as the server stored them (grid format v2).
      locks: locksOf(r.days || []),
      // Other programs' published schedules, or fixed and recurring activities, this week (G5).
      otherPrograms: readOtherPrograms(r.otherPrograms),
      // The week's days a special day replaces (ADR 0014 slice 4).
      specials: r.specials || { days: [] },
      // The week as it was imported and that version's name: the engine's floor (step 8).
      imported: (r.engine && r.engine.imported && r.engine.imported.days) || [],
      importedName:
        (r.engine && r.engine.imported && r.engine.imported.name) || null
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

/**
 * The engine's input on these days, with the camp's words (terms) and what the season's setup
 * adds: the days a special day replaces, the elective offerings, the camp's first day and its
 * "In a short week" choice.
 */
export function engineInputOf(base, { days, terms, setup }) {
  const specials = base.specials;
  const electives = (setup && setup.electives) || {};
  return {
    ...base,
    days,
    terms,
    // Days a special day replaces: nothing is built, checked or counted there (ADR 0014).
    replacedDates: ((specials && specials.days) || []).map(
      (day) => day.dateValue
    ),
    // The season's offerings: an elective set on the grid takes up their places (ADR 0018
    // slice E5).
    electiveOfferings: electives.offerings || [],
    // The camp's normal first day of the week: an early-week goal counts from it.
    firstDay: campFirstDay(setup),
    // The camp's "In a short week" choice: keep each weekly minimum, or lower it (WEEK-4.2).
    shortWeek: campShortWeek(setup)
  };
}

/** What the server's save reads (GeneratedWeek.Save), for the week the engine built. */
export function saveRequestOf(loaded, { action, option, days, engineNotes }) {
  return {
    programId: loaded.input.programId,
    weekId: loaded.input.weekId,
    scheduleId: loaded.scheduleId,
    revision: loaded.revision,
    action,
    option,
    days: (days || []).map(dayToSave),
    engineNotes: notesText(engineNotes)
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
 * How the engine builds for each action (Greg 2026-10-27, protocol section 10): Rebuild keeps the
 * week as it is and changes only what setup forces; Generate and Try another build it fresh;
 * Fill the open cells keeps every filled cell.
 */
function modeOf(action) {
  if (action === ACTION.FILL_OPEN) {
    return MODE.FILL_OPEN;
  }
  return action === ACTION.REBUILD ? MODE.KEEP : MODE.FULL;
}

/**
 * generateWeek's whole input for building the loaded week (not Start over, which builds nothing):
 * the action's mode, the option, the camp's words (terms) and the season's setup. The engine's
 * notes are the ones the server kept with the week (loaded.engineNotes), so every build of the
 * same records is the same, after a reload or through an agent.
 */
export function buildInputOf(loaded, { action, option, terms, setup }) {
  const notes = loaded.engineNotes;
  return {
    ...engineInputOf(inputFor(loaded, action), {
      days: loaded.input.days,
      terms,
      setup
    }),
    option,
    mode: modeOf(action),
    // Each weekly minimum as the week was built: Rebuild moves cells only for a minimum the
    // setup change left short (rule 10.6). Unknown for a week built before they were kept.
    builtMinimums: notes && notes.mins.length ? notes.mins : null
  };
}

/**
 * The week generateWeek built (result) for the loaded week: { ok: true, days, notes, request },
 * notes being what the engine said about it (notesOf) and request what the server's save reads;
 * or { ok: false, error } in the engine's own words.
 */
export function builtWeekOf(loaded, { action, option }, result) {
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  const notes = notesOf(result);
  return {
    ok: true,
    days: result.days,
    notes,
    request: saveRequestOf(loaded, {
      action,
      option,
      days: result.days,
      engineNotes: notes
    })
  };
}

/**
 * Builds the loaded week at once: buildInputOf, generateWeek, builtWeekOf. Generated Schedule
 * runs the same input through its pieces runner instead (so the tab never feels stuck), which
 * builds the same week.
 */
export function buildWeek(loaded, how) {
  return builtWeekOf(loaded, how, generateWeek(buildInputOf(loaded, how)));
}

/**
 * A week built for an agent (API-1.19), as Generated Schedule's own buttons build it: Generate
 * when the week has never been built, else Rebuild (it keeps the week, changing only what setup
 * forces), on the option the week was built with, locks kept. read: what /v1/build_week answers
 * ({ inputs, setup, labels }: getInputs, the season's setup and the camp's words). Answers
 * { ok: true, save } (save: what /v1/build_week takes back) or { ok: false, error } in the
 * engine's own words.
 */
export function buildForAgent(read) {
  nameDaysFor(read.setup);
  const loaded = loadedOf(read.inputs || {});
  const built = buildWeek(loaded, {
    action: loaded.scheduleId ? ACTION.REBUILD : ACTION.GENERATE,
    option: loaded.option,
    terms: buildTerms(read.labels),
    setup: read.setup
  });
  if (!built.ok) {
    return built;
  }
  const { request } = built;
  return {
    ok: true,
    save: {
      revision: request.revision,
      option: request.option,
      days: request.days,
      engine_notes: request.engineNotes
    }
  };
}
