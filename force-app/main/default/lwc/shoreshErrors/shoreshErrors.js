/*
 * Error words, in the desktop's shape (writeErrorMessage.js describeWriteFailure): what didn't
 * happen and whether anything was lost, in camp words, then why. The server's message is the why
 * (Shoresh's own refusals, or plain words for the platform's, ScreenErrors); when no reason can be
 * read, the why says so rather than guessing.
 */
const UNKNOWN = "Shoresh couldn't tell why. Try again.";

/** The readable reason inside an error from Apex or Lightning Data Service. */
export function errorMessage(error) {
  if (!error) {
    return UNKNOWN;
  }
  if (typeof error === "string") {
    return error;
  }
  const body = error.body;
  if (Array.isArray(body)) {
    const messages = body.map((b) => b.message).filter(Boolean);
    return messages.length ? messages.join(" ") : UNKNOWN;
  }
  if (body && body.message) {
    return body.message;
  }
  return error.message || UNKNOWN;
}

/**
 * What didn't happen, then why: failed("Bunks not saved. Your changes are still here.", e) ->
 * 'Bunks not saved. Your changes are still here. "Bunk 3": That name is already used. Pick
 * another.'
 */
export function failed(what, error) {
  return `${what} ${errorMessage(error)}`;
}
