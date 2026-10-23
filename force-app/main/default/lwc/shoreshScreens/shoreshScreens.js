/**
 * The screens of the Shoresh page and the left-hand menu that reaches them, following Shoresh
 * desktop's sidebar (navSections.js): Roots (home), then Camp, then Activities & Events, then
 * Schedules: Generated Schedule and Manual Build (by name, as the desktop lists them: the two
 * are equal and the order means nothing), and Schedules (saved versions). Section titles are the
 * desktop's NAV_SECTIONS titles. Every label is in the camp's own words. Screens not built yet
 * are listed as coming, not hidden.
 */

// Built in a later slice: listed, not reachable yet (none just now; Special events came in ADR
// 0014 slice 2).
const COMING = new Set([]);
// A screen that can be opened from the page's address before it is in the menu, for the checks
// that look at it (?c__preview=bringInChoices; repo ADR 0017 choice 19, the route of ADR 0018).
// Nothing else reaches it.
const PREVIEWABLE = new Set(["bringInChoices"]);
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
      "specialEvents"
    ]
  },
  {
    key: "schedules",
    title: () => "Schedules",
    screens: ["generatedSchedule", "manualBuild", "schedules"]
  }
];

export function isComing(screen) {
  return COMING.has(screen);
}

/** Whether the screen can be opened now: built, and (except camp words) a season exists. */
export function canOpen(screen, hasSeason) {
  return !COMING.has(screen) && (hasSeason || WITHOUT_SEASON.has(screen));
}

/** The screen a page address may open ("bringInChoices"), else null. */
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
 */
export function menuSections(t, hasSeason, marks = {}) {
  const labels = screenLabels(t);
  return SECTIONS.map((section) => ({
    key: section.key,
    title: section.title ? section.title(t) : null,
    items: section.screens.map((screen) => {
      const disabled = !canOpen(screen, hasSeason);
      const kind = disabled ? null : marks[screen];
      const coming = COMING.has(screen);
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
