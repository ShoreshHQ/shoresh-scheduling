import { FIELD } from "c/shoreshSchema";
import { screenLabels } from "c/shoreshScreens";
import { pieces, shortDate, shorten } from "c/shoreshRootsFaces";

/**
 * Roots' hand: what needs a look in this camp, as cards (repo ADR 0020 choice 10; wiki decisions
 * 64g, 64h and 65; the approved mock-up's needs-a-look hand). Pure: the same camp gives the same
 * hand, in the same order.
 *
 * Every card comes from something the app already knows is off, never from a rule of its own:
 * - everything "Needs your attention" listed (shoreshSetupRules.setupProblems, the desktop's Roots
 *   attention list and Greg's 2026-10-16 nudges), each kind gathered onto one card;
 * - what the table already draws as missing (ADR 0020 choice 2; decision 29, a dashed outline is
 *   what is missing): a week close at hand with no schedule (the Weeks card's outline bars),
 *   activities with no place in a camp that has places (the Activities card's dashed tiles; a camp
 *   with no places at all doesn't use them, desktop readiness.js OPTIONAL_AREAS), and a special
 *   day or event that is on the calendar with nothing planned in it (its dashed flag);
 * - the Elective seats counter's "kept below minimum" for the run the table shows (ADR 0018
 *   choice 36, the counter's needs-a-look corner).
 *
 * A card is { key, screen, meld, name, small, off, label, glimpse, nav }: name and off say what is
 * off at a glance in the camp's words (off is a few words, never a sentence); label is the whole
 * sentence for screen readers (the attention list's own words); the glimpse is drawn with the
 * table's own marks; nav says which exact thing a click opens (a week, a special day, a run).
 * Cards lie in the menu's order of the screens that fix them, so each sits below its meld.
 */

export const HW = 170;
export const HH = 62;

const { rect, txt, path, tile, well, dashed, flag } = pieces;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_LETTERS = ["M", "T", "W", "T", "F"];
const SECTION_OF = {
  weeks: "camp",
  programs: "camp",
  divisions: "camp",
  groups: "camp",
  timeBlocks: "camp",
  locations: "camp",
  campWords: "camp",
  activities: "activities",
  fixedActivities: "activities",
  recurringActivities: "activities",
  specialEvents: "activities",
  electives: "activities",
  scheduleWeeks: "schedules",
  generatedSchedule: "schedules",
  manualBuild: "schedules",
  electiveSeats: "schedules",
  schedules: "schedules"
};
const SCREEN_ORDER = Object.keys(SECTION_OF);
// A card for each of these, one per thing; every other kind gathers its things onto one card.
const ONE_EACH = new Set([
  "weekNotBuilt",
  "eventNoPlan",
  "specialOffDay",
  "specialTimes"
]);

const n1 = (x) => Math.round(x * 10) / 10;

function glimpse(shapes) {
  return {
    w: HW,
    h: HH,
    align: "xMidYMax",
    fade: null,
    shapes: shapes.flat(Infinity).map((s, i) => ({ ...s, key: `s${i}` }))
  };
}

/** "Canoe, Pottery and Photography". */
function listed(names) {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven"];
const counted = (n, one, many) => `${WORDS[n] || n} ${n === 1 ? one : many}`;

// ---------- the pictures (170 by 62, the mock-up's hand glimpse) ----------

function arrow(x, y, len) {
  return [
    path(`M${n1(x)} ${n1(y)}h${n1(len)}`, "g-lock"),
    path(`M${n1(x + len - 4)} ${n1(y - 3)}l4 3-4 3`, "g-lock")
  ];
}

/** Each thing (up to three rows) and where it should lead, dashed: what it still lacks. */
function toMissing(names) {
  const rows =
    names.length > 3 ? [names[0], names[1], `+${names.length - 2}`] : names;
  const top = (HH - (rows.length * 21.5 - 2.5)) / 2;
  return rows.map((name, r) => {
    const y = top + r * 21.5;
    return [
      tile(0, y, 100, 19, shorten(name, 100 - 12, 11), { left: true }),
      arrow(106, y + 9.5, 16),
      dashed(128, y, 42, 19, 4, "s700")
    ];
  });
}

/** An area with nothing in it yet: its tiles, dashed (decision 29). */
function emptyTiles(cols, rows, w, h) {
  const out = [];
  const gx = (HW - cols * w) / Math.max(cols - 1, 1);
  const gy = 5;
  const top = HH - rows * h - (rows - 1) * gy;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(dashed(c * (w + gx), top + r * (h + gy), w, h, 4, "s700"));
    }
  }
  return out;
}

/** A week with no schedule: its days, every cell an outline (the mock-up's week 4). */
function emptyWeek() {
  const out = [];
  DAY_LETTERS.forEach((d, i) => {
    const x = i * 34.4;
    out.push(txt(x + 15, 10, d, "g-m", "middle"));
    for (let r = 0; r < 4; r++) {
      out.push(dashed(x, 16 + r * 11.5, 30, 10, 2.5, "s500"));
    }
  });
  return out;
}

/** A special day or event with nothing planned: its flag, and its time blocks dashed. */
function emptyEvent() {
  const out = [flag(0, 8, 46, false)];
  for (let i = 0; i < 4; i++) {
    out.push(dashed(52 + i * 29.5, 4, 26, 57, 4, "s700"));
  }
  return out;
}

/** On a day its week no longer has: the week's days, that day an outline under the flag. */
function offDay(day) {
  const at = Math.max(0, DAYS.indexOf(day));
  const out = [];
  DAY_LETTERS.forEach((d, i) => {
    const x = i * 34.4;
    out.push(txt(x + 15, 26, d, "g-m", "middle"));
    out.push(i === at ? dashed(x, 32, 30, 28, 4, "s700") : well(x, 32, 30, 28));
  });
  out.push(flag(at * 34.4 + 6, 0, 18, true));
  return out;
}

/** Its time blocks no longer match the regular day's: the two days side by side, out of step. */
function outOfStep() {
  const out = [];
  [0, 1, 2].forEach((r) => {
    out.push(tile(0, 4 + r * 20, 70, 16, ""));
    out.push(dashed(100, 11 + r * 20, 70, 16, 4, "s700"));
  });
  out.push(arrow(76, 31, 18));
  return out;
}

/** Weeks past the season's ends: the season as a line, the week reaching past it. */
function outsideSeason() {
  return [
    rect(0, 40, 130, 1.5, 0.75, "f500"),
    rect(0, 34, 1.5, 13, 0.75, "f500"),
    rect(128.5, 34, 1.5, 13, 0.75, "f500"),
    tile(98, 10, 32, 22, ""),
    dashed(130, 10, 40, 22, 4, "s700")
  ];
}

/** Two weeks sharing dates: two bars that overlap, the shared days in the caution colour. */
function sharedDates() {
  return [
    tile(0, 12, 100, 18, ""),
    tile(70, 34, 100, 18, ""),
    rect(70, 12, 30, 18, 4, "fcaution"),
    rect(70, 34, 30, 18, 4, "fcaution")
  ];
}

/** Seats as boxes (the Elective seats glimpse): taken filled, the minimum's missing dashed. */
function seatRow(taken, minimum, limit, y, h, x0 = 0, width = HW) {
  const all = Math.max(limit || 0, minimum, taken, 1);
  const boxes = Math.min(all, 16);
  const scale = boxes / all;
  const w = Math.min(width / boxes, 15);
  const filled = Math.max(taken > 0 ? 1 : 0, Math.round(taken * scale));
  const min = Math.max(filled + 1, Math.round(minimum * scale));
  const out = [];
  for (let s = 0; s < boxes; s++) {
    const x = x0 + s * w;
    if (s < filled) out.push(rect(x, y, w - 3, h, 3, "f500"));
    else if (s < min)
      out.push(rect(x + 0.5, y + 0.5, w - 4, h - 1, 3, "fnone s700 dash"));
    else out.push(rect(x + 0.5, y + 0.5, w - 4, h - 1, 3, "fnone s400"));
  }
  return { shapes: out, line: x0 + min * w - 1.5 };
}

function shortSeats(seat) {
  const { shapes, line } = seatRow(
    seat.fewest,
    seat.minimum,
    seat.seats,
    26,
    22
  );
  return [
    shapes,
    path(`M${n1(line)} 20v36`, "g-lock"),
    txt(line, 13, String(seat.minimum), "g-m", "middle")
  ];
}

/** Several offerings short: each its name and its boxes. */
function shortRows(seats) {
  const rows = seats.slice(0, 3);
  const top = (HH - (rows.length * 21.5 - 2.5)) / 2;
  return rows.map((seat, r) => {
    const y = top + r * 21.5;
    const name =
      seats.length > 3 && r === 2 ? `+${seats.length - 2}` : seat.name;
    return [
      txt(0, y + 13.5, shorten(name, 60, 11), "g-t2"),
      seatRow(seat.fewest, seat.minimum, seat.seats, y + 2, 15, 66, 104).shapes
    ];
  });
}

/** More groups at once than the place fits: a box a group, those past the place's room caution. */
function tooMany(atOnce, fits) {
  const all = Math.max(atOnce, 1);
  const boxes = Math.min(all, 12);
  const w = HW / Math.max(boxes, 6);
  const cap = Math.min(boxes - 1, Math.round((fits * boxes) / all));
  const out = [];
  for (let s = 0; s < boxes; s++) {
    out.push(rect(s * w, 24, w - 4, 26, 3, s < cap ? "f500" : "fcaution"));
  }
  out.push(path(`M${n1(cap * w - 2)} 18v38`, "g-lock"));
  out.push(txt(cap * w - 2, 12, String(fits), "g-m", "middle"));
  return out;
}

/** Offerings an import proposed: their tiles, dashed until someone confirms them. */
function proposed(names) {
  const rows = names.slice(0, 3);
  const top = (HH - (rows.length * 21.5 - 2.5)) / 2;
  return rows.map((name, r) => {
    const label = names.length > 3 && r === 2 ? `+${names.length - 2}` : name;
    return tile(0, top + r * 21.5, HW, 19, shorten(label, HW - 14, 11), {
      open: true,
      left: true
    });
  });
}

// ---------- what each kind of card says and shows ----------

/** The empty area each "none yet" kind draws. */
const EMPTY = {
  noWeeks: () => emptyTiles(8, 1, 15, 44),
  noPrograms: () => emptyTiles(5, 2, 30, 19),
  noTimeBlocks: () => emptyTiles(1, 3, HW, 14),
  noDivisions: () => emptyTiles(3, 2, 52, 19),
  noGroups: () => emptyTiles(4, 2, 38, 19),
  noActivities: () => emptyTiles(3, 2, 52, 19)
};

/**
 * One card from the problems of one kind (same screen): what it is called, the words for what is
 * off, and its picture. labels: the screens' names in the camp's words.
 */
function fromProblems(kind, list, t, labels) {
  const first = list[0];
  const one = list.length === 1;
  const names = list.map((p) => p.name);
  const screenName = labels[first.screen];
  const whys = new Set(list.map((p) => p.why));
  const label =
    whys.size === 1
      ? `${listed(names)}: ${first.why}`
      : list.map((p) => `${p.name}: ${p.why}`).join(" ");
  const card = {
    name: one ? first.name : screenName,
    small: one ? screenName.toUpperCase() : null,
    label,
    picture: null,
    off: ""
  };
  switch (kind) {
    case "noWeeks":
    case "noPrograms":
    case "noActivities":
      return {
        ...card,
        name: screenName,
        small: null,
        off: "none yet",
        picture: EMPTY[kind]()
      };
    case "noTimeBlocks":
    case "noDivisions":
    case "noGroups":
      return {
        ...card,
        name: screenName,
        small: one ? first.name.toUpperCase() : null,
        off: "none yet",
        picture: one ? EMPTY[kind]() : toMissing(names)
      };
    case "weekOutside":
      return {
        ...card,
        off: `outside the ${t.sIn("Season")}`,
        picture: outsideSeason()
      };
    case "weeksShare":
      return { ...card, off: "share dates", picture: sharedDates() };
    case "nothingOpen":
      // About groups, fixed on Activities.
      return {
        ...card,
        name: one ? first.name : labels.groups,
        small: one ? labels.groups.toUpperCase() : null,
        off: `no ${t.pIn("Activity")} open`,
        picture: toMissing(names)
      };
    case "noRainPlan":
      return {
        ...card,
        off: `no ${t.sIn("RainPlan")}`,
        picture: toMissing(names)
      };
    case "tooManyAtOnce":
      return {
        ...card,
        off: "too many at once",
        picture: one ? tooMany(first.atOnce, first.fits) : toMissing(names)
      };
    case "specialOffDay":
      return {
        ...card,
        small: null,
        off: `not in its ${t.sIn("Week")}`,
        picture: offDay(first.day)
      };
    case "specialTimes":
      return {
        ...card,
        small: null,
        off: `${t.pIn("TimeBlock")} moved`,
        picture: outOfStep()
      };
    case "spanChanged":
      return {
        ...card,
        off: `its ${t.sIn("TimeBlock")} changed`,
        picture: outOfStep()
      };
    case "runsNoWeek":
      return {
        ...card,
        off: `in no ${t.sIn("Week")}`,
        picture: emptyTiles(8, 1, 15, 44)
      };
    case "allLeftOut":
      return {
        ...card,
        off: `no ${t.pIn("Group")} there`,
        picture: toMissing(names)
      };
    case "placeClosed":
      return {
        ...card,
        off: `${t.sIn("Location")} closed`,
        picture: toMissing(names)
      };
    case "offeringProposed":
      return {
        ...card,
        small: (first.set || screenName).toUpperCase(),
        off: "not confirmed",
        picture: proposed(names)
      };
    case "offeringNoSeats":
      return {
        ...card,
        small: (first.set || screenName).toUpperCase(),
        off: "seats not filled in",
        picture: toMissing(names)
      };
    default:
      // A check this file doesn't draw yet still shows, by its words.
      return {
        ...card,
        off: shorten(String(first.why || "").replace(/\.$/, ""), 160, 13),
        picture: emptyTiles(3, 1, 52, 19)
      };
  }
}

/** Where a kind's problems gather: one card a kind (per elective set), or one a thing. */
function groupKey(p) {
  if (ONE_EACH.has(p.kind)) {
    return `${p.kind}|${p.of || p.name}`;
  }
  if (p.kind === "offeringProposed" || p.kind === "offeringNoSeats") {
    return `${p.kind}|${p.set || ""}`;
  }
  return `${p.kind || "other"}|${p.screen}`;
}

// The room for a hand card's name and its words at 13 px: the narrowest card (196) less its sides.
const NAME_ROOM = 196 - 26;
// The small mono tag's width per letter at 11 px.
const MONO = 6.8;

/** A small tag of at most 14 letters, cut after its last whole word. */
function tagOf(small) {
  if (small.length <= 14) {
    return small;
  }
  let kept = "";
  for (const word of small.split(/\s+/)) {
    const next = kept ? `${kept} ${word}` : word;
    if (next.length > 13) {
      break;
    }
    kept = next;
  }
  return `${kept || small.slice(0, 13)}…`;
}

/**
 * A card's name and its small tag as they fit its top line: the tag kept short, the name cut after
 * its last whole word (as the table's faces do), never smaller than 13 px.
 */
function fitted(name, small) {
  const tag = small ? tagOf(String(small)) : null;
  const room = NAME_ROOM - (tag ? tag.length * MONO + 8 : 0);
  return { name: shorten(name, room, 13), small: tag };
}

// ---------- what the table draws as missing ----------

function weekNotBuilt(card) {
  return card.id.startsWith("weekNotBuilt|");
}

function weekCards(setup, table) {
  const built = new Set(table.builtWeekIds || []);
  const weeks = new Map((setup.weeks || []).map((w) => [w.Id, w]));
  return (table.soonWeekIds || [])
    .filter((id) => weeks.has(id) && !built.has(id))
    .map((id) => {
      const week = weeks.get(id);
      return {
        id: `weekNotBuilt|${id}`,
        screen: "scheduleWeeks",
        name: week.Name,
        small: shortDate(week[FIELD.Week.StartDate]),
        off: "not built",
        label: `${week.Name} has no schedule yet.`,
        picture: emptyWeek(),
        nav: { weekId: id }
      };
    });
}

function placeCard(setup, t) {
  if (!(setup.locations || []).length) {
    return [];
  }
  const names = (setup.activities || [])
    .filter((a) => !a[FIELD.Activity.Location])
    .map((a) => a.Name);
  if (!names.length) {
    return [];
  }
  const one = names.length === 1;
  const place = t.sIn("Location");
  return [
    {
      id: "noPlace|",
      screen: "activities",
      name: one ? names[0] : screenLabels(t).activities,
      small: one ? screenLabels(t).activities.toUpperCase() : null,
      off: `no ${place}`,
      label: `${listed(names)} ${one ? "has" : "have"} no ${place}.`,
      picture: toMissing(names)
    }
  ];
}

/** A special day or event on the calendar with nothing planned in it. */
function eventCards(setup, t) {
  const special = setup.special || {};
  const names = new Map(
    [...(special.specialDays || []), ...(special.specialEvents || [])].map(
      (item) => [item.Id, item.Name]
    )
  );
  const weeks = new Map((setup.weeks || []).map((w) => [w.Id, w]));
  return (special.briefs || [])
    .filter((brief) => names.has(brief.itemId) && !brief.problem)
    .filter((brief) => (brief.days || []).some((d) => weeks.has(d.weekId)))
    .filter(
      (brief) =>
        !brief.planned ||
        !(brief.periods || []).some((p) => (p.items || []).length)
    )
    .map((brief) => {
      const name = names.get(brief.itemId);
      const week = weeks.get(
        brief.days.find((d) => weeks.has(d.weekId)).weekId
      );
      return {
        id: `eventNoPlan|${brief.itemId}`,
        screen: "specialEvents",
        name,
        small: (week.Name || "").toUpperCase(),
        off: `no ${t.pIn("Activity")}`,
        label: `${name} has no ${t.pIn("Activity")} planned yet.`,
        picture: emptyEvent(),
        nav: { specialItemId: brief.itemId }
      };
    });
}

function seatCards(table, t, labels) {
  const short = table.shortSeats || [];
  if (!short.length) {
    return [];
  }
  const one = short.length === 1;
  const first = short[0];
  const missing = first.minimum - first.fewest;
  return [
    {
      id: "seatsShort|",
      screen: "electiveSeats",
      name: one ? first.name : labels.electiveSeats,
      small: one ? t.p("Elective").toUpperCase() : null,
      off: one
        ? counted(missing, "seat short", "seats short")
        : "under minimum",
      label: short
        .map(
          (s) =>
            `${s.name} is ${counted(s.minimum - s.fewest, "seat", "seats")} short of its minimum.`
        )
        .join(" "),
      picture: one ? shortSeats(first) : shortRows(short),
      nav: {
        weekId: table.seatsWeekId,
        setId: table.seatsSetId,
        scheduleId: table.seatsScheduleId,
        runId: table.seatsRunId
      }
    }
  ];
}

/**
 * The hand, from what the page already holds: problems (setupProblems, filtered to screens that
 * can open), setup (the season), table (Roots' one request; null until read, and then the cards
 * it feeds are left out), terms, and openable (the screens Roots can open: its cards and doors).
 */
export function looksOf({ problems, setup, table, terms, openable }) {
  if (!setup || !setup.season) {
    return [];
  }
  const labels = screenLabels(terms);
  const sets = new Map(
    ((setup.electives || {}).offerings || []).map((o) => [
      o.Id,
      ((setup.electives || {}).sets || []).find(
        (s) => s.Id === o[FIELD.Offering.ElectiveSet]
      )?.Name || ""
    ])
  );
  const groups = new Map();
  (problems || []).forEach((p) => {
    const problem =
      p.kind === "offeringProposed" || p.kind === "offeringNoSeats"
        ? { ...p, set: sets.get(p.of) || "" }
        : p;
    const key = groupKey(problem);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(problem);
  });
  const cards = [...groups.entries()].map(([id, list]) => {
    const first = list[0];
    const made = fromProblems(first.kind, list, terms, labels);
    return {
      id,
      screen: first.screen,
      ...made,
      nav:
        ONE_EACH.has(first.kind) && first.screen === "specialEvents"
          ? { specialItemId: first.of }
          : {}
    };
  });
  if (table) {
    cards.push(...weekCards(setup, table));
    cards.push(...seatCards(table, terms, labels));
  }
  cards.push(...placeCard(setup, terms));
  cards.push(...eventCards(setup, terms));
  const allowed = openable ? new Set(openable) : null;
  return cards
    .filter((c) => !allowed || allowed.has(c.screen))
    .sort(
      (a, b) =>
        SCREEN_ORDER.indexOf(a.screen) - SCREEN_ORDER.indexOf(b.screen) ||
        // Weeks not built stay in season order, as they came (the sort keeps ties in place).
        (weekNotBuilt(a) && weekNotBuilt(b)
          ? 0
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0)
    )
    .map((c) => ({
      key: `hand:${c.id}`,
      screen: c.screen,
      meld: SECTION_OF[c.screen] || "camp",
      ...fitted(c.name, c.small),
      off: shorten(c.off, NAME_ROOM, 13),
      label: c.label,
      nav: c.nav || {},
      glimpse: glimpse(c.picture || [])
    }));
}
