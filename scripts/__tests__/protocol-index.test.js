/**
 * scripts/protocol-index.js: every protocol statement ID is read, each is proved only by a test
 * that names it and asserts, every test a Test column names exists, and each statement proved
 * stays proved, and the number proved may only go up, so a deleted statement is seen too
 * (docs/protocol/README.md). A new statement needs its test, or a line in NOT_PROVED; raise
 * ENCODED_FLOOR when a change proves more.
 */
const {
  protocolIndex,
  counts,
  testsIn,
  proves,
  missingTests
} = require("../protocol-index.js");

const ENCODED_FLOOR = 519;

// Built, not written, so this file names no ID itself.
const ID = ["LOCK", "4.3"].join("-");
// The only statements no test proves yet.
const NOT_PROVED = [["PROG", "1.1"].join("-")];

describe("the protocol's conformance index", () => {
  const statements = protocolIndex();

  it("reads every document's statements, each ID once", () => {
    const ids = statements.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const prefixes = new Set(ids.map((id) => id.split("-")[0]));
    expect([...prefixes].sort()).toEqual([
      "API",
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

  it("never has fewer statements proved by a test than the floor, so deleting one is seen", () => {
    expect(counts(statements).ENCODED).toBeGreaterThanOrEqual(ENCODED_FLOOR);
  });

  it("names every statement no test proves, so one can't quietly take another's place", () => {
    expect(
      statements.filter((s) => s.status !== "ENCODED").map((s) => s.id)
    ).toEqual(NOT_PROVED);
  });

  it("finds every test a Test column names", () => {
    const missing = statements
      .filter((s) => s.missing.length)
      .map((s) => `${s.id}: ${s.missing.join(", ")}`);
    expect(missing).toEqual([]);
  });

  it("reads an ID whole: one ID is not found inside a longer one", () => {
    const short = statements.find((s) => s.id === ["CORE", "1.2"].join("-"));
    expect(
      short.citedBy.every((f) => !f.includes("shoreshCampSetup.test.js"))
    ).toBe(true);
  });
});

describe("what proves a statement", () => {
  const jest = (source) => testsIn("a/b.test.js", source);
  const apex = (source) => testsIn("a/BTest.cls", source);
  const proved = (tests) => tests.some((t) => proves(t, ID));

  it("an it with the ID in the comment directly above, or its title, that expects", () => {
    expect(
      proved(jest(`// ${ID}\nit("refuses", () => {\n  expect(1).toBe(1);\n});`))
    ).toBe(true);
    expect(
      proved(jest(`it("${ID}: refuses", () => {\n  expect(1).toBe(1);\n});`))
    ).toBe(true);
  });

  it("every it inside a describe with the ID above it", () => {
    const tests = jest(
      `// ${ID}\ndescribe("locks", () => {\n  it("one", () => {\n    expect(1).toBe(1);\n  });\n});\n` +
        `it("outside", () => {\n  expect(1).toBe(1);\n});`
    );
    expect(tests.filter((t) => proves(t, ID)).map((t) => t.name)).toEqual([
      "one"
    ]);
  });

  it("an Apex method with the ID above @IsTest, that asserts", () => {
    expect(
      proved(
        apex(
          `@IsTest\nprivate class BTest {\n  // ${ID}\n  @IsTest\n  static void refused() {\n    Assert.isTrue(true);\n  }\n}`
        )
      )
    ).toBe(true);
  });

  it("not a gutted test: one that asserts nothing", () => {
    expect(proved(jest(`// ${ID}\nit("refuses", () => {});`))).toBe(false);
    expect(
      proved(
        apex(
          `@IsTest\nprivate class BTest {\n  // ${ID}\n  @IsTest\n  static void refused() {\n  }\n}`
        )
      )
    ).toBe(false);
  });

  it("not a skipped test, or one in a skipped describe", () => {
    const ok = `() => {\n  expect(1).toBe(1);\n}`;
    expect(proved(jest(`// ${ID}\nit.skip("refuses", ${ok});`))).toBe(false);
    expect(
      proved(
        jest(
          `// ${ID}\ndescribe.skip("locks", () => {\n  it("one", ${ok.replace(/\n/g, "\n  ")});\n});`
        )
      )
    ).toBe(false);
  });

  it("not one whose only assert is commented out, or after its own body", () => {
    expect(
      proved(
        jest(`// ${ID}\nit("refuses", () => {\n  // expect(1).toBe(1);\n});`)
      )
    ).toBe(false);
    expect(
      proved(
        jest(
          `// ${ID}\nit("refuses", () => {\n  run();\n});\nafterEach(() => {\n  expect(1).toBe(1);\n});`
        )
      )
    ).toBe(false);
    expect(
      proved(
        apex(
          `@IsTest\nprivate class BTest {\n  // ${ID}\n  @IsTest\n  static void refused() {\n    run();\n  }\n  static void run() {\n    Assert.isTrue(true);\n  }\n}`
        )
      )
    ).toBe(false);
  });

  it("a one-line describe covers nothing after it", () => {
    const tests = jest(
      `// ${ID}\ndescribe.each(cases)("%s", run);\nit("other", () => {\n  expect(1).toBe(1);\n});`
    );
    expect(tests.some((t) => proves(t, ID))).toBe(false);
  });

  it("not a comment-only citation: a file header, a test's body, or a comment a line apart", () => {
    const body = `it("refuses", () => {\n  expect(1).toBe(1);\n});`;
    expect(proved(jest(`/**\n * ${ID}\n */\nconst x = 1;\n\n${body}`))).toBe(
      false
    );
    expect(
      proved(
        jest(`it("refuses", () => {\n  // ${ID}\n  expect(1).toBe(1);\n});`)
      )
    ).toBe(false);
    expect(proved(jest(`// ${ID}\n\n${body}`))).toBe(false);
    expect(
      proved(
        apex(
          `/** ${ID} */\n@IsTest\nprivate class BTest {\n  @IsTest\n  static void refused() {\n    Assert.isTrue(true);\n  }\n}`
        )
      )
    ).toBe(false);
  });
});

describe("a Test column's names", () => {
  const tests = [
    ...testsIn(
      "force-app/main/default/classes/GeneratedLocksTest.cls",
      "@IsTest\nprivate class GeneratedLocksTest {\n  @IsTest\n  static void aBuildIsRefused() {\n    Assert.isTrue(true);\n  }\n}"
    ),
    ...testsIn(
      "force-app/x/__tests__/rules.test.js",
      'it("never repeats an activity in a day", () => {\n  expect(1).toBe(1);\n});\n' +
        'it.each([["a"]])("rule 1: a bunk %s on Wednesday", () => {\n  expect(1).toBe(1);\n});'
    )
  ];

  it("are found when they exist, either way an Apex method is written", () => {
    expect(
      missingTests(
        'Apex GeneratedLocksTest aBuildIsRefused; GeneratedLocksTest.aBuildIsRefused; Jest rules: "never repeats an…"; "rule 1: a bunk off / on a trip on Wednesday"',
        tests
      )
    ).toEqual([]);
  });

  it("are missing when renamed or deleted", () => {
    expect(
      missingTests(
        'Apex GeneratedLocksTest aBuildWasRefused; GoneTest; rules.test.js; Jest "never repeats a group"',
        tests
      )
    ).toEqual([
      "GeneratedLocksTest aBuildWasRefused",
      "GoneTest",
      "never repeats a group"
    ]);
  });
});
