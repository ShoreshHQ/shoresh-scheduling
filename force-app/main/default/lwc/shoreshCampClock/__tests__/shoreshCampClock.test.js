import { campZone, setCampZone } from "c/shoreshCampClock";
import { nameDaysFor } from "c/shoreshImportEngine";

describe("c-shoresh-camp-clock", () => {
  afterEach(() => setCampZone(null));

  it("CORE-6.11: a time is said on the camp's clock once its season is read, and on this computer's when the camp has none", () => {
    const at = "2026-10-18T18:40:00.000Z";
    const said = () =>
      new Date(at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: campZone()
      });
    nameDaysFor({ season: {}, campTimeZone: "America/Los_Angeles" });
    expect(said()).toBe("Oct 18, 11:40 AM");
    nameDaysFor({ season: {}, campTimeZone: "America/New_York" });
    expect(said()).toBe("Oct 18, 2:40 PM");
    nameDaysFor({ season: {} });
    expect(campZone()).toBeUndefined();
  });
});
