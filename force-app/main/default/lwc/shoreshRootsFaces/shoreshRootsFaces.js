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
      count: tb.versionCount || 0,
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

function weekBars(c, top, h, numbers) {
  const n = Math.max(c.weeks.length, 1);
  const out = [];
  if (!c.weeks.length) {
    for (let i = 0; i < 8; i++) {
      out.push(dashed(weekX(i, 8), top, weekW(8), h, 5));
    }
    return out;
  }
  c.weeks.forEach((wk, i) => {
    const x = weekX(i, n);
    const bw = weekW(n);
    if (wk.now) {
      out.push(rect(x, top, bw, h, 5, "fhl"));
    } else if (wk.built) {
      out.push(rect(x, top, bw, h, 5, "f500"));
    } else {
      out.push(dashed(x, top, bw, h, 5));
    }
    const label = numbers(i, wk);
    if (label) {
      out.push(label);
    }
  });
  return out;
}

const G = {
  weeks(c) {
    const n = Math.max(c.weeks.length, 1);
    const shapes = weekBars(c, 30, 66, (i, wk) => {
      return n <= 12 || wk.now || i === 0 || i === n - 1
        ? txt(
            weekX(i, n) + weekW(n) / 2,
            114,
            String(wk.n),
            wk.now ? "g-mb" : "g-m",
            "middle"
          )
        : null;
    });
    if (c.weeks.length) {
      shapes.push(txt(0, 14, shortDate(c.weeks[0].start), "g-m"));
      shapes.push(
        txt(W, 14, shortDate(c.weeks[c.weeks.length - 1].end), "g-m", "end")
      );
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
      shapes.push(txt(0, y + 10, fit(p.name, W, 11), "g-tb"));
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
        shapes.push(txt(0, y + 10, fit(lane.name, W, 11), "g-t2"));
        y += 16;
      }
      let x = 0;
      lane.list.forEach((name) => {
        const w = Math.min(W, tw(name));
        if (x > 0 && x + w > W) {
          x = 0;
          y += 28;
        }
        if (y + 22 <= H) shapes.push(tile(x, y, w, 22, fit(name, w - 10, 11)));
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
      shapes.push(txt(0, y + 11.5, fit(d.name, 84, 11), "g-t2"));
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
    rows.forEach(([p, acts], r) => {
      const y = 4 + r * 24.5;
      if (p)
        shapes.push(
          tile(0, y, 70, 20, fit(p, 58, 11), { left: true, cls: "g-tb" })
        );
      else shapes.push(rect(0.5, y + 0.5, 69, 19, 4, "fnone s700 dash"));
      let x = 78;
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
        shapes.push(txt(100, y + 15, fit(row.mine, 112, 11), "g-tb"));
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
      shapes.push(lockedBar(0, 21 + i * 41, W, 20, fit(n, W - 40, 11)));
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
    rows.forEach((r, ri) => {
      r.days.forEach((on, i) => {
        const x = i * 45;
        const y = 34 + ri * (rh + 8);
        shapes.push(
          on ? tile(x, y, 41, rh, fit(r.name, 36, 11)) : well(x, y, 41, rh)
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
    const flagged = new Map();
    c.events.forEach((e) =>
      flagged.set(e.n, (flagged.get(e.n) ?? true) && e.done)
    );
    if (!flagged.size) {
      shapes.push(...flag(W / 2 - 14, 46, 40, false));
    }
    flagged.forEach((done, wn) => {
      const s = Math.min(40, weekW(n) * 1.9);
      shapes.push(
        ...flag(weekX(wn - 1, n) + weekW(n) / 2 - s * 0.25, 92 - s, s, done)
      );
    });
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
      shapes.push(txt(0, y + 26, fit(set.name, W, 11), "g-t2"));
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
      shapes.push(txt(0, y + 12, fit(seat.name, 62, 11), "g-t2"));
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
        fit(v.week ? `${v.week} · ${v.name}` : v.name, 132, 11),
        "g-t"
      )
    );
    shapes.push(txt(12, 74, v.when, "g-m"));
    for (let i = 0; i < 6; i++) shapes.push(well(12 + i * 26, 88, 22, 16, 3));
    if (v.published) shapes.push(path("m154 49.5 3 3 6-7", "g-check"));
    return glimpse(shapes);
  }
};

/** Seats as a row of boxes: taken filled, the rest of the minimum dashed, free seats an outline. */
function seatBoxes(seat, x0, y, width, h) {
  const out = [];
  const limit = seat.seats == null ? Math.max(seat.taken + 3, 8) : seat.seats;
  const boxes = Math.max(1, Math.min(limit, 20));
  const scale = boxes / Math.max(limit, 1);
  const taken = Math.round(seat.taken * scale);
  const min = seat.minimum ? Math.round(seat.minimum * scale) : 0;
  const w = width / boxes;
  for (let s = 0; s < boxes; s++) {
    const x = x0 + s * w;
    if (s < taken) out.push(rect(x, y, w - 2.5, h, 2.5, "f500"));
    else if (s < min)
      out.push(rect(x + 0.5, y + 0.5, w - 3.5, h - 1, 2.5, "fnone s700 dash"));
    else out.push(rect(x + 0.5, y + 0.5, w - 3.5, h - 1, 2.5, "fnone s400"));
  }
  return out;
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
  const groupCount = Math.min(cols, (grid.groups || []).length);
  const list = grid.rows.slice(0, rows);
  if (named) {
    const cx = (i) => 40 + i * 61;
    (grid.groups || []).slice(0, groupCount).forEach((g, i) => {
      shapes.push(txt(cx(i) + 28, 14, fit(g, 56, 11), "g-t2", "middle"));
    });
    list.forEach((row, r) => {
      const y = 24 + r * 26;
      shapes.push(txt(0, y + 15, clockOf(minutesOf(row.startTime)), "g-m"));
      if (row.fixed) {
        shapes.push(lockedBar(40, y, 179, 21, fit(row.fixed, 140, 11)));
        return;
      }
      (row.cells || []).slice(0, groupCount).forEach((cell, i) => {
        shapes.push(
          cell.name
            ? tile(cx(i), y, 57, 21, fit(cell.name, 50, 11))
            : well(cx(i), y, 57, 21)
        );
        if (cell.locked) shapes.push(...lock(cx(i) + 57 - 11, y + 21 - 11, 9));
      });
    });
    return shapes;
  }
  const cw = (W - (groupCount - 1) * 4.4) / Math.max(groupCount, 1);
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
    const n = Math.max(c.weeks.length, 1);
    const top = 4;
    const h = yb - f - 6 - top;
    return glimpse(
      weekBars(c, top, h, (i, wk) => {
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
      })
    );
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
      shapes.push(ptx(0, y + f * 0.9, fit(p.name, W, f), "g-p", f));
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
        ptx(f * 0.6, y + rh / 2 + f * 0.36, fit(d.name, W - f, f), "g-p", f)
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
          ptx(8, y + rh / 2 + f * 0.36, fit(p, pw - 12, f), "g-p", f)
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
            fit(row.mine, W - wx - 12, f),
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
      shapes.push(lockedBar(0, y, W, bh, fit(n, W - f * 3, f), f));
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
    const flagged = new Map();
    c.events.forEach((e) =>
      flagged.set(e.n, (flagged.get(e.n) ?? true) && e.done)
    );
    const s = Math.min(40, line - 6);
    if (!flagged.size)
      shapes.push(...flag(W / 2 - s / 4, line - s - 2, s, false));
    flagged.forEach((done, wn) => {
      shapes.push(
        ...flag(
          weekX(wn - 1, n) + weekW(n) / 2 - s * 0.25,
          line - s - 2,
          s,
          done
        )
      );
    });
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
      shapes.push(ptx(0, y + f * 0.9, fit(set.name, W, f), "g-p", f));
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
    const rh = (H - 4 * 5) / 5;
    const cols = Math.min(6, (grid?.groups || []).length) || 6;
    const cw = (W - (cols - 1) * 4.4) / cols;
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
    const rh =
      (H - fixedRows * bh - (rows.length - 1) * 6) /
      Math.max(rows.length - fixedRows, 1);
    let y = 0;
    rows.forEach((row) => {
      if (row.fixed) {
        shapes.push(lockedBar(0, y, W, bh, fit(row.fixed, W - f * 3, f), f));
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
      shapes.push(ptx(0, y + f * 0.9, fit(seat.name, W, f), "g-p", f));
      shapes.push(...seatBoxes(seat, 0, y + f * 1.15, W, bh));
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
        ptx(12, 34 + 14 + f, fit(v.week || v.name, 130, f), "g-p", f)
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
