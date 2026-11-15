/**
 * undo_last_agent_change (API-1.14, API-1.148): Undo as the screen's Undo, held here and nowhere else.
 * The screen holds its Undo in the page, only while it is open; the connector holds it in this
 * process, only for this conversation, never in Salesforce. Each change's answer says what its
 * Undo needs (AgentUndoHeld: the schedule (a week's draft, or a special day's or event's
 * plan), the change's label, the revision just after it, and its kind). A week's hand edit's runs
 * back are worked out here, when Undo is asked, as the editor's history works them out (history.js,
 * moves.js inverse, locks.js stampLocks and lockTarget): the runs reversed, each cell's lock taken
 * back to what it was before the edit unless a Lock or Unlock chose that cell since (lockChosen).
 * A special plan's cell edit is held the same way, without locks (its page has none).
 *
 * As the editor's history, each schedule keeps its hand edits, newest last, up to 50:
 *   - "edit": a hand edit, one more step;
 *   - "lock" (a Lock or Unlock) and "kept" (Set it up): the history goes on past it, as the screen's
 *     does (the week is shown again, Undo kept); the cells a Lock reached keep their locks on any
 *     Undo of a step before it; a build's Undo is no longer offered (the week moved on);
 *   - "build" (Rebuild, Start over: Undo with the version its save kept) and "none" (no Undo: Generate,
 *     Try another, Fill the open cells, Update to match setup, Restore, a special plan's frame change
 *     or import): the history starts over with that change alone;
 *   - "undone": Undo's own answer; the step leaves, and the one before is next.
 */

// The screen's limit (history.js LIMIT).
const LIMIT = 50;

// By sign-in, then by schedule: { steps (newest last), locks (the week's locks as the connector
// last left them, a Set of "date|groupId|blockId", or null), seq (the last step's id), chosenAt
// (cell -> the last step's id when a Lock or Unlock chose it) }.
const held = new Map();

function schedulesOf(org) {
  const key = org || "";
  if (!held.has(key)) held.set(key, new Map());
  return held.get(key);
}

function stateOf(org, schedule) {
  const all = schedulesOf(org);
  if (!all.has(schedule)) {
    all.set(schedule, {
      steps: [],
      locks: null,
      seq: 0,
      chosenAt: new Map()
    });
  }
  return all.get(schedule);
}

/** An answer's body without what its Undo needs, and that, if it says it. */
function takeUndo(response) {
  let parsed;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return { response, undo: null };
  }
  if (!parsed || Array.isArray(parsed) || !parsed.undo) {
    return { response, undo: null };
  }
  const { undo, ...rest } = parsed;
  return { response: { ...response, body: JSON.stringify(rest) }, undo };
}

/** A step as Undo is asked for it: what the screen's history would send. */
function stepOf(undo, extra = {}) {
  return {
    kind: undo.kind,
    label: undo.label,
    seen: undo.seen ?? null,
    version: undo.version ?? null,
    version_name: undo.version_name ?? null,
    ...extra
  };
}

/**
 * What a change just made leaves for Undo. A week's hand edit ("edit") comes with back: { sent
 * (its runs as the server took them), before and after (the week's locks either side of it, or
 * null on Manual Build), rain, rainSeen }; a Lock with keys (the cells its choice reached).
 */
function hold(org, undo, back = null) {
  if (!undo || !undo.schedule) return;
  if (undo.kind === "edit" && !back) return;
  const state = stateOf(org, undo.schedule);
  const steps = state.steps;
  const top = steps[steps.length - 1];
  if (undo.kind === "undone") {
    const taken = steps.pop();
    if (taken && taken._locksAfterUndo) state.locks = taken._locksAfterUndo;
    const left = steps.filter((step) => step.kind === "edit");
    if (!taken || taken.kind !== "edit" || !left.length) {
      // A build undone is a whole week back: Undo starts over, as on the screen.
      state.steps = [];
      return;
    }
    // The step before it is undone next, from the week as this Undo left it.
    left[left.length - 1].seen = undo.seen ?? null;
    state.steps = left;
    return;
  }
  if (undo.kind === "lock" || undo.kind === "kept") {
    // Nothing held for the week: nothing to go on past, so nothing is kept (Undo there says so).
    if (!top) return;
    if (undo.kind === "lock") {
      if (!back) {
        // Which cells the Lock reached couldn't be worked out: no Undo is risked past it.
        state.steps = [stepOf({ ...undo, kind: "none" })];
        return;
      }
      for (const key of back.keys) state.chosenAt.set(key, state.seq);
      if (state.locks) {
        const next = new Set(state.locks);
        back.keys.forEach((key) =>
          back.locks ? next.add(key) : next.delete(key)
        );
        state.locks = next;
      }
    }
    if (top && top.kind === "edit") {
      top.seen = undo.seen ?? null;
    } else if (top && top.kind === "build") {
      // The week moved on since the build: its Undo is no longer offered, as on the screen.
      state.steps = [{ ...top, kind: "none" }];
    }
    return;
  }
  if (undo.kind === "edit") {
    state.seq += 1;
    const step = stepOf(undo, { id: state.seq });
    if (back) {
      step.sent = back.sent;
      step.before = back.before;
      step.after = back.after;
      step.rain = back.rain ? rainBack(back.rain, back.rainSeen) : null;
      state.locks = back.after;
    }
    state.steps = [...steps.filter((each) => each.kind === "edit"), step].slice(
      -LIMIT
    );
    return;
  }
  state.steps = [stepOf(undo)];
  state.locks = null;
  state.chosenAt = new Map();
}

/**
 * The locks an Undo of a step leaves (shoreshWeekEditor lockTarget): each cell the step changed
 * the lock of goes back to before it, unless a Lock or Unlock chose it since; every other cell
 * keeps the lock it has now.
 */
function lockTarget(step, state) {
  const target = new Set(state.locks);
  const chosenSince = (key) => (state.chosenAt.get(key) ?? -1) >= step.id;
  [...step.before, ...step.after]
    .filter((key) => step.before.has(key) !== step.after.has(key))
    .filter((key) => !chosenSince(key))
    .forEach((key) => {
      if (step.before.has(key)) target.add(key);
      else target.delete(key);
    });
  return target;
}

/**
 * What Undo would take back in each schedule this conversation changed, by schedule, as the
 * screen's history would send it now. m: the week editor's modules (needed for a week's hand
 * edit; null when none is held).
 */
function heldNow(org, m = null) {
  const tops = {};
  for (const [schedule, state] of schedulesOf(org)) {
    const step = state.steps[state.steps.length - 1];
    if (!step) continue;
    const { id, sent, before, after, _locksAfterUndo, ...said } = step;
    if (sent && m) {
      const back = m.inverse(sent);
      if (before && state.locks) {
        const target = lockTarget(step, state);
        said.runs = m.stampLocks(back, state.locks, target);
        step._locksAfterUndo = back.reduce(
          (locks, run) => m.foldRun(locks, run, target),
          state.locks
        );
      } else {
        said.runs = back;
      }
    }
    if (!said.rain) delete said.rain;
    tops[schedule] = { schedule, ...said };
  }
  return tops;
}

/** Whether any schedule's Undo needs the week editor's modules to be worked out. */
function needsEditor(org) {
  for (const state of schedulesOf(org).values()) {
    const step = state.steps[state.steps.length - 1];
    if (step && step.sent) return true;
  }
  return false;
}

/** Nothing held anywhere (a new conversation, or the command line's one command). */
function nothingHeld(org) {
  return [...schedulesOf(org).values()].every((state) => !state.steps.length);
}

/** Forgets everything held (a test's new conversation). */
function forgetAll() {
  held.clear();
}

/** The locks after a week's hand edit, as the screen folds them (locks.js foldRun). */
function locksAfter(m, sent, liveLocks) {
  return liveLocks
    ? sent.reduce((locks, run) => m.foldRun(locks, run), liveLocks)
    : null;
}

/** A rainy day's marks as they were before it. */
function rainBack(rain, seen) {
  return rain.map((day) => ({ day: day.day, cells: seen || [] }));
}

module.exports = {
  takeUndo,
  hold,
  heldNow,
  needsEditor,
  nothingHeld,
  forgetAll,
  locksAfter
};
