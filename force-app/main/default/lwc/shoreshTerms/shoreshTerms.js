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
  const word = (term, plural) => {
    const row = byTerm.get(term);
    if (!row) {
      // Unknown until labels load: "TimeBlock" shows as "Time block" rather than nothing.
      const words = term.replace(/([a-z])([A-Z])/g, "$1 $2");
      const readable = words.charAt(0) + words.slice(1).toLowerCase();
      if (!plural) {
        return readable;
      }
      // As the server makes plurals: "Activity" -> "Activities", "Day" -> "Days".
      return /[^a]y$/.test(readable)
        ? `${readable.slice(0, -1)}ies`
        : `${readable}s`;
    }
    return plural ? row.plural : row.singular;
  };
  const inSentence = (term, plural) => {
    const row = byTerm.get(term);
    const text = word(term, plural);
    return row && row.isCustom ? text : text.toLowerCase();
  };
  return {
    s: (term) => word(term, false),
    p: (term) => word(term, true),
    sIn: (term) => inSentence(term, false),
    pIn: (term) => inSentence(term, true)
  };
}

export const SHORT_DAYS = Object.freeze({
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun"
});

/** "a word" or "an word". */
export function article(word) {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
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
  if (/[^aeiou]y$/i.test(text)) {
    return `${text.slice(0, -1)}ies`;
  }
  if (/(s|x|z|ch|sh)$/i.test(text)) {
    return `${text}es`;
  }
  return `${text}s`;
}
