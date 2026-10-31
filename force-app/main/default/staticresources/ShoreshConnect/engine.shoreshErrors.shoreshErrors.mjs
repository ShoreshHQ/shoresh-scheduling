/*
 * Error words, in the desktop's shape (writeErrorMessage.js describeWriteFailure): what didn't
 * happen and whether anything was lost, in camp words, then why.
 *
 * The why is only ever Shoresh's own words: the refusals our Apex writes on purpose
 * (ScreenErrors, ShoreshException, trigger and validation messages, all sent as an
 * AuraHandledException) and the refusals these screens make themselves (refusal()). Anything
 * else (a platform message naming objects, fields or status codes, a stack trace, a script
 * error, a dropped connection) never reaches the director: the why becomes "Try again.", and the
 * raw detail goes to the browser console for support.
 */
const TRY_AGAIN = "Try again.";
// For a caller that can't say what it was doing (failed() is the usual way in).
const NOTHING_HAPPENED = "That didn't work. Try again.";

// The exception type our Apex sends its own words as. Any other type is the platform's.
const OURS = /(^|\.)AuraHandledException$/;

// Text that is the platform's or the code's, never ours, even when it arrives as a message:
// status codes (FIELD_CUSTOM_VALIDATION_EXCEPTION), field and object names (Week__c), DML and
// script wording, stack lines, and Lightning's own transport and server failures.
const MACHINE_WORDS = [
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/,
  /__[a-z]\b/i,
  /\b(?:Insert|Update|Upsert|Delete|Undelete|Merge) failed\b/i,
  /\bfirst error:/i,
  /\bline \d+, column \d+/i,
  /\bClass\.[A-Za-z_]/,
  /\bSystem\.[A-Za-z]+Exception\b/,
  /Script-thrown exception/i,
  /internal server error/i,
  /Disconnected or Canceled/i,
  /\b(?:undefined|null) is not\b|\bis not a function\b|Cannot read propert/i
];

// Quoted names (a bunk, an activity) are the camp's own words and may hold anything.
const QUOTED = /"[^"]*"|“[^”]*”/g;

/**
 * An error these screens raise in their own words (a cell Excel can't hold, a refusal the
 * week editor passes on): its message is shown as it is.
 */
export function refusal(message) {
  const error = new Error(message);
  error.shoreshWords = true;
  return error;
}

function looksOurs(text) {
  if (typeof text !== "string" || !text.trim()) {
    return false;
  }
  const words = text.replace(QUOTED, '""');
  return !MACHINE_WORDS.some((pattern) => pattern.test(words));
}

/** Shoresh's own message from one server answer, or null. */
function ownServerWords(body) {
  if (!body || !looksOurs(body.message)) {
    return null;
  }
  if (body.exceptionType && !OURS.test(body.exceptionType)) {
    return null;
  }
  return body.message;
}

/** Shoresh's own words inside an error, or null when there are none. */
function ownWords(error) {
  if (!error) {
    return null;
  }
  if (typeof error === "string") {
    // Only these screens pass a string: a reason already in camp words.
    return looksOurs(error) ? error : null;
  }
  if (error.shoreshWords) {
    return looksOurs(error.message) ? error.message : null;
  }
  const body = error.body;
  if (Array.isArray(body)) {
    const messages = body.map(ownServerWords);
    return messages.length && messages.every(Boolean)
      ? messages.join(" ")
      : null;
  }
  return ownServerWords(body);
}

/** The why: Shoresh's own words, or "Try again." with the detail in the console for support. */
export function reasonOf(error) {
  const own = ownWords(error);
  if (own === NOTHING_HAPPENED) {
    // A bare errorMessage() passed along to failed(): its subject says what didn't happen.
    return TRY_AGAIN;
  }
  if (own) {
    return own;
  }
  console.error("Shoresh: not shown to the director:", error);
  return TRY_AGAIN;
}

/**
 * The why on its own, for a caller with no subject to put in front of it: Shoresh's own words,
 * or "That didn't work. Try again." Prefer failed(), which names what didn't happen.
 */
export function errorMessage(error) {
  const why = reasonOf(error);
  return why === TRY_AGAIN ? NOTHING_HAPPENED : why;
}

/**
 * What didn't happen, then why: failed("Bunks not saved. Your changes are still here.", e) ->
 * 'Bunks not saved. Your changes are still here. "Bunk 3": That name is already used. Pick
 * another.', or, when the server's text isn't ours, '... Your changes are still here. Try
 * again.'
 */
export function failed(what, error) {
  return `${what} ${reasonOf(error)}`;
}
