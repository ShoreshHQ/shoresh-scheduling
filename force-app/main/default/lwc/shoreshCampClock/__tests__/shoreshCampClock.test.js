import { campZone, setCampZone } from "c/shoreshCampClock";
import { nameDaysFor } from "c/shoreshImportEngine";
import { FIELD, PARENT } from "c/shoreshSchema";

/** A season as the setup hands it on, with its camp's time zone. */
const inZone = (zone) => ({
  season: { [PARENT.Season.Camp]: { [FIELD.Camp.TimeZone]: zone } }
});

describe("c-shoresh-camp-clock", () => {
  afterEach(() => setCampZone(null));

  it("CORE-6.11: a time is said on the camp's clock once its season is read, and on the person's own Salesforce clock when the camp has none", () => {
    const at = "2026-10-18T18:40:00.000Z";
    const said = () =>
      new Date(at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: campZone()
      });
    nameDaysFor(inZone("America/Los_Angeles"));
    expect(said()).toBe("Oct 18, 11:40 AM");
    nameDaysFor(inZone("America/New_York"));
    expect(said()).toBe("Oct 18, 2:40 PM");
    // As Apex's CampClock falls back (word walk W6): Jest's Salesforce user is in Los Angeles.
    nameDaysFor({ season: {} });
    expect(campZone()).toBe("America/Los_Angeles");
  });
});
