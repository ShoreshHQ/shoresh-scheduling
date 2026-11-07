/**
 * move_cell, take_out_cell, copy_cells, switch_to_rain_plans and place_special_event (API-1.38 to
 * API-1.40, API-1.45, API-1.65, API-1.75): an edit of several
 * cells of a Generated Schedule or Manual Build week, worked out here exactly as the screen's grid works it out. The week is
 * read as Generated Schedule reads it (GET /v1/week_checks, the counter's own read), opened as the
 * screen opens it (c/shoreshGeneratedSchedule counter.js), and the edit made with the week
 * editor's own module (c/shoreshWeekEditor handEdits.js, shipped beside this file): the same
 * moves, swaps, pastes, refusals and words. Its runs then go to the screen's own save
 * (POST /v1/move_cell, /v1/take_out_cell, /v1/copy_cells or /v1/switch_to_rain_plans), marked Through an agent. Only finding the cells by their names is
 * done here.
 */

/** A name as camps type it: case and spaces don't count. */
function fold(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A refusal in Shoresh's words: nothing was changed. */
class Refused extends Error {
  constructor(text, status = 400) {
    super(text);
    this.status = status;
  }
}

function namesSaid(things, names) {
  return names.length
    ? `The ${things}: ${names.join(", ")}.`
    : `There are no ${things} yet.`;
}

/** The one that reads as asked, or a refusal naming what there is (never guessed). */
function onlyOne(list, asked, nameOf, what, where) {
  if (!String(asked || "").trim()) {
    throw new Refused(`Say which ${what}.`);
  }
  const found = list.filter((x) =>
    nameOf(x).some((n) => fold(n) === fold(asked))
  );
  if (found.length === 1) {
    return list.indexOf(found[0]);
  }
  if (found.length > 1) {
    throw new Refused(
      `Two ${what}s are called "${String(asked).slice(0, 80)}"${where}. Nothing was changed.`
    );
  }
  throw new Refused(
    `There is no ${what} called "${String(asked).slice(0, 80)}"${where}. ${namesSaid(
      `${what}s`,
      list.map((x) => nameOf(x)[0])
    )}`
  );
}

/** The week's day (by name, like Monday, by number, like Day 3, or date), as an index; a replaced or unreadable day is refused. */
function dayIn(ctx, m, asked, weekName) {
  const d = ctx.week.findIndex(
    (day) =>
      day.dateValue === String(asked || "").trim() ||
      fold(ctx.dayNameOf(day.dateValue)) === fold(asked) ||
      fold(ctx.weekdayOf(day.dateValue)) === fold(asked)
  );
  if (!String(asked || "").trim()) {
    throw new Refused(
      `Say which day (day), like ${ctx.spokenWeekday("Monday")}.`
    );
  }
  if (d < 0) {
    throw new Refused(
      `${weekName} has no day "${String(asked).slice(0, 40)}" in its schedule.`
    );
  }
  const day = ctx.week[d];
  if (day.problem) {
    throw new Refused(`This day could not be read: ${day.problem}.`);
  }
  const special = ctx.replaced.get(day.dateValue);
  if (special) {
    // The screen's words when a tool reaches it (handEdits.js withoutReplaced).
    throw new Refused(
      `${ctx.dayNameOf(day.dateValue)} is ${special.name}: open it to change that day.`
    );
  }
  return d;
}

function groupIn(ctx, d, asked) {
  return onlyOne(
    ctx.week[d].groups,
    asked,
    (g) => [g.name],
    "group",
    " on that day"
  );
}

/** The time block by its name ("Period 2") or its start ("09:00"). */
function blockIn(ctx, d, asked) {
  const blocks = ctx.week[d].blocks;
  const byName = blocks.filter((b) => fold(b.name) === fold(asked));
  if (byName.length) {
    return onlyOne(blocks, asked, (b) => [b.name], "time", " on that day");
  }
  return onlyOne(
    blocks,
    asked,
    (b) => [b.name, String(b.startTime || "").slice(0, 5)],
    "time",
    " on that day"
  );
}

/** A cell asked for: { day, group, block }. */
function cellOf(ctx, m, input, weekName, prefix = "") {
  const day = dayIn(ctx, m, input[`${prefix}day`], weekName);
  return {
    day,
    group: groupIn(ctx, day, input[`${prefix}group`]),
    block: blockIn(ctx, day, input[`${prefix}time`])
  };
}

/** Refused unless the cell still holds what the agent saw: someone else's change is never replaced unseen. */
function checkWas(ctx, m, slot, was) {
  const day = ctx.week[slot.day];
  const now = ctx.nameOf(m.placement(day, slot.group, slot.block).slot, day);
  if (fold(was || "Open") !== fold(now)) {
    throw new Refused(
      `Changed by someone else: ${m.slotName(ctx, slot)} holds ${now} now. Nothing was changed.`,
      409
    );
  }
}

/**
 * What the shared edits work with (handEdits.js ctx): the week as Generated Schedule opens it, or
 * Manual Build's draft as that screen gives it to its week editor (no locks there).
 */
function contextOf(m, body) {
  // WEEK-1.5: days are said as this season says them; an AI may still name the weekday.
  m.nameDaysFor(body.setup);
  if (body.draft) {
    return manualContextOf(m, body);
  }
  const t = m.buildTerms(body.labels);
  const loaded = m.loadedOf(body.inputs || {});
  const { draft } = m.counterWeek(loaded, { terms: t, setup: body.setup });
  const week = draft.schedule.days;
  const locks = m.lockedKeys(loaded.input.locks);
  const setup = body.setup || {};
  const events = (setup.special && setup.special.specialEvents) || [];
  const sets = (setup.electives && setup.electives.sets) || [];
  const isAwayOn = (w, d, g, b) => {
    const groupId = w[d].groups[g].id;
    const blockId = w[d].blocks[b].id;
    return (draft.away || []).some(
      (entry) => entry.groupId === groupId && entry.blockIds.includes(blockId)
    );
  };
  const find = {
    activity: (item) =>
      (draft.activities || []).find((a) => `A:${a.id}` === item),
    event: (item) =>
      ((e) => e && { name: e.Name })(events.find((e) => `S:${e.Id}` === item)),
    elective: (item) =>
      ((e) => e && { name: e.Name })(sets.find((e) => `E:${e.Id}` === item)),
    t
  };
  return {
    week,
    t,
    // The season's setup a rainy day reads (rain.js rainModel), as the screen's editor has it.
    draft,
    nameOf: (slot, day) => m.nameOfSlot(slot, day, find),
    // As the screen names a day (shoreshWeekEditor dayNameOf(dateValue, this.planName)): Generated
    // Schedule gives its editor no planName (only a special day's or event's own schedule has one).
    dayNameOf: (dateValue) => m.dayNameOf(dateValue),
    weekdayOf: (dateValue) => m.weekdayName(dateValue),
    spokenWeekday: (weekday) => m.spokenWeekday(weekday),
    isAwayOn,
    isLocked: (slot) => {
      const day = week[slot.day];
      return locks.has(
        `${day.dateValue}|${day.groups[slot.group].id}|${day.blocks[slot.block].id}`
      );
    },
    liveLocks: locks,
    events,
    replaced: m.replacedDays(draft)
  };
}

/** Manual Build's week as its week editor holds it (shoreshWeekEditor editCtx, nameOf, isAwayOn). */
function manualContextOf(m, body) {
  const t = m.buildTerms(body.labels);
  const draft = body.draft;
  const week = draft.schedule.days;
  const setup = body.setup || {};
  const events = (setup.special && setup.special.specialEvents) || [];
  const sets = (setup.electives && setup.electives.sets) || [];
  const find = {
    activity: (item) =>
      (draft.activities || []).find((a) => `A:${a.id}` === item),
    event: (item) =>
      ((e) => e && { name: e.Name })(events.find((e) => `S:${e.Id}` === item)),
    elective: (item) =>
      ((e) => e && { name: e.Name })(sets.find((e) => `E:${e.Id}` === item)),
    t
  };
  return {
    week,
    t,
    draft,
    nameOf: (slot, day) => m.nameOfSlot(slot, day, find),
    dayNameOf: (dateValue) => m.dayNameOf(dateValue),
    weekdayOf: (dateValue) => m.weekdayName(dateValue),
    spokenWeekday: (weekday) => m.spokenWeekday(weekday),
    isAwayOn: (w, d, g, b) => {
      const groupId = w[d].groups[g].id;
      const blockId = w[d].blocks[b].id;
      return (draft.away || []).some(
        (entry) => entry.groupId === groupId && entry.blockIds.includes(blockId)
      );
    },
    isLocked: () => false,
    liveLocks: null,
    events,
    replaced: m.replacedDays(draft)
  };
}

/**
 * copy_cells as the screen's Daily View copies and pastes: the cells of the groups and times
 * asked for (one cell per placement, a placement chosen whole, as the grid chooses a block of
 * cells), pasted with their top left at the cell asked for, on that day's grid.
 */
function copyTool(ctx, m, input, weekName) {
  const d = dayIn(ctx, m, input.day, weekName);
  const groups = (Array.isArray(input.groups) ? input.groups : [input.groups])
    .map((g) => groupIn(ctx, d, g))
    .sort((a, b) => a - b);
  groups.forEach((g, i) => {
    if (i > 0 && g !== groups[i - 1] + 1) {
      throw new Refused(
        `Copy groups side by side, as the day shows them: ${ctx.week[d].groups.map((x) => x.name).join(", ")}.`
      );
    }
  });
  let top = blockIn(ctx, d, input.time);
  let bottom = input.through_time ? blockIn(ctx, d, input.through_time) : top;
  if (bottom < top) {
    [top, bottom] = [bottom, top];
  }
  const day = ctx.week[d];
  groups.forEach((g) => {
    const first = m.placement(day, g, top);
    const last = m.placement(day, g, bottom);
    top = Math.min(top, first.first);
    bottom = Math.max(bottom, last.first + last.length - 1);
  });
  const cells = [];
  groups.forEach((g) => {
    for (let b = top; b <= bottom; b++) {
      if (m.placement(day, g, b).first === b) {
        cells.push({ row: b, column: g, slot: { day: d, group: g, block: b } });
      }
    }
  });
  const copied = m.copyStep(ctx, cells, (slot, x) =>
    x.items.find((i) => m.identity(i) === m.owner(slot))
  );
  if (copied.refused) {
    throw new Refused(copied.refused);
  }
  const to = cellOf(ctx, m, input, weekName, "to_");
  const slotAt = (row, column) => {
    const target = ctx.week[to.day];
    return target.groups[column] && target.blocks[row]
      ? { day: to.day, group: column, block: row }
      : null;
  };
  return m.pasteTool(
    ctx,
    copied.clip,
    { row: to.block, column: to.group },
    slotAt,
    m.slotName(ctx, to)
  );
}

/**
 * switch_to_rain_plans as the screen's Edit > Rainy day… does (shoreshWeekEditor rainyTool and
 * runRainyDay): the day's outdoor activities switched to their rain plans by the editor's own tool,
 * locked cells (Generated) left as they are. With the marks it leaves on the day ("Rain plan full",
 * switched), and the day's marks as read (seen).
 */
function rainyDay(ctx, m, input, weekName) {
  const day = ctx.week[dayIn(ctx, m, input.day, weekName)];
  const name = ctx.dayNameOf(day.dateValue);
  const step = m.toolStep(ctx, {
    kind: "rain",
    dates: [day.dateValue],
    name,
    label: `Rainy ${name}`,
    model: m.rainModel(ctx.draft, ctx.week),
    // A Lock beats a switch (Generated): the cells locked now are left as they are.
    locks: ctx.liveLocks ? new Set(ctx.liveLocks) : null
  });
  if (step.nothing) {
    return { nothing: step.nothing };
  }
  const before = day.rain || [];
  return {
    runs: step.result.runs,
    label: step.label,
    said: step.said,
    rain: [
      { day: day.dateValue, cells: m.marksAfter(before, step.result.marks) }
    ],
    seen: before
  };
}

/**
 * place_special_event as choosing a special event from the screen's list puts it over the cells
 * chosen (shoreshWeekEditor placeEvent): the groups side by side and times asked for on one day,
 * widened to whole placements (rowsCovered), each group's cells holding the event (eventRuns: a
 * fixed or recurring activity is covered, as a hand edit may; a locked cell refuses it), labelled
 * as the screen labels it ("Placed Color War · Bunk 1 to Bunk 2 · Monday · Period 1 to Period 2").
 */
function placeEvent(ctx, m, input, weekName) {
  const e = onlyOne(
    ctx.events,
    input.event,
    (x) => [x.Name],
    "special event",
    " in this season"
  );
  const event = ctx.events[e];
  const d = dayIn(ctx, m, input.day, weekName);
  const asked = Array.isArray(input.groups) ? input.groups : [input.groups];
  if (!asked.length) {
    throw new Refused("Say which groups (groups), like Bunk 3.");
  }
  const groups = [...new Set(asked.map((g) => groupIn(ctx, d, g)))].sort(
    (a, b) => a - b
  );
  groups.forEach((g, i) => {
    if (i > 0 && g !== groups[i - 1] + 1) {
      throw new Refused(
        `Choose groups side by side, as the day shows them: ${ctx.week[d].groups.map((x) => x.name).join(", ")}.`
      );
    }
  });
  let top = blockIn(ctx, d, input.time);
  let bottom = input.through_time ? blockIn(ctx, d, input.through_time) : top;
  if (bottom < top) {
    [top, bottom] = [bottom, top];
  }
  const cells = [];
  groups.forEach((g) => {
    for (let b = top; b <= bottom; b++) {
      cells.push({ slot: { day: d, group: g, block: b } });
    }
  });
  const rows = m
    .rowsCovered(ctx.week, cells)
    .sort((a, b) => a.day - b.day || a.group - b.group);
  const result = m.eventRuns(ctx.week, rows, `S:${event.Id}`, {
    isAway: () => false,
    isLocked: (slot) => ctx.isLocked(slot),
    coversSetTime: true
  });
  if (result.refused) {
    // Only a Lock stops a hand edit, in the screen's words.
    throw new Refused(m.lockedWords(ctx, result.at));
  }
  const range = rangeName(ctx, rows);
  if (!result.runs.length) {
    return {
      nothing: `Nothing to place: ${range} already holds ${event.Name}.`
    };
  }
  return { runs: result.runs, label: `Placed ${event.Name} · ${range}` };
}

/** "Bunk 1 to Bunk 2 · Monday · Period 1 to Period 2", as the screen names what it covers. */
function rangeName(ctx, rows) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const day = ctx.week[first.day];
  const groupsSaid =
    rows.length === 1 || first.group === last.group
      ? day.groups[first.group].name
      : `${day.groups[first.group].name} to ${day.groups[last.group].name}`;
  const top = Math.min(...rows.map((r) => r.first));
  const bottom = Math.max(...rows.map((r) => r.last));
  const blocks =
    top === bottom
      ? day.blocks[top].name
      : `${day.blocks[top].name} to ${day.blocks[bottom].name}`;
  return [groupsSaid, ctx.dayNameOf(day.dateValue), blocks].join(" · ");
}

/** The edit asked for, worked out by the screen's own module: { runs, label, said } or a refusal. */
function stepOf(capability, ctx, m, input, weekName) {
  if (capability.name === "place_special_event") {
    return placeEvent(ctx, m, input, weekName);
  }
  if (capability.name === "switch_to_rain_plans") {
    return rainyDay(ctx, m, input, weekName);
  }
  if (capability.name === "copy_cells") {
    const step = m.toolStep(ctx, copyTool(ctx, m, input, weekName));
    if (step.nothing) {
      return { nothing: step.nothing };
    }
    return { runs: step.result.runs, label: step.label, said: step.said };
  }
  const from = cellOf(ctx, m, input, weekName);
  checkWas(ctx, m, from, input.was);
  const step =
    capability.name === "move_cell"
      ? m.moveStep(ctx, from, cellOf(ctx, m, input, weekName, "to_"))
      : m.takeOutStep(ctx, from);
  if (!step || (step.runs && !step.runs.length)) {
    return {
      nothing:
        capability.name === "move_cell"
          ? "Put back: it is already there. Nothing was changed."
          : `Nothing to take out: ${m.slotName(ctx, from)} is Open.`
    };
  }
  if (step.refused) {
    throw new Refused(step.refused);
  }
  return { runs: step.runs, label: step.label, said: null };
}

/**
 * The edit, made as the person: read, worked out here, saved through the screen's own save.
 * read(api, fields) and send(api, body) answer Salesforce's { status, body }; load() the screens' modules.
 */
async function editCells(capability, input, { read, send, answer, load }) {
  const fields = {};
  for (const field of ["season", "week", "program", "schedule"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  const got = await read("week_checks", fields);
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const m = await load();
  const ctx = contextOf(m, body);
  const weekName = input.week;
  let step;
  try {
    step = stepOf(capability, ctx, m, input, weekName);
  } catch (e) {
    if (e instanceof Refused) {
      return { ok: false, status: e.status, text: e.message };
    }
    throw e;
  }
  if (step.nothing) {
    return { ok: true, status: 200, text: step.nothing };
  }
  const sent = m.serverRunsOf(step.runs, ctx.week);
  // Manual Build has no locks: its runs go as its screen sends them, without any.
  const runs = ctx.liveLocks ? m.stampLocks(sent, ctx.liveLocks) : sent;
  return answer(
    await send(capability.api, {
      ...fields,
      change: step.label,
      said: step.said || "",
      runs,
      // The week as the agent read it: the save holds the week and refuses it if changed since.
      ...(input.seen ? { revision: input.seen } : {}),
      // A rainy day's marks, and the day's marks as read.
      ...(step.rain ? { rain: step.rain, seen: step.seen } : {})
    })
  );
}

/**
 * The cells of a Generated Schedule week that are locked, named as the screen names a cell
 * ("Bunk 3 · Monday · Period 2"), each shown with its lock; Manual Build has none.
 */
function lockedCells(m, body) {
  const ctx = contextOf(m, body);
  const named = [];
  ctx.week.forEach((day, d) =>
    day.groups.forEach((_, g) =>
      day.blocks.forEach((__, b) => {
        const slot = { day: d, group: g, block: b };
        if (ctx.isLocked(slot)) named.push(m.slotName(ctx, slot));
      })
    )
  );
  return named;
}

/** The camp's word for what a cell holds if not an activity, by its identity (nameOfSlot). */
const KINDS = {
  "S:": "SpecialEvent",
  "E:": "ElectiveSet",
  "F:": "FixedActivity",
  "R:": "RecurringActivity"
};

/** A draft row's values, in order; notes is left off a row that has none. */
const DRAFT_COLUMNS = [
  "date",
  "day",
  "group",
  "time_block",
  "start_time",
  "end_time",
  "activity",
  "notes"
];

/**
 * read_week_draft (API-1.123): the week as its screen has it (contextOf), one compact row per
 * thing a group does (the published read's rows, day by day, each group in the day's order,
 * consecutive time blocks of one placement as one row), with Open cells said, each cell named as
 * the grid names it (nameOfSlot), and notes for what only the draft has: locked wherever the grid
 * shows a padlock, away, and what the cell holds if not a plain activity. A day a special day
 * takes over is said as that day, not its cells (its own schedule has them); a day that can't be
 * read is said, never left out. Groups with one name stay apart: said, and each row notes which
 * of them it is. input.day and input.group narrow the rows, never the checks; one the week doesn't
 * have, or a group name two groups share, is refused, so an empty or blended answer can't read as
 * a clean one.
 */
function draftOf(m, body, input) {
  const ctx = contextOf(m, body);
  const asked = String(input.day || "").trim();
  const days = ctx.week.filter(
    (day) =>
      !asked ||
      day.dateValue === asked ||
      fold(ctx.dayNameOf(day.dateValue)) === fold(asked) ||
      fold(ctx.weekdayOf(day.dateValue)) === fold(asked)
  );
  if (!days.length) {
    throw new Refused(
      `${input.week} has no day "${asked.slice(0, 40)}" in its schedule. ${namesSaid(
        "days",
        ctx.week.map((day) => ctx.dayNameOf(day.dateValue))
      )}`
    );
  }
  if (input.group) {
    const read = days.filter(
      (day) => !day.problem && !ctx.replaced.get(day.dateValue)
    );
    // Two groups with the name asked for can't be told apart: refused, as a cell edit is.
    read.forEach((day) => {
      const named = day.groups.filter(
        (g) => fold(g.name) === fold(input.group)
      );
      if (named.length > 1) {
        onlyOne(
          day.groups,
          input.group,
          (g) => [g.name],
          "group",
          " on that day"
        );
      }
    });
    const groups = [
      ...new Set(read.flatMap((day) => day.groups.map((g) => g.name)))
    ];
    // A day that couldn't be read may hold the group: that day is said, not a wrong "no group".
    if (
      read.length &&
      !days.some((day) => day.problem) &&
      !groups.some((name) => fold(name) === fold(input.group))
    ) {
      throw new Refused(
        `There is no group called "${String(input.group).slice(0, 80)}" on ${input.week}. ${namesSaid("groups", groups)}`
      );
    }
  }
  const records = [];
  const specialDays = [];
  const unread = [];
  const sameNamed = new Set();
  days.forEach((day) => {
    const d = ctx.week.indexOf(day);
    const date = day.dateValue;
    const dayName = ctx.dayNameOf(date);
    const special = ctx.replaced.get(date);
    if (special) {
      specialDays.push({ date, day: dayName, special_day: special.name });
      return;
    }
    if (day.problem) {
      unread.push({ date, day: dayName, problem: day.problem });
      return;
    }
    day.groups.forEach((group, g) => {
      if (input.group && fold(group.name) !== fold(input.group)) return;
      const named = day.groups.filter((x) => fold(x.name) === fold(group.name));
      if (named.length > 1) sameNamed.add(group.name);
      let b = 0;
      while (b < day.blocks.length) {
        const p = m.placement(day, g, b);
        const first = day.blocks[p.first];
        const last = day.blocks[p.first + p.length - 1];
        const cells = [];
        for (let i = 0; i < p.length; i++) {
          cells.push({ day: d, group: g, block: p.first + i });
        }
        const kind = KINDS[m.owner(p.slot).slice(0, 2)];
        // The grid's padlock: the director's Lock, or a fixed or recurring activity's own.
        const marks = [
          ...(m.isSetTime(p.slot) || cells.some((slot) => ctx.isLocked(slot))
            ? ["locked"]
            : []),
          ...(cells.some((slot) => ctx.isAwayOn(ctx.week, d, g, slot.block))
            ? ["away"]
            : []),
          ...(kind ? [ctx.t.sIn(kind)] : []),
          ...(named.length > 1
            ? [
                `group ${named.indexOf(group) + 1} of ${named.length} called ${group.name}`
              ]
            : [])
        ];
        records.push([
          date,
          dayName,
          group.name,
          first.name,
          String(first.startTime || "").slice(0, 5),
          String(last.endTime || "").slice(0, 5),
          ctx.nameOf(p.slot, day),
          ...(marks.length ? [marks.join(", ")] : [])
        ]);
        b = Math.max(b + 1, p.first + p.length);
      }
    });
  });
  return {
    ...(specialDays.length ? { special_days: specialDays } : {}),
    ...(unread.length ? { days_not_read: unread } : {}),
    ...(sameNamed.size ? { groups_with_the_same_name: [...sameNamed] } : {}),
    columns: DRAFT_COLUMNS,
    records
  };
}

module.exports = { Refused, editCells, lockedCells, draftOf };
