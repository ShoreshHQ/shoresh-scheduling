/**
 * The counter's lines, as its dropdown lists them (wiki decisions 16, 38, 41 and 43; CORE-6.8):
 * Open, under, over, to look at and notes, each with its key and Accept, those accepted and no
 * worse since left out. Shared by the counter (c/shoreshWeekChecks) and Shoresh's connector, which
 * reads a week's checks and accepts one for an agent with this same code (docs/protocol/api.md
 * API-1.30, API-1.31), so the two can never say or keep different things.
 */

/**
 * The lines still shown: { open, under, over, look, notes }. measure: c/shoreshEngine
 * measureWeek's answer with the Why list's rows; accepted: the lines accepted, as kept with the
 * week ({ key, same, size }).
 */
export function checkLines(m, accepted) {
  const shown = (line) => !tucked(accepted, line);
  return {
    open: (m.open || [])
      .map((line) => ({ ...line, acceptLabel: `Accept: ${line.text}` }))
      .filter(shown),
    under: m.under.rows
      .map((row) => ({
        ...row,
        key: `under|${row.id}|${row.placed}|${row.goal}`,
        same: `under|${row.id}`,
        size: row.goal - row.placed,
        said: `${row.name}: ${row.placed} of ${row.goal}`,
        acceptLabel: `Accept: ${row.name}, ${row.placed} of ${row.goal}`
      }))
      .filter(shown),
    over: m.over.rows
      .map((row) => ({
        ...row,
        key: `over|${row.id}|${row.placed}|${row.goal}`,
        same: `over|${row.id}`,
        size: row.placed - row.goal,
        said: `${row.name}: ${row.placed} of ${row.goal}, over`,
        acceptLabel: `Accept: ${row.name}, ${row.placed} of ${row.goal}, over`
      }))
      .filter(shown),
    look: m.look
      .map((line) => ({
        ...line,
        // Desktop FindingsRail: an overlap has nothing to accept.
        acceptable: line.kind !== "overlapping",
        acceptLabel: `Accept: ${line.text}`
      }))
      .filter(shown),
    notes: (m.notes || [])
      .map((line) => ({ ...line, acceptLabel: `Accept: ${line.text}` }))
      .filter(shown)
  };
}

/** Accepted and no worse since: the same line, its size no bigger (CORE-6.8). */
export function tucked(accepted, line) {
  return accepted.some((a) => {
    if (a.same === undefined || a.size === undefined) {
      return a.key === line.key;
    }
    return a.same === line.same && line.size <= a.size;
  });
}

/** What Accept says it hid: the line's words, or "<activity>, <placed> of <goal>". */
export function saidOf(line) {
  return line.text || `${line.name}, ${line.placed} of ${line.goal}`;
}

/** An accepted line as the week keeps it (Apex WeekAccepts): { k, s, n } as JSON. */
export function keptLine(line) {
  return JSON.stringify({
    k: line.key,
    s: line.same === undefined ? null : line.same,
    n: line.size === undefined ? null : line.size
  });
}

/** The lines kept with the week (WeekAccepts.accepted's JSON), as accepted lines. */
export function readKept(text) {
  return JSON.parse(text || "[]").map((line) => ({
    key: line.k,
    same: line.s === null ? undefined : line.s,
    size: line.n === null ? undefined : line.n
  }));
}

/** Priorities met (CORE-6.4): "High priority 9 of 10 minimums met", then Low. Counts only. */
export function priorityRowsOf(m) {
  return (m.priorities || []).map((row) => ({
    ...row,
    key: `priority-${row.priority}`,
    label: row.priority === "high" ? "High priority" : "Low priority"
  }));
}

/** Spread across the week (CORE-6.4): sessions on a day of their own, of repeated sessions. */
export function spreadOf(m) {
  const spread = m.spread;
  return spread && spread.sessions > 0 ? spread : null;
}

/** An Accept the line offers: every line but an overlapping cell (desktop FindingsRail). */
export function acceptable(line) {
  return line.acceptable !== false;
}

/** The words a line is listed by: an under or over row's "<activity>: <placed> of <goal>", else its text. */
export function wordsOf(line) {
  return line.said || line.text;
}

/**
 * What the counter shows, in its own words, as one object an agent reads (API-1.30): the
 * counter's "29 of 35 placed", whether it needs a look, its dropdown's rows in order, and the
 * lines still shown, each with whether it has an Accept. Sections the dropdown leaves out are
 * left out.
 */
export function counterWords(m, accepted) {
  const lines = checkLines(m, accepted);
  const listed = (rows) =>
    rows.map((line) => ({ line: wordsOf(line), can_accept: acceptable(line) }));
  const shown =
    lines.open.length +
      lines.under.length +
      lines.over.length +
      lines.look.length +
      lines.notes.length >
    0;
  const out = {
    placed: `${m.placed} of ${m.total} placed`,
    needs_a_look: shown,
    still_needed: m.stillNeeded,
    priorities: priorityRowsOf(m).map(
      (row) => `${row.label} ${row.met} of ${row.total} minimums met`
    )
  };
  const spread = spreadOf(m);
  if (spread) {
    out.spread = `Spread across the week ${spread.days} of ${spread.sessions} on different days`;
  }
  if (lines.open.length) {
    out.open = listed(lines.open);
  }
  if (m.hasGoals || m.under.count > 0) {
    out.under = { count: m.under.count, lines: listed(lines.under) };
  }
  if (m.hasLimits || m.over.count > 0) {
    out.over = { count: m.over.count, lines: listed(lines.over) };
  }
  if (lines.look.length) {
    out.to_look_at = listed(lines.look);
  }
  if (lines.notes.length) {
    out.notes = listed(lines.notes);
  }
  return out;
}
