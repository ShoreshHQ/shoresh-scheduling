import { FIELD } from "c/shoreshSchema";

/**
 * Roots' card faces (repo ADR 0020; the approved mock-up design-research/roots-approved/table.js):
 * each card's name and one drawn glimpse of the camp's own data, and for a card shrunk aside a
 * simpler picture of the same data with only its one or two key words, drawn large enough to read.
 * No sentences and no counts the director already knows. Pure: the same camp gives the same faces.
 *
 * A glimpse is { w, h, align, fade, shapes }: a 220 by 128 drawing (the card's glimpse box) whose
 * shapes are rects, texts and paths with token classes (c-shoresh-roots-glimpse draws them). An
 * empty area draws its outline, dashed, so what is missing shows by its shape (wiki decision 29).
 */

export const W = 220;
export const H = 128;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_LETTERS = ["M", "T", "W", "T", "F"];
const MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");

// ---------- the melds: the menu's three sections, in its order (wiki decision 64h) ----------

/** Per section: the three cards that show at rest (front first), and the small tag on a name. */
export const MELD_REST = {
  camp: ["weeks", "divisions", "timeBlocks"],
  activities: ["activities", "specialEvents", "electives"],
  schedules: ["manualBuild", "generatedSchedule", "schedules"]
};

// ---------- reading the camp ----------

/** "2026-06-29" -> { y, m (0-11), d }, the same in every time zone. */
function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return match
    ? { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) }
    : null;
}

/** "JUN 28". */
export function shortDate(value) {
  const p = dateParts(value);
  return p ? `${MONTHS[p.m]} ${p.d}` : "";
}

/** Minutes past midnight from a time block's time (milliseconds) or "HH:mm". */
function minutesOf(value) {
  if (typeof value === "number") {
    return Math.round(value / 60000);
  }
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "9:00", "12:20", "3:30": the grid's short clock (no AM/PM: the day reads in order). */
export function clockOf(minutes) {
  if (minutes == null) {
    return "";
  }
  const h = Math.floor(minutes / 60) % 12 || 12;
  return `${h}:${String(minutes % 60).padStart(2, "0")}`;
}

const nameOf = (row) => (row && row.Name) || "";

/**
 * Everything the faces draw, from the season's setup (already on the page), Roots' one request
 * (RootsController.getTable: schedules, seats, versions) and the camp's words (setup.labels).
 */
export function readCamp(setup, table) {
  const s = setup || {};
  const tb = table || {};
  const programs = s.programs || [];
  const built = new Set(tb.builtWeekIds || []);
  const weeks = (s.weeks || []).map((w, i) => ({
    id: w.Id,
    n: i + 1,
    name: nameOf(w),
    start: w[FIELD.Week.StartDate],
    end: w[FIELD.Week.EndDate],
    built: built.has(w.Id),
    now: !!tb.thisWeekId && w.Id === tb.thisWeekId
  }));
  const weekIndex = new Map(weeks.map((w) => [w.id, w]));
  const divisions = programs.flatMap((entry) =>
    (entry.divisions || []).map((d) => ({
      name: nameOf(d.division),
      program: nameOf(entry.program),
      groups: (d.groups || []).map(nameOf)
    }))
  );
  // The day drawn: the program with the most time blocks (the first of those).
  const dayProgram = programs.reduce((best, entry) => {
    return (entry.timeBlocks || []).length > (best?.timeBlocks || []).length
      ? entry
      : best;
  }, null);
  const fixedByBlock = new Map();
  (dayProgram?.fixedActivities || []).forEach((f) => {
    fixedByBlock.set(f[FIELD.FixedActivity.TimeBlock], nameOf(f));
  });
  const blocks = (dayProgram?.timeBlocks || [])
    .map((b) => ({
      start: minutesOf(b[FIELD.TimeBlock.StartTime]),
      end: minutesOf(b[FIELD.TimeBlock.EndTime]),
      fixed: fixedByBlock.get(b.Id) || null
    }))
    .filter((b) => b.start != null && b.end != null && b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const fixed = blocks.filter((b) => b.fixed).map((b) => b.fixed);
  const activities = (s.activities || []).map((a) => ({
    id: a.Id,
    name: nameOf(a),
    place: a[FIELD.Activity.Location] || null
  }));
  const actName = new Map(activities.map((a) => [a.id, a.name]));
  const places = (s.locations || [])
    .map((loc) => ({
      name: nameOf(loc),
      acts: activities.filter((a) => a.place === loc.Id).map((a) => a.name)
    }))
    .sort((a, b) => b.acts.length - a.acts.length);
  const noPlace = activities.filter((a) => !a.place).map((a) => a.name);
  const recurring = programs.flatMap((entry) =>
    (entry.recurringActivities || []).map((r) => ({
      name: nameOf(r),
      days: DAYS.map((d) => !!r[FIELD.RecurringActivity[d]])
    }))
  );
  const special = s.special || {};
  const events = [];
  (special.briefs || []).forEach((brief) => {
    (brief.days || []).forEach((day) => {
      const week = weekIndex.get(day.weekId);
      if (week) {
        events.push({ n: week.n, done: !!brief.planned });
      }
    });
  });
  const electives = s.electives || {};
  const linked = new Set(
    (electives.linkedChoices || []).map((l) => l[FIELD.LinkedChoice.Offering])
  );
  const sets = (electives.sets || []).map((set) => ({
    name: nameOf(set),
    offerings: (electives.offerings || [])
      .filter(
        (o) =>
          o[FIELD.Offering.ElectiveSet] === set.Id &&
          !o[FIELD.Offering.Proposed]
      )
      .map((o) => ({
        name: actName.get(o[FIELD.Offering.Activity]) || "",
        linked: linked.has(o.Id)
      }))
      .filter((o) => o.name)
  }));
  const shown = weekIndex.get(tb.shownWeekId) || null;
  const version = tb.latestVersion || null;
  return {
    year: dateParts(s.season && s.season[FIELD.Season.StartDate])?.y || null,
    weeks,
    shownWeek: shown,
    programs: programs.map((entry) => ({
      name: nameOf(entry.program),
      days: DAYS.map((d) => !!(entry.program || {})[FIELD.Program[d]])
    })),
    divisions,
    blocks,
    places: places
      .filter((p) => p.acts.length)
      .concat(places.filter((p) => !p.acts.length)),
    noPlace,
    words: wordsOf(s.labels || []),
    activities,
    fixed,
    recurring,
    events,
    sets,
    generated: tb.generated || null,
    manual: tb.manual || null,
    seats: tb.seats || [],
    versions: {
      latest: version
        ? {
            name: version.name || "",
            week: weekIndex.get(version.weekId)?.name || "",
            when: shortDateTime(version.savedAt),
            published: !!version.published
          }
        : null
    }
  };
}

/** "2026-07-10T16:12:00.000Z" -> "JUL 10". */
function shortDateTime(value) {
  return shortDate(String(value || "").slice(0, 10));
}

// The words Camp words shows first: the camp's own, then these, to four.
const WORD_ORDER = [
  "Group",
  "Division",
  "TimeBlock",
  "Elective",
  "Activity",
  "Location",
  "Week",
  "Program"
];

/** The standard word ("Time block") and the camp's own singular, or null when it has none. */
function wordsOf(labels) {
  const byTerm = new Map(labels.map((row) => [row.term, row]));
  const standard = (term) => {
    const words = term.replace(/([a-z])([A-Z])/g, "$1 $2");
    return words.charAt(0) + words.slice(1).toLowerCase();
  };
  const row = (term) => {
    const label = byTerm.get(term);
    return {
      term,
      std: standard(term),
      mine: label && label.isCustom ? label.singular : null
    };
  };
  const custom = labels
    .filter((l) => l.isCustom)
    .map((l) => l.term)
    .sort((a, b) => order(a) - order(b));
  const terms = [...new Set([...custom, ...WORD_ORDER])].slice(0, 4);
  return terms.map(row);
}

function order(term) {
  const at = WORD_ORDER.indexOf(term);
  return at < 0 ? WORD_ORDER.length : at;
}

// ---------- measuring words ----------

const NARROW = new Set("iljtfrI.,:;'!|".split(""));
const WIDE = new Set("mwMW".split(""));

/**
 * A word's width at 1 px, Inter 500, estimated per letter (the same everywhere, so the same camp
 * lays out the same; a little generous, so a name never runs past its card).
 */
export function nameWidth(text) {
  let w = 0;
  for (const ch of String(text || "")) {
    if (ch === " ") {
      w += 0.28;
    } else if (NARROW.has(ch)) {
      w += 0.3;
    } else if (WIDE.has(ch)) {
      w += 0.86;
    } else if (/[A-Z&]/.test(ch)) {
      w += 0.68;
    } else if (/[0-9]/.test(ch)) {
      w += 0.6;
    } else {
      w += 0.56;
    }
  }
  return w;
}

/** An 11 px label's tile width, as the mock-up sizes them. */
const tw = (s) => Math.round(nameWidth(s) * 11 + 14);

/** Shortens a word to fit a width in px at a font size, with an ellipsis. */
function fit(text, width, size) {
  const s = String(text || "");
  if (nameWidth(s) * size <= width) {
    return s;
  }
  let cut = s;
  while (cut.length > 1 && nameWidth(`${cut}…`) * size > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

// Little words a name is never cut after ("Arts and…" reads as "Arts…").
const JOINERS = new Set([
  "and",
  "&",
  "of",
  "the",
  "a",
  "for",
  "with",
  "+",
  "-"
]);

/**
 * A name as it best fits a width at a size: whole when it fits; else cut after the last whole
 * word that fits, with an ellipsis ("Morning…", never "Morni…"); only a first word too long for
 * the width is cut inside it. Never smaller than the size given: the glimpse's words stay 11 px.
 */
export function shorten(text, width, size = 11) {
  const s = String(text || "").trim();
  if (nameWidth(s) * size <= width) {
    return s;
  }
  const words = s.split(/\s+/);
  for (let k = words.length - 1; k >= 1; k--) {
    const kept = words.slice(0, k);
    while (
      kept.length > 1 &&
      JOINERS.has(kept[kept.length - 1].toLowerCase())
    ) {
      kept.pop();
    }
    const cut = `${kept.join(" ").replace(/[,;:/-]+$/, "")}…`;
    if (nameWidth(cut) * size <= width) {
      return cut;
    }
  }
  return fit(s, width, size);
}

// ---------- drawing ----------

const n1 = (x) => Math.round(x * 10) / 10;

function rect(x, y, w, h, rx, cls) {
  return {
    rect: true,
    x: n1(x),
    y: n1(y),
    w: n1(Math.max(0, w)),
    h: n1(Math.max(0, h)),
    rx,
    cls
  };
}

function txt(x, y, s, cls, anchor, size) {
  return {
    text: true,
    x: n1(x),
    y: n1(y),
    value: String(s),
    cls,
    anchor: anchor || "start",
    style: size ? `font-size:${size.toFixed(1)}px` : null
  };
}

function path(d, cls, transform, style) {
  return { path: true, d, cls, transform: transform || null, style };
}

/** A raised tile, as on the grid: lightest step, fine edge, soft shadow. Open: dashed outline. */
function tile(x, y, w, h, label, opts = {}) {
  const out = [];
  if (opts.open) {
    out.push(rect(x + 0.5, y + 0.5, w - 1, h - 1, 4, "fnone s700 dash"));
  } else {
    out.push(rect(x, y + 1, w, h, 4, "fshade"));
    out.push(rect(x + 0.5, y + 0.5, w - 1, h - 1, 4, "f50 sedge"));
  }
  if (label) {
    const cls = opts.cls || (opts.open ? "g-t2" : "g-t");
    out.push(
      opts.left
        ? txt(x + 7, y + h / 2 + 3.8, label, cls, "start", opts.size)
        : txt(x + w / 2, y + h / 2 + 3.8, label, cls, "middle", opts.size)
    );
  }
  return out;
}

const well = (x, y, w, h, rx = 4) => rect(x, y, w, h, rx, "f300");
const dashed = (x, y, w, h, rx = 4, stroke = "s500") =>
  rect(x + 0.5, y + 0.5, w - 1, h - 1, rx, `fnone ${stroke} dash`);

/** The app's padlock (c-shoresh-lock) at any size. */
function lock(x, y, s) {
  const t = `translate(${n1(x)} ${n1(y)}) scale(${(s / 12).toFixed(3)})`;
  return [
    path(
      "M3.75 5.25h4.5a1.5 1.5 0 0 1 1.5 1.5v2.5a1.5 1.5 0 0 1-1.5 1.5h-4.5a1.5 1.5 0 0 1-1.5-1.5v-2.5a1.5 1.5 0 0 1 1.5-1.5Z",
      "g-lock",
      t
    ),
    path("M4 5.25V3.75a2 2 0 0 1 4 0v1.5", "g-lock", t)
  ];
}

/** A special day or event's flag (special-r1): filled once it is planned, dashed until then. */
function flag(x, y, s, done) {
  const t = `translate(${n1(x)} ${n1(y)}) scale(${(s / 12).toFixed(3)})`;
  const stroke = `stroke-width:${(18 / s).toFixed(3)}px${done ? "" : `;stroke-dasharray:${(9 / s).toFixed(3)} ${(7 / s).toFixed(3)}`}`;
  const out = [];
  if (done) {
    out.push(path("M3 2h6l-1.5 2.25L9 6.5H3Z", "f500 snone", t));
  }
  out.push(path("M3 10.5V1.75", done ? "g-flag" : "g-flag-open", t, stroke));
  out.push(
    path("M3 2h6l-1.5 2.25L9 6.5H3", done ? "g-flag" : "g-flag-open", t, stroke)
  );
  return out;
}

/** A linked choice's link mark. */
function link(x, y) {
  const t = `translate(${n1(x)} ${n1(y)}) scale(0.8)`;
  return [
    path("M5 7 7 5", "g-link", t),
    path("M4.2 5.6 3 6.8a1.7 1.7 0 0 0 2.4 2.4L6.6 8", "g-link", t),
    path("M7.8 6.4 9 5.2a1.7 1.7 0 0 0-2.4-2.4L5.4 4", "g-link", t)
  ];
}

function lockedBar(x, y, w, h, label, size = 11) {
  if (!label) {
    // The padlock alone: a locked row whose name has no room to read whole.
    return [
      rect(x + 0.5, y + 0.5, w - 1, h - 1, 4, "f50 sedge"),
      ...lock(x + w / 2 - size / 2, y + h / 2 - size * 0.55, size)
    ];
  }
  const tw2 = nameWidth(label) * size;
  return [
    rect(x + 0.5, y + 0.5, w - 1, h - 1, 4, "f50 sedge"),
    ...lock(x + w / 2 - tw2 / 2 - size * 0.9, y + h / 2 - size * 0.55, size),
    txt(
      x + w / 2 + size * 0.45,
      y + h / 2 + size * 0.36,
      label,
      size === 11 ? "g-t" : "g-p",
      "middle",
      size === 11 ? null : size
    )
  ];
}

function glimpse(shapes, opts = {}) {
  return {
    w: W,
    h: H,
    align: opts.align || "xMidYMax",
    fade: opts.fade || null,
    shapes: shapes.flat().map((s, i) => ({ ...s, key: `s${i}` }))
  };
}

// ---------- the glimpses, one per card ----------

const weekW = (n) => Math.min(22, W / Math.max(n, 1) - 4);
const weekX = (i, n) =>
  i * (W / Math.max(n, 1)) + (W / Math.max(n, 1) - weekW(n)) / 2;

// Up to this many weeks, every week is a bar. A longer season shows WEEK_WINDOW of them, from just
// before this week (else the first week not built yet), with the whole season as a line beneath.
export const MAX_WEEK_BARS = 12;
export const WEEK_WINDOW = 8;

/** The weeks a card draws as bars: { from, to, whole }. */
export function weekWindow(weeks) {
  const n = weeks.length;
  if (n <= MAX_WEEK_BARS) {
    return { from: 0, to: n, whole: true };
  }
  let anchor = weeks.findIndex((w) => w.now);
  if (anchor < 0) {
    anchor = weeks.findIndex((w) => !w.built);
  }
  if (anchor < 0) {
    anchor = n - 1;
  }
  const from = Math.max(0, Math.min(anchor - 2, n - WEEK_WINDOW));
  return { from, to: from + WEEK_WINDOW, whole: false };
}

/** The whole season as a line, the weeks drawn above it marked on it, this week in the highlight. */
function seasonLine(c, win, x0, x1, y) {
  const n = c.weeks.length;
  const k = (x1 - x0) / n;
  const out = [
    rect(x0, y, x1 - x0, 3, 1.5, "f400"),
    rect(x0 + win.from * k, y - 1.5, WEEK_WINDOW * k, 6, 3, "f500")
  ];
  const now = c.weeks.findIndex((w) => w.now);
  if (now >= 0) {
    out.push(rect(x0 + now * k, y - 1.5, Math.max(3, k), 6, 3, "fhl"));
  }
  return out;
}

function weekBars(c, top, h, numbers, win = weekWindow(c.weeks)) {
  const list = c.weeks.slice(win.from, win.to);
  const n = Math.max(list.length, 1);
  const out = [];
  if (!list.length) {
    for (let i = 0; i < 8; i++) {
      out.push(dashed(weekX(i, 8), top, weekW(8), h, 5));
    }
    return out;
  }
  list.forEach((wk, i) => {
    const x = weekX(i, n);
    const bw = weekW(n);
    if (wk.now) {
      out.push(rect(x, top, bw, h, 5, "fhl"));
    } else if (wk.built) {
      out.push(rect(x, top, bw, h, 5, "f500"));
    } else {
      out.push(dashed(x, top, bw, h, 5));
    }
    const label = numbers(i, wk, n);
    if (label) {
      out.push(label);
    }
  });
  return out;
}

const G = {
  weeks(c) {
    // A long season: its window of weeks, numbered, over the line of the whole season.
    const win = weekWindow(c.weeks);
    const top = win.whole ? 30 : 24;
    const shapes = weekBars(
      c,
      top,
      win.whole ? 66 : 54,
      (i, wk, n) =>
        txt(
          weekX(i, n) + weekW(n) / 2,
          win.whole ? 114 : 94,
          String(wk.n),
          wk.now ? "g-mb" : "g-m",
          "middle"
        ),
      win
    );
    if (c.weeks.length) {
      const last = Math.min(win.to, c.weeks.length) - 1;
      shapes.push(txt(0, 14, shortDate(c.weeks[win.from].start), "g-m"));
      shapes.push(txt(W, 14, shortDate(c.weeks[last].end), "g-m", "end"));
    }
    if (!win.whole) {
      const end = String(c.weeks.length);
      shapes.push(seasonLine(c, win, 14, W - nameWidth(end) * 11 - 6, 110));
      shapes.push(txt(0, 115, "1", "g-m"));
      shapes.push(txt(W, 115, end, "g-m", "end"));
    }
    return glimpse(shapes);
  },

  programs(c) {
    // Each program across its week, the days it runs raised, the others an outline.
    const list = c.programs.slice(0, 3);
    const lane = list.length > 2 ? 40 : 52;
    const dw = (W - 4 * 4) / 5;
    const shapes = [];
    if (!list.length) {
      DAY_LETTERS.forEach((d, i) =>
        shapes.push(dashed(i * (dw + 4), 40, dw, 26))
      );
      return glimpse(shapes);
    }
    list.forEach((p, r) => {
      const y = 4 + r * lane;
      shapes.push(txt(0, y + 10, shorten(p.name, W, 11), "g-tb"));
      p.days.forEach((on, i) => {
        const x = i * (dw + 4);
        shapes.push(
          on
            ? tile(x, y + 16, dw, lane - 26, DAY_LETTERS[i], { cls: "g-m" })
            : dashed(x, y + 16, dw, lane - 26, 4, "s400")
        );
      });
    });
    return glimpse(shapes, { align: "xMidYMid" });
  },

  divisions(c) {
    // Each program's divisions as tiles, in their order.
    const shapes = [];
    if (!c.divisions.length) {
      for (let i = 0; i < 3; i++) shapes.push(dashed(i * 72, 50, 66, 24));
      return glimpse(shapes);
    }
    const byProgram = [];
    c.divisions.forEach((d) => {
      let lane = byProgram.find((l) => l.name === d.program);
      if (!lane) {
        lane = { name: d.program, list: [] };
        byProgram.push(lane);
      }
      lane.list.push(d.name);
    });
    let y = 2;
    const named = byProgram.length > 1;
    byProgram.forEach((lane) => {
      if (y > H - 24) return;
      if (named) {
        shapes.push(txt(0, y + 10, shorten(lane.name, W, 11), "g-t2"));
        y += 16;
      }
      let x = 0;
      lane.list.forEach((name) => {
        const w = Math.min(W, tw(name));
        if (x > 0 && x + w > W) {
          x = 0;
          y += 28;
        }
        if (y + 22 <= H)
          shapes.push(tile(x, y, w, 22, shorten(name, w - 10, 11)));
        x += w + 5;
      });
      y += 32;
    });
    return glimpse(shapes, { align: "xMidYMin", fade: "bottom" });
  },

  groups(c) {
    // Each division's groups, one tile a group.
    const shapes = [];
    const rows = c.divisions.slice(0, 6);
    if (!rows.length) {
      for (let k = 0; k < 5; k++) shapes.push(dashed(92 + k * 21, 50, 17, 15));
      return glimpse(shapes);
    }
    rows.forEach((d, i) => {
      const y = 2 + i * 20;
      shapes.push(txt(0, y + 11.5, shorten(d.name, 84, 11), "g-t2"));
      const count = Math.min(d.groups.length, 6);
      if (!count) shapes.push(dashed(92, y, 17, 15));
      for (let k = 0; k < count; k++)
        shapes.push(tile(92 + k * 21, y, 17, 15, ""));
    });
    return glimpse(shapes, { fade: "right" });
  },

  timeBlocks(c) {
    const shapes = [];
    if (!c.blocks.length) {
      for (let i = 0; i < 6; i++) shapes.push(dashed(i * 37, 28, 33, 68));
      return glimpse(shapes);
    }
    const t0 = c.blocks[0].start;
    const t1 = c.blocks[c.blocks.length - 1].end;
    const k = W / Math.max(1, t1 - t0);
    c.blocks.forEach((b) => {
      const x = (b.start - t0) * k;
      const w = Math.max(3, (b.end - b.start) * k);
      if (b.fixed) {
        shapes.push(rect(x + 0.5, 28.5, w - 1, 67, 4, "f300 sedge"));
        if (w >= 14) shapes.push(...lock(x + w / 2 - 6, 56, 12));
      } else {
        shapes.push(tile(x, 28, w, 68, ""));
      }
    });
    shapes.push(txt(0, 114, clockOf(t0), "g-m"));
    if (c.blocks.length > 2) {
      const mid = c.blocks[Math.floor(c.blocks.length / 2)].start;
      shapes.push(txt((mid - t0) * k, 114, clockOf(mid), "g-m", "middle"));
    }
    shapes.push(txt(W, 114, clockOf(t1), "g-m", "end"));
    return glimpse(shapes);
  },

  locations(c) {
    // Each place and what is held there; then what still waits for a place.
    const rows = c.places
      .slice(0, c.noPlace.length ? 4 : 5)
      .map((p) => [p.name, p.acts]);
    if (c.noPlace.length) rows.push([null, c.noPlace.slice(0, 3)]);
    const shapes = [];
    if (!rows.length) {
      for (let r = 0; r < 3; r++) shapes.push(dashed(0, 20 + r * 30, 70, 20));
      return glimpse(shapes, { align: "xMidYMid" });
    }
    // The places' column is as wide as their names need, up to half the card.
    const pw = Math.round(
      Math.min(
        110,
        Math.max(70, ...rows.map(([p]) => (p ? nameWidth(p) * 11 + 14 : 0)))
      )
    );
    rows.forEach(([p, acts], r) => {
      const y = 4 + r * 24.5;
      if (p)
        shapes.push(
          tile(0, y, pw, 20, shorten(p, pw - 12, 11), {
            left: true,
            cls: "g-tb"
          })
        );
      else shapes.push(rect(0.5, y + 0.5, pw - 1, 19, 4, "fnone s700 dash"));
      let x = pw + 8;
      acts.forEach((a) => {
        const w = tw(a) - 2;
        if (p) {
          shapes.push(well(x, y + 2, w, 16, 3));
          shapes.push(txt(x + w / 2, y + 13.6, a, "g-t2", "middle"));
        } else {
          shapes.push(tile(x, y, w + 4, 20, a));
        }
        x += w + 6;
      });
    });
    return glimpse(shapes, { align: "xMidYMid", fade: "right" });
  },

  campWords(c) {
    // The standard word, then the camp's own, as Camp words shows them.
    const shapes = [];
    c.words.forEach((row, r) => {
      const y = 6 + r * 30;
      shapes.push(txt(0, y + 15, row.std, "g-t2"));
      if (row.mine) {
        shapes.push(well(92, y, 128, 22));
        shapes.push(txt(100, y + 15, shorten(row.mine, 112, 11), "g-tb"));
      } else {
        shapes.push(dashed(92, y, 128, 22, 4));
        shapes.push(txt(100, y + 15, row.std, "g-t2"));
      }
    });
    return glimpse(shapes, { align: "xMidYMid" });
  },

  activities(c) {
    // The activities as tiles; one with no place, dashed.
    const shapes = [];
    if (!c.activities.length) {
      for (let i = 0; i < 4; i++) shapes.push(dashed(i * 56, 50, 50, 22));
      return glimpse(shapes);
    }
    let x = 0;
    let row = 0;
    c.activities.forEach((a) => {
      const w = tw(a.name);
      if (x > 0 && x + w > 300) {
        row++;
        x = 0;
      }
      if (row < 4)
        shapes.push(tile(x, 10 + row * 28, w, 22, a.name, { open: !a.place }));
      x += w + 5;
    });
    return glimpse(shapes, { fade: "right" });
  },

  fixedActivities(c) {
    const names = c.fixed.slice(0, 3);
    const shapes = [];
    const cells = (y) => [0, 1, 2, 3].map((i) => well(i * 56, y, 52, 13));
    if (!names.length) {
      return glimpse([
        cells(4),
        dashed(0, 21, W, 20),
        cells(45),
        dashed(0, 62, W, 20),
        cells(86)
      ]);
    }
    names.forEach((n, i) => {
      shapes.push(cells(4 + i * 41));
      shapes.push(lockedBar(0, 21 + i * 41, W, 20, shorten(n, W - 40, 11)));
    });
    if (names.length < 3) shapes.push(cells(4 + names.length * 41));
    return glimpse(shapes, { align: "xMidYMin" });
  },

  recurringActivities(c) {
    const shapes = [];
    DAY_LETTERS.forEach((d, i) =>
      shapes.push(txt(i * 45 + 20, 22, d, "g-m", "middle"))
    );
    const rows = c.recurring.slice(0, 3);
    const rh = rows.length > 2 ? 26 : 36;
    if (!rows.length) {
      DAY_LETTERS.forEach((d, i) => shapes.push(dashed(i * 45, 34, 41, 36)));
      return glimpse(shapes);
    }
    if (rows.every((r) => nameWidth(r.name) * 11 <= 35)) {
      rows.forEach((r, ri) => {
        r.days.forEach((on, i) => {
          const x = i * 45;
          const y = 34 + ri * (rh + 8);
          shapes.push(on ? tile(x, y, 41, rh, r.name) : well(x, y, 41, rh));
        });
      });
      return glimpse(shapes);
    }
    // A name too long for a day's tile ("Morning meeting") heads its row instead.
    const unit = (H - 28) / rows.length;
    rows.forEach((r, ri) => {
      const y = 28 + ri * unit;
      shapes.push(txt(0, y + 10, shorten(r.name, W, 11), "g-t2"));
      r.days.forEach((on, i) => {
        const x = i * 45;
        shapes.push(
          on
            ? tile(x, y + 14, 41, unit - 18, "")
            : well(x, y + 14, 41, unit - 18)
        );
      });
    });
    return glimpse(shapes);
  },

  specialEvents(c) {
    const shapes = [];
    const n = Math.max(c.weeks.length, 1);
    c.weeks.forEach((wk, i) => {
      shapes.push(
        rect(weekX(i, n), 98, weekW(n), 3, 1.5, wk.now ? "fhl" : "f400")
      );
      if (n <= 12 || i === 0 || i === n - 1) {
        shapes.push(
          txt(
            weekX(i, n) + weekW(n) / 2,
            116,
            String(wk.n),
            wk.now ? "g-mb" : "g-m",
            "middle"
          )
        );
      }
    });
    if (!c.events.length) {
      shapes.push(...flag(W / 2 - 14, 46, 40, false));
    }
    shapes.push(flags(c, n, 92, 16, 40));
    return glimpse(shapes);
  },

  electives(c) {
    const shapes = [];
    const sets = c.sets.slice(0, 2);
    if (!sets.length) {
      for (let i = 0; i < 3; i++) shapes.push(dashed(i * 62, 50, 56, 24));
      return glimpse(shapes);
    }
    sets.forEach((set, r) => {
      const y = r * 56;
      shapes.push(txt(0, y + 26, shorten(set.name, W, 11), "g-t2"));
      let x = 0;
      set.offerings.forEach((o) => {
        const w = tw(o.name) + (o.linked ? 12 : 0);
        if (x + w > W + 40) return;
        shapes.push(
          tile(x, y + 34, w, 24, o.name, o.linked ? { left: true } : {})
        );
        if (o.linked) shapes.push(...link(x + w - 15, y + 40));
        x += w + 5;
      });
      if (!set.offerings.length) shapes.push(dashed(0, y + 34, 56, 24));
    });
    return glimpse(shapes, { fade: "right" });
  },

  generatedSchedule(c) {
    return glimpse(gridGlimpse(c.generated, 6, 5, false));
  },

  manualBuild(c) {
    return glimpse(gridGlimpse(c.manual, 3, 4, true));
  },

  electiveSeats(c) {
    const shapes = [];
    const rows = c.seats.slice(0, 4);
    if (!rows.length) {
      for (let s = 0; s < 10; s++)
        shapes.push(dashed(68 + s * 15.2, 40, 12.7, 14, 2.5, "s400"));
      return glimpse(shapes);
    }
    rows.forEach((seat, r) => {
      const y = 10 + r * 29;
      shapes.push(txt(0, y + 12, shorten(seat.name, 62, 11), "g-t2"));
      shapes.push(...seatBoxes(seat, 68, y + 2, W - 68, 14));
    });
    return glimpse(shapes);
  },

  schedules(c) {
    const v = c.versions.latest;
    const sheet = (x, y, open) => {
      return open
        ? [dashed(x, y, 176, 82, 6)]
        : [
            rect(x, y + 1, 176, 82, 6, "fshade"),
            rect(x + 0.5, y + 0.5, 175, 81, 6, "f50 sedge")
          ];
    };
    if (!v) {
      return glimpse([
        sheet(36, 6, true),
        sheet(18, 20, true),
        sheet(0, 34, true)
      ]);
    }
    const shapes = [sheet(36, 6), sheet(18, 20), sheet(0, 34)];
    shapes.push(
      txt(
        12,
        56,
        shorten(v.week ? `${v.week} · ${v.name}` : v.name, 132, 11),
        "g-t"
      )
    );
    shapes.push(txt(12, 74, v.when, "g-m"));
    for (let i = 0; i < 6; i++) shapes.push(well(12 + i * 26, 88, 22, 16, 3));
    if (v.published) shapes.push(path("m154 49.5 3 3 6-7", "g-check"));
    return glimpse(shapes);
  }
};

/**
 * A flag over each week with a special day or event, filled once all there are planned. On a long
 * season the flags keep a size that reads; weeks too close for a flag each share one, which is
 * dashed while any of them is unplanned.
 */
function flags(c, n, base, least, most) {
  const byWeek = new Map();
  c.events.forEach((e) => byWeek.set(e.n, (byWeek.get(e.n) ?? true) && e.done));
  const s = Math.max(least, Math.min(most, weekW(n) * 1.9));
  const placed = [];
  [...byWeek]
    .sort((a, b) => a[0] - b[0])
    .forEach(([wn, done]) => {
      const x = weekX(wn - 1, n) + weekW(n) / 2 - s * 0.25;
      const prev = placed[placed.length - 1];
      if (prev && x - prev.x < s * 0.62) {
        prev.done = prev.done && done;
      } else {
        placed.push({ x, done });
      }
    });
  return placed.flatMap((p) => flag(p.x, base - s, s, p.done));
}

/**
 * Seats as a row of boxes: taken filled, the rest of the minimum dashed, free seats an outline.
 * Campers past the limit are more boxes in the caution colour, never hidden in a full row; an
 * offering with no limit is its taken boxes and an open end (∞), never a count of empty seats.
 */
function seatBoxes(seat, x0, y, width, h, size = 11, cls = "g-m") {
  const out = [];
  const count = seat.taken || 0;
  const px = size === 11 ? null : size;
  if (seat.seats == null) {
    // No limit: a box a camper, then the open end. More campers than the row holds show their
    // number before the open end, so the row never looks like a limit.
    const w = width / 12;
    const taken = count > 10 ? 8 : count;
    for (let s = 0; s < taken; s++)
      out.push(rect(x0 + s * w, y, w - 2.5, h, 2.5, "f500"));
    let x = x0 + taken * w + 1;
    if (count > 10) {
      out.push(txt(x + 2, y + h - 3, String(count), cls, "start", px));
      x += String(count).length * 0.64 * size + size * 0.45;
    }
    out.push(txt(x, y + h - 3, "\u221e", cls, "start", px));
    return out;
  }
  const limit = seat.seats;
  const all = Math.max(limit, count);
  const boxes = Math.max(1, Math.min(all, 20));
  const scale = boxes / Math.max(all, 1);
  let taken = Math.round(count * scale);
  let cap = Math.round(limit * scale);
  if (count > limit) {
    // Past the limit always shows, however small a share of the seats it is.
    cap = Math.min(cap, boxes - 1);
    taken = boxes;
  } else if (count > 0) {
    // Someone seated is never an empty row, and a row not yet full never looks full.
    taken = Math.max(1, count < limit ? Math.min(taken, cap - 1) : taken);
  }
  const min = seat.minimum ? Math.round(seat.minimum * scale) : 0;
  // A few seats are boxes of a seat's size, not stretched across the row.
  const w = Math.min(width / boxes, 15.2);
  for (let s = 0; s < boxes; s++) {
    const x = x0 + s * w;
    if (s < taken)
      out.push(rect(x, y, w - 2.5, h, 2.5, s < cap ? "f500" : "fcaution"));
    else if (s < min)
      out.push(rect(x + 0.5, y + 0.5, w - 3.5, h - 1, 2.5, "fnone s700 dash"));
    else out.push(rect(x + 0.5, y + 0.5, w - 3.5, h - 1, 2.5, "fnone s400"));
  }
  return out;
}

// Manual Build's named grid: the times' column, then the groups across the rest.
const NAMED_X = 40;
const NAMED_SPAN = W - 1 - NAMED_X;
const CELL_LOCK = 10;

/**
 * How many groups Manual Build's face shows across (up to max): fewer, wider columns when that
 * cuts fewer names, so "Woodworking & Carpentry" reads whole rather than as "Woodwo…"; down to
 * one group's day when only that reads.
 */
export function namedColumns(groups, rows, max) {
  const n = Math.min(max, groups.length);
  if (n <= 1) {
    return 1;
  }
  let best = n;
  let fewest = Infinity;
  for (let k = n; k >= 1; k--) {
    const cw = (NAMED_SPAN - (k - 1) * 4) / k;
    let cuts = groups
      .slice(0, k)
      .filter((g) => nameWidth(g) * 11 > cw - 2).length;
    rows
      .filter((row) => !row.fixed)
      .forEach((row) => {
        (row.cells || []).slice(0, k).forEach((cell) => {
          const room = cw - 8 - (cell.locked ? CELL_LOCK : 0);
          if (cell.name && nameWidth(cell.name) * 11 > room) cuts++;
        });
      });
    if (cuts < fewest) {
      best = k;
      fewest = cuts;
    }
  }
  return best;
}

/**
 * A day of a draft: tiles where something is placed, the empty cells wells, a fixed activity's
 * block one locked bar across; locks where the director locked a cell. With names (Manual Build):
 * the first groups across with their times and what each has.
 */
function gridGlimpse(grid, cols, rows, named) {
  const shapes = [];
  if (!grid || !(grid.rows || []).length) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        shapes.push(
          named
            ? dashed(40 + c * 61, 24 + r * 26, 57, 21)
            : dashed(c * 37.4, 4 + r * 24, 33, 19)
        );
      }
    }
    return shapes;
  }
  const list = grid.rows.slice(0, rows);
  if (named) {
    // The groups across, as many as their names and what they have fit (fewer columns before
    // any name is cut); the padlock in a cell's corner, clear of its name.
    const k = namedColumns(grid.groups || [], list, cols);
    const cw = (NAMED_SPAN - (k - 1) * 4) / k;
    const cx = (i) => NAMED_X + i * (cw + 4);
    (grid.groups || []).slice(0, k).forEach((g, i) => {
      shapes.push(
        txt(cx(i) + cw / 2, 14, shorten(g, cw - 2, 11), "g-t2", "middle")
      );
    });
    list.forEach((row, r) => {
      const y = 24 + r * 26;
      shapes.push(txt(0, y + 15, clockOf(minutesOf(row.startTime)), "g-m"));
      if (row.fixed) {
        shapes.push(
          lockedBar(NAMED_X, y, NAMED_SPAN, 21, shorten(row.fixed, 140, 11))
        );
        return;
      }
      (row.cells || []).slice(0, k).forEach((cell, i) => {
        const room = cw - 8 - (cell.locked ? CELL_LOCK : 0);
        if (cell.name) {
          shapes.push(tile(cx(i), y, cw, 21, ""));
          shapes.push(
            txt(
              cx(i) + room / 2 + 4,
              y + 14.3,
              shorten(cell.name, room, 11),
              "g-t",
              "middle"
            )
          );
        } else {
          shapes.push(well(cx(i), y, cw, 21));
        }
        if (cell.locked) shapes.push(...lock(cx(i) + cw - 11, y + 21 - 11, 9));
      });
    });
    return shapes;
  }
  const groupCount = Math.min(cols, (grid.groups || []).length);
  // One or two groups are columns of a cell's size, not stretched across the card.
  const cw = Math.min(
    48,
    (W - (groupCount - 1) * 4.4) / Math.max(groupCount, 1)
  );
  list.forEach((row, r) => {
    const y = 4 + r * 24;
    if (row.fixed) {
      shapes.push(rect(0.5, y + 0.5, W - 1, 18, 4, "f300 sedge"));
      shapes.push(...lock(W / 2 - 6, y + 3, 12));
      return;
    }
    (row.cells || []).slice(0, groupCount).forEach((cell, c) => {
      const x = c * (cw + 4.4);
      shapes.push(cell.name ? tile(x, y, cw, 19, "") : well(x, y, cw, 19));
      if (cell.locked) shapes.push(...lock(x + cw - 12, y + 7, 9));
    });
  });
  return shapes;
}

// ---------- the picture-only glimpses ----------
// A shrunk card can't carry 11 px words, so it shows a simpler picture of the same data with only
// its one or two key words, at f px in the glimpse's own units (11.5 px or more on screen).

const ptx = (x, y, s, cls, f, anchor) => txt(x, y, s, cls, anchor, f);

const PIC = {
  weeks(c, f) {
    const yb = H - 2;
    const win = weekWindow(c.weeks);
    const top = 4;
    const line = win.whole ? 0 : 12;
    const h = yb - f - 6 - top - line;
    const shapes = weekBars(
      c,
      top,
      h,
      (i, wk, n) => {
        return i === 0 || i === n - 1 || wk.now
          ? ptx(
              weekX(i, n) + weekW(n) / 2,
              yb,
              String(wk.n),
              wk.now ? "g-pmb" : "g-pm",
              f,
              "middle"
            )
          : null;
      },
      win
    );
    if (!win.whole) {
      shapes.push(seasonLine(c, win, 0, W, top + h + 5));
    }
    return glimpse(shapes);
  },

  programs(c, f) {
    const list = c.programs.slice(0, 2);
    const shapes = [];
    // One program takes the card's height; two share it.
    const lane = (H - 4) / Math.max(list.length, 1);
    const bh = Math.max(12, Math.min(lane - f * 1.6, f * 2.4));
    if (!list.length) return glimpse([dashed(0, H / 2 - 8, W, 16)]);
    list.forEach((p, r) => {
      const y = r * lane + 2;
      shapes.push(ptx(0, y + f * 0.9, shorten(p.name, W, f), "g-p", f));
      const dw = (W - 16) / 5;
      p.days.forEach((on, i) => {
        shapes.push(
          on
            ? tile(i * (dw + 4), y + f * 1.15, dw, bh, "")
            : dashed(i * (dw + 4), y + f * 1.15, dw, bh, 4, "s400")
        );
      });
    });
    return glimpse(shapes);
  },

  divisions(c, f) {
    const list = c.divisions.slice(0, 4);
    const rh = f * 1.6;
    const gap = Math.max(4, (H - list.length * rh) / Math.max(list.length, 1));
    if (!list.length)
      return glimpse([dashed(0, H / 2 - rh / 2, W * 0.6, rh)], {
        align: "xMidYMid"
      });
    const shapes = [];
    list.forEach((d, r) => {
      const y = gap / 2 + r * (rh + gap);
      if (y + rh > H) return;
      const w = Math.min(W, nameWidth(d.name) * f + f * 1.2);
      shapes.push(tile(0, y, w, rh, ""));
      shapes.push(
        ptx(f * 0.6, y + rh / 2 + f * 0.36, shorten(d.name, W - f, f), "g-p", f)
      );
    });
    return glimpse(shapes, { align: "xMidYMid" });
  },

  groups(c, f) {
    const list = c.divisions.slice(0, 6);
    const n = Math.max(list.length, 1);
    const step = (H - 4) / n;
    const sz = Math.min(17, step - 4);
    const shapes = [];
    list.forEach((d, i) => {
      for (let k = 0; k < Math.min(d.groups.length, 7); k++)
        shapes.push(tile(k * (sz + 4), 2 + i * step, sz, sz, ""));
    });
    const total = c.divisions.reduce((sum, d) => sum + d.groups.length, 0);
    if (total)
      shapes.push(ptx(W, H - 4, String(total), "g-p", f * 1.25, "end"));
    else shapes.push(dashed(0, H / 2 - 9, 17, 17));
    return glimpse(shapes);
  },

  timeBlocks(c, f) {
    const yb = H - 2;
    const h = yb - f - 8;
    const shapes = [];
    if (!c.blocks.length) return glimpse([dashed(0, 2, W, h)]);
    const t0 = c.blocks[0].start;
    const t1 = c.blocks[c.blocks.length - 1].end;
    const k = W / Math.max(1, t1 - t0);
    c.blocks.forEach((b) => {
      const x = (b.start - t0) * k;
      const w = Math.max(3, (b.end - b.start) * k);
      if (b.fixed) {
        shapes.push(rect(x + 0.5, 2.5, w - 1, h - 1, 4, "f300 sedge"));
        if (w >= 16) shapes.push(...lock(x + w / 2 - 7, h / 2 - 5, 14));
      } else {
        shapes.push(tile(x, 2, w, h, ""));
      }
    });
    shapes.push(ptx(0, yb, clockOf(t0), "g-pm", f));
    shapes.push(ptx(W, yb, clockOf(t1), "g-pm", f, "end"));
    return glimpse(shapes);
  },

  locations(c, f) {
    const rows = c.places
      .slice(0, c.noPlace.length ? 2 : 3)
      .map((p) => [p.name, Math.min(p.acts.length, 3)]);
    if (c.noPlace.length) rows.push([null, 1]);
    const rh = f * 1.6;
    const gap = Math.max(4, (H - rows.length * rh) / Math.max(rows.length, 1));
    const shapes = [];
    rows.forEach(([p, k], r) => {
      const y = gap / 2 + r * (rh + gap);
      const pw = Math.min(W * 0.62, nameWidth(p || "Lake") * f + 16);
      if (p) {
        shapes.push(tile(0, y, pw, rh, ""));
        shapes.push(
          ptx(8, y + rh / 2 + f * 0.36, shorten(p, pw - 12, f), "g-p", f)
        );
      } else {
        shapes.push(rect(0.5, y + 0.5, pw - 1, rh - 1, 4, "fnone s700 dash"));
      }
      for (let i = 0; i < k; i++) {
        shapes.push(
          p
            ? well(pw + 8 + i * 30, y + 3, 26, rh - 6, 3)
            : tile(pw + 8, y, 44, rh, "")
        );
      }
    });
    if (!rows.length) shapes.push(dashed(0, H / 2 - rh / 2, W * 0.4, rh));
    return glimpse(shapes, { align: "xMidYMid", fade: "right" });
  },

  campWords(c, f) {
    const rh = f * 1.55;
    const rows = c.words.slice(0, Math.min(4, Math.floor((H + 8) / (rh + 8))));
    const shapes = [];
    const wx = Math.max(nameWidth("Time block") * f + 10, 92);
    rows.forEach((row, r) => {
      const y = (H - rows.length * (rh + 8) + 8) / 2 + r * (rh + 8);
      shapes.push(ptx(0, y + rh / 2 + f * 0.36, row.std, "g-p2", f));
      if (row.mine) {
        shapes.push(rect(wx, y, W - wx, rh, 4, "f300"));
        shapes.push(
          ptx(
            wx + 8,
            y + rh / 2 + f * 0.36,
            shorten(row.mine, W - wx - 12, f),
            "g-p",
            f
          )
        );
      } else {
        shapes.push(dashed(wx, y, W - wx, rh, 4));
        shapes.push(ptx(wx + 8, y + rh / 2 + f * 0.36, row.std, "g-p2", f));
      }
    });
    return glimpse(shapes, { align: "xMidYMid" });
  },

  activities(c, f) {
    const rh = f * 1.6;
    const shapes = [];
    let x = 0;
    let y = 4;
    c.activities.forEach((a) => {
      const w = nameWidth(a.name) * f + f * 1.1;
      if (x > 0 && x + w > W + 30) {
        x = 0;
        y += rh + Math.max(6, f * 0.45);
      }
      if (y + rh <= H) {
        shapes.push(tile(x, y, w, rh, "", { open: !a.place }));
        shapes.push(
          ptx(
            x + w / 2,
            y + rh / 2 + f * 0.36,
            a.name,
            a.place ? "g-p" : "g-p2",
            f,
            "middle"
          )
        );
      }
      x += w + 6;
    });
    if (!c.activities.length) shapes.push(dashed(0, 4, W * 0.4, rh));
    return glimpse(shapes, { align: "xMidYMin", fade: "right" });
  },

  fixedActivities(c, f) {
    const bh = f * 1.6;
    const names = c.fixed.slice(0, 2);
    const gap =
      (H - Math.max(names.length, 1) * bh) / Math.max(names.length, 1);
    const shapes = [];
    if (!names.length) return glimpse([dashed(0, H / 2 - bh / 2, W, bh)]);
    names.forEach((n, i) => {
      const y = gap / 2 + i * (bh + gap);
      shapes.push(well(0, y - gap / 2 + 2, W, gap - 4));
      // A fixed thing always looks fixed: the padlock stays, and the name is shortened instead.
      shapes.push(lockedBar(0, y, W, bh, shorten(n, W - f * 3, f), f));
    });
    return glimpse(shapes);
  },

  recurringActivities(c, f) {
    const top = f + 8;
    const rows = c.recurring.slice(0, 2);
    const rh = (H - top - 6) / 2;
    const shapes = DAY_LETTERS.map((d, i) =>
      ptx(i * 45 + 20, f, d, "g-pm", f, "middle")
    );
    if (!rows.length) {
      DAY_LETTERS.forEach((d, i) => shapes.push(dashed(i * 45, top, 41, rh)));
    }
    rows.forEach((r, ri) => {
      r.days.forEach((on, i) => {
        const x = i * 45;
        const y = top + ri * (rh + 6);
        shapes.push(on ? tile(x, y, 41, rh, "") : well(x, y, 41, rh));
      });
    });
    return glimpse(shapes);
  },

  specialEvents(c, f) {
    const yb = H - 2;
    const line = yb - f - 8;
    const n = Math.max(c.weeks.length, 1);
    const shapes = [];
    c.weeks.forEach((wk, i) => {
      shapes.push(
        rect(weekX(i, n), line, weekW(n), 3, 1.5, wk.now ? "fhl" : "f400")
      );
      if (i === 0 || i === n - 1)
        shapes.push(
          ptx(weekX(i, n) + weekW(n) / 2, yb, String(wk.n), "g-pm", f, "middle")
        );
    });
    const s = Math.min(40, line - 6);
    if (!c.events.length)
      shapes.push(...flag(W / 2 - s / 4, line - s - 2, s, false));
    shapes.push(flags(c, n, line - 2, 22, s));
    return glimpse(shapes);
  },

  electives(c, f) {
    const bh = Math.max(14, f * 0.9);
    const lane = (H - 4) / 2;
    const shapes = [];
    const sets = c.sets.slice(0, 2);
    if (!sets.length) return glimpse([dashed(0, H / 2 - bh / 2, W * 0.45, bh)]);
    sets.forEach((set, r) => {
      const y = r * lane + 2;
      const k = Math.max(1, Math.min(set.offerings.length, 4));
      const w = (W - 15) / 4;
      shapes.push(ptx(0, y + f * 0.9, shorten(set.name, W, f), "g-p", f));
      for (let i = 0; i < k; i++) {
        shapes.push(
          set.offerings.length
            ? tile(i * (w + 5), y + f * 1.15, w, bh, "")
            : dashed(i * (w + 5), y + f * 1.15, w, bh)
        );
      }
    });
    return glimpse(shapes);
  },

  generatedSchedule(c) {
    const grid = c.generated;
    const shapes = [];
    const rows = (grid?.rows || []).slice(0, 5);
    const rh = (H - 4 - 4 * 5) / 5;
    const cols = Math.min(6, (grid?.groups || []).length) || 6;
    const cw = Math.min(48, (W - (cols - 1) * 4.4) / cols);
    if (!rows.length) {
      for (let r = 0; r < 5; r++)
        for (let k = 0; k < 6; k++)
          shapes.push(dashed(k * 37.4, 2 + r * (rh + 5), 33, rh));
      return glimpse(shapes);
    }
    rows.forEach((row, r) => {
      const y = 2 + r * (rh + 5);
      if (row.fixed) {
        shapes.push(rect(0.5, y + 0.5, W - 1, rh - 1, 4, "f300 sedge"));
        shapes.push(...lock(W / 2 - 7, y + rh / 2 - 7, 14));
        return;
      }
      (row.cells || []).slice(0, cols).forEach((cell, k) => {
        const x = k * (cw + 4.4);
        shapes.push(cell.name ? tile(x, y, cw, rh, "") : well(x, y, cw, rh));
        if (cell.locked)
          shapes.push(...lock(x + cw / 2 - 6, y + rh / 2 - 6, 12));
      });
    });
    return glimpse(shapes);
  },

  manualBuild(c, f) {
    const grid = c.manual;
    const bh = f * 1.6;
    const shapes = [];
    const rows = (grid?.rows || []).slice(0, 4);
    if (!rows.length) {
      const rh = (H - 3 * 6) / 4;
      for (let r = 0; r < 4; r++)
        for (let k = 0; k < 3; k++)
          shapes.push(dashed(k * 74, r * (rh + 6), 68, rh));
      return glimpse(shapes);
    }
    const fixedRows = rows.filter((r) => r.fixed).length;
    const rh = Math.min(
      30,
      (H - fixedRows * bh - (rows.length - 1) * 6) /
        Math.max(rows.length - fixedRows, 1)
    );
    let y = 0;
    rows.forEach((row) => {
      if (row.fixed) {
        shapes.push(
          lockedBar(
            0,
            y,
            W,
            bh,
            nameWidth(row.fixed) * f <= W - f * 3 ? row.fixed : "",
            f
          )
        );
        y += bh + 6;
        return;
      }
      (row.cells || []).slice(0, 3).forEach((cell, i) => {
        shapes.push(
          cell.name ? tile(i * 74, y, 68, rh, "") : well(i * 74, y, 68, rh)
        );
      });
      y += rh + 6;
    });
    return glimpse(shapes);
  },

  electiveSeats(c, f) {
    const lane = (H - 4) / 2;
    const bh = Math.max(12, f * 0.8);
    const shapes = [];
    const rows = c.seats.slice(0, 2);
    if (!rows.length)
      return glimpse([dashed(0, H / 2 - bh / 2, W, bh, 2.5, "s400")]);
    rows.forEach((seat, r) => {
      const y = r * lane + 2;
      shapes.push(ptx(0, y + f * 0.9, shorten(seat.name, W, f), "g-p", f));
      shapes.push(...seatBoxes(seat, 0, y + f * 1.15, W, bh, f, "g-pm"));
    });
    return glimpse(shapes);
  },

  schedules(c, f) {
    const v = c.versions.latest;
    const sheet = (x, y) => {
      return v
        ? [
            rect(x, y + 1, 176, 82, 6, "fshade"),
            rect(x + 0.5, y + 0.5, 175, 81, 6, "f50 sedge")
          ]
        : [dashed(x, y, 176, 82, 6)];
    };
    const shapes = [sheet(36, 6), sheet(18, 20), sheet(0, 34)];
    if (v) {
      shapes.push(
        ptx(12, 34 + 14 + f, shorten(v.week || v.name, 130, f), "g-p", f)
      );
      if (v.published)
        shapes.push(
          path(`m150 ${n1(34 + 14 + f * 0.6)} 4 4 8-9`, "g-check g-check_big")
        );
      for (let i = 0; i < 6; i++) shapes.push(well(12 + i * 26, 98, 22, 12, 3));
    }
    return glimpse(shapes);
  }
};

/**
 * The drawing pieces, for the hand's cards (c/shoreshRootsLooks): the same tiles, wells, dashed
 * outlines, flags and words as the table's faces, so the hand speaks the table's language.
 */
export const pieces = { rect, txt, path, tile, well, dashed, flag, lock };

/** A card's glimpse: its full face (f 0), or its picture with key words at f px. */
export function glimpseOf(key, camp, f = 0) {
  const draw = f > 0 ? PIC[key] : G[key];
  return draw ? draw(camp, f) : glimpse([]);
}

/** The small mono tag beside a card's name: the season's year, the week a schedule shows. */
export function smallOf(key, camp, t) {
  if (key === "weeks" && camp.year) {
    return String(camp.year);
  }
  if (
    (key === "manualBuild" || key === "generatedSchedule") &&
    camp.shownWeek
  ) {
    return camp.shownWeek.name
      ? camp.shownWeek.name.toUpperCase()
      : `${t.s("Week")} ${camp.shownWeek.n}`.toUpperCase();
  }
  return null;
}

/**
 * The font size (in the glimpse's units) a card's picture needs at scale s, or 0 when its full
 * glimpse still reads (its 11 px words at 11 px or more). cw, ch: the card's size at scale 1.
 */
export function pictureSize(s, cw, ch) {
  const nf = s < 0.9 ? Math.max(13, 11.5 / s) : 13;
  const e = Math.min((cw - 28) / W, (ch - 34 - nf * 1.25) / H) * s;
  return e * 11 < 11 ? Math.ceil((11.8 / e) * 2) / 2 : 0;
}
