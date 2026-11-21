/*
 * Error words, in the desktop's shape (writeErrorMessage.js describeWriteFailure): what didn't
 * happen and whether anything was lost, in camp words, then why.
 *
 * The why is only ever Shoresh's own words: the refusals our Apex writes on purpose
 * (ScreenErrors, ShoreshException, trigger and validation messages, all sent as an
 * AuraHandledException) and the refusals these screens make themselves (refusal()). Anything
 * else (a platform message naming objects, fields or status codes, a stack trace, a script
 * error, a dropped connection) never reaches the director: the why becomes "Try again." with a
 * support code after it (CORE-6.15), and the raw detail is kept under that code in the camp's
 * org (ErrorCodes) and goes to the browser console.
 */
import keepFromScreen from "@salesforce/apex/ErrorCodes.keepFromScreen";

const TRY_AGAIN = "Try again.";
// For a caller that can't say what it was doing (failed() is the usual way in).
const NOTHING_HAPPENED = "That didn't work. Try again.";
// Salesforce stops one request that reads or saves too much (a governor limit), and everything
// it did is rolled back. Trying again does the same, so the director is told plainly.
// Shoresh support's address, the one place it is written (Help in Settings uses it too).
export const SUPPORT_EMAIL = "imshoresh@gmail.com";
export const TOO_BIG = `This camp is bigger than Salesforce lets Shoresh handle in one go, so trying again won't help. Open Help in Settings, or write to ${SUPPORT_EMAIL}.`;
const LIMIT_TYPE = /(^|\.)LimitException$/;
const LIMIT_WORDS =
  /^(?:Too many [A-Za-z ]+:|Apex CPU time limit exceeded|Apex heap size too large)/;

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

/** Whether a server answer is Salesforce's governor limit stopping the request. */
function hitLimit(error) {
  const bodies = error && error.body;
  return (Array.isArray(bodies) ? bodies : [bodies]).some(
    (body) =>
      Boolean(body) &&
      (LIMIT_TYPE.test(body.exceptionType || "") ||
        LIMIT_WORDS.test(body.message || ""))
  );
}

// ---------- support codes (CORE-6.15) ----------

// Letters and digits that can't be heard or read as another; the same set as ErrorCodes.cls.
const CODE_LETTERS = "ACDEFGHJKMNPQRTUVWXY34679";
// The most detail kept with one code (the Error Log's Detail field).
const MOST_DETAIL = 32000;
// One error shown twice (its why, then its failed() sentence) keeps one code.
const codes = new WeakMap();

function newCode() {
  const picks = new Uint32Array(6);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(picks);
  } else {
    picks.forEach((_, i) => {
      picks[i] = Math.floor(Math.random() * CODE_LETTERS.length);
    });
  }
  const letters = Array.from(
    picks,
    (n) => CODE_LETTERS[n % CODE_LETTERS.length]
  );
  return `${letters.slice(0, 3).join("")}-${letters.slice(3).join("")}`;
}

/** What support needs to know about an error the screen met on its own. */
function detailOf(error) {
  let text;
  if (error instanceof Error) {
    text = `${error.name}: ${error.message} ${error.stack || ""}`;
  } else {
    try {
      text = JSON.stringify(error);
    } catch {
      text = String(error);
    }
  }
  const where =
    typeof window !== "undefined" && window.location
      ? window.location.pathname
      : "";
  return `${where} ${text}`.slice(0, MOST_DETAIL);
}

/**
 * The code shown for an error Shoresh can't explain, kept with its detail in the camp's org.
 * Keeping it never gets in the way: a screen that can't reach Salesforce still shows the code,
 * and the detail is in the console.
 */
function supportCode(error, said) {
  const known = error && typeof error === "object" ? codes.get(error) : null;
  if (known) {
    return known;
  }
  const code = newCode();
  if (error && typeof error === "object") {
    codes.set(error, code);
  }
  console.error(`Shoresh ${code}: ${said}`, error);
  Promise.resolve()
    .then(() => keepFromScreen({ code, detail: `${said} ${detailOf(error)}` }))
    .catch(() => {});
  return code;
}

const forSupport = (code) => ` For support: ${code}.`;

/**
 * The why and what kind it is: Shoresh's own words ("own"), "too big" when Salesforce's limits
 * stopped it ("limit"), or "Try again." ("unexplained").
 */
function explain(error) {
  if (hitLimit(error)) {
    return { why: TOO_BIG, kind: "limit" };
  }
  const own = ownWords(error);
  if (own && own.startsWith(NOTHING_HAPPENED)) {
    // A bare errorMessage() passed along to failed(): its subject says what didn't happen. Its
    // support code, if it has one, stays.
    return { why: TRY_AGAIN + own.slice(NOTHING_HAPPENED.length), kind: "own" };
  }
  if (own) {
    return { why: own, kind: "own" };
  }
  return { why: TRY_AGAIN, kind: "unexplained" };
}

/** The why with a support code after it when Shoresh couldn't explain it (CORE-6.15). */
function withCode(error, { why, kind }) {
  if (kind === "own") {
    return why;
  }
  const said =
    kind === "limit"
      ? "stopped by a Salesforce limit"
      : "not shown to the director";
  return why + forSupport(supportCode(error, said));
}

/**
 * The why: Shoresh's own words, "too big" when Salesforce's limits stopped it, or "Try again.";
 * the last two end with a support code.
 */
export function reasonOf(error) {
  return withCode(error, explain(error));
}

/**
 * The why on its own, for a caller with no subject to put in front of it: Shoresh's own words,
 * or "That didn't work. Try again." Prefer failed(), which names what didn't happen.
 */
export function errorMessage(error) {
  const found = explain(error);
  return found.kind === "unexplained"
    ? withCode(error, { ...found, why: NOTHING_HAPPENED })
    : withCode(error, found);
}

// A subject that says the change was made (the screen only couldn't show it) is always kept.
const DONE = /^Done\b/;

/** The first sentence of a subject: "Bunks not saved." out of "Bunks not saved. Nothing …". */
function firstSentence(what) {
  const masked = what.replace(QUOTED, (quoted) => "x".repeat(quoted.length));
  const end = masked.search(/[.!?](\s|$)/);
  return end < 0 ? what : what.slice(0, end + 1);
}

/**
 * What didn't happen, in one sentence, then why (word walk W4: never "Not saved. Nothing was
 * saved. Your changes are still here."): failed("Bunk 1 · Monday wasn't saved.", e) ->
 * "Bunk 1 · Monday wasn't saved. Bunk 1 isn't at camp then.", or "… Try again." when the
 * server's text isn't ours. Only the subject's first sentence is said.
 */
export function failed(what, error) {
  const subject = String(what || "");
  const why = reasonOf(error);
  return `${DONE.test(subject) ? subject : firstSentence(subject)} ${why}`;
}

/**
 * The why alone, where the place it is shown already names what failed (a field, a table row,
 * a delete refused): Shoresh's own reason ('"Bunk 3": That name is already used. Pick
 * another.'), or, when the server's text isn't ours, failed()'s "Bunks not saved. Try again."
 */
export function refusedBecause(what, error) {
  const subject = String(what || "");
  const found = explain(error);
  if (
    DONE.test(subject) ||
    found.kind !== "own" ||
    found.why.startsWith(TRY_AGAIN)
  ) {
    return failed(subject, error);
  }
  return found.why;
}

// ---------- the floating refusal (word walk W4) ----------

// The one component whose refusal floats at the window's foot now: a newer one puts it away, so
// two never sit on top of each other.
let floating = null;
// Where the cursor was when each refusal first showed: Close takes it back there.
const cameFrom = new WeakMap();

/** The element with focus, looking inside components (their shadow roots). */
function focusedNow() {
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}

/** A place the cursor can't usefully go back to: nowhere, or a refusal's own Close. */
function nowhere(el) {
  return (
    !el ||
    el === document.body ||
    (el.dataset && el.dataset.id === "error-close")
  );
}

/**
 * Called from a component's `error` setter with the message being shown (or null): the newest
 * floating refusal on the page replaces any other component's, and where the cursor was when it
 * first showed is kept for Close. `showing` is the message on screen before this one.
 */
export function floatRefusal(owner, message, showing) {
  if (!message) {
    if (floating === owner) {
      floating = null;
    }
    return;
  }
  if (!showing) {
    const from = focusedNow();
    if (nowhere(from)) {
      cameFrom.delete(owner);
    } else {
      cameFrom.set(owner, from);
    }
  }
  const older = floating;
  floating = owner;
  if (older && older !== owner) {
    older.error = null;
  }
}

/**
 * Close on a floating refusal: it goes, and the cursor goes back to the control that caused it,
 * or, when that is gone or can't take it, to `fallback()` (the screen's heading), never to the
 * top of the page (WCAG 2.4.3).
 */
export function closeRefusal(owner, fallback) {
  const from = cameFrom.get(owner);
  cameFrom.delete(owner);
  owner.error = null;
  if (from && from.isConnected && typeof from.focus === "function") {
    from.focus();
  }
  if (!from || nowhere(focusedNow())) {
    const target = fallback ? fallback() : null;
    if (target && typeof target.focus === "function") {
      target.focus();
    }
  }
}
