/**
 * scripts/protocol-index.js: every protocol statement ID is read, and the number a test names
 * may only go up (docs/protocol/README.md). Raise ENCODED_FLOOR when a change cites more.
 */
const { protocolIndex, counts } = require("../protocol-index.js");

const ENCODED_FLOOR = 338;

describe("the protocol's conformance index", () => {
  const statements = protocolIndex();

  it("reads every document's statements, each ID once", () => {
    const ids = statements.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const prefixes = new Set(ids.map((id) => id.split("-")[0]));
    expect([...prefixes].sort()).toEqual([
      "CLOSE",
      "CORE",
      "DIV",
      "ELECT",
      "GEN",
      "INGEST",
      "LOCK",
      "MEMO",
      "PROG",
      "PUB",
      "SPECIAL",
      "WEEK"
    ]);
  });

  it("never has fewer statements named by a test than the floor", () => {
    expect(counts(statements).ENCODED).toBeGreaterThanOrEqual(ENCODED_FLOOR);
  });

  it("reads an ID whole: one ID is not found inside a longer one", () => {
    // Built, not written, so this file names no ID itself.
    const short = statements.find((s) => s.id === ["CORE", "1.2"].join("-"));
    expect(
      short.citedBy.every((f) => !f.endsWith("shoreshCampSetup.test.js"))
    ).toBe(true);
  });
});
