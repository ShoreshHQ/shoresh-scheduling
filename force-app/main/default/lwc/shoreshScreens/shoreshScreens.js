/**
 * The screens of the Shoresh page and the left-hand menu that reaches them, following Shoresh
 * desktop's sidebar: Roots (home), then Camp, then Activities, then
 * the schedules: Generated Schedule and Manual Build (by name, as the desktop lists them: the two
 * are equal and the order means nothing), and Schedules (saved versions). Every label is in the
 * camp's own words. Screens not built yet are listed as coming, not hidden.
 */

// Built in a later slice: listed, not reachable yet.
const COMING = new Set(["specialEvents"]);
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
    title: (t) => t.p("Activity"),
    screens: [
      "activities",
      "fixedActivities",
      "recurringActivities",
      "specialEvents"
    ]
  },
  {
    key: "schedules",
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

/** The menu: sections, each with its items ({ key, label, coming, disabled }). */
export function menuSections(t, hasSeason) {
  const labels = screenLabels(t);
  return SECTIONS.map((section) => ({
    key: section.key,
    title: section.title ? section.title(t) : null,
    items: section.screens.map((screen) => ({
      key: screen,
      label: labels[screen],
      coming: COMING.has(screen),
      disabled: !canOpen(screen, hasSeason)
    }))
  }));
}
