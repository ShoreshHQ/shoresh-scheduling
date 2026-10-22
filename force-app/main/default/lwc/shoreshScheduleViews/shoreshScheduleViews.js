/**
 * The schedule page's three views of one opened schedule, worked out from its days as the server
 * sends them (SchedulesController.openSchedule): Daily View (all groups for one day), Group View
 * (one group's week), and Activity View (where one activity runs across the week). Each grid is
 * { columns, rows, cells } for c-shoresh-schedule-grid, laid out the way Shoresh desktop lays
 * out its grids: time blocks down the side, one column per group or day, a cell that runs
 * several blocks spanning their rows.
 *
 * A day's rows are the stored format's: cells separated by commas, one per time block; a cell is
 * empty, an item number (from 1), or ^ (the item above carries on). Names are as saved.
 */

const CARRIES_ON = "^";
const NOT_SET_UP = new Set(["E", "D", "S", "T"]);

/**
 * Whether an item points at something set up in Shoresh: an activity, a fixed or recurring
 * activity, or a special event (or day) with its record (ADR 0014 slice 4). An elective, trip,
 * special day or event noted from a file by name only is "not set up yet".
 */
export function isSetUpItem(item) {
  return !NOT_SET_UP.has(item.kind) || Boolean(item.id);
}

/** A special event placed on the grid (with its record), not one noted from a file. */
export function isEventItem(item) {
  return !!item && item.kind === "S" && Boolean(item.id);
}

/** "Monday", "Mon" and "Jun 29" for a date sent as "2026-06-29", whatever the browser's time zone. */
export function dayLabel(dateValue) {
  const [y, m, d] = String(dateValue).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    label: date.toLocaleDateString("en-US", { weekday: "long" }),
    short: date.toLocaleDateString("en-US", { weekday: "short" }),
    sub: date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  };
}

/** "09:00" -> "9:00 AM". */
export function clock(hhmm) {
  if (!hhmm) {
    return "";
  }
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** What a kind of item is called, in the camp's words. */
export function kindLabel(kind, t) {
  return {
    A: t.s("Activity"),
    F: t.s("FixedActivity"),
    R: t.s("RecurringActivity"),
    E: t.s("ElectiveSet"),
    D: t.s("SpecialDay"),
    S: t.s("SpecialEvent"),
    T: t.s("Trip")
  }[kind];
}

/** The same item on every day: by record for things set up, by kind and name otherwise. */
export function itemKey(item) {
  return isSetUpItem(item)
    ? `${item.kind}:${item.id}`
    : `${item.kind}:${item.name}`;
}

function refKey(ref) {
  return ref.id || ref.name;
}

/**
 * One day's cells for one group: for each time block that starts something, the item (or null
 * for nothing placed) and how many blocks it runs. Blocks an item carries on into are left out.
 */
export function groupCells(day, groupIndex) {
  const row = (day.rows[groupIndex] || "").split(",");
  const cells = [];
  row.forEach((token, blockIndex) => {
    if (token === CARRIES_ON && cells.length) {
      cells[cells.length - 1].length += 1;
      return;
    }
    cells.push({
      blockIndex,
      length: 1,
      item: token ? day.items[Number(token) - 1] : null
    });
  });
  return cells;
}

function readable(view) {
  return ((view && view.days) || []).filter((day) => !day.problem);
}

/** The week's days, for the day pills and Group and Activity View columns. */
export function days(view) {
  return ((view && view.days) || []).map((day, index) => ({
    key: String(index),
    index,
    problem: day.problem,
    ...dayLabel(day.dateValue)
  }));
}

/**
 * Every group in the week, in order, for the group pills. A deleted one says so on its pill, as
 * its column does in Daily View, on every screen that shows the pills.
 */
export function groups(view) {
  const seen = new Map();
  readable(view).forEach((day) =>
    day.groups.forEach((grp) => {
      if (!seen.has(refKey(grp))) {
        seen.set(refKey(grp), {
          key: refKey(grp),
          name: grp.name,
          gone: grp.gone,
          note: grp.gone ? "(removed)" : null
        });
      }
    })
  );
  return [...seen.values()];
}

/** Every time block in the week, in the order of the day (a block may be on some days only). */
function weekBlocks(view) {
  const seen = new Map();
  readable(view).forEach((day) =>
    day.blocks.forEach((block) => {
      if (!seen.has(refKey(block))) {
        seen.set(refKey(block), block);
      }
    })
  );
  return [...seen.values()].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || "")
  );
}

/**
 * How wide a schedule grid (and Manual Build's drawer under it, on the same columns) must be for
 * every column: the time column, then each column at least 88 px and the gap after it.
 */
export function gridMinWidth(columns) {
  return `calc(var(--shoresh-head-w) + ${columns} * (88px + var(--shoresh-space-cell-gap)))`;
}

/** "09:00" -> "9:00", "13:15" -> "1:15": a time as the grid's time column shows it. */
export function shortClock(hhmm) {
  if (!hhmm) {
    return "";
  }
  const [h, m] = hhmm.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}`;
}

/** The block's name is just its time range, "9:00 AM – 9:45 AM" (TimeBlockTriggerHandler). */
function isTimeRange(block) {
  return block.name === `${clock(block.startTime)} – ${clock(block.endTime)}`;
}

function blockRows(blocks) {
  if (!blocks.length) {
    // No day could be read: one empty row, so each day's "Can't be shown" still shows.
    return [
      {
        key: "none",
        name: "",
        time: "",
        said: "",
        gone: false,
        style: "grid-row: 1 / span 1; grid-column: 1 / span 1;"
      }
    ];
  }
  return blocks.map((block, index) => {
    const range = block.startTime
      ? `${clock(block.startTime)} – ${clock(block.endTime)}`
      : null;
    return {
      key: refKey(block),
      name: block.name,
      // The time column shows times only (wiki decision 36, docs/design round 13): "9:00–9:45".
      // A block saved without times shows its name instead.
      time: block.startTime
        ? `${shortClock(block.startTime)}–${shortClock(block.endTime)}`
        : block.name,
      // What a screen reader hears: the block's name and its times, once when the name already
      // is the time range (a block saved without a name, desktop blockLabelParts).
      said:
        range && !isTimeRange(block) ? `${block.name}, ${range}` : block.name,
      gone: block.gone,
      style: `grid-row: ${index + 1} / span 1; grid-column: 1 / span 1;`
    };
  });
}

function place(rowIndex, columnIndex, length) {
  return `grid-row: ${rowIndex + 1} / span ${length}; grid-column: ${columnIndex + 2} / span 1;`;
}

/**
 * What one cell shows. Every placed cell is the one raised look; what kind it is rides on flags
 * the grid draws as marks (wiki decisions 36 to 41): setTime (a fixed or recurring activity: the
 * lock), notSetUp (a dashed edge), gone (removed since: the name struck through). An Open cell
 * is recessed and shows no word; "Open" stays its name for screen readers. activityKey says
 * which activity a cell is, for the same-activity outlines. A special event placed on the grid
 * (decision 47.3) carries its quiet flag before the name (event), and eventKey says which event
 * it is: in Daily View the bunks next to each other holding it over the same blocks are drawn as
 * one cell (c-shoresh-schedule-grid; mockup design-research/special-r1 placed.html).
 */
function cellView(item, t) {
  if (!item) {
    return {
      text: "Open",
      open: true,
      className: "cell cell_open",
      note: null,
      title: "Open"
    };
  }
  const kind = kindLabel(item.kind, t);
  if (isEventItem(item)) {
    return {
      text: item.name,
      event: true,
      eventKey: `S:${item.id}`,
      gone: !!item.gone,
      className: "cell cell_event",
      note: item.gone ? "(removed)" : null,
      title: `${item.name}: ${kind}`
    };
  }
  if (!isSetUpItem(item)) {
    return {
      text: item.name,
      notSetUp: true,
      className: "cell cell_not-set-up",
      note: "not set up yet",
      title: `${item.name}: ${kind}, not set up in Shoresh yet`
    };
  }
  const setTime = item.kind === "F" || item.kind === "R";
  return {
    text: item.name,
    setTime,
    gone: !!item.gone,
    activityKey: item.kind === "A" ? `A:${item.id}` : null,
    className: setTime ? "cell cell_set-time" : "cell cell_activity",
    note: item.gone ? "(removed)" : null,
    title: item.kind === "A" ? item.name : `${item.name}: ${kind}`
  };
}

/** at.slot: the day, group, and time block (positions in the day) the cell starts at. */
function cell(key, at, item, t) {
  return {
    key,
    row: at.row,
    column: at.column,
    length: at.length,
    slot: at.slot,
    style: place(at.row, at.column, at.length),
    ...cellView(item, t)
  };
}

/**
 * A day that could not be read, in Group or Activity View: its whole column says so, in camp
 * words. Why (the day's problem: the server's reason, about how the day is stored) is no help
 * to a director and isn't shown.
 */
function problemCell(dayIndex, rowCount) {
  return {
    key: `${dayIndex}-problem`,
    row: 0,
    column: dayIndex,
    length: Math.max(rowCount, 1),
    style: place(0, dayIndex, Math.max(rowCount, 1)),
    text: "Can't be shown",
    className: "cell cell_problem",
    note: null,
    title: null
  };
}

function column(key, label, sub, gone) {
  return { key, label, sub, note: gone ? "(removed)" : null };
}

/** Daily View: one day, a column per group. */
export function dailyGrid(view, dayIndex, t) {
  const day = view && view.days[dayIndex];
  if (!day || day.problem) {
    return null;
  }
  const cells = [];
  day.groups.forEach((grp, g) => {
    groupCells(day, g).forEach((c) => {
      const drawn = cell(
        `${g}-${c.blockIndex}`,
        {
          row: c.blockIndex,
          column: g,
          length: c.length,
          slot: { day: dayIndex, group: g, block: c.blockIndex }
        },
        c.item,
        t
      );
      // The same event over the same blocks in bunks side by side is one cell (ADR 0014).
      if (drawn.eventKey) {
        drawn.mergeKey = `${drawn.eventKey}|${c.blockIndex}|${c.length}`;
      }
      cells.push(drawn);
    });
  });
  return {
    columns: day.groups.map((grp) =>
      column(refKey(grp), grp.name, null, grp.gone)
    ),
    rows: blockRows(day.blocks),
    cells
  };
}

/** Group View: one group's week, a column per day. */
export function groupGrid(view, groupKey, t) {
  const blocks = weekBlocks(view);
  const rowOf = new Map(blocks.map((block, i) => [refKey(block), i]));
  const cells = [];
  const columns = days(view).map((d) => column(d.key, d.label, d.sub, false));
  (view.days || []).forEach((day, dayIndex) => {
    if (day.problem) {
      cells.push(problemCell(dayIndex, blocks.length));
      return;
    }
    const g = day.groups.findIndex((grp) => refKey(grp) === groupKey);
    if (g < 0) {
      return;
    }
    groupCells(day, g).forEach((c) => {
      const first = rowOf.get(refKey(day.blocks[c.blockIndex]));
      const last = rowOf.get(refKey(day.blocks[c.blockIndex + c.length - 1]));
      cells.push(
        cell(
          `${dayIndex}-${first}`,
          {
            row: first,
            column: dayIndex,
            length: last - first + 1,
            slot: { day: dayIndex, group: g, block: c.blockIndex }
          },
          c.item,
          t
        )
      );
    });
  });
  return { columns, rows: blockRows(blocks), cells };
}

/**
 * Activity View's cards: the camp's activities (the catalogue, in order), and any activity in
 * this schedule that is not in it any more. Only an activity that is deleted is marked so, the
 * same as its cells (one that is just in another season is listed, not marked). Each says how many groups do it and how often.
 */
export function activityCards(view, catalogue, t) {
  const counts = new Map();
  readable(view).forEach((day) =>
    day.groups.forEach((grp, g) =>
      groupCells(day, g).forEach((c) => {
        if (c.item && c.item.kind === "A") {
          const entry = counts.get(c.item.id) || {
            groups: new Set(),
            times: 0,
            name: c.item.name,
            gone: !!c.item.gone
          };
          entry.groups.add(refKey(grp));
          entry.times += 1;
          counts.set(c.item.id, entry);
        }
      })
    )
  );
  const cards = (catalogue || []).map((a) => ({ key: a.Id, name: a.Name }));
  const known = new Set(cards.map((card) => card.key));
  counts.forEach((entry, id) => {
    if (!known.has(id)) {
      cards.push({ key: id, name: entry.name, gone: entry.gone });
    }
  });
  return cards.map((card) => {
    const entry = counts.get(card.key);
    const groupCount = entry ? entry.groups.size : 0;
    const times = entry ? entry.times : 0;
    return {
      ...card,
      summary: `${groupCount} ${groupCount === 1 ? t.sIn("Group") : t.pIn("Group")} · ${times} ${times === 1 ? "time" : "times"} this ${t.sIn("Week")}`
    };
  });
}

/** Activity View, opened on one activity: in each block of each day, the groups doing it. */
export function activityGrid(view, activityId) {
  const blocks = weekBlocks(view);
  const rowOf = new Map(blocks.map((block, i) => [refKey(block), i]));
  const cells = [];
  (view.days || []).forEach((day, dayIndex) => {
    if (day.problem) {
      cells.push(problemCell(dayIndex, blocks.length));
      return;
    }
    const names = new Map();
    day.groups.forEach((grp, g) =>
      groupCells(day, g).forEach((c) => {
        if (c.item && c.item.kind === "A" && c.item.id === activityId) {
          for (let b = c.blockIndex; b < c.blockIndex + c.length; b++) {
            const row = rowOf.get(refKey(day.blocks[b]));
            names.set(row, [...(names.get(row) || []), grp.name]);
          }
        }
      })
    );
    blocks.forEach((block, row) => {
      const here = names.get(row) || [];
      cells.push({
        key: `${dayIndex}-${row}`,
        row,
        column: dayIndex,
        length: 1,
        style: place(row, dayIndex, 1),
        className: here.length
          ? "cell cell_activity-here"
          : "cell cell_activity-none",
        names: here.map((name, i) => ({ key: String(i), name })),
        title: here.length ? here.join(", ") : "Not scheduled"
      });
    });
  });
  return {
    columns: days(view).map((d) => column(d.key, d.label, d.sub, false)),
    rows: blockRows(blocks),
    cells
  };
}
