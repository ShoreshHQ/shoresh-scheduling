// Keys whose standard word is not the key split into words, and those the same in the plural,
// as the server's picklist and CampLabels have them.
const STANDARD = { Seats: "Seat" };
const SAME_IN_PLURAL = new Set([
  "Availability",
  "GroupsAtOnce",
  "GroupsThatFit",
  "MinimumToRun",
  "TimesPerWeek"
]);

/** "TimeBlock" -> "Time block"; "Seats" -> "Seat". */
function standardWord(term) {
  if (STANDARD[term]) {
    return STANDARD[term];
  }
  const words = String(term || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return words.charAt(0) + words.slice(1).toLowerCase();
}

/**
 * The one English plural rule (CORE-1.35), as CampLabels.pluralOf: "ies" after a consonant and y,
 * "es" after s, x, z, ch and sh, else "s".
 */
function pluralOf(text) {
  if (/[^aeiou]y$/i.test(text)) {
    return `${text.slice(0, -1)}ies`;
  }
  if (/(s|x|z|ch|sh)$/i.test(text)) {
    return `${text}es`;
  }
  return `${text}s`;
}

/**
 * The camp's own words for model terms (decision 0006), for every Shoresh screen.
 * Built from the TermLabel list the server sends (CampLabels.all()).
 *
 * s('Group')   -> "Group" or the camp's "Bunk"     (headings, buttons, start of a sentence)
 * p('Group')   -> "Groups" or "Bunks"
 * sIn / pIn    -> inside a sentence: model terms in lower case, camp labels exactly as typed
 */
export function buildTerms(labels) {
  const byTerm = new Map((labels || []).map((row) => [row.term, row]));
  const own = (term) => {
    const row = byTerm.get(term);
    return row && row.isCustom ? row : null;
  };
  // CORE-1.34: a word the camp left standard follows the camp's word it belongs to.
  const followed = (term) => {
    if (own(term)) {
      return null;
    }
    if (term === "ElectiveSet" && own("Elective")) {
      const elective = own("Elective");
      return { singular: elective.singular, plural: elective.plural };
    }
    if ((term === "GroupsThatFit" || term === "GroupsAtOnce") && own("Group")) {
      const words = `${own("Group").plural} ${term === "GroupsThatFit" ? "that fit" : "at once"}`;
      return { singular: words, plural: words };
    }
    return null;
  };
  const word = (term, plural) => {
    const follows = followed(term);
    if (follows) {
      return plural ? follows.plural : follows.singular;
    }
    const row = byTerm.get(term);
    if (!row) {
      // Unknown until labels load: "TimeBlock" shows as "Time block" rather than nothing.
      const readable = standardWord(term);
      if (!plural) {
        return readable;
      }
      // As the server makes plurals: "Activity" -> "Activities", "Day" -> "Days".
      return SAME_IN_PLURAL.has(term) ? readable : pluralOf(readable);
    }
    return plural ? row.plural : row.singular;
  };
  const inSentence = (term, plural) => {
    const text = word(term, plural);
    return own(term) || followed(term) ? text : text.toLowerCase();
  };
  return {
    s: (term) => word(term, false),
    p: (term) => word(term, true),
    sIn: (term) => inSentence(term, false),
    pIn: (term) => inSentence(term, true)
  };
}

/**
 * Camp words no screen shows (word walk W1): left off Camp words, its worksheet and the AI's
 * read_camp_words (CampLabels.UNSHOWN). Their saved words stay.
 */
export const UNSHOWN_TERMS = Object.freeze([
  "Scheduler",
  "WeekException",
  "Preference",
  "Assignment",
  "DraftSchedule",
  "Placement",
  "Conflict",
  "Shortfall",
  "Lock",
  "Team"
]);

export const SHORT_DAYS = Object.freeze({
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun"
});

/** "a time block", "an Edah", "an hour", "a Unit": the article a word takes by its sound. */
export function article(word) {
  const vowelSound =
    /^(hour|honest|hono|heir)/i.test(word) ||
    (/^[aeiou]/i.test(word) &&
      !/^(uni|use|usu|uti|ure|one|once|eu|ewe)/i.test(word));
  return `${vowelSound ? "an" : "a"} ${word}`;
}

export function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/**
 * A short date, month first, on every screen (CORE-6.10): "2026-07-03" -> "Jul 3", never shifted
 * by a time zone; a moment in time -> the day it was where the person is. "" when it can't be read.
 */
export function shortDate(value) {
  const day = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (day) {
    const name = MONTHS[Number(day[1]) - 1];
    return name && Number(day[2]) ? `${name} ${Number(day[2])}` : "";
  }
  const date = new Date(value || NaN);
  return Number.isNaN(date.getTime())
    ? ""
    : `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/**
 * The plural Camp words guesses for a camp's own word (wiki decision 56, camp-words-b): the
 * standard word's own plural when the word is the standard one ("Times per week"), else the
 * English rule the server uses for the standard words ("Activity" -> "Activities"), with "es"
 * after s, x, z, ch and sh ("Chug" -> "Chugs", "Lunch" -> "Lunches"). The desktop has no camp
 * words, so no rule of its own. Only a guess: the director types over it (Chug -> Chugim).
 */
export function guessPlural(word, standardSingular, standardPlural) {
  const text = (word || "").trim();
  if (!text) {
    return "";
  }
  if (
    standardSingular &&
    standardPlural &&
    text.toLowerCase() === standardSingular.toLowerCase()
  ) {
    // The standard word, perhaps in other capitals: its own plural, starting as the word does.
    return text.charAt(0) + standardPlural.slice(1);
  }
  if (
    standardSingular &&
    standardPlural &&
    standardSingular.toLowerCase() === standardPlural.toLowerCase()
  ) {
    // The standard word is the same in the plural, so the camp's word is too.
    return text;
  }
  return pluralOf(text);
}

/**
 * The elective seats screen's name: "Elective seats", or the camp's "Chug spots" (word walk W1),
 * the camp's Seat word in its plural, small after the Elective word.
 */
export function electiveSeatsTitle(t) {
  return `${t.s("Elective")} ${t.p("Seats").toLowerCase()}`;
}

/** A count with its unit, in the camp's words: "1 spot", "3 spots", "2 Edot". */
export function countOf(t, n, term) {
  return `${n} ${n === 1 ? t.sIn(term) : t.pIn(term)}`;
}
