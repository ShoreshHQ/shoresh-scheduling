import { compareText } from "./engine.shoreshTerms.shoreshTerms.mjs";

/**
 * Protocol rule 9.10 (docs/engine/protocol.md): a fresh build never depends on an activity's place
 * in the list or its Id; between activities with identical settings (twins) the name breaks the
 * tie. Greg's swap test (__tests__/swap.test.js): Sports, which has no twin, swapped for an
 * identical Adventure Baseball gives the same week. Rebuild builds fresh too (protocol 10.13, Greg
 * 2026-11-12), so a renamed twin can trade places there as on Generate.
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
  // Another program doing an activity counts against its groups at once, not its place: folding
  // the place into groups at once would count those groups against the place too (seed 198).
  const placeOf = new Map(model.acts.map((a) => [a.id, a.locationId]));
  for (const key of (model.otherActivity || new Map()).keys()) {
    outside.add(placeOf.get(key.split("|")[0]));
  }
  for (const list of (model.electivePlaces || new Map()).values()) {
    for (const p of list || []) {
      outside.add(typeof p === "string" ? p : p && p.locationId);
    }
  }
  return { users, outside };
}

/**
 * Each activity's area of camp (ADR 0031 piece C), by Id: only when the camp's places are in two
 * or more areas, since with one area or none nothing is ever a walk. Empty otherwise.
 */
function areasOf(model) {
  const areas = model.areas || new Map();
  if (new Set(areas.values()).size < 2) {
    return new Map();
  }
  return new Map(
    model.acts
      .filter((a) => areas.has(a.locationId))
      .map((a) => [a.id, areas.get(a.locationId)])
  );
}

/**
 * Map activity id -> its settings key: length, weekly minimum and maximum, groups at once (lowered
 * to the groups that fit at a place it has to itself), same division only, priority, early-week
 * goal, who it is for, a place it shares with others, when it can't run, and its area of camp.
 */
function settingsKeys(model) {
  const keys = new Map();
  const { users, outside } = sharedPlaces(model);
  const areas = areasOf(model);
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
        groups,
        // When it can't run (ADR 0031 A3): only said when it has some, so a camp that unticks
        // nothing keeps every key, and so every week, exactly as before.
        ...(a.off && a.off.size ? [`off:${[...a.off].sort().join(",")}`] : []),
        // Its area of camp (ADR 0031 C2): only in a camp with two or more, so a camp with none
        // keeps every key, and so every week, exactly as before.
        ...(areas.has(a.id) ? [`area:${areas.get(a.id)}`] : [])
      ].join("/")
    );
  }
  return keys;
}

/**
 * The activities as a build works with them: in settings-key order (the same key: by name, then
 * Id), and an activity alone at its place built as having no place, its groups at once lowered to
 * the groups that fit, so the place alone never changes what the build does. Each activity keeps
 * its area of camp (area) in a camp with two or more, its place or not. Returns { acts }.
 */
export function actsAsBuilt(model) {
  const settingsKey = settingsKeys(model);
  const { users, outside } = sharedPlaces(model);
  const areas = areasOf(model);
  const acts = inSettingsOrder(model.acts, settingsKey).map((built) => {
    const a = areas.has(built.id)
      ? { ...built, area: areas.get(built.id) }
      : built;
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
function inSettingsOrder(acts, keys) {
  return [...acts].sort(
    (a, b) =>
      compareText(keys.get(a.id), keys.get(b.id)) ||
      compareText(a.name, b.name) ||
      compareText(a.id, b.id)
  );
}
