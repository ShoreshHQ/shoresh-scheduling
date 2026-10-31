import { FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
import { measureWeek } from "./engine.shoreshEngine.shoreshEngine.mjs";
import { dayLabel } from "./engine.shoreshScheduleViews.shoreshScheduleViews.mjs";
import { placement } from "./engine.shoreshWeekEditor.slotEdits.mjs";
import { RAIN_PLAN_FULL, isMarked } from "./engine.shoreshWeekEditor.rain.mjs";

/**
 * The week's measure, as the rail's counter shows it (c/shoreshEngine measureWeek and the Why
 * list's rows): worked out from the week checked, the editor's draft and its days. Shared by the
 * week editor and Shoresh's connector, which reads a week's checks for an agent with this same
 * code (docs/protocol/api.md API-1.30), so the two can never say different things.
 */

/** What a day is called in lines and questions: its weekday, or the plan's name. */
export function dayNameOf(dateValue, planName) {
  return planName || dayLabel(dateValue).label;
}

/**
 * The editor's activities, each with its priority from its record ("high" or "low"), so the
 * week's measure can count priorities met (CORE-6.4).
 */
export function withPriority(activities, records) {
  const high = new Set(
    (records || [])
      .filter((r) => r[FIELD.Activity.Priority] === "High")
      .map((r) => r.Id)
  );
  return (activities || []).map((a) => ({
    ...a,
    priority: high.has(a.id) ? "high" : "low"
  }));
}

/**
 * The week's measure. checked: the week checked (the editor's checked); draft: the editor's
 * draft (its activities and activity records); weekDays: the days shown; setupDots: Manual
 * Build's or Generated Schedule's cells setup changed ("date|groupId|blockId" to words);
 * planName: a special day's or event's own schedule's name, when that is what is shown.
 */
export function weekMeasure({ checked, draft, weekDays, setupDots, planName }) {
  const dayName = (dateValue) => dayNameOf(dateValue, planName);
  const activities = (draft && draft.activities) || null;
  const measured = measureWeek(
    checked,
    withPriority(activities, draft && draft.activityRecords),
    weekDays
  );
  const activityName = (id) => {
    const activity = (activities || []).find((a) => a.id === id);
    return activity ? activity.name : "";
  };
  const why = whyRows(checked, weekDays, { setupDots, dayName, activityName });
  return {
    ...measured,
    look: [...measured.look, ...why.look],
    open: why.open,
    notes: why.notes,
    offTarget:
      measured.offTarget ||
      why.look.length > 0 ||
      why.open.length > 0 ||
      why.notes.length > 0
  };
}

/**
 * The Why list's rows that measureWeek doesn't make (wiki engine care plan Q18: nothing from
 * the engine or the rule checks sits on the grid; it is all said here, each row naming its
 * cell, place first): look, one row per placement with everything said about it joined (what
 * the check says about the placement as a whole (a time block it shares with other
 * cells is the overlapping cell's own row), setup changed since the week started,
 * rain plan full), "Bunk 1 · Monday · Period 2 · Soccer: …"; open, the host's Open cells with
 * why (Generated), "Bunk 1 · Monday · Period 3: …"; notes, the
 * host's lines with no cell (setup taken as 1, the imported week).
 */
function whyRows(checked, weekDays, { setupDots, dayName, activityName }) {
  const look = [];
  if (!checked) {
    return { look, open: [], notes: [] };
  }
  const dayOf = (dateValue) => weekDays.find((d) => d.dateValue === dateValue);
  const where = (dateValue, groupId, blockId) => {
    const day = dayOf(dateValue);
    const grp = day && day.groups.find((x) => x.id === groupId);
    const block = day && day.blocks.find((x) => x.id === blockId);
    return [
      grp ? grp.name : "",
      dayName(dateValue),
      block ? block.name : ""
    ].join(" · ");
  };
  // One row per placement (keyed where it starts), its reasons joined as the checks join
  // them (" · "): what the check flags, then setup changed, then rain plan full.
  const said = new Map();
  const say = (key, words) => {
    const list = said.get(key) || [];
    if (words && !list.includes(words)) {
      list.push(words);
    }
    said.set(key, list);
  };
  // Only the reasons about the placement as a whole: a reason about a time block it shares
  // with other cells is that overlapping cell's own row (no Accept), from measureWeek.
  (checked.wholeFlags || new Map()).forEach((words, key) => say(key, words));
  // Setup changed: on the placement it is part of (any of its time blocks).
  (setupDots || new Map()).forEach((words, key) => {
    const [dateValue, groupId, blockId] = key.split("|");
    const day = dayOf(dateValue);
    const g = day ? day.groups.findIndex((x) => x.id === groupId) : -1;
    const b = day ? day.blocks.findIndex((x) => x.id === blockId) : -1;
    say(
      g >= 0 && b >= 0
        ? `${dateValue}|${groupId}|${day.blocks[placement(day, g, b).first].id}`
        : key,
      words
    );
  });
  weekDays.forEach((day) => {
    if (!day.rain || !day.rain.length || day.problem) {
      return;
    }
    day.groups.forEach((grp, g) =>
      day.blocks.forEach((block, b) => {
        if (placement(day, g, b).first === b && rainFullAt(day, g, b)) {
          say(`${day.dateValue}|${grp.id}|${block.id}`, RAIN_PLAN_FULL);
        }
      })
    );
  });
  // In the week's order: by day, then group, then time block.
  const at = (key) => {
    const [dateValue, groupId, blockId] = key.split("|");
    const d = weekDays.findIndex((x) => x.dateValue === dateValue);
    const day = weekDays[d];
    return [
      d,
      day ? day.groups.findIndex((x) => x.id === groupId) : -1,
      day ? day.blocks.findIndex((x) => x.id === blockId) : -1
    ];
  };
  [...said]
    .sort((x, y) => {
      const px = at(x[0]);
      const py = at(y[0]);
      return px[0] - py[0] || px[1] - py[1] || px[2] - py[2];
    })
    .forEach(([key, list]) => {
      const [dateValue, groupId, blockId] = key.split("|");
      const p = (checked.placements || []).find((x) => x.key === key);
      const name = p ? activityName(p.id) : "";
      const words = list.join(" · ");
      // Place first, then what is there: "Bunk 1 · Monday · Period 2 · Soccer: …".
      const place = [where(dateValue, groupId, blockId), name]
        .filter(Boolean)
        .join(" · ");
      look.push({
        key: `why|${key}|${words}`,
        kind: "placement",
        text: `${place}: ${words}`,
        groupId,
        dateValue,
        blockId
      });
    });
  // Only an Open cell with a reason: the rest are counted in "still needed", as on Manual Build.
  const open = (checked.openCells || [])
    .filter((c) => c.reason)
    .map((c) => ({
      key: `open|${c.dateValue}|${c.groupId}|${c.blockId}|${c.reason || ""}`,
      kind: "open",
      text: c.text,
      groupId: c.groupId,
      dateValue: c.dateValue,
      blockId: c.blockId
    }));
  const notes = (checked.notes || []).map((text) => ({
    key: `note|${text}`,
    kind: "note",
    text
  }));
  return { look, open, notes };
}

/**
 * "Rain plan full: choose another" for a cell a rainy day left outdoors (repo docs/adr/0019),
 * while it still holds that activity, as on the desktop: a row in the Why list. day: the week's
 * day; g, b: the group and time block.
 */
export function rainFullAt(day, g, b) {
  if (!day || !day.rain || !day.rain.length) {
    return null;
  }
  const at = placement(day, g, b);
  if (!at.slot.startsWith("A:") || at.length !== 1) {
    return null;
  }
  return isMarked(
    day,
    day.groups[g].id,
    day.blocks[at.first].id,
    at.slot.slice(2)
  )
    ? RAIN_PLAN_FULL
    : null;
}
