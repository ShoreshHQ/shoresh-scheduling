/**
 * What Generated Schedule hands the shared week editor (c-shoresh-week-editor, ADR 0010 §38): the
 * activities it offers to place, as Manual Build's draft has them, and the blocks each group isn't
 * at camp for. Worked out from the week's inputs (c/shoreshGeneratedWeek loadWeek), the same
 * records the engine reads, so the editor and the engine never disagree. Pure: no server, no
 * screen.
 */
import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";

const ACTIVITY = FIELD.Activity;
const ELIGIBILITY = FIELD.ActivityEligibility;

function wholeNumber(value, otherwise) {
  const n = Number(value);
  return value === null || value === undefined || !Number.isFinite(n)
    ? otherwise
    : Math.trunc(n);
}

/** The season's order: sort order (none last), then name, then Id (as ManualBuildViews.options). */
function bySeasonOrder(a, b) {
  const sa = a[ACTIVITY.SortOrder];
  const sb = b[ACTIVITY.SortOrder];
  const has = (x) => typeof x === "number";
  if (has(sa) !== has(sb)) {
    return has(sa) ? -1 : 1;
  }
  if (has(sa) && sa !== sb) {
    return sa - sb;
  }
  const byName = String(a.Name || "").localeCompare(String(b.Name || ""));
  if (byName) {
    return byName;
  }
  return a.Id < b.Id ? -1 : Number(a.Id > b.Id);
}

/**
 * Each activity as the editor offers it ({ id, name, length, minPerWeek, maxPerWeek, notFor }, as
 * ManualBuildController's ActivityOption): notFor lists the week's groups its "who can do it"
 * leaves out (no rows: everyone). input: loadWeek's input; days: the week's days (their groups).
 */
export function activityOptions(input, days) {
  const groupDivision = new Map(
    (input.groups || []).map((g) => [g.Id, g[FIELD.Group.Division] || null])
  );
  const weekGroups = [];
  (days || []).forEach((day) =>
    (day.groups || []).forEach((grp) => {
      if (!weekGroups.includes(grp.id)) {
        weekGroups.push(grp.id);
      }
    })
  );
  const who = new Map();
  (input.eligibilities || []).forEach((row) => {
    const id = row[ELIGIBILITY.Activity];
    if (!who.has(id)) {
      who.set(id, new Set());
    }
    who.get(id).add(row[ELIGIBILITY.Group]);
    who.get(id).add(row[ELIGIBILITY.Division]);
  });
  return [...(input.activities || [])].sort(bySeasonOrder).map((record) => {
    const named = who.get(record.Id);
    return {
      id: record.Id,
      name: record.Name || "",
      length: Math.max(1, wholeNumber(record[ACTIVITY.Length], 1)),
      minPerWeek: Math.max(0, wholeNumber(record[ACTIVITY.TimesPerWeekMin], 0)),
      maxPerWeek: record[ACTIVITY.NoWeeklyMax]
        ? null
        : wholeNumber(record[ACTIVITY.TimesPerWeekMax], null),
      notFor: named
        ? weekGroups.filter(
            (id) =>
              !named.has(id) &&
              !(groupDivision.get(id) && named.has(groupDivision.get(id)))
          )
        : []
    };
  });
}

/**
 * The blocks each group isn't at camp for ([{ groupId, blockIds }], as Manual Build's draft has
 * them), from the engine check's isAway: a group the server no longer sends is away in all.
 */
export function awayRows(days, isAway) {
  const rows = new Map();
  (days || []).forEach((day) =>
    (day.groups || []).forEach((grp) =>
      (day.blocks || []).forEach((block) => {
        if (!isAway(grp.id, block.id)) {
          return;
        }
        if (!rows.has(grp.id)) {
          rows.set(grp.id, new Set());
        }
        rows.get(grp.id).add(block.id);
      })
    )
  );
  return [...rows].map(([groupId, blockIds]) => ({
    groupId,
    blockIds: [...blockIds]
  }));
}

/** The data module's lock ({ date, groupId, blockId }) of a cell key ("date|groupId|blockId"). */
export function lockOf(key) {
  const [date, groupId, blockId] = key.split("|");
  return { date, groupId, blockId };
}
