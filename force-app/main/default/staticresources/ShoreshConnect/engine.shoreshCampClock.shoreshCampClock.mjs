/**
 * The camp's clock (CORE-6.11): every time a screen says (an import, a version saved) is in the
 * camp's time zone, as its dates already are (MEMO-7.2), so one list never mixes two clocks. A
 * camp with no time zone set says it on the person's own Salesforce clock, the one Apex's CampClock
 * falls back to, so a version's name and the Published menu agree (word walk W6: they were three
 * hours apart on this computer's clock). Times already written into a saved version's name stay as
 * written.
 *
 * Held here rather than passed to every line that says a time: set each time a season is read
 * (c/shoreshImportEngine nameDaysFor, from the setup's campTimeZone), as c/shoreshDayNames is.
 * Apex's CampClock does the same for the server.
 */
const USER_ZONE = undefined;

let zone;

/** The camp's time zone ("America/New_York"); nothing given, the person's own Salesforce clock. */
export function setCampZone(timeZone) {
  zone = timeZone || undefined;
}

/** The zone to say a time in, for Intl and lightning-formatted-date-time's time-zone. */
export function campZone() {
  return zone || USER_ZONE || undefined;
}
