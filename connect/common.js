/**
 * What the connector's modules share: a refusal with nothing done, what a screen reads as the
 * screen gets it, and a name as camps type it.
 */

/** Something changed since it was read or reviewed: nothing was saved (409). By default, the setup since the review. */
function changedSince(
  text = "Someone changed the setup since the file was reviewed, so nothing was saved. Review the file again (without save) and use the new seen."
) {
  return { ok: false, status: 409, text };
}

function refused(text) {
  return { ok: false, status: 400, text };
}

// A time as the web address gives it ("09:00:00.000Z"), and the fields that hold one (a time
// block's start and end; namespaced or not).
const WEB_TIME = /^(\d\d):(\d\d):(\d\d)\.(\d{3})Z$/;
const TIME_FIELD = /(^|__)(Start|End)Time__c$/;

/**
 * What the screen reads before a file, as the screen gets it (API-1.99): Salesforce gives a
 * screen a time as milliseconds after midnight, and the web address as "09:00:00.000Z", so each
 * time field's is made the screen's number. The setup's time blocks are then matched by their
 * times, as on the screen, not added again, and a file made from them shows their times.
 */
function asTheScreenReads(value, key = "") {
  if (Array.isArray(value)) return value.map((v) => asTheScreenReads(v));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, asTheScreenReads(v, k)])
    );
  }
  const time =
    TIME_FIELD.test(key) && typeof value === "string" && WEB_TIME.exec(value);
  if (!time) return value;
  const [hours, minutes, seconds, ms] = time.slice(1).map(Number);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + ms;
}

/**
 * A name as camps type it (API-1.25): letters and digits only, lower case, with "&" and "+" read as
 * "and". The import's foldName and Apex's IncomingBatch.fold are the same rule; all three pass
 * ShoreshRuleExamples.json's foldedNames.
 */
function foldName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&|\+/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

module.exports = { changedSince, refused, asTheScreenReads, foldName };
