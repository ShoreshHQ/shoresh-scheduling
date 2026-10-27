import { compareText } from "./setup";

/**
 * Protocol rule 9.10 (docs/engine/protocol.md): a fresh build never depends on an activity's place
 * in the list or its Id; between activities with identical settings (twins) the name breaks the
 * tie. Replacing one activity without moving anything else is guaranteed by Rebuild keeping the
 * week (weekKeep.js, protocol section 10, Greg 2026-10-27), not here. Greg's swap test (__tests__/swap.test.js): Sports,
 * which has no twin, swapped for an identical Adventure Baseball gives the same week.
 *
 * So a build never sees the list's order: it works through the activities in settings-key order
 * (settingsKeys), and everything that goes through them in turn follows that order: the
 * tie-break draws (weekOptions.js drawTieKeys, weekPlace.js short-supply draws), and every
 * "first that fits" choice. An activity swapped for one with the same settings takes its place in
 * that order, so it draws the same numbers and is tried at the same moments. A place no other activity,
 * set-time activity, elective or other program uses only limits how many groups fit, so the build
 * takes it as that limit on groups at once (a field that fits 2 for an activity of 2 at once is
 * the same as no place at all).
 *
 * Two activities whose keys are the same (twins) are ordered by name (then Id, only for two with
 * the same name too): renaming one can move cells. This is the one place a name counts.
 */

function sharedPlaces(model) {
  const users = new Map();
  const use = (id) => id && users.set(id, (users.get(id) || 0) + 1);
  model.acts.forEach((a) => use(a.locationId));
  const outside = new Set();
  for (const id of (model.setTimeLocation || new Map()).values()) {
    if (id) {
      outside.add(id);
    }
  }
  for (const key of (model.otherPlace || new Map()).keys()) {
    outside.add(key.split("|")[0]);
  }
  for (const list of (model.electivePlaces || new Map()).values()) {
    for (const p of list || []) {
      outside.add(typeof p === "string" ? p : p && p.locationId);
    }
  }
  return { users, outside };
}

/**
 * Map activity id -> its settings key: length, weekly minimum and maximum, groups at once (lowered
 * to the groups that fit at a place it has to itself), same division only, priority, early-week
 * goal, who it is for, and a place it shares with others.
 */
export function settingsKeys(model) {
  const keys = new Map();
  const { users, outside } = sharedPlaces(model);
  for (const a of model.acts) {
    const loc = a.locationId;
    const fit =
      loc && model.fit && model.fit.has(loc) ? model.fit.get(loc) : null;
    const shared = fit != null && (users.get(loc) > 1 || outside.has(loc));
    let atOnce = a.atOnce == null ? "any" : a.atOnce;
    if (fit != null && !shared) {
      atOnce = atOnce === "any" ? fit : Math.min(atOnce, fit);
    }
    const groups = model.groupIds
      .filter((g) => model.eligibility.get(a.id).has(g))
      .join(",");
    keys.set(
      a.id,
      [
        a.span,
        a.min,
        a.max == null ? "any" : a.max,
        atOnce,
        shared ? `at:${loc}` : "",
        a.sameDivision ? "same" : "",
        a.priority,
        a.early ? `${a.early.count}by${a.early.byDay}` : "",
        groups
      ].join("/")
    );
  }
  return keys;
}

/**
 * The activities as a build works with them: in settings-key order (the same key: by name, then
 * Id), and an activity alone at its place built as having no place, its groups at once lowered to
 * the groups that fit, so the place alone never changes what the build does. Returns
 * { acts }.
 */
export function actsAsBuilt(model) {
  const settingsKey = settingsKeys(model);
  const { users, outside } = sharedPlaces(model);
  const acts = inSettingsOrder(model.acts, settingsKey).map((a) => {
    const loc = a.locationId;
    if (
      !loc ||
      !model.fit ||
      !model.fit.has(loc) ||
      users.get(loc) > 1 ||
      outside.has(loc)
    ) {
      return a;
    }
    const fit = model.fit.get(loc);
    return {
      ...a,
      locationId: null,
      atOnce: a.atOnce == null ? fit : Math.min(a.atOnce, fit)
    };
  });
  return { acts };
}

/** The activities in settings-key order; the same key: by name, then Id. */
export function inSettingsOrder(acts, keys) {
  return [...acts].sort(
    (a, b) =>
      compareText(keys.get(a.id), keys.get(b.id)) ||
      compareText(a.name, b.name) ||
      compareText(a.id, b.id)
  );
}
