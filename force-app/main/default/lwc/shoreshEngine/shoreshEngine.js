import { buildTerms } from "c/shoreshTerms";
import { blankSetupNote, floorNote, reasonFor } from "./words";
import { DAY_NAMES, checkWeek, weekdayOf } from "./checks";
import {
  readElectivePlaces,
  readLocations as readLocationMap
} from "./checkInputs";
import { identity } from "./grid";
import { OPEN_WHY } from "./notes";
import { NOW, nowOf } from "./progress";
import { fuller, importedFilled, sameFrame, seedFromImport } from "./weekFloor";
import {
  atCamp,
  compareText,
  minutes,
  readActivities,
  readDays,
  readEligibility,
  readGroups,
  readLocations,
  readPartsOfDay,
  readSetTimeLocations
} from "./setup";
import {
  BUDGET,
  BUSY,
  FULL,
  MIN_COST,
  NO_FIT,
  NONE_FOR,
  RELAX_ORDER,
  RULE,
  SEARCHED,
  TRADE,
  lockKey,
  scheduleWeekSteps
} from "./week";

export {
  BUDGET,
  BUSY,
  FULL,
  MIN_COST,
  NONE_FOR,
  NO_FIT,
  RELAX_ORDER,
  RULE,
  SEARCHED,
  TRADE,
  reasonFor,
  checkWeek
};
export {
  readActivities,
  readElectivePlaces,
  readLocations,
  readProgram
} from "./checkInputs";
export { measureWeek } from "./measure";
export { NOW } from "./progress";
export {
  NOTES_MAX,
  notesOf,
  notesText,
  notesWithout,
  openKey,
  readNotes,
  whyOf
} from "./notes";

/** How a week is built: every unlocked cell again, or only the Open ones. */
export const MODE = Object.freeze({ FULL: "full", FILL_OPEN: "fillOpen" });

// The most work one Generate may do, over every build it makes (weekState.js runWorkLeft): rule
// checks plus cells the step 8 search looked at. Node does about 1.1 million a second on the
// largest camps, so this is about 40 s there, and in a browser two to three times slower still
// under the 3-minute ceiling. Past it the repairs and the search stop and the week is finished
// as it stands (nothing left blank; a cell still Open says the search ran out of work). The
// largest test camp uses about 20 million (docs/engine/protocol.md, "Step 8 budget").
const RUN_WORK = 40000000;

/**
 * Generated Schedule's engine (ADR 0010): one program's week, built in the browser from the
 * week's grid and the season's setup. Pure: no server calls, no saving, no clock, no
 * Math.random; the same inputs and option always give the same week.
 *
 * input:
 *   programId, weekId, option (1, 2, ... for "Try another"), mode (MODE.FULL keeps locked cells,
 *     fixed and recurring activities and not-set-up items; MODE.FILL_OPEN keeps every filled cell)
 *   days: the week's days as Manual Build's DayView has them
 *     ({ dateValue, blocks: [{ id, name, startTime, endTime }], groups: [{ id, name }],
 *        items: [{ kind, id, name }], rows: ["1,^,", ...] }), fixed and recurring activities in
 *   groups, timeBlocks, activities, eligibilities (ActivityEligibility rows), locations,
 *     fixedActivities, recurringActivities, weekExceptions: the season's records
 *   locks: [{ date, groupId, blockId }]: a lock on any cell of a placement keeps all of it
 *   otherPrograms: [{ date, startTime, endTime, locationId, activityId, groups }]: other
 *     programs' groups in a place (or doing an activity) at a clock time; counted against
 *     groups that fit and groups at once
 *   terms: the camp's words (c/shoreshTerms), for the reasons
 *   replacedDates: the days ("YYYY-MM-DD") a special day replaces (ADR 0014 slice 4; desktop ADR
 *     2026-10-09 D4): nothing is built or counted there, and they come back exactly as sent
 *   electiveOfferings: the season's offerings (Offering__c, setup.electives.offerings): an elective
 *     set on the grid is kept like a lock and takes up the places of its confirmed, open offerings
 *     (readElectivePlaces; ADR 0018 slice E5, desktop electiveOccupancy.js)
 *   imported, importedName: the week as it was imported (DayView days, as `days`) and that
 *     version's name, or nothing: step 8's floor (weekFloor.js). A full build that fills fewer
 *     cells than it is built again from it, and the fuller of the two kept; "fill the open cells"
 *     keeps every filled cell already, so it is not compared there
 *
 * Returns { ok: true, floor, days, flags, stillNeeded, spread, stillNeededBy, spreadBy,
 * setupNotes, setupBlank, overlapping, cells, openCells, ruleChecks }
 * or
 * { ok: false, error }:
 *   days: the same DayView shape, with new rows and items
 *   floor: what step 8's floor found: { importedName, imported (the imported week's filled cells,
 *     counted as `cells` counts them; null when not compared), built (this week's), used ("none":
 *     no import, "fill the open cells", a changed set-up, or no fuller than the first build;
 *     "first": the first build was kept; "seeded": the build from the imported week), reason (in
 *     camp words when the imported week no longer matches this week's set-up, or this week is
 *     still emptier, naming both counts; else null) }
 *   flags: checkWeek's dots on the finished week, one entry per cell of each dotted placement:
 *     [{ date, groupId, blockId, activityId, bends: [RULE...], reason }]. A cell the engine had to
 *     bend a rule for always has one; so does anything kept that breaks a rule
 *   stillNeeded, spread, stillNeededBy, spreadBy, cells: checkWeek's lines, the same as data,
 *     and counts, the same words as Manual Build ("Swim · Bunk 3: 1 still needed by Wednesday")
 *   setupNotes: lines for each blank groups at once (an activity running this week) or groups
 *     that fit (a place one uses), taken as 1: "Arts: Groups at once is blank, so it counts as 1"
 *   setupBlank: the same settings as data, [{ field ("atOnce" or "fit"), id (the activity's or
 *     place's) }], for the notes kept with the saved week (notesOf, notes.js)
 *   overlapping: checkWeek's cells where a placement breaks a rule that time block shares with
 *     other cells: [{ dateValue, groupId, blockId, rules: [RULE... or BUSY], text }]
 *   ruleChecks: how many times a placement was checked against the rules, over every build: the
 *     work done, the same on any machine
 *   openCells: [{ date, groupId, blockId, reason, why }] for an at-camp cell left Open: the group
 *     is busy at an overlapping time ("Already busy then"), everything set up for it is taken
 *     then, nothing running this week is set up for it, no activity's length fits the gap, every
 *     arrangement of the day was tried, filling it would take a group below a weekly minimum, or
 *     the search ran out of work first (why: the code, weekRules.js; BUDGET is the one that is
 *     not a proof); for MIN_COST also shortGroupId and shortActivityId, the group a fuller day
 *     would leave short and of what; TRADE (left Open on purpose so another group gets a weekly
 *     minimum, as a last resort) also has shortGroupId and shortActivityId: that group and activity
 *   moved: each cell the step 8 search changed, in order: [{ date, groupId, blockId, from, to,
 *     why, toFill: [{ date, groupId, blockId }] }] (from/to: activity ids, null for Open; why:
 *     "fill" to fill cells, "minimum" to leave fewer groups short of a weekly minimum with as
 *     many cells filled; toFill: the cells that rearrangement filled)
 */
export function generateWeek(input) {
  const steps = generateWeekSteps(input);
  let step = steps.next();
  while (!step.done) {
    step = steps.next();
  }
  return step.value;
}

/**
 * generateWeek in steps (ADR 0010 §22): a generator that yields how far the build has got, a
 * number from 0 to 1 that only goes up, and returns generateWeek's result. A screen runs a few
 * steps at a time between paints so a big week never freezes the tab; the steps never change
 * the week, so it is the same as generateWeek's. It ends at 1. A week built twice (the minimum
 * repair's leniency, below) spends the first half of the way on the first build; once the first
 * build's minimum repair shows it won't be built again, the rest of the first build fills the
 * rest of the way. watch, if given, holds what the build is working on as it goes (watch.now,
 * progress.js: { code, step, date, dayIndex, groupId, blockId, activityId, toActivityId }), for a
 * progress screen to say in words; the screen reads the latest when it gets the tab back.
 * runWork: the most work the whole run may do (RUN_WORK; a test may set a smaller one).
 */
export function* generateWeekSteps(input, watch = {}, runWork = RUN_WORK) {
  // Step 1: reading the week's setup (a setup that can't be built answers with no steps).
  watch.now = nowOf(NOW.READ, 1);
  const t = input.terms || buildTerms([]);
  const weekId = input.weekId || null;
  const activities = readActivities(
    input.activities,
    input.weekExceptions,
    weekId
  );
  if (!activities.running.length) {
    return {
      ok: false,
      error: activities.total
        ? `No ${t.pIn("Activity")} run this ${t.sIn("Week")}.`
        : `No ${t.pIn("Activity")} are set up yet.`
    };
  }
  const groups = readGroups(input.groups);
  const { built: toBuild, replaced } = splitReplaced(input);
  const days = readDays(toBuild, readPartsOfDay(input.timeBlocks));
  if (!days.length) {
    return {
      ok: false,
      error: replaced.length
        ? `Every day this ${t.sIn("Week")} is a ${t.sIn("SpecialDay")}, so there is nothing to generate.`
        : `This ${t.sIn("Week")} has no days to build.`
    };
  }
  const option = optionOf(input.option);
  if (!option) {
    return { ok: false, error: "That option can't be built." };
  }
  const { fit, names: placeNames, blank } = readLocations(input.locations);
  // Blank groups at once or groups that fit: taken as 1 and said, never 0, never a stop.
  // Which settings those are (field and record), kept with the saved week (notes.js).
  const setupBlank = [
    ...activities.running
      .filter((a) => a.atOnceBlank)
      .map((a) => ({ field: "atOnce", id: a.id, name: a.name })),
    // Only the places an activity running this week uses.
    ...blank
      .filter((id) => activities.running.some((a) => a.locationId === id))
      .map((id) => ({ field: "fit", id, name: placeNames.get(id) }))
  ];
  const setupNotes = setupBlank.map((b) => blankSetupNote(b.field, b.name, t));
  const model = {
    days,
    groups,
    groupIds: groupOrder(groups, days),
    acts: activities.running,
    eligibility: readEligibility(
      activities.running,
      input.eligibilities,
      groups
    ),
    fit,
    setTimeLocation: readSetTimeLocations(
      input.fixedActivities,
      input.recurringActivities
    ),
    locks: new Set(
      (input.locks || []).map((l) => lockKey(l.date, l.groupId, l.blockId))
    ),
    electivePlaces: readElectivePlaces(
      input.electiveOfferings,
      input.activities
    ),
    mode: input.mode === MODE.FILL_OPEN ? MODE.FILL_OPEN : MODE.FULL,
    seed: `${input.programId || ""}|${weekId || ""}|${option}`,
    ...otherPrograms(input.otherPrograms, days)
  };
  const words = { t, dayName: (date) => DAY_NAMES[weekdayOf(date)] || "" };
  // A build fills the bar from `from` by `share`; `once` (it may be the only build in its part of
  // the bar): once that is known, it runs on to `end` instead.
  // The run's work so far, over every build (RUN_WORK).
  let workUsed = 0;
  function* build(settings, from, share, once, end = 1, code = null) {
    if (code) {
      // A second build (the stricter one, or from the imported week): said first.
      watch.now = nowOf(code, 8);
      yield from;
    }
    const notes = {};
    const steps = scheduleWeekSteps(
      { ...settings, runWorkLeft: runWork - workUsed },
      notes
    );
    // Where the bar was when it became known this is the only build (see above), if it is.
    let alone = null;
    // What the build said last, so the watcher's copy (with the day's date) is made only when
    // it changes, not at every step.
    let told = null;
    let step = steps.next();
    while (!step.done) {
      const f = step.value;
      if (once && !alone && notes.settled && !notes.leftForNeverBlank) {
        alone = { f, at: from + share * f };
      }
      if (notes.now !== told) {
        told = notes.now;
        watch.now = {
          ...told,
          date: told.dayIndex == null ? null : days[told.dayIndex].date,
          toDate: told.toDayIndex == null ? null : days[told.toDayIndex].date
        };
      }
      yield alone && alone.f < 1
        ? alone.at + ((f - alone.f) / (1 - alone.f)) * (end - alone.at)
        : from + share * f;
      step = steps.next();
    }
    const state = step.value;
    workUsed += state.ruleChecks + state.looksUsed;
    const built = writeDays(settings, state);
    yield once && !state.leftForNeverBlank ? end : from + share;
    return {
      state,
      built,
      checked: checkWeek(built, checkModel(input, settings, state), words)
    };
  }
  // One build, and when the minimum repair left a cell for never-blank, the same again without
  // that leniency: the week kept is the one no worse (it meets more minimums, or as many with no
  // more bends; ADR 0010).
  function* buildBest(settings, from, share, once, code = null) {
    let best = yield* build(
      settings,
      from,
      share / 2,
      once,
      from + share,
      code
    );
    let checks = best.state.ruleChecks;
    if (best.state.leftForNeverBlank) {
      const strict = yield* build(
        { ...settings, strictRepair: true },
        from + share / 2,
        share / 2,
        false,
        1,
        NOW.AGAIN
      );
      checks += strict.state.ruleChecks;
      if (worse(best.checked, strict.checked)) {
        best = strict;
      }
    }
    return { ...best, ruleChecks: checks };
  }
  const importedDays = (input.imported || []).filter(
    (day) =>
      day &&
      day.dateValue &&
      !replaced.some((r) => r.dateValue === day.dateValue)
  );
  // With an imported week to compare, the first build has the first half of the bar and a build
  // from the imported week the second (the bar jumps to the end when none is needed); else the
  // first build has all of it.
  const floorShare = importedDays.length && model.mode === MODE.FULL ? 0.5 : 0;
  yield 0;
  const first = yield* buildBest(model, 0, 1 - floorShare, true);
  let ruleChecks = first.ruleChecks;
  // Step 8's floor: never emptier than the week as it was imported (weekFloor.js).
  const floor = {
    importedName: input.importedName || null,
    imported: null,
    built: first.checked.cells.filled,
    used: "none",
    reason: null
  };
  let chosen = first;
  if (importedDays.length && model.mode === MODE.FULL) {
    if (!sameFrame(toBuild, importedDays)) {
      floor.reason = floorNote("frame", { name: floor.importedName, terms: t });
    } else {
      const fromImport = readDays(
        importedDays,
        readPartsOfDay(input.timeBlocks)
      );
      // Counted only over the cells this week counts (the first build's week, as it stands).
      floor.imported = importedFilled(
        checkModel(input, model, first.state),
        first.built,
        importedDays
      );
      if (floor.imported > first.checked.cells.filled) {
        const seed = seedFromImport(model, fromImport, writeDays);
        ruleChecks += seed.kept.ruleChecks;
        workUsed += seed.kept.ruleChecks;
        const seededModel = {
          ...model,
          days: readDays(seed.days, readPartsOfDay(input.timeBlocks)),
          mode: MODE.FILL_OPEN
        };
        const seeded = yield* buildBest(
          seededModel,
          1 - floorShare,
          floorShare,
          true,
          NOW.IMPORTED
        );
        ruleChecks += seeded.ruleChecks;
        // Checked as the director's week: only what the first build kept counts as kept, so a
        // weekly-limit dot lands where it would on any other build.
        seeded.checked = checkWeek(
          seeded.built,
          checkModel(input, model, seed.kept),
          words
        );
        if (fuller(seeded.checked, first.checked)) {
          chosen = seeded;
          floor.used = "seeded";
        } else {
          floor.used = "first";
        }
        floor.built = chosen.checked.cells.filled;
        if (floor.built < floor.imported) {
          floor.reason = floorNote("emptier", {
            name: floor.importedName,
            built: floor.built,
            imported: floor.imported,
            terms: t
          });
        }
      }
    }
  }
  if (floorShare) {
    yield 1;
  }
  const { state, built, checked } = chosen;
  return {
    floor,
    ok: true,
    days: withReplaced(built, replaced),
    flags: flagCells(built, checked),
    stillNeeded: checked.stillNeeded,
    spread: checked.spread,
    stillNeededBy: checked.stillNeededBy,
    spreadBy: checked.spreadBy,
    setupNotes,
    setupBlank: setupBlank.map(({ field, id }) => ({ field, id })),
    overlapping: checked.overlapping,
    cells: checked.cells,
    ruleChecks,
    openCells: state.openCells.map(({ key, why, cost }) => {
      const [groupId, d, blockId] = state.splitKey(key);
      // A cell a fuller day would fill only by leaving a group short, or left Open so a group
      // gets a minimum, names that group and activity; every other reason, the cell's own group.
      const named = cost ? cost.groupId : groupId;
      return {
        date: days[d].date,
        groupId,
        blockId,
        reason: reasonFor(OPEN_WHY[why], {
          terms: t,
          groupName: (groups.get(named) || {}).name || "",
          activityName: cost ? state.actById.get(cost.activityId).name : ""
        }),
        why,
        ...(cost
          ? { shortGroupId: cost.groupId, shortActivityId: cost.activityId }
          : {})
      };
    }),
    moved: state.searchMoves.map((m) => ({
      date: days[m.dayIndex].date,
      groupId: m.groupId,
      blockId: m.blockId,
      from: m.from,
      to: m.to,
      why: m.why,
      toFill: m.toFill.map((k) => {
        const [g, d, b] = state.splitKey(k);
        return { date: days[d].date, groupId: g, blockId: b };
      })
    }))
  };
}

/**
 * A Generated week as it stands (built, saved or cleared), checked by the same rules and model
 * the engine checks its own builds with: the screen's dots, counters and lines, worked out again
 * whenever the week is shown, never stored (ADR 0010 §11). input: generateWeek's (days are the
 * week to check; option and mode don't matter). Returns { days, checked, isAway, shortest }: the
 * days in date order (checkWeek's day numbers count in it), checkWeek's answer, whether a group
 * is away from camp in a block (the cells shown hatched; a group the server didn't send is away
 * in all of them), and the shortest activity running this week, in blocks.
 */
export function checkGeneratedWeek(input) {
  const t = input.terms || buildTerms([]);
  const activities = readActivities(
    input.activities,
    input.weekExceptions,
    input.weekId || null
  );
  const groups = readGroups(input.groups);
  const { built: checkedDays, replaced } = splitReplaced(input);
  const days = readDays(checkedDays, readPartsOfDay(input.timeBlocks));
  const model = {
    days,
    groups,
    groupIds: groupOrder(groups, days),
    acts: activities.running,
    eligibility: readEligibility(
      activities.running,
      input.eligibilities,
      groups
    ),
    setTimeLocation: readSetTimeLocations(
      input.fixedActivities,
      input.recurringActivities
    ),
    electivePlaces: readElectivePlaces(
      input.electiveOfferings,
      input.activities
    ),
    // The locks, so a cell locked empty isn't counted as one to fill (G4).
    locks: new Set(
      (input.locks || []).map((l) => lockKey(l.date, l.groupId, l.blockId))
    ),
    ...otherPrograms(input.otherPrograms, days)
  };
  const check = {
    ...checkModel(input, model, null),
    // The placements the director locked (a lock on any of their cells), as the engine keeps
    // them: a weekly-limit dot goes on an unlocked session first.
    locked: lockedHeads(days, model.locks, groups)
  };
  // A group the server didn't send (away this week since the draft was made, G2 §13) keeps its
  // row, but is away in every block: hatched, not counted to fill, nothing goes in.
  const isAway = (groupId, blockId) =>
    !groups.has(groupId) || check.isAway(groupId, blockId);
  const shown = days.map((day) => day.frame);
  return {
    // Every day, a replaced one too (the screen shows the special day there), in date order.
    days: withReplaced(shown, replaced),
    // The days checked and counted: those a special day doesn't replace.
    checkedDays: shown,
    checked: checkWeek(
      shown,
      { ...check, isAway },
      { t, dayName: (date) => DAY_NAMES[weekdayOf(date)] || "" }
    ),
    isAway,
    // The fewest blocks any activity running this week takes: a gap shorter than this fits
    // nothing (the engine's "No activity fits this gap"); null with none running.
    shortest: activities.running.length
      ? Math.min(...activities.running.map((a) => a.span))
      : null
  };
}

/**
 * The week's days split into those to build or check and those a special day replaces
 * (input.replacedDates): a replaced day is never built, checked or counted (desktop ADR
 * 2026-10-09 D4), and is kept exactly as it was.
 */
function splitReplaced(input) {
  const replacedDates = new Set(input.replacedDates || []);
  const all = (input.days || []).filter((day) => day && day.dateValue);
  return {
    built: all.filter((day) => !replacedDates.has(day.dateValue)),
    replaced: all.filter((day) => replacedDates.has(day.dateValue))
  };
}

/** The days with the replaced ones put back as they were, in date order. */
function withReplaced(days, replaced) {
  if (!replaced.length) {
    return days;
  }
  return [...days, ...replaced].sort((a, b) =>
    compareText(a.dateValue, b.dateValue)
  );
}

/**
 * Head keys ("date|groupId|firstBlockId") of the placements the engine keeps as the director's:
 * those with a locked cell, and every placement of a group setup no longer has (the engine keeps
 * those rows whole).
 */
function lockedHeads(days, locks, groups) {
  const heads = new Set();
  for (const day of days) {
    for (const [groupId, tokens] of day.tokens) {
      const kept = !groups.has(groupId);
      tokens.forEach((token, b) => {
        if (
          !token ||
          (!kept && !locks.has(lockKey(day.date, groupId, day.blocks[b].id)))
        ) {
          return;
        }
        let first = b;
        while (first > 0 && tokens[first] === "^") {
          first -= 1;
        }
        if (tokens[first] && tokens[first] !== "^") {
          heads.add(`${day.date}|${groupId}|${day.blocks[first].id}`);
        }
      });
    }
  }
  return heads;
}

/** Every bend the week's dots name: each rule on each dotted placement. */
function bendCount(checked) {
  let n = 0;
  for (const rules of checked.bends.values()) {
    n += rules.length;
  }
  return n;
}

/** Whether week a is worse than week b: fewer minimums met, or as many with more bends. */
function worse(a, b) {
  const short = (c) => c.stillNeeded.length;
  if (short(a) !== short(b)) {
    return short(a) > short(b);
  }
  return bendCount(a) > bendCount(b);
}

/**
 * The option for "Try another": 1, 2, ... (a whole number, or the same in decimal digits). Left out means the
 * first; 0, a fraction or anything else is refused rather than quietly built as option 1, so a
 * screen bug can't show the wrong week as if it were the one asked for.
 */
// The last option a schedule can store (Schedule__c.EngineOption__c holds four digits).
const LAST_OPTION = 9999;

function optionOf(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }
  // A whole number from 1 to LAST_OPTION, or those as plain decimal digits: never "1e3",
  // "0x10" or " 2".
  const option =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isInteger(option) && option > 0 && option <= LAST_OPTION
    ? option
    : null;
}

/**
 * checkWeek's model from the engine's inputs: the activities that run this week, the places,
 * each group's division, where fixed and recurring activities take place, who each activity
 * isn't set up for (and a group setup no longer has isn't set up for anything), not-at-camp
 * blocks, and the activities it kept (locked, or every filled cell in "fill the open cells").
 */
export function checkModel(input, model, state) {
  const groupsInSetup = model.groups;
  const parts = readPartsOfDay(input.timeBlocks);
  const notFor = new Map(
    model.acts.map((act) => [
      act.id,
      model.groupIds.filter((g) => !model.eligibility.get(act.id).has(g))
    ])
  );
  return {
    activities: new Map(model.acts.map((a) => [a.id, a])),
    locations: readLocationMap(input.locations),
    divisions: new Map(
      [...groupsInSetup.values()].map((g) => [g.id, g.division])
    ),
    setTimeLocations: model.setTimeLocation,
    electivePlaces: model.electivePlaces,
    notFor,
    isAway: (groupId, blockId) =>
      groupsInSetup.has(groupId) &&
      !atCamp(groupsInSetup.get(groupId), parts.get(blockId) || null),
    locked: lockedPlacements(model, state),
    isLockedOpen: (groupId, date, blockId) =>
      Boolean(model.locks) && model.locks.has(lockKey(date, groupId, blockId)),
    othersAt: (kind, id, d, blockId) =>
      (kind === "place" ? model.otherPlace : model.otherActivity).get(
        `${id}|${d}|${blockId}`
      ) || 0,
    otherNamesAt: (locationId, d, blockId) =>
      model.otherPlaceNames.get(`${locationId}|${d}|${blockId}`) || []
  };
}

/** The placements (head keys "date|groupId|firstBlockId") of activities the build kept. */
function lockedPlacements(model, state) {
  const keys = new Set();
  if (state) {
    for (const [k, cell] of state.keptCells) {
      if (cell.head && cell.item.kind === "A") {
        const [groupId, d, blockId] = state.splitKey(k);
        keys.add(`${model.days[d].date}|${groupId}|${blockId}`);
      }
    }
  }
  return keys;
}

/** checkWeek's dots, one entry per cell of each dotted placement. */
function flagCells(days, checked) {
  const out = [];
  for (const p of checked.placements) {
    const bends = checked.bends.get(p.key);
    if (!bends) {
      continue;
    }
    const day = days[p.d];
    for (let b = p.first; b < p.first + p.length; b++) {
      out.push({
        date: day.dateValue,
        groupId: p.groupId,
        blockId: day.blocks[b].id,
        activityId: p.id,
        bends: [...bends],
        reason: checked.flags.get(p.key)
      });
    }
  }
  return out;
}

/** Groups in setup order, then any group the grid has that setup doesn't (kept as it is). */
function groupOrder(groups, days) {
  const inGrid = new Set();
  for (const day of days) {
    for (const groupId of day.tokens.keys()) {
      inGrid.add(groupId);
    }
  }
  const known = [...groups.keys()].filter((id) => inGrid.has(id));
  const unknown = [...inGrid].filter((id) => !groups.has(id)).sort(compareText);
  return [...known, ...unknown];
}

/**
 * Other programs' groups for checkWeek's model (othersAt, otherNamesAt), on a week's days as
 * Manual Build's DayView has them: entries as generateWeek's `otherPrograms`, counted and named
 * the same way, so both schedules dot the same over-capacity places with the same words. The day
 * index is the one into `days`.
 */
export function otherProgramsAt(entries, days) {
  const read = readDays(days, new Map());
  const { otherPlace, otherActivity, otherPlaceNames } = otherPrograms(
    entries,
    read
  );
  const indexOf = new Map(read.map((day) => [day.date, day.index]));
  const keyOf = (id, d, blockId) => {
    const index = days && days[d] ? indexOf.get(days[d].dateValue) : undefined;
    return index === undefined ? null : `${id}|${index}|${blockId}`;
  };
  return {
    othersAt: (kind, id, d, blockId) =>
      (kind === "place" ? otherPlace : otherActivity).get(
        keyOf(id, d, blockId)
      ) || 0,
    otherNamesAt: (locationId, d, blockId) =>
      otherPlaceNames.get(keyOf(locationId, d, blockId)) || []
  };
}

/**
 * The server's entries (OtherProgramUse.Entry: dateValue, startTime, endTime, locationId,
 * activityId, groups, names) in generateWeek's `otherPrograms` shape.
 */
export function readOtherPrograms(records) {
  return (records || []).map((r) => ({
    date: r.dateValue,
    startTime: r.startTime,
    endTime: r.endTime,
    locationId: r.locationId || null,
    activityId: r.activityId || null,
    groups: r.groups,
    names: r.names || []
  }));
}

/**
 * Other programs' groups per place and per activity, on each of this program's blocks: the most
 * there at any one moment of the block, not the total of every entry overlapping it. Programs
 * keep their own time grids, so one group across two of their shorter blocks, or two groups one
 * after the other, is one group at a time (ADR 0010 §23). And per place, the names of what they
 * are doing there during the block, in alphabetical order.
 */
function otherPrograms(entries, days) {
  const placeSpans = new Map();
  const activitySpans = new Map();
  const placeNames = new Map();
  const addSpan = (spans, k, span) => {
    if (!spans.has(k)) {
      spans.set(k, []);
    }
    spans.get(k).push(span);
  };
  for (const entry of entries || []) {
    const start = minutes(entry.startTime);
    const end = minutes(entry.endTime);
    // No count means one group; a count of 0 means none.
    const n = entry.groups == null ? 1 : Number(entry.groups);
    if (!(n > 0) || start == null || end == null || end <= start) {
      continue;
    }
    for (const day of days) {
      if (day.date !== entry.date) {
        continue;
      }
      for (const block of day.blocks) {
        if (block.start == null || !(block.start < end && start < block.end)) {
          continue;
        }
        // The part of the entry inside this block.
        const span = [
          Math.max(start, block.start),
          Math.min(end, block.end),
          n
        ];
        if (entry.locationId) {
          const k = `${entry.locationId}|${day.index}|${block.id}`;
          addSpan(placeSpans, k, span);
          if (!placeNames.has(k)) {
            placeNames.set(k, new Set());
          }
          (entry.names || []).forEach((name) => placeNames.get(k).add(name));
        }
        if (entry.activityId) {
          addSpan(
            activitySpans,
            `${entry.activityId}|${day.index}|${block.id}`,
            span
          );
        }
      }
    }
  }
  const busiest = (spans) =>
    new Map([...spans].map(([k, list]) => [k, mostAtOnce(list)]));
  return {
    otherPlace: busiest(placeSpans),
    otherActivity: busiest(activitySpans),
    otherPlaceNames: new Map(
      [...placeNames].map(([k, names]) => [k, [...names].sort(compareText)])
    )
  };
}

/**
 * The most groups present at one moment, from [start, end, groups] spans: a sweep over the start
 * and end times, ends before starts at the same minute (touching times don't overlap). The same
 * whatever order the spans come in.
 */
function mostAtOnce(spans) {
  const changes = [];
  for (const [from, to, n] of spans) {
    changes.push([from, n], [to, -n]);
  }
  changes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let most = 0;
  for (const [, change] of changes) {
    now += change;
    most = Math.max(most, now);
  }
  return most;
}

function activityItem(act) {
  return { kind: "A", id: act.id, name: act.name, gone: false };
}

/** Each day in Manual Build's shape: items in the order cells first use them, rows rebuilt. */
function writeDays(model, state) {
  return model.days.map((day) => {
    const items = [];
    const numbers = new Map();
    const numberOf = (item) => {
      const id = identity(item);
      if (!numbers.has(id)) {
        items.push(item);
        numbers.set(id, items.length);
      }
      return String(numbers.get(id));
    };
    const rows = (day.frame.groups || []).map((group) =>
      day.blocks
        .map((block) => {
          const k = state.cellKey(group.id, day.index, block.id);
          const kept = state.keptCells.get(k);
          if (kept) {
            // A kept activity shows its name as setup has it now (a rename shows the new name).
            const current =
              kept.item.kind === "A" && state.actById.get(kept.item.id);
            return kept.head
              ? numberOf(current ? activityItem(current) : kept.item)
              : "^";
          }
          const actId = state.assigned.get(k);
          if (!actId) {
            return "";
          }
          if (state.spanTails.has(k)) {
            return "^";
          }
          return numberOf(activityItem(state.actById.get(actId)));
        })
        .join(",")
    );
    return { ...day.frame, items, rows };
  });
}
