/**
 * The screens of the Shoresh page and the left-hand menu that reaches them, following Shoresh
 * desktop's sidebar (navSections.js): Roots (home), then Camp, then Activities & Events, then
 * Schedules: Generated Schedule and Manual Build (by name, as the desktop lists them: the two
 * are equal and the order means nothing), and Schedules (saved versions). Section titles are the
 * desktop's NAV_SECTIONS titles. Every label is in the camp's own words. Screens not built yet
 * are listed as coming, not hidden.
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
const WITHOUT_SEASON = new Set(["campWords"]);

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
    electives: "Electives",
    electiveSeats: "Elective seats",
    manualBuild: "Manual Build",
    generatedSchedule: "Generated Schedule",
    schedules: "Schedules",
    import: "Import last year"
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
    screens: ["generatedSchedule", "manualBuild", "electiveSeats", "schedules"]
  }
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

/**
 * The menu: sections, each with its items ({ key, label, coming, disabled, reason, mark }). marks:
 * screen -> "needed" | "done" (shoreshSetupRules.menuMarks); mark is { kind, symbol, label }.
 * preview: the coming screen the page's address opened (previewScreen), listed as built.
 */
export function menuSections(t, hasSeason, marks = {}, preview = null) {
  const labels = screenLabels(t);
  return SECTIONS.map((section) => ({
    key: section.key,
    title: section.title ? section.title(t) : null,
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
        reason: !disabled
          ? null
          : coming
            ? "Coming"
            : `Needs a ${t.sIn("Season")}`,
        mark: kind ? { kind, ...MARKS[kind] } : null
      };
    })
  }));
}
