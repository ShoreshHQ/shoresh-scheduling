/**
 * Common camp names and their usual kind: what Shoresh knows before a camp's first answer
 * (Greg, 2026-10-28, wiki projects/shoresh-sf-learned-plan.md "Built-in camp knowledge as a
 * tiebreaker"; INGEST-3.10, MEMO-6.9 to 6.11, MEMO-7.8).
 *
 * Used only as a shown Suggestion on a "what is this?" question the import already asks, never to
 * decide anything: the grid always wins. General North American day-camp words, invented for
 * Shoresh; a name that is often more than one kind is left out on purpose: Swim, Free Swim,
 * Clean Up, Tefillah, Color War, and the meals and rest (Lunch, Snack, Rest Hour, Menucha), which
 * are the whole camp at once at some camps (fixed) and staggered by division at others
 * (recurring): on the made-up camps a built-in "Lunch: recurring" was wrong on 160 of 190 asked
 * questions (campWordsMeasure.test.js).
 *
 * Each entry: name (as shown), kind ("fixed" | "recurring" | "activity"), also (other spellings
 * of the same name), why (a short note for whoever reviews this list).
 * Matching: see wordKey in shoreshPatterns.js (capitals, spacing and punctuation ignored; a
 * trailing number dropped, "Carpool 2" is "Carpool").
 */
export const CAMP_WORDS = Object.freeze([
  // Fixed activity: every group, the same time block, every day.
  {
    name: "Arrival",
    kind: "fixed",
    also: [],
    why: "The whole camp arrives together every morning."
  },
  {
    name: "Carpool",
    kind: "fixed",
    also: ["Car Pool"],
    why: "Morning or afternoon car line for the whole camp (wiki decision 0004)."
  },
  {
    name: "Buses",
    kind: "fixed",
    also: ["Busses", "Bus"],
    why: "Everyone boards at the same time at the end of the day."
  },
  {
    name: "Dismissal",
    kind: "fixed",
    also: [],
    why: "The whole camp leaves together."
  },
  {
    name: "Departure",
    kind: "fixed",
    also: [],
    why: "Another word for dismissal."
  },
  {
    name: "Pickup",
    kind: "fixed",
    also: ["Pick Up"],
    why: "End-of-day pickup for the whole camp."
  },
  {
    name: "Drop Off",
    kind: "fixed",
    also: ["Dropoff"],
    why: "Start-of-day drop-off for the whole camp."
  },
  {
    name: "Flagpole",
    kind: "fixed",
    also: ["Flag Pole", "Flag"],
    why: "The all-camp morning gathering (wiki decision 0004)."
  },
  {
    name: "Line Up",
    kind: "fixed",
    also: ["Lineup"],
    why: "An all-camp opening, as in the import corpus."
  },
  {
    name: "Morning Circle",
    kind: "fixed",
    also: [],
    why: "An all-camp opening, as in the import corpus."
  },
  {
    name: "Boker Tov",
    kind: "fixed",
    also: [],
    why: "Hebrew 'good morning': an all-camp opening."
  },
  {
    name: "Mifkad",
    kind: "fixed",
    also: [],
    why: "Hebrew roll call: all camp, same time daily (desktop ADR 2026-08-28)."
  },
  {
    name: "Opening Circle",
    kind: "fixed",
    also: [],
    why: "An all-camp opening."
  },
  {
    name: "Closing Circle",
    kind: "fixed",
    also: [],
    why: "An all-camp close of the day."
  },

  // Recurring activity: a set time that leaves the block free for some groups or days.
  {
    name: "Shabbat",
    kind: "recurring",
    also: ["Kabbalat Shabbat", "Oneg Shabbat", "Oneg"],
    why: "Every group, but only on Fridays."
  },
  {
    name: "All Camp",
    kind: "recurring",
    also: ["All Camp Activity", "All Camp Program"],
    why: "Every group, on some days of the week (wiki decision 0004)."
  },
  {
    name: "Assembly",
    kind: "recurring",
    also: [],
    why: "Every group, on some days (a Monday assembly, wiki decision 0004)."
  },
  {
    name: "Song Session",
    kind: "recurring",
    also: ["Shira"],
    why: "All-camp singing, a day or two a week."
  },
  {
    name: "Ruach",
    kind: "recurring",
    also: [],
    why: "Hebrew 'spirit': recurring in Greg's camp."
  },

  // Activity: placed by the scheduler.
  { name: "Archery", kind: "activity", also: [], why: "A rotating activity." },
  {
    name: "Arts and Crafts",
    kind: "activity",
    also: ["Arts & Crafts", "Arts n Crafts"],
    why: "A rotating activity."
  },
  {
    name: "Basketball",
    kind: "activity",
    also: [],
    why: "A rotating activity."
  },
  { name: "Soccer", kind: "activity", also: [], why: "A rotating activity." },
  { name: "Gaga", kind: "activity", also: [], why: "A rotating activity." },
  { name: "Tennis", kind: "activity", also: [], why: "A rotating activity." },
  { name: "Drama", kind: "activity", also: [], why: "A rotating activity." },
  { name: "Nature", kind: "activity", also: [], why: "A rotating activity." },
  { name: "Woodshop", kind: "activity", also: [], why: "A rotating activity." },
  { name: "Ceramics", kind: "activity", also: [], why: "A rotating activity." },
  {
    name: "Climbing",
    kind: "activity",
    also: ["Climbing Wall"],
    why: "A rotating activity."
  },
  {
    name: "Ropes Course",
    kind: "activity",
    also: ["Ropes"],
    why: "A rotating activity."
  },
  { name: "Canoeing", kind: "activity", also: [], why: "A rotating activity." }
]);
