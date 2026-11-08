import {
  ACTION,
  buildWeek,
  loadedOf,
  saveRequestOf
} from "./engine.shoreshGeneratedWeek.shoreshGeneratedWeek.mjs";
import { nameDaysFor } from "./engine.shoreshImportEngine.shoreshImportEngine.mjs";
import { buildTerms } from "./engine.shoreshTerms.shoreshTerms.mjs";
import { counterWeek } from "./engine.shoreshGeneratedSchedule.counter.mjs";
import { clearedDays } from "./engine.shoreshGeneratedSchedule.week.mjs";

/**
 * Generated Schedule's Build menu for an agent (API-1.127 to API-1.130): Try another, an option
 * brought back, Fill the open cells and Start over, worked out by the connector with the screen's
 * own modules from what the screen reads, so the two can never build differently.
 */

// An Option row in the Build menu: Try another to that option (the screen's handleOption).
const BRING_BACK = "BringBack";

/** What Start over leaves: its cleared days; it builds nothing, so it has no engine notes. */
function startedOver(loaded, { option }) {
  const replaced = ((loaded.input.specials || {}).days || []).map(
    (day) => day.dateValue
  );
  const action = ACTION.START_OVER;
  const days = clearedDays(loaded.input.days, new Set(replaced));
  return {
    ok: true,
    days,
    request: saveRequestOf(loaded, { action, option, days, engineNotes: null })
  };
}

/** Why an option can't be brought back: the screen's Option rows, 1 up to the option it's on. */
function optionRefusal(option, loaded, week) {
  if (option === undefined) {
    return "No option was named. Nothing was changed.";
  }
  const asked = Number(option);
  return Number.isInteger(asked) && asked >= 1 && asked <= loaded.option
    ? null
    : `Option ${option} hasn't been tried for ${week}, which is on Option ${loaded.option}. Nothing was changed.`;
}

/** Why the Build menu can't do this for the week as read (the screen offers no such button). */
function refusal(loaded, { action, option, week }, terms, setup) {
  if (!loaded.scheduleId) {
    return `${week} hasn't been built yet. Nothing was changed.`;
  }
  if (loaded.input.days.length === 0) {
    return `${week} has no days its program runs. Nothing was changed.`;
  }
  if (action === BRING_BACK) {
    return optionRefusal(option, loaded, week);
  }
  return action === ACTION.FILL_OPEN &&
    counterWeek(loaded, { terms, setup }).checked.openCells.length === 0
    ? `${week} has no open cells to fill. Nothing was changed.`
    : null;
}

/** The action the save reads and the option it's for: the screen's handlers, without a screen. */
function howOf(action, option, loaded) {
  switch (action) {
    case BRING_BACK:
      return { action: ACTION.TRY_ANOTHER, option: Number(option) };
    case ACTION.TRY_ANOTHER:
      return { action, option: loaded.option + 1 };
    default:
      return { action, option: loaded.option };
  }
}

/**
 * read: what /v1/build_week answers. how: { action (ACTION's TRY_ANOTHER, FILL_OPEN or START_OVER,
 * or BRING_BACK), week (its name), option (only to bring one back) }. Answers { ok: true, save,
 * said } (save: what /v1/build_week takes back; said: the screen's "Filled 30 of 35."),
 * { ok: true, unchanged } (the option the week is already on: on screen, a click that does
 * nothing), or { ok: false, error }.
 */
export function menuForAgent(read, { action, week, option }) {
  nameDaysFor(read.setup);
  const setup = read.setup;
  const terms = buildTerms(read.labels);
  const loaded = loadedOf(read.inputs || {});
  const refused = refusal(loaded, { action, option, week }, terms, setup);
  if (refused) {
    return { ok: false, error: refused };
  }
  if (action === BRING_BACK && Number(option) === loaded.option) {
    return {
      ok: true,
      unchanged: `${week} is already on Option ${loaded.option}. Nothing was changed.`
    };
  }
  const how = { ...howOf(action, option, loaded), terms, setup };
  const built =
    how.action === ACTION.START_OVER
      ? startedOver(loaded, how)
      : buildWeek(loaded, how);
  if (!built.ok) {
    return built;
  }
  const { request } = built;
  // The count the screen says when a build ends, of the week as it will stand.
  const { filled, total } = counterWeek(
    {
      ...loaded,
      engineNotes: built.notes || null,
      input: {
        ...loaded.input,
        days: built.days,
        locks: how.action === ACTION.START_OVER ? [] : loaded.input.locks
      }
    },
    { terms, setup }
  ).checked.cells;
  return {
    ok: true,
    said: `Filled ${filled} of ${total}.`,
    save: {
      action: how.action,
      revision: request.revision,
      option: request.option,
      days: request.days,
      engine_notes: request.engineNotes
    }
  };
}
