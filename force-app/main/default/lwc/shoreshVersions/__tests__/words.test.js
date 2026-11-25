import { metaOf } from "../words";

describe("c/shoreshVersions words", () => {
  it("says where a version came from in Shoresh's words", () => {
    expect(metaOf({ origin: "Manual", reason: "AutoSaved" }).meta).toBe(
      "Manual Build · Auto-saved"
    );
  });

  // CORE-6.18
  it("CORE-6.18: an origin Shoresh has no words for is left out, never shown as stored", () => {
    expect(
      metaOf({ origin: "ThroughSomethingNew", reason: "AutoSaved" }).meta
    ).toBe("Auto-saved");
    expect(metaOf({ origin: "ThroughSomethingNew" }).meta).toBe("");
  });
});
