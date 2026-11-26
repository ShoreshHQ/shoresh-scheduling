/**
 * change_schedule_cell, move_cell, take_out_cell, copy_cells, rainy_day and
 * place_special_event (API-1.11, API-1.38 to API-1.40, API-1.45, API-1.65, API-1.75): an edit of one or several
 * cells of a Generated Schedule or Manual Build week, worked out here exactly as the screen's grid works it out. The week is
 * read as Generated Schedule reads it (GET /v1/week_checks, the counter's own read), opened as the
 * screen opens it (c/shoreshGeneratedSchedule counter.js), and the edit made with the week
 * editor's own module (c/shoreshWeekEditor handEdits.js, shipped beside this file): the same
 * moves, swaps, pastes, refusals and words. Its runs then go to the screen's own save
 * (POST /v1/schedule_cell, /v1/move_cell, /v1/take_out_cell, /v1/copy_cells or
 * /v1/rainy_day), and, as the screen's history does, its runs back are held for Undo
 * for the rest of the conversation (undo.js, API-1.14). Only finding the cells by their names is
 * done here.
 */
const { locksAfter } = require("./undo");
const { foldName: fold } = require("./common");

// The most group days a clear's yes dialog names (WEEK-6.15).
const MOST_ROWS = 20;

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

/**
 * What a list holds in the camp's words, one and many, as a sentence says them ("Edah", "Edot":
 * CORE-1.0, never the word with "s" added).
 */
function wordsOf(t, term) {
  return { one: t.sIn(term), many: t.pIn(term) };
}

/**
 * The one that reads as asked, or a refusal naming what there is (never guessed); what: the
 * list's words (wordsOf).
 */
function onlyOne(list, asked, nameOf, what, where) {
  if (!fold(asked)) {
    throw new Refused(`Say which ${what.one}.`);
  }
  const found = list.filter((x) =>
    nameOf(x).some((n) => fold(n) === fold(asked))
  );
  if (found.length === 1) {
    return list.indexOf(found[0]);
  }
  if (found.length > 1) {
    throw new Refused(
      `Two ${what.many} are called "${String(asked).slice(0, 80)}"${where}. Nothing was changed.`
    );
  }
  throw new Refused(
    `There is no ${what.one} called "${String(asked).slice(0, 80)}"${where}. ${namesSaid(
      what.many,
      list.map((x) => nameOf(x)[0])
    )}`
  );
}

/**
 * The week's day (by name, like Monday, by number, like Day 3, or date), as an index; an
 * unreadable day is refused, and a replaced one too unless the tool says so itself (clear).
 */
function dayIn(ctx, m, asked, weekName, toolSaysReplaced = false) {
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
  if (special && !toolSaysReplaced) {
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
    wordsOf(ctx.t, "Group"),
    " on that day"
  );
}

/** The time block by its name ("Period 2") or its start ("09:00"). */
function blockIn(ctx, d, asked) {
  const blocks = ctx.week[d].blocks;
  const what = wordsOf(ctx.t, "TimeBlock");
  const byName = blocks.filter((b) => fold(b.name) === fold(asked));
  if (byName.length) {
    return onlyOne(blocks, asked, (b) => [b.name], what, " on that day");
  }
  return onlyOne(
    blocks,
    asked,
    (b) => [b.name, String(b.startTime || "").slice(0, 5)],
    what,
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
  // What was seen, as the season's names read it: one spelled exactly so is that one, never a
  // look-alike someone put there since.
  const names = [
    ...(ctx.draft.activities || []).map((a) => a.name),
    ...ctx.sets.map((e) => e.Name)
  ];
  const seen = names.includes(was)
    ? was === now
    : fold(was || "Open") === fold(now);
  if (!seen) {
    throw new Refused(
      `Changed by someone else: ${m.slotName(ctx, slot)} holds ${now} now. Nothing was changed.`,
      409
    );
  }
}

/**
 * What the shared edits work with (handEdits.js editContextOf, as the week editor builds it): the
 * week as Generated Schedule opens it, or Manual Build's draft as that screen gives it to its week
 * editor (no locks there), with what only an AI's tools need beside it.
 */
function contextOf(m, body) {
  // WEEK-1.5: days are said as this season says them; an AI may still name the weekday.
  m.nameDaysFor(body.setup);
  const t = m.buildTerms(body.labels);
  const setup = body.setup || {};
  let draft = body.draft;
  let checkedWeek;
  let locks = null;
  if (!draft) {
    const loaded = m.loadedOf(body.inputs || {});
    ({ draft, week: checkedWeek } = m.counterWeek(loaded, {
      terms: t,
      setup: body.setup
    }));
    locks = m.lockedKeys(loaded.input.locks);
  }
  return {
    // Generated Schedule gives its editor no planName (only a special day's or event's own
    // schedule has one).
    ...m.editContextOf({ draft, t, setup, locks }),
    // The season's setup a rainy day reads (rain.js rainModel), as the screen's editor has it.
    draft,
    weekdayOf: (dateValue) => m.weekdayName(dateValue),
    spokenWeekday: (weekday) => m.spokenWeekday(weekday),
    // The week as its Lock menu weighs it (counter.js checkDays), for the cells a Lock reaches.
    checkedWeek,
    events: (setup.special && setup.special.specialEvents) || [],
    sets: (setup.electives && setup.electives.sets) || []
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
 * clear_day and clear_week (API-1.143) as Manual Build's Edit menu clears (shoreshManualBuild
 * handleClearDay, handleClearGroupDay, handleClearWeek): the day for every group, or for one
 * group, or the whole week, by the week editor's own tool, with the screen's own preview
 * (handEdits.js clearPreview) for Shoresh to ask first. Generated Schedule has no such tool.
 */
function clearStep(capability, ctx, m, input, weekName) {
  if (ctx.liveLocks) {
    throw new Refused(
      `Clear ${capability.name === "clear_week" ? "week" : "day"} is on Manual Build only. Nothing was changed.`
    );
  }
  let tool;
  if (capability.name === "clear_week") {
    tool = {
      kind: "clear",
      dates: ctx.week.map((day) => day.dateValue),
      name: weekName,
      inWeek: true
    };
  } else {
    // The screen offers Clear day on a special day too; its tool says it is left as it is.
    const d = dayIn(ctx, m, input.day, weekName, true);
    const day = ctx.week[d];
    const name = ctx.dayNameOf(day.dateValue);
    tool = { kind: "clear", dates: [day.dateValue], name };
    if (input.group !== undefined) {
      const grp = day.groups[groupIn(ctx, d, input.group)];
      tool = { ...tool, groupId: grp.id, name: `${grp.name} · ${name}` };
    }
  }
  const step = m.toolStep(ctx, tool);
  if (step.nothing) {
    return { nothing: step.nothing };
  }
  // Asked first as the screen asks it (WEEK-6.15): its own preview, said by Shoresh for the yes.
  // The person's yes dialog doesn't scroll, so it names at most MOST_ROWS group days.
  const { lines, rows } = m.clearPreview(ctx, step);
  const preview =
    rows > MOST_ROWS
      ? [
          ...lines.slice(0, MOST_ROWS),
          `And ${rows - MOST_ROWS} more.`,
          ...lines.slice(rows)
        ]
      : lines;
  return {
    runs: step.result.runs,
    label: step.label,
    said: step.said,
    preview
  };
}

/**
 * rainy_day as the screen's Edit > Rainy day… does (shoreshWeekEditor rainyTool and
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
    model: m.rainModel(ctx.draft, ctx.week, ctx.electivePlaces),
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
 * widened to whole placements (rowsCovered), each group's cells holding the event (placeOverStep: a
 * fixed or recurring activity is covered, as a hand edit may; a locked cell refuses it), labelled
 * as the screen labels it ("Placed Color War · Bunk 1 to Bunk 2 · Monday · Period 1 to Period 2").
 */
function placeEvent(ctx, m, input, weekName) {
  const e = onlyOne(
    ctx.events,
    input.event,
    (x) => [x.Name],
    wordsOf(ctx.t, "SpecialEvent"),
    " in this season"
  );
  const event = ctx.events[e];
  const d = dayIn(ctx, m, input.day, weekName);
  const asked = Array.isArray(input.groups) ? input.groups : [input.groups];
  if (!asked.length) {
    throw new Refused(
      `Say which ${ctx.t.pIn("Group")} (groups), like ${ctx.t.s("Group")} 3.`
    );
  }
  const groups = [...new Set(asked.map((g) => groupIn(ctx, d, g)))].sort(
    (a, b) => a - b
  );
  groups.forEach((g, i) => {
    if (i > 0 && g !== groups[i - 1] + 1) {
      throw new Refused(
        `Choose ${ctx.t.pIn("Group")} side by side, as the day shows them: ${ctx.week[d].groups.map((x) => x.name).join(", ")}.`
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
  const result = m.placeOverStep(ctx, rows, `S:${event.Id}`, event.Name);
  if (result.refused) {
    throw new Refused(result.refused);
  }
  if (!result.runs.length) {
    return {
      nothing: `Nothing to place: ${m.rangeName(ctx, rows)} already holds ${event.Name}.`
    };
  }
  return { runs: result.runs, label: result.label };
}

/**
 * The ones spelled exactly as asked when any of the season's names is (exact); otherwise the ones
 * that read the same (AgentNamed.called).
 */
function called(list, nameOf, asked, exact) {
  return exact
    ? list.filter((x) => nameOf(x) === asked)
    : list.filter((x) => fold(nameOf(x)) === fold(asked));
}

/** Two or more that read the same, named, in the server's words (AgentNamed.sameNameSaid). */
function sameNameSaid(names, things) {
  const quoted = names.map((n) => `"${n}"`);
  const unsure = ", so Shoresh can't tell which you mean. Nothing was changed.";
  if (new Set(quoted).size === 1) {
    return `There are ${quoted.length} ${things} called ${quoted[0]}${unsure}`;
  }
  const last = quoted.pop();
  return `${quoted.join(", ")} and ${last} are ${quoted.length === 1 ? "both" : "all"} ${things} with that name${unsure}`;
}

/**
 * What an AI names for a cell, as typing it offers (API-1.124): one of the season's activities
 * (as the week editor lists them, with their lengths) or elective sets; a name both have, or
 * neither, is refused, never guessed.
 */
function typedOf(ctx, m, asked) {
  const all = ctx.draft.activities || [];
  const exact =
    all.some((a) => a.name === asked) || ctx.sets.some((e) => e.Name === asked);
  const activities = called(all, (a) => a.name, asked, exact);
  const sets = called(ctx.sets, (e) => e.Name, asked, exact);
  const said = String(asked).slice(0, 80);
  const { t } = ctx;
  if (activities.length && sets.length) {
    throw new Refused(
      `"${said}" is both ${m.article(t.sIn("Activity"))} and ${m.article(t.sIn("ElectiveSet"))} in this season, so Shoresh can't tell which you mean.`
    );
  }
  if (activities.length > 1) {
    throw new Refused(
      sameNameSaid(
        activities.map((a) => a.name),
        t.pIn("Activity")
      )
    );
  }
  if (sets.length > 1) {
    throw new Refused(
      sameNameSaid(
        sets.map((e) => e.Name),
        t.pIn("ElectiveSet")
      )
    );
  }
  if (activities.length) {
    return { activity: activities[0] };
  }
  if (sets.length) {
    return { set: sets[0] };
  }
  const byName = (a, b) => a.localeCompare(b);
  throw new Refused(
    `There is no ${t.sIn("Activity")} or ${t.sIn("ElectiveSet")} called "${said}" in this season. ${namesSaid(
      `${t.pIn("Activity")} and ${t.pIn("ElectiveSet")}`,
      [
        ...(ctx.draft.activities || []).map((a) => a.name).sort(byName),
        ...ctx.sets.map((e) => e.Name).sort(byName)
      ]
    )}`
  );
}

/**
 * change_schedule_cell (API-1.11, API-1.13) as typing in a cell on the screen does (the week
 * editor's pick): Open clears the placement there and an activity goes in for its full length,
 * from the placement's first time block, into Open cells after it (placeStep: "(2 of 3)" when it
 * runs out of room, "in place of" a fixed or recurring activity it covers); an elective set holds
 * each time block of the placement on its own (placeElective: rowsCovered, placeOverStep). One
 * group's cell, as Group View types in it.
 */
function typeStep(ctx, m, input, weekName) {
  return typedIn(ctx, m, input, cellOf(ctx, m, input, weekName));
}

/** Typing what input names (input.activity) into a cell (slot), as the week editor's pick does. */
function typedIn(ctx, m, input, slot) {
  checkWas(ctx, m, slot, input.was);
  const day = ctx.week[slot.day];
  const now = ctx.nameOf(m.placement(day, slot.group, slot.block).slot, day);
  const asked = String(input.activity || "").trim();
  if (asked && fold(asked) !== "open") {
    const typed = typedOf(ctx, m, asked);
    if (typed.set) {
      const rows = m.rowsCovered(ctx.week, [{ slot }]);
      const result = m.placeOverStep(
        ctx,
        rows,
        `E:${typed.set.Id}`,
        typed.set.Name,
        true
      );
      if (result.refused) {
        throw new Refused(result.refused);
      }
      if (!result.runs.length) {
        return {
          nothing: `Nothing to change: ${m.rangeName(ctx, rows)} already holds ${now}.`
        };
      }
      return { runs: result.runs, label: result.label };
    }
    return placed(
      m.placeStep(ctx, slot, `A:${typed.activity.id}`, typed.activity.length),
      ctx,
      m,
      slot,
      now
    );
  }
  return placed(m.placeStep(ctx, slot, m.OPEN, 1), ctx, m, slot, now);
}

/** placeStep's answer as an edit: its runs and words, a refusal, or nothing to change. */
function placed(step, ctx, m, slot, now) {
  if (!step) {
    return {
      nothing: `Nothing to change: ${m.slotName(ctx, slot)} already holds ${now}.`
    };
  }
  if (step.refused) {
    throw new Refused(step.refused);
  }
  return { runs: step.runs, label: step.label, said: null };
}

/**
 * change_cell_length (API-1.138): the placement made to end at a time, as its bottom handle does,
 * by the week editor's own step. What has no handle on the screen is said; the same end is nothing.
 */
function lengthStep(ctx, m, from, input) {
  const day = ctx.week[from.day];
  const at = m.placement(day, from.group, from.block);
  const name = ctx.nameOf(at.slot, day);
  const last = blockIn(ctx, from.day, input.ends_at);
  if (!m.canMove(at.slot)) {
    throw new Refused(
      `${m.slotName(ctx, from)} holds ${name}, which has no length to change. Nothing was changed.`
    );
  }
  const step = m.resizeStep(ctx, from, last);
  if (!step) {
    return {
      nothing: `${name} already ends at ${day.blocks[last].name}. Nothing was changed.`
    };
  }
  if (step.refused) {
    throw new Refused(step.refused);
  }
  return { runs: step.runs, label: step.label, said: null };
}

/** The edit asked for, worked out by the screen's own module: { runs, label, said } or a refusal. */
function stepOf(capability, ctx, m, input, weekName) {
  if (capability.name === "place_special_event") {
    return placeEvent(ctx, m, input, weekName);
  }
  if (capability.name === "rainy_day") {
    return rainyDay(ctx, m, input, weekName);
  }
  if (capability.name === "clear_day" || capability.name === "clear_week") {
    return clearStep(capability, ctx, m, input, weekName);
  }
  if (capability.name === "change_schedule_cell") {
    return typeStep(ctx, m, input, weekName);
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
  if (capability.name === "change_cell_length") {
    return lengthStep(ctx, m, from, input);
  }
  const step =
    capability.name === "move_cell"
      ? m.moveStep(ctx, from, cellOf(ctx, m, input, weekName, "to_"))
      : // What has no move of its own (a special event or elective set, API-1.154) goes as
        // Delete on the screen does.
        m.takeOutStep(ctx, from) || m.deleteStep(ctx, from);
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
async function editCells(
  capability,
  input,
  { read, send, answer, load, hold = () => {} }
) {
  const fields = {};
  for (const field of ["season", "week", "program", "schedule"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  const got = await read("week_checks", fields);
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const m = await load();
  const ctx = contextOf(m, body);
  // The week as it is called, as the screen's labels say it (the AI may spell it loosely).
  const weekName = body.week_name ?? input.week;
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
  const saved = await send(capability.api, {
    ...fields,
    change: step.label,
    said: step.said || "",
    runs,
    // The week as the agent read it: the save holds the week and refuses it if changed since.
    ...(input.seen ? { revision: input.seen } : {}),
    // A rainy day's marks, and the day's marks as read.
    ...(step.rain ? { rain: step.rain, seen: step.seen } : {}),
    // A clear's preview, and the person's yes to it (API-1.106).
    ...(step.preview ? { preview: step.preview } : {}),
    ...(input.confirm === undefined ? {} : { confirm: input.confirm })
  });
  if (saved.undo && saved.undo.kind === "edit") {
    // Its Undo, as the editor's history holds it: the runs back, for this conversation only.
    hold(saved.undo, {
      sent,
      before: ctx.liveLocks,
      after: locksAfter(m, sent, ctx.liveLocks),
      rain: step.rain,
      rainSeen: step.seen
    });
  }
  return answer(saved);
}

/**
 * A special day's or event's own schedule as its page hands it to the week editor
 * (shoreshSpecialSchedule: planName, takesElectives, its activities; no locks, nothing away), from
 * what the page opens (GET /v1/change_special_schedule_cell). One day; its columns are the day's
 * groups.
 */
function specialContextOf(m, body) {
  m.nameDaysFor(body.setup);
  const t = m.buildTerms(body.labels);
  const plan = body.plan || {};
  const activities = plan.activities || [];
  const setup = body.setup || {};
  const draft = {
    schedule: { days: (plan.schedule && plan.schedule.days) || [] },
    activities
  };
  return {
    ...m.editContextOf({ draft, t, setup, planName: plan.name }),
    draft,
    weekdayOf: (dateValue) => m.weekdayName(dateValue),
    spokenWeekday: (weekday) => m.spokenWeekday(weekday),
    events: [],
    // A special day's cells take the season's elective sets; an event's don't (the page's
    // takesElectives, SPECIAL-1.3).
    sets:
      plan.kind === "SpecialEvent"
        ? []
        : (setup.electives && setup.electives.sets) || [],
    // An event's columns are its stations; a special day's, its groups.
    columns: plan.kind === "SpecialEvent" ? "Station" : "Group"
  };
}

/**
 * change_special_schedule_cell (API-1.77) as typing in a cell on its page does: the page types
 * through the same week editor as the week screens (typedIn), so the runs are its steps'; they go
 * to the page's own save (POST /v1/change_special_schedule_cell), and, as the page's history does,
 * their runs back are held for Undo for the conversation (undo.js, API-1.14).
 */
async function specialCell(
  capability,
  input,
  { read, send, answer, load, hold = () => {} }
) {
  const fields = {};
  for (const field of ["season", "special", "kind"]) {
    if (input[field] !== undefined) fields[field] = input[field];
  }
  const got = await read(capability.api, fields);
  if (got.status !== 200) return answer(got);
  const m = await load();
  const ctx = specialContextOf(m, JSON.parse(got.body));
  let step;
  try {
    if (!ctx.week.length || ctx.week[0].problem) {
      throw new Refused(
        `This schedule can't be changed: ${(ctx.week[0] && ctx.week[0].problem) || "it has no time blocks or columns yet"}.`
      );
    }
    const slot = {
      day: 0,
      group: onlyOne(
        ctx.week[0].groups,
        input.column,
        (g) => [g.name],
        wordsOf(ctx.t, ctx.columns),
        " in this schedule"
      ),
      block: blockIn(ctx, 0, input.time)
    };
    step = typedIn(ctx, m, input, slot);
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
  const saved = await send(capability.api, {
    ...fields,
    change: step.label,
    runs: sent
  });
  if (saved.undo && saved.undo.kind === "edit") {
    hold(saved.undo, { sent, before: null, after: null });
  }
  return answer(saved);
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
          wordsOf(ctx.t, "Group"),
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
        `There is no ${ctx.t.sIn("Group")} called "${String(input.group).slice(0, 80)}" on ${input.week}. ${namesSaid(ctx.t.pIn("Group"), groups)}`
      );
    }
  }
  const rows = [];
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
        rows.push([
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
    rows
  };
}

/**
 * The cells a Lock or Unlock reached (change: as setLocks took it), as the screen's Lock menu
 * works them out for the same choice (shoreshGeneratedSchedule locks.js weekCells and
 * lockChoices: keys), on the week as read before it: what an Undo of an earlier step leaves as
 * chosen (shoreshWeekEditor lockChosen). Null when the menu offers no such choice.
 */
function lockKeysOf(m, body, change) {
  const ctx = contextOf(m, body);
  if (!ctx.checkedWeek) return null;
  const w = ctx.checkedWeek;
  const cells = m.weekCells(w.checkedDays, w.locked, w.isAway);
  const scope = change.blockId
    ? "cell"
    : change.dateValue && change.groupId
      ? "groupDay"
      : change.dateValue
        ? "day"
        : "group";
  const at = {
    cell:
      scope === "cell" || scope === "groupDay"
        ? {
            dateValue: change.dateValue,
            groupId: change.groupId,
            blockId: change.blockId || null,
            where: "",
            groupName: ""
          }
        : null,
    day: scope === "day" ? { dateValue: change.dateValue, name: "" } : null,
    group: scope === "group" ? { groupId: change.groupId, name: "" } : null
  };
  const choice = m
    .lockChoices(cells, at)
    .find(
      (c) => c.value.endsWith(`|${scope}`) && c.change.action === change.action
    );
  return choice ? choice.keys : null;
}

module.exports = {
  Refused,
  editCells,
  lockedCells,
  draftOf,
  contextOf,
  lockKeysOf,
  specialCell
};
