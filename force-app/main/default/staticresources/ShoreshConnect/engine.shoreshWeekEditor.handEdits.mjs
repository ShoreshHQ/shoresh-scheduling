/**
 * The grid's edits of several cells, worked out with their words: a placement moved or swapped
 * (dragged onto another cell), taken out whole, copied and pasted, and the day and week tools
 * (tools.js). Pure: no screen. The week editor makes each one through here, and so does Shoresh's
 * connector for a person's AI (docs/protocol/api.md API-1.38 to API-1.40), so the two can never
 * edit, refuse or say anything differently.
 *
 * ctx: { week (the days shown), t (the camp's words), nameOf(slot, day), dayNameOf(dateValue),
 * isAwayOn(week, d, g, b), isLocked({ day, group, block }), liveLocks (the locked cells' keys, or
 * null where nothing is locked, Manual Build), replaced (the days a special day replaces, by date) }.
 * A position is { day, group, block }: indexes into the week, that day's groups and its time blocks.
 */
import { dayLabel } from "./engine.shoreshScheduleViews.shoreshScheduleViews.mjs";
import { OPEN, identity, owner, placement } from "./engine.shoreshWeekEditor.slotEdits.mjs";
import { REFUSED, moveEdit, removeEdit } from "./engine.shoreshWeekEditor.moves.mjs";
import { LEFT_OUT, replan, toolRuns } from "./engine.shoreshWeekEditor.tools.mjs";
import { rainCounts } from "./engine.shoreshWeekEditor.rain.mjs";
import { lockKey, noteRows } from "./engine.shoreshWeekEditor.locks.mjs";

// A hand edit: fixed and recurring activities move by hand, and no time is away for it.
const SET_TIME_BY_HAND = true;
const NEVER_AWAY = () => false;

/**
 * What a slot's identity is called: the day's saved name, else the activity's, the special
 * event's or the elective set's (find: { activity, event, elective }, each by identity, and t).
 */
export function nameOfSlot(slot, day, find) {
  if (slot === OPEN) {
    return "Open";
  }
  const item = owner(slot);
  const saved = day.items.find((i) => identity(i) === item);
  if (saved) {
    return saved.name;
  }
  const named = find.activity(item) || find.event(item) || find.elective(item);
  if (named) {
    return named.name;
  }
  if (item.startsWith("E:")) {
    return `${find.t.s("ElectiveSet")} (removed)`;
  }
  return item.startsWith("S:")
    ? `${find.t.s("SpecialEvent")} (removed)`
    : `${find.t.s("Activity")} (removed)`;
}

/** "Bunk 3 · Monday · Period 2" */
export function slotName(ctx, slot, block = slot.block) {
  const day = ctx.week[slot.day];
  return [
    day.groups[slot.group].name,
    ctx.dayNameOf(day.dateValue),
    day.blocks[block].name
  ].join(" · ");
}

/** "Bunk 3 · Monday · Period 2 is locked." */
export function lockedWords(ctx, slot) {
  return `${slotName(ctx, slot)} is locked.`;
}

/** The first locked cell runs ({ day, group, first, after }) would change, or null. */
export function firstLocked(ctx, runs) {
  for (const run of runs) {
    for (let i = 0; i < run.after.length; i++) {
      const slot = { day: run.day, group: run.group, block: run.first + i };
      if (ctx.isLocked(slot)) {
        return slot;
      }
    }
  }
  return null;
}

/** A refused move, in a few words. */
export function refusalWords(ctx, reason, name, slot) {
  const day = ctx.week[slot.day];
  const t = ctx.t;
  switch (reason) {
    case REFUSED.SET_TIME:
      return `${ctx.nameOf(placement(day, slot.group, slot.block).slot, day)} stays where it is set up.`;
    case REFUSED.AWAY:
      return `${day.groups[slot.group].name} isn't at camp then.`;
    case REFUSED.SWAP_LONG:
      return `Longer ${t.pIn("Activity")} don't swap.`;
    case REFUSED.FIXED_HERE:
      return `${ctx.nameOf(placement(day, slot.group, slot.block).slot, day)} stays where it is.`;
    case REFUSED.NO_SWAP:
      // The desktop's words (useSlotMutations.js): elective and event cells never swap. A camp
      // with its own word for electives (wiki decision 66) sees it, plural so no article is
      // built from it; the standard word keeps the desktop's sentence.
      return t.s("Elective") === "Elective"
        ? "Can’t swap with an elective or an event. Move it to an empty cell instead."
        : `Can’t swap with ${t.pIn("Elective")} or events. Move it to an empty cell instead.`;
    default:
      return `${name} doesn't fit there.`;
  }
}

/**
 * The placement at `from` dragged onto `to`: moved there when it is Open, else swapped with what
 * is there. { runs, label }, { refused } (its words; `locked` the locked cell when a Lock stopped
 * it), or null when it is put down where it already is.
 */
export function moveStep(ctx, from, to) {
  const fromDay = ctx.week[from.day];
  const name = ctx.nameOf(
    placement(fromDay, from.group, from.block).slot,
    fromDay
  );
  const result = moveEdit(ctx.week, from, to, NEVER_AWAY, SET_TIME_BY_HAND);
  if (!result) {
    return null;
  }
  if (result.refused) {
    return {
      refused: refusalWords(ctx, result.refused, name, result.at || to)
    };
  }
  const locked = firstLocked(ctx, result.runs);
  if (locked) {
    return { refused: lockedWords(ctx, locked), locked };
  }
  const day = ctx.week[to.day];
  const there = placement(day, to.group, to.block).slot;
  return {
    runs: result.runs,
    label:
      there === OPEN
        ? `Moved ${name} to ${slotName(ctx, to)}`
        : `Swapped ${name} and ${ctx.nameOf(there, day)}`
  };
}

/** The placement at a cell taken out whole: { runs, label }, { refused, locked }, or null. */
export function takeOutStep(ctx, slot) {
  const day = ctx.week[slot.day];
  const name = ctx.nameOf(placement(day, slot.group, slot.block).slot, day);
  const result = removeEdit(ctx.week, slot, SET_TIME_BY_HAND);
  if (!result) {
    return null;
  }
  const locked = firstLocked(ctx, result.runs);
  if (locked) {
    return { refused: lockedWords(ctx, locked), locked };
  }
  return {
    runs: result.runs,
    label: `Cleared ${name} · ${slotName(ctx, slot)}`
  };
}

/**
 * A run as the server takes it: the day's date, the group's and first block's Ids, and every
 * cell's block (blockIds), so it lands on those blocks or comes back as a conflict, now and
 * when it is undone or redone.
 */
export function serverRunOf(run, week) {
  const day = week[run.day];
  return {
    day: day.dateValue,
    groupId: day.groups[run.group].id,
    firstBlockId: day.blocks[run.first].id,
    before: run.before,
    after: run.after,
    blockIds: day.blocks
      .slice(run.first, run.first + run.after.length)
      .map((b) => b.id)
  };
}

/** Runs as the server takes them, each noted with its whole row after it (for the locks it brings). */
export function serverRunsOf(runs, week) {
  const serverRuns = runs.map((run) => serverRunOf(run, week));
  noteRows(week, serverRuns);
  return serverRuns;
}

// ---------- copy and paste (Greg decision 45) ----------

/** "Swim", "3 activities and 2 Open": what was copied, in a line. */
export function copiedWords(t, items, opens) {
  if (items.length === 1 && !opens.length) {
    return items[0].name;
  }
  const open = opens.length ? `${opens.length} Open` : "";
  if (!items.length) {
    return opens.length === 1 ? "Open" : open;
  }
  const placed = `${items.length} ${items.length === 1 ? t.sIn("Activity") : t.pIn("Activity")}`;
  return open ? `${placed} and ${open}` : placed;
}

/**
 * Copy: what cells ([{ row, column, slot }], where they sit on the grid) hold, by where they sit,
 * for Paste, fixed and recurring activities and times a bunk isn't at camp included (a paste is
 * a hand edit, Greg 2026-10-26). { clip, said }, or { refused } when there is nothing to copy.
 * savedItem(slot, day): the day's saved item a slot is, if any.
 */
export function copyStep(ctx, cells, savedItem) {
  const items = [];
  const opens = [];
  cells.forEach((cell) => {
    const day = ctx.week[cell.slot.day];
    const at = placement(day, cell.slot.group, cell.slot.block);
    if (at.slot === OPEN) {
      opens.push({ row: cell.row, column: cell.column });
      return;
    }
    const saved = savedItem(at.slot, day);
    items.push({
      row: cell.row,
      column: cell.column,
      slot: at.slot,
      length: at.length,
      name: ctx.nameOf(at.slot, day),
      gone: !!(saved && saved.gone)
    });
  });
  if (!items.length && !opens.length) {
    return { refused: "Nothing to copy there." };
  }
  const all = [...items, ...opens];
  const top = Math.min(...all.map((c) => c.row));
  const left = Math.min(...all.map((c) => c.column));
  const offset = ({ row, column, ...rest }) => ({
    ...rest,
    dr: row - top,
    dc: column - left
  });
  return {
    clip: { items: items.map(offset), opens: opens.map(offset) },
    said: `Copied ${copiedWords(ctx.t, items, opens)}.`
  };
}

/**
 * Paste: the tool that puts what was copied in with its top left at `origin` ({ row, column }),
 * by Copy day to…'s rules (tools.js pasteEdit). slotAt(row, column): the position at a row and
 * column of the grid, or null; where: the words for where it goes.
 */
export function pasteTool(ctx, clip, origin, slotAt, where) {
  const items = [];
  const outside = [];
  const opens = [];
  const dates = new Set();
  clip.items.forEach((c) => {
    const at = slotAt(origin.row + c.dr, origin.column + c.dc);
    const day = at && ctx.week[at.day];
    if (!at || at.block + c.length > day.blocks.length) {
      outside.push({ slot: c.slot, name: c.name });
      return;
    }
    dates.add(day.dateValue);
    items.push({
      date: day.dateValue,
      groupId: day.groups[at.group].id,
      blockIds: day.blocks
        .slice(at.block, at.block + c.length)
        .map((b) => b.id),
      slot: c.slot,
      gone: c.gone,
      name: c.name
    });
  });
  clip.opens.forEach((c) => {
    const at = slotAt(origin.row + c.dr, origin.column + c.dc);
    if (at) {
      const day = ctx.week[at.day];
      dates.add(day.dateValue);
      opens.push(
        lockKey(day.dateValue, day.groups[at.group].id, day.blocks[at.block].id)
      );
    }
  });
  return {
    kind: "paste",
    dates: [...dates],
    items,
    opens,
    outside,
    what: copiedWords(ctx.t, clip.items, clip.opens),
    where
  };
}

// ---------- the tools' words ----------

/** "N <what>: a; b; …; and M more." with at most five named, or null. */
export function listText(list, what, name) {
  if (!list.length) {
    return null;
  }
  const named = list.slice(0, 5).map(name);
  const more = list.length - named.length;
  return `${list.length} ${what}: ${named.join("; ")}${more > 0 ? `; and ${more} more` : ""}.`;
}

/** The things a placement is named by in a line: "Swim · Bunk 3 · Tuesday". */
function placementName(ctx, week, dayIndex, group, slot) {
  const day = week[dayIndex];
  return `${ctx.nameOf(slot, day)} · ${day.groups[group].name} · ${ctx.dayNameOf(day.dateValue)}`;
}

/** "2 stayed: Archery · Bunk 1 · Monday (removed); …" (at most five named). */
function stayedText(ctx, week, stayed) {
  const why = {
    [LEFT_OUT.GONE]: "removed",
    [LEFT_OUT.NOT_SET_UP]: "not set up yet",
    [LEFT_OUT.AWAY]: "not at camp then"
  };
  return listText(
    stayed,
    "stayed",
    (o) => `${placementName(ctx, week, o.day, o.group, o.slot)} (${why[o.why]})`
  );
}

/** "2 left out: Swim · Bunk 3 · Tuesday: not at camp then; …" (at most five named). */
function leftOutText(ctx, week, from, leftOut) {
  const source = week[from];
  const why = (o) => {
    const target = ctx.dayNameOf(week[o.day].dateValue);
    switch (o.why) {
      case LEFT_OUT.AWAY:
        return "not at camp then";
      case LEFT_OUT.NO_BLOCK:
        return `${target} has no ${source.blocks[o.missing].name}`;
      case LEFT_OUT.NO_GROUP:
        return `not on ${target}`;
      case LEFT_OUT.GONE:
        return "removed";
      case LEFT_OUT.NOT_SET_UP:
        return "not set up yet";
      default:
        return `${ctx.nameOf(o.blocking, week[o.day])} is set up there`;
    }
  };
  return listText(
    leftOut,
    "left out",
    (o) =>
      `${ctx.nameOf(o.slot, source)} · ${source.groups[o.group].name} · ${ctx.dayNameOf(week[o.day].dateValue)}: ${why(o)}`
  );
}

/** "2 left out: Swim · Bunk 2 · Tuesday: not at camp then; Boating: no room there." */
function pasteLeftOutText(ctx, week, leftOut) {
  const why = (o) => {
    switch (o.why) {
      case LEFT_OUT.AWAY:
        return "not at camp then";
      case LEFT_OUT.GONE:
        return "removed";
      case LEFT_OUT.NOT_SET_UP:
        return "not set up yet";
      case LEFT_OUT.NO_ROOM:
        return "no room there";
      default:
        return `${ctx.nameOf(o.blocking, week[o.day])} is set up there`;
    }
  };
  return listText(leftOut, "left out", (o) => {
    const where =
      o.day === null
        ? ""
        : ` · ${week[o.day].groups[o.group].name} · ${ctx.dayNameOf(week[o.day].dateValue)}`;
    return `${o.name}${where}: ${why(o)}`;
  });
}

/** A tool's words for what stayed or was left out, from its result (tools.js toolRuns). */
export function toolWords(ctx, tool, result) {
  if (tool.kind === "rain") {
    return rainCounts(result.rain);
  }
  if (tool.kind === "clear") {
    return stayedText(ctx, result.week, result.stayed);
  }
  if (tool.kind === "paste") {
    return pasteLeftOutText(ctx, result.week, result.leftOut);
  }
  const from = result.week.findIndex((d) => d.dateValue === tool.from);
  return from < 0 ? null : leftOutText(ctx, result.week, from, result.leftOut);
}

/**
 * The placements a tool left out because they are locked, in the words of the other lists:
 * "1 stayed: Swim · Bunk 1 · Monday (locked)." for a clear (what stays in the cell), "1 left
 * out: Swim · Bunk 1 · Tuesday: locked." for a copy (what was being copied there). Null when
 * none.
 */
export function lockedText(ctx, tool, week, cells) {
  const named = cells
    .map(({ key, slot }) => {
      const [date, groupId, blockId] = key.split("|");
      const d = week.findIndex((x) => x.dateValue === date);
      const g = d < 0 ? -1 : week[d].groups.findIndex((x) => x.id === groupId);
      const b = d < 0 ? -1 : week[d].blocks.findIndex((x) => x.id === blockId);
      return d < 0 || g < 0 || b < 0 ? null : { d, g, b, slot };
    })
    .filter(Boolean);
  return tool.kind === "clear"
    ? listText(
        named,
        "stayed",
        (o) => `${placementName(ctx, week, o.d, o.g, o.slot)} (locked)`
      )
    : listText(
        named,
        "left out",
        (o) => `${placementName(ctx, week, o.d, o.g, o.slot)}: locked`
      );
}

/** "Cleared Monday", "Copied Monday to Tuesday": a tool's words for Undo and the line. */
export function toolLabel(tool) {
  if (tool.kind === "rain") {
    return tool.label;
  }
  if (tool.kind === "paste") {
    return `Pasted ${tool.what} · ${tool.where}`;
  }
  return tool.kind === "clear"
    ? `Cleared ${tool.name}`
    : `Copied ${tool.fromName} to ${tool.toName}`;
}

/** What a tool says when it changes nothing. */
export function toolNothing(tool, said) {
  if (tool.kind === "rain") {
    return `${tool.label}: ${said || rainCounts({ switches: [], full: [], noPlan: [], spans: [], locked: [] })}`;
  }
  if (tool.kind === "paste") {
    return said
      ? `Nothing pasted. ${said}`
      : `Nothing to paste: ${tool.where} already matches.`;
  }
  if (tool.kind === "clear") {
    const where = `${tool.inWeek ? "in" : "on"} ${tool.name}`;
    return said
      ? `Nothing cleared ${where}. ${said}`
      : `Nothing to clear ${where}.`;
  }
  if (said) {
    return `Nothing copied. ${said}`;
  }
  const to = tool.toName === "all other days" ? "All other days" : tool.toName;
  return `${to} ${tool.toName === "all other days" ? "already match" : "already matches"} ${tool.fromName}.`;
}

/**
 * A tool without the days a special day replaces: { tool, replacedNote }, the note naming
 * them ("Friday is Visiting Day: left as it is."); no tool when nothing is left to do.
 */
export function withoutReplaced(ctx, tool) {
  const replaced = ctx.replaced;
  const hit = new Set();
  const keep = (date) => {
    if (replaced.has(date)) {
      hit.add(date);
      return false;
    }
    return true;
  };
  if (tool.kind === "copy" && replaced.has(tool.from)) {
    const special = replaced.get(tool.from);
    return {
      tool: null,
      replacedNote: `${dayLabel(tool.from).label} is ${special.name}: open it to change that day.`
    };
  }
  const next = { ...tool, dates: (tool.dates || []).filter(keep) };
  if (tool.kind === "paste") {
    next.items = (tool.items || []).filter((item) => keep(item.date));
    next.opens = (tool.opens || []).filter((key) =>
      keep(String(key).split("|")[0])
    );
  }
  const note = hit.size
    ? [...hit]
        .sort()
        .map((date) => `${dayLabel(date).label} is ${replaced.get(date).name}`)
        .join(", ") + ": left as it is."
    : null;
  const empty =
    !next.dates.length ||
    (tool.kind === "paste" && !next.items.length && !next.opens.length);
  return { tool: empty ? null : next, replacedNote: note };
}

/**
 * A tool worked out on the week shown: { nothing } (what it says when it changes nothing), or
 * { tool, result, label, said, locked }. A day a special day replaces is left as it is; a paste
 * leaves locked cells (Generated) as they are, and lists them: a Lock beats what is pasted.
 */
export function toolStep(ctx, asked) {
  const { tool, replacedNote } = withoutReplaced(ctx, asked);
  if (!tool) {
    return { nothing: replacedNote || toolNothing(asked, null) };
  }
  const seen = ctx.week;
  const isAway = ctx.isAwayOn;
  const locks = tool.kind === "paste" ? ctx.liveLocks : null;
  const locked = locks && locks.size ? new Set(locks) : null;
  const result = locked
    ? replan(tool, seen, seen, new Set(), isAway, locked)
    : toolRuns(tool, seen, { isAway });
  const said =
    [
      toolWords(ctx, tool, result),
      locked ? lockedText(ctx, tool, seen, result.lockedCells) : null,
      replacedNote
    ]
      .filter(Boolean)
      .join(" ") || null;
  // A rainy day whose cells are all full still leaves its marks (one Undo step).
  if (!result.runs.length && !(tool.kind === "rain" && result.marks.length)) {
    return { nothing: toolNothing(tool, said) };
  }
  return { tool, result, label: toolLabel(tool), said, locked };
}
