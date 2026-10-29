/**
 * The API's web addresses and Flow actions (repo ADR 0024 choice 3; docs/protocol/api.md),
 * checked from the Apex classes themselves: each incoming capability is one class with one web
 * address of the shape /v1/<plain_name> and one Flow action of the same name.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "../../force-app/main/default/classes");
// API-1.1: what comes in, by its plain name.
const INCOMING = {
  IncomingCamper: "camper",
  IncomingCamperGroup: "camper_group",
  IncomingCamperElectiveChoice: "camper_elective_choice"
};

const source = (name) => fs.readFileSync(path.join(DIR, `${name}.cls`), "utf8");

describe("the API's addresses", () => {
  // API-1.4
  it("gives every web address the shape /v1/<plain_name>", () => {
    const addresses = fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith(".cls"))
      .flatMap((f) =>
        [
          ...fs
            .readFileSync(path.join(DIR, f), "utf8")
            .matchAll(/@RestResource\(\s*urlMapping\s*=\s*'([^']*)'/g)
        ].map((m) => m[1])
      );
    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) {
      expect(address).toMatch(/^\/v1\/[a-z]+(_[a-z]+)*$/);
    }
  });

  // API-1.1, API-1.3: one class per capability, reached by its web address and by a Flow
  // action of the same plain name, both handing over to the one shared logic.
  it("reaches each incoming capability by a web address and a Flow action of one name", () => {
    for (const [cls, name] of Object.entries(INCOMING)) {
      const text = source(cls);
      expect([cls, text.match(/urlMapping='([^']*)'/)[1]]).toEqual([
        cls,
        `/v1/${name}`
      ]);
      const action = text.match(/@InvocableMethod\(\s*label='([^']*)'/);
      expect([cls, action && action[1]]).toEqual([cls, name]);
      expect(text).toContain("IncomingDoors.byFlow(");
      expect(text).toContain("IncomingDoors.byWeb(");
    }
  });

  // API-1.5: no jargon in what a camp or developer reads.
  it("says nothing in jargon", () => {
    for (const cls of [
      ...Object.keys(INCOMING),
      "IncomingCamperPlan",
      "IncomingCamperGroupPlan",
      "IncomingElectiveChoicePlan",
      "IncomingBatch",
      "IncomingSeason",
      "IncomingSave",
      "IncomingDoors",
      "IncomingCampers",
      "IncomingResult"
    ]) {
      const said = [...source(cls).matchAll(/'((?:[^'\\]|\\.)*)'/g)]
        .map((m) => m[1])
        .join(" ");
      expect([
        cls,
        said.match(/\b(resource|payload|entity|idempoten\w*)\b/i)
      ]).toEqual([cls, null]);
    }
  });
});
