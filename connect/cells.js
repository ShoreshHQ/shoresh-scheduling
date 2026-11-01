/**
 * move_cell, take_out_cell, copy_cells and switch_to_rain_plans (API-1.38 to API-1.40, API-1.45,
 * API-1.65): an edit of several
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
      `Two ${what}s are called "${String(asked).slice(0, 80)}"${where}. Rename one in Shoresh first.`
    );
  }
  throw new Refused(
    `There is no ${what} called "${String(asked).slice(0, 80)}"${where}. ${namesSaid(
      `${what}s`,
      list.map((x) => nameOf(x)[0])
    )}`
  );
}

/** The week's day (by name, like Monday, or date), as an index; a replaced or unreadable day is refused. */
function dayIn(ctx, m, asked, weekName) {
  const d = ctx.week.findIndex(
    (day) =>
      day.dateValue === String(asked || "").trim() ||
      fold(ctx.dayNameOf(day.dateValue)) === fold(asked)
  );
  if (!String(asked || "").trim()) {
    throw new Refused("Say which day (day), like Monday.");
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
    isAwayOn,
    isLocked: (slot) => {
      const day = week[slot.day];
      return locks.has(
        `${day.dateValue}|${day.groups[slot.group].id}|${day.blocks[slot.block].id}`
      );
    },
    liveLocks: locks,
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
    isAwayOn: (w, d, g, b) => {
      const groupId = w[d].groups[g].id;
      const blockId = w[d].blocks[b].id;
      return (draft.away || []).some(
        (entry) => entry.groupId === groupId && entry.blockIds.includes(blockId)
      );
    },
    isLocked: () => false,
    liveLocks: null,
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

/** The edit asked for, worked out by the screen's own module: { runs, label, said } or a refusal. */
function stepOf(capability, ctx, m, input, weekName) {
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
 * ask(request) answers Salesforce's { status, body }; load(namespace) the screens' modules.
 */
async function editCells(
  capability,
  input,
  { ask, answer, load, namespaceOf }
) {
  const fields = {};
  for (const field of ["season", "week", "program", "schedule"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  const read = await ask({
    path: `/services/apexrest/v1/week_checks?${new URLSearchParams(fields)}`,
    method: "GET"
  });
  if (read.status !== 200) return answer(read);
  const body = JSON.parse(read.body);
  const m = await load(namespaceOf(body));
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
    await ask({
      path: `/services/apexrest/v1/${capability.api}`,
      method: "POST",
      body: JSON.stringify({
        ...fields,
        change: step.label,
        said: step.said || "",
        runs,
        // A rainy day's marks, and the day's marks as read.
        ...(step.rain ? { rain: step.rain, seen: step.seen } : {})
      })
    })
  );
}

module.exports = { editCells };
