/**
 * The camp's Salesforce address (connect/camp.js): the namespace as Salesforce says it, every
 * action at its address with and without one (ADR 0024), and an older connector saying so.
 * No Salesforce here: the sf command line is a stand-in.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { campOf, tooOld, ownVersion, address } = require("../camp");
const { CAPABILITIES } = require("../capabilities");
const { call, check } = require("../client");

/**
 * A stand-in for `sf api request rest --include` in a camp whose Shoresh has the given namespace
 * and ships the given connector version: the query camp.js asks is answered as Salesforce answers
 * it, any other address 200 with {"message":"Done"}. Records each address asked.
 */
const campAnswering =
  (namespace, version, seen = []) =>
  async (args) => {
    const asked = args[3];
    seen.push(asked);
    const body = asked.startsWith("/services/data/")
      ? JSON.stringify({
          totalSize: 1,
          done: true,
          records: [
            {
              NamespacePrefix: namespace,
              Description: `Shoresh's connector for AI apps and the command line. Version ${version}.`
            }
          ]
        })
      : '{"message":"Done"}';
    return `HTTP/1.1 200\ncontent-type: application/json\n\n${body}`;
  };

describe("The camp's Salesforce address", () => {
  it("namespaceFromSalesforce: the namespace is the one Salesforce gives the package's own static resource, none where it has none", async () => {
    const asked = (namespace) => async () => ({
      status: 200,
      body: JSON.stringify({
        records: [
          { NamespacePrefix: namespace, Description: "Version 1.0.50." }
        ]
      })
    });
    expect(await campOf(asked("shoresh"))).toEqual({
      namespace: "shoresh",
      version: "1.0.50"
    });
    expect(await campOf(asked(null))).toEqual({
      namespace: "",
      version: "1.0.50"
    });
    // Nothing Salesforce can say (no Shoresh, or no answer): no namespace, no version.
    expect(
      await campOf(async () => ({ status: 200, body: '{"records":[]}' }))
    ).toEqual({ namespace: "", version: null });
    // Not read (refused, or no answer): asked again next time.
    expect(await campOf(async () => ({ status: 400, body: "[]" }))).toEqual({
      namespace: "",
      version: null,
      read: false
    });
  });

  it("everyActionAtItsAddress: each action's address carries the namespace when there is one", () => {
    for (const c of CAPABILITIES) {
      expect(address("", c.api)).toBe(`/services/apexrest/v1/${c.api}`);
      expect(address("shoresh", c.api)).toBe(
        `/services/apexrest/shoresh/v1/${c.api}`
      );
    }
    expect(address("shoresh", "week_checks", { season: "Summer 2026" })).toBe(
      "/services/apexrest/shoresh/v1/week_checks?season=Summer+2026"
    );
  });

  it("actionsAskTheNamespacedAddress: an action in a packaged camp asks Shoresh at its namespaced address, and one without at the plain one", async () => {
    for (const [namespace, at] of [
      ["shoresh", "/services/apexrest/shoresh/v1/"],
      [null, "/services/apexrest/v1/"]
    ]) {
      const seen = [];
      const done = await call(
        "publish_week",
        { season: "Summer 2026", week: "Week 1" },
        {
          camp: (org, asked) => campOf(asked),
          run: campAnswering(namespace, "1.0.1", seen)
        }
      );
      expect(done).toEqual({ ok: true, status: 200, text: "Done" });
      expect(seen[1]).toBe(`${at}publish_week`);
    }
    // The setup's test read too.
    const seen = [];
    await check({ run: campAnswering("shoresh", "1.0.1", seen) });
    expect(seen[1]).toBe("/services/apexrest/shoresh/v1/group_schedule");
  });

  it("olderConnectorSaysSo: a downloaded copy older than the camp's does nothing and says to download it again", async () => {
    expect(tooOld({ version: "1.0.50" }, "1.0.48")).toBe(
      "This copy of Shoresh's connector (1.0.48) is older than your camp's Shoresh (1.0.50), so nothing was done. Download it again from Settings in Shoresh."
    );
    expect(tooOld({ version: "1.0.50" }, "1.0.50")).toBeNull();
    expect(tooOld({ version: "1.0.9" }, "1.0.10")).toBeNull();
    expect(tooOld({ version: "2.0.0" }, "1.9.9")).not.toBeNull();
    // Run from the repo (no manifest), or a camp that doesn't say: nothing to compare.
    expect(tooOld({ version: "1.0.50" }, null)).toBeNull();
    expect(tooOld({ version: null }, "1.0.48")).toBeNull();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shoresh-"));
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ version: "1.0.48" })
    );
    expect(ownVersion(dir)).toBe("1.0.48");
    expect(ownVersion(path.join(dir, "none"))).toBeNull();
  });

  it("shipsItsVersion: the camp's static resource names the version its manifest has", () => {
    const resource = path.resolve(
      __dirname,
      "../../force-app/main/default/staticresources"
    );
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(resource, "ShoreshConnect/manifest.json"),
        "utf8"
      )
    );
    expect(
      fs.readFileSync(
        path.join(resource, "ShoreshConnect.resource-meta.xml"),
        "utf8"
      )
    ).toContain(`Version ${manifest.version}.`);
  });
});
