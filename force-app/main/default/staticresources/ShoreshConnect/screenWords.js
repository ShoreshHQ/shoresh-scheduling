/**
 * The one place where the names the API and the screens' modules keep for themselves meet the
 * words an AI reads and sends (API-1.6: every word in the screens' words). Outside systems share
 * the API's answers (API-1.3) and the modules keep their own camelCase words, so neither changes:
 * an AI hears and sends these instead.
 */

// Answer keys the API shares with outside systems, said to an AI as the screens say them: a
// schedule read's rows (One row per group per activity), the Electives list's electives (never
// "offering", Greg 2026-11-12).
const ANSWER_KEYS = { records: "rows", offerings: "electives" };

// The setup lists an AI names, as the engine and the screens' modules name them.
const LISTS = [
  "programs",
  "divisions",
  "groups",
  "timeBlocks",
  "locations",
  "staff",
  "activities",
  "fixedActivities",
  "recurringActivities",
  "electives",
  "specialEvents"
];

const snake = (word) => word.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * One of the modules' own camelCase words as an AI reads it: timeBlocks as time_blocks, leaveOut
 * as leave_out. `words` are the module's words; anything else (a camp's own name) is as it is.
 */
function aiWord(word, words = LISTS) {
  return words.includes(word) ? snake(word) : word;
}

/** What an AI sent, in the module's own word: time_blocks as timeBlocks. */
function engineWord(word, words = LISTS) {
  return words.find((w) => snake(w) === word) ?? word;
}

/** A value with each answer key renamed, at any depth. */
function renamed(value) {
  if (Array.isArray(value)) return value.map(renamed);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      ANSWER_KEYS[key] ?? key,
      renamed(v)
    ])
  );
}

/**
 * An answer's text as an AI reads it: a JSON answer with its keys in the screens' words, laid
 * out as it came; a sentence or a CSV file as it is.
 */
function forAi(text) {
  if (typeof text !== "string" || !/^[[{]/.test(text)) return text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  return JSON.stringify(renamed(parsed), null, /^[[{]\n/.test(text) ? 2 : 0);
}

module.exports = { LISTS, aiWord, engineWord, forAi };
