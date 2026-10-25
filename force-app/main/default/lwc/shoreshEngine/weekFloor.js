import { countedCells } from "./checks";
import { CARRIES_ON, slots } from "./grid";
import { readGrid } from "./weekFixed";
import { check } from "./weekOptions";
import { PREFERENCES, RULE } from "./weekRules";
import { createWeekState } from "./weekState";

/**
 * Step 8's floor (care plan step 8, Greg 2026-10-25; docs/engine/protocol.md 8.19-8.23): a full
 * build is never emptier than the week as it was imported. When the first build fills fewer cells
 * than the imported week, a second build starts from it: what the director keeps (locks, hand
 * edits, fixed and set-time activities, specials, electives) stays as it is, the imported week's
 * activity goes into every other cell where it is still allowed, and the rest is filled as "fill
 * the open cells" fills it. shoreshEngine.js compares the two.
 */

/** Ids of a day's time blocks in order, and its groups' ids sorted: a day's frame. */
function frameOf(day) {
  return {
    blocks: (day.blocks || []).map((b) => b.id).join("|"),
    groups: (day.groups || [])
      .map((g) => g.id)
      .sort()
      .join("|")
  };
}

/**
 * Whether the imported week's days, time blocks and groups are still this week's (the days to
 * build; a day a special day replaces is left out of both). A day that couldn't be read is not a
 * match.
 */
export function sameFrame(days, imported) {
  if (days.length !== imported.length) {
    return false;
  }
  const byDate = new Map(imported.map((day) => [day.dateValue, day]));
  return days.every((day) => {
    const other = byDate.get(day.dateValue);
    if (!other || other.problem || day.problem) {
      return false;
    }
    const a = frameOf(day);
    const b = frameOf(other);
    return a.blocks === b.blocks && a.groups === b.groups;
  });
}

/**
 * How many of the cells this week counts (checks.js countedCells on this week's days, ctx its
 * checkWeek model) the imported week holds an activity in. A cell this week no longer counts (a
 * fixed or recurring activity, a special or an elective there now, a group away, a cell locked
 * Open) isn't counted for the imported week either, and neither is a cell the imported week held
 * something other than an activity in: the floor is what a build could put back.
 */
export function importedFilled(ctx, days, imported) {
  const byDate = new Map(imported.map((day) => [day.dateValue, day]));
  const rowOf = new Map();
  const slotOf = (day, groupId, b) => {
    const k = `${day.dateValue}|${groupId}`;
    if (!rowOf.has(k)) {
      const other = byDate.get(day.dateValue);
      const g = other ? other.groups.findIndex((x) => x.id === groupId) : -1;
      rowOf.set(k, g < 0 ? [] : slots(other, g));
    }
    const slot = rowOf.get(k)[b] || "";
    return slot.startsWith(CARRIES_ON) ? slot.slice(1) : slot;
  };
  return countedCells(ctx, days).filter((c) =>
    slotOf(c.day, c.groupId, c.b).startsWith("A:")
  ).length;
}

/**
 * The imported week's activity placements on `importDays` (readDays' shape, the same dates and
 * frame as model.days), in a fixed order: day, then group in build order, then time block.
 */
function placementsOf(model, importDays) {
  const out = [];
  importDays.forEach((day, d) => {
    for (const groupId of model.groupIds) {
      const tokens = day.tokens.get(groupId);
      if (!tokens) {
        continue;
      }
      tokens.forEach((token, b) => {
        const item = /^\d+$/.test(token) ? day.items[Number(token) - 1] : null;
        if (!item || item.kind !== "A") {
          return;
        }
        let length = 1;
        while (tokens[b + length] === "^") {
          length += 1;
        }
        out.push({
          d,
          groupId,
          blockId: model.days[d].blocks[b].id,
          actId: item.id,
          length
        });
      });
    }
  });
  return out;
}

/**
 * The week a seeded build starts from: model's days with every activity a full build would clear
 * taken out (state.keptCells holds what stays), then the imported week's activity put in each
 * cell still free where every limit allows it (a weekly max may be gone over: it is a preference,
 * flagged like any other bend). An activity that isn't running this week (deleted, closed, or a
 * different length now) is skipped. Returns { days: the DayView days to build from in "fill the
 * open cells", kept: the clearing state, whose keptCells are the director's, placed: how many
 * placements went in }.
 */
export function seedFromImport(model, importDays, writeDays) {
  const st = createWeekState({ ...model, mode: "full" });
  readGrid(st);
  let placed = 0;
  for (const p of placementsOf(model, importDays)) {
    const act = st.actById.get(p.actId);
    const k = st.cellKey(p.groupId, p.d, p.blockId);
    if (
      !act ||
      act.span !== p.length ||
      !st.openSlotByKey.has(k) ||
      st.assigned.has(k)
    ) {
      continue;
    }
    const bends = check(st, act, p.groupId, p.d, p.blockId, true);
    if (bends === null || bends.some((r) => !PREFERENCES.includes(r))) {
      continue;
    }
    st.place(act, p.groupId, p.d, p.blockId);
    placed += 1;
  }
  return { days: writeDays(model, st), kept: st, placed };
}

/** Weekly-limit bends a checked week's dots name. */
function weeklyMaxBends(checked) {
  let n = 0;
  for (const rules of checked.bends.values()) {
    n += rules.filter((r) => r === RULE.WEEKLY_MAX).length;
  }
  return n;
}

/**
 * Whether checked week a (the build from the imported week) is kept over checked week b (the
 * first build): more cells filled (a full week first, Greg); as many: fewer groups short of a
 * weekly minimum, then fewer sessions short, then fewer weekly-limit bends; still a tie keeps
 * the first build.
 */
export function fuller(a, b) {
  const rank = (c) => [
    -c.cells.filled,
    new Set(c.stillNeededBy.map((n) => n.groupId)).size,
    c.stillNeededBy.reduce((sum, n) => sum + n.missing, 0),
    weeklyMaxBends(c)
  ];
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) {
      return ra[i] < rb[i];
    }
  }
  return false;
}
