import { compareText } from "./setup";

/**
 * Protocol rule 9.10 (docs/engine/protocol.md): an activity's name, Id and place in the list never
 * change where anything is placed; only its settings, groups and location do. Greg's swap test
 * (__tests__/swap.test.js): Sports deleted and an identical Adventure Baseball added gives the
 * same week with Sports' cells now Adventure Baseball.
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
 * Two activities whose keys are the same are ordered by name (then Id, only for two with the
 * same name too). This is the one place a name counts, and only between activities nothing else
 * tells apart.
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
 * Map activity id -> its settings key: what it asks for (length, weekly minimum and maximum, same
 * division only, priority, early-week goal) and who it is for. How many it can take at once (groups
 * at once, its place, other programs there) is left out: those are limits the rules check
 * wherever the activity goes, so a smaller place changes only the cells it can no longer take.
 */
export function settingsKeys(model) {
  const keys = new Map();
  for (const a of model.acts) {
    const groups = model.groupIds
      .filter((g) => model.eligibility.get(a.id).has(g))
      .join(",");
    keys.set(
      a.id,
      [
        a.span,
        a.min,
        a.max == null ? "any" : a.max,
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
