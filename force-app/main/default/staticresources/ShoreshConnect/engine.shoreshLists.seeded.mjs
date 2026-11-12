// A new special day's start, in words (SPECIAL-2.1, SPECIAL-2.6): said on Camp Setup, in Import a
// list's summary and to an AI (connect/imports.js), so all three say the same.

/** "Lunch, Rest and Flag". */
function listed(names) {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What a special day just added left out of the regular day (SpecialDaySeed.Seed), and why
 * (desktop SpecialEventsScreen.jsx's note after "Copy time blocks"). Nothing is left out
 * quietly; what it started from shows on its schedule, so no sentence explains it (word walk
 * W4: never '"Field Day" starts from Main's 7 time blocks').
 */
export function seededLines(seed, name, t) {
  if (!seed) {
    return [];
  }
  if (!seed.program) {
    return [
      `"${name}" has no ${t.pIn("TimeBlock")} yet: there were none to start from.`
    ];
  }
  const lines = [];
  const left = (names, why) => {
    if (names && names.length) {
      lines.push(`Not copied, since ${why}: ${listed(names)}.`);
    }
  };
  left(seed.notEveryDay, "they don't run every day");
  left(seed.notEveryWeek, "they don't run every week");
  left(seed.otherTimes, `they are in other ${t.pIn("TimeBlock")}`);
  left(seed.slotTaken, "the time was already taken");
  return lines;
}
