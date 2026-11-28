/*
 * INGEST-2.34: the weeks an activity's cells name ("Water Slide Weeks 2, 4-5"). The activity
 * runs only in those weeks of the season, by number, as the weeks a person unticks on the
 * Activities screen (a week off, WeekException). A number the season does not have is said, not
 * guessed; cells of the same name without weeks win, so it runs every week, and that is said.
 */

/**
 * The season's week a cell's week number names: the week named a word and that number ("Week
 * 2"), as a file's own "Week 2" sheet is matched (version.js sureWeek); by its place in the
 * season when no week is named so ("Week of 6/21", "Session 1 Week 2"). Null when it has none.
 */
function weekNumbered(weeks, n) {
  const numberOf = (w) => {
    const found = String(w.Name || "").match(/^\s*\p{L}+\s+(\d+)\s*$/u);
    return found ? Number(found[1]) : null;
  };
  if (weeks.some((w) => numberOf(w) !== null)) {
    return weeks.find((w) => numberOf(w) === n) || null;
  }
  return weeks[n - 1] || null;
}

/**
 * Sets each new activity's weeks off (offWeeks: the season's week Ids, or keys of weeks this
 * import fills in) and runsIn (the week numbers it runs in). weeks: the season's weeks in order,
 * saved or to fill in ({ Id, Name, filled }). Returns { notes, usesFilled }: the review's notes,
 * each once, and whether a week to fill in is named (the import must then add the weeks).
 */
export function weeksWritten(activities, setTime, usable, weeks, leftOut = []) {
  const notes = new Map();
  const note = (type, name, extra = {}) =>
    notes.set(`${type}|${name}`, { type, name, ...extra });
  let usesFilled = false;
  const cellsOf = new Map();
  for (const p of usable) {
    cellsOf.set(p.text, [...(cellsOf.get(p.text) || []), p]);
  }
  const marked = (name) => (cellsOf.get(name) || []).filter((p) => p.weeks);
  const weeksIn = (cells) =>
    [...new Set(cells.flatMap((p) => p.weeks))].sort((x, y) => x - y);
  // A name left out comes in with nothing to keep: nothing is said for it.
  const done = new Set(leftOut);
  for (const a of activities) {
    const cells = cellsOf.get(a.name) || [];
    const withWeeks = marked(a.name);
    if (withWeeks.length === 0) {
      continue;
    }
    done.add(a.name);
    if (withWeeks.length < cells.length) {
      note("weeksEvery", a.name);
      continue;
    }
    const written = weeksIn(withWeeks);
    const named = written.map((n) => [n, weekNumbered(weeks, n)]);
    const known = named.filter(([, w]) => w).map(([n]) => n);
    const unknown = named.filter(([, w]) => !w).map(([n]) => n);
    if (unknown.length > 0) {
      note("weeksUnknown", a.name, { weeks: unknown });
    }
    const on = new Set(named.filter(([, w]) => w).map(([, w]) => w.Id));
    if (on.size === 0 || on.size === weeks.length) {
      continue;
    }
    a.runsIn = known;
    a.offWeeks = weeks.filter((w) => !on.has(w.Id)).map((w) => w.Id);
    usesFilled = usesFilled || weeks.some((w) => w.filled);
    note("weeksRunsIn", a.name, { weeks: known });
  }
  // A set time is every week: its weeks are not read (only an activity's are).
  for (const name of new Set(setTime.map((r) => r.name))) {
    if (marked(name).length > 0 && !done.has(name)) {
      done.add(name);
      const every = marked(name).length === (cellsOf.get(name) || []).length;
      note(every ? "weeksSetTime" : "weeksEvery", name);
    }
  }
  // Anything else named with weeks (an activity the camp has, an elective's choice) keeps its own.
  for (const [name, cells] of cellsOf) {
    if (!done.has(name) && cells.some((p) => p.weeks)) {
      note("weeksAsIs", name, { weeks: weeksIn(marked(name)) });
    }
  }
  return { notes: [...notes.values()], usesFilled };
}
