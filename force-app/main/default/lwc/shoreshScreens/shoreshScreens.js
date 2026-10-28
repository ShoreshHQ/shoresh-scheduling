/**
 * The screens of the Shoresh page and the left-hand menu that reaches them, following Shoresh
 * desktop's sidebar (navSections.js): Roots (home), then Camp, then Activities & Events, then
 * Schedules: Generated Schedule and Manual Build (by name, as the desktop lists them: the two
 * are equal and the order means nothing), Elective seats, and Saved versions (key "schedules").
 * Section titles are the desktop's NAV_SECTIONS titles. At the foot, Settings, where the desktop
 * has its footer link: it holds only What Shoresh has learned for now (repo ADR 0023, Greg
 * 2026-10-28; the screen keeps its key, "learned"). Every label is in the camp's own words.
 * Screens not built yet are listed as coming, not hidden.
 *
 * The Schedules title is itself a doorway (wiki decision 61): it opens the season's weeks
 * (screen "scheduleWeeks"), each with Generated Schedule and Manual Build. The desktop draws that
 * title as a plain label (Sidebar.jsx, the pinned section); its nearest door is App.jsx's neutral
 * "schedule" entry, which picks neither route and offers both. The other titles stay plain.
 */

// Built in a later slice: listed, not reachable from the menu yet. None just now: Electives and
// Elective seats opened with slice E11 (decision 44; repo ADR 0018 choice 59).
const COMING = new Set();
// A screen the page's address may open (repo ADR 0018 choices 12 and 59: ?c__preview=electives,
// ?c__preview=electiveSeats; ADR 0017 choice 19: ?c__preview=bringInChoices). The checks reach
// Bring in choices this way; Electives and Elective seats are in the menu now, so their address
// opens what the menu does. Nothing else is opened from the address.
const PREVIEWABLE = new Set(["electives", "bringInChoices", "electiveSeats"]);
// Everything else needs a season first.
const WITHOUT_SEASON = new Set(["campWords", "learned"]);

/** Each screen's name, in the camp's words. */
export function screenLabels(t) {
  return {
    roots: "Roots",
    weeks: t.p("Week"),
    programs: t.p("Program"),
    divisions: t.p("Division"),
    groups: t.p("Group"),
    timeBlocks: t.p("TimeBlock"),
    locations: t.p("Location"),
    campWords: "Camp words",
    activities: t.p("Activity"),
    fixedActivities: t.p("FixedActivity"),
    recurringActivities: t.p("RecurringActivity"),
    specialEvents: t.p("SpecialEvent"),
    // The camp's word for electives too (wiki decision 66): "Chugim", "Chug seats".
    electives: t.p("Elective"),
    electiveSeats: `${t.s("Elective")} seats`,
    manualBuild: "Manual Build",
    generatedSchedule: "Generated Schedule",
    schedules: "Saved versions",
    scheduleWeeks: "Schedules",
    import: "Import last year",
    learned: "Settings"
  };
}

const SECTIONS = [
  { key: "home", screens: ["roots"] },
  {
    key: "camp",
    title: () => "Camp",
    screens: [
      "weeks",
      "programs",
      "divisions",
      "groups",
      "timeBlocks",
      "locations",
      "campWords"
    ]
  },
  {
    key: "activities",
    title: (t) => `${t.p("Activity")} & Events`,
    screens: [
      "activities",
      "fixedActivities",
      "recurringActivities",
      "specialEvents",
      "electives"
    ]
  },
  {
    key: "schedules",
    title: () => "Schedules",
    door: "scheduleWeeks",
    screens: ["generatedSchedule", "manualBuild", "electiveSeats", "schedules"]
  },
  // At the foot of the menu, as the desktop's sidebar footer link (Sidebar.jsx): no title.
  // Settings, which opens straight onto What Shoresh has learned (repo ADR 0023).
  { key: "settings", foot: true, screens: ["learned"] }
];

export function isComing(screen) {
  return COMING.has(screen);
}

/**
 * Whether the screen can be opened now: built, and (except camp words) a season exists. preview:
 * the coming screen the page's address names (previewScreen), which opens like a built one.
 */
export function canOpen(screen, hasSeason, preview = null) {
  const built = !COMING.has(screen) || preview === screen;
  return built && (hasSeason || WITHOUT_SEASON.has(screen));
}

/** The screen a page address may open ("electives", "bringInChoices", "electiveSeats"), else null. */
export function previewScreen(name) {
  return PREVIEWABLE.has(name) ? name : null;
}

// The setup screens, in menu order (the Camp section, then Activities): each one's "next" button
// walks this list, so following the buttons and reading down the menu take the same path (desktop
// navSections.js SETUP_SCREEN_ORDER, SetupScreenShell.jsx).
const SETUP_ORDER = SECTIONS.filter(
  (section) => section.key === "camp" || section.key === "activities"
).flatMap((section) => section.screens);

/**
 * The setup screen after this one that can be opened now ({ key, label: "Bunks →" }), or null
 * for the last one and for screens that are not setup screens. The desktop's last setup screen
 * leads to a neutral schedule landing; Salesforce has none, and pointing at Generated Schedule
 * or Manual Build would pick one for the director, so the last setup screen has no next.
 */
export function nextScreen(screen, t, hasSeason) {
  const at = SETUP_ORDER.indexOf(screen);
  if (at < 0) {
    return null;
  }
  const next = SETUP_ORDER.slice(at + 1).find((key) => canOpen(key, hasSeason));
  return next ? { key: next, label: `${screenLabels(t)[next]} →` } : null;
}

// The words on each mark (Shoresh desktop Sidebar.jsx: "Needed" on "!", "Done" on "✓").
const MARKS = {
  needed: { symbol: "!", label: "Needed" },
  done: { symbol: "✓", label: "Done" }
};

/** Why a screen can't open now, read with it ("Coming", "Needs a Season"), or null. */
function whyClosed(screen, t, hasSeason, preview) {
  if (canOpen(screen, hasSeason, preview)) {
    return null;
  }
  return COMING.has(screen) && preview !== screen
    ? "Coming"
    : `Needs a ${t.sIn("Season")}`;
}

/**
 * The menu: sections, each with its items ({ key, label, coming, disabled, reason, mark }). marks:
 * screen -> "needed" | "done" (shoreshSetupRules.menuMarks); mark is { kind, symbol, label }.
 * preview: the coming screen the page's address opened (previewScreen), listed as built.
 * door: the screen a section's title opens ({ key, disabled, reason }), or null (a plain title).
 */
export function menuSections(t, hasSeason, marks = {}, preview = null) {
  const labels = screenLabels(t);
  return SECTIONS.map((section) => ({
    key: section.key,
    title: section.title ? section.title(t) : null,
    foot: !!section.foot,
    door: section.door
      ? {
          key: section.door,
          disabled: !canOpen(section.door, hasSeason, preview),
          reason: whyClosed(section.door, t, hasSeason, preview)
        }
      : null,
    items: section.screens.map((screen) => {
      const disabled = !canOpen(screen, hasSeason, preview);
      const kind = disabled ? null : marks[screen];
      const coming = COMING.has(screen) && preview !== screen;
      return {
        key: screen,
        label: labels[screen],
        coming,
        disabled,
        // Why it can't open, read with it (it stays in the tab order, so keyboard users hear it).
        reason: whyClosed(screen, t, hasSeason, preview),
        mark: kind ? { kind, ...MARKS[kind] } : null
      };
    })
  }));
}
