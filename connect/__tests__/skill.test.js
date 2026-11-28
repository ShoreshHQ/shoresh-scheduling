/**
 * The skill a camp's AI reads (connect/skill/, docs/protocol/api/connector.md): it may name only
 * tools the connector has and rule IDs the protocol has, so it can't drift from either.
 */
const fs = require("fs");
const path = require("path");
const { CAPABILITIES } = require("../capabilities");
const { protocolIndex } = require("../../scripts/protocol-index.js");

const SKILL = path.join(__dirname, "../skill");

/** Every file in the skill folder, { path from connect/skill: its text }. */
function skillTexts(dir = SKILL, out = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) skillTexts(full, out);
    else out[path.relative(SKILL, full)] = fs.readFileSync(full, "utf8");
  }
  return out;
}

const TOOLS = new Set(CAPABILITIES.map((c) => c.name));
// The few input and answer field names the skill names that aren't tools, each checked to be one
// a tool really takes or says. Anything else snake_case must be a tool, so a misspelt tool fails.
const FIELDS = new Set(["open_questions"]);
const INPUTS = new Set(
  CAPABILITIES.flatMap((c) => Object.keys(c.inputSchema.properties || {}))
);
// The first word of every tool (read, change, list…): a hyphenated word starting with one, three
// words or more, is a tool written with hyphens.
const VERBS = new Set([...TOOLS].map((t) => t.split("_")[0]));

/**
 * What a text names that isn't there: every snake_case word must be a tool or on FIELDS, a tool
 * written with hyphens (`read-week-checks`, in backticks or looking like one) is named, and every
 * rule ID ("CORE-6.1", or a range "CORE-1.1 to CORE-1.39" or "CORE-1.1 to 1.39", both ends) one
 * the protocol has.
 */
function unknownNames(text, ids) {
  const unknown = [];
  for (const [word] of text.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)) {
    if (!TOOLS.has(word) && !FIELDS.has(word)) unknown.push(word);
  }
  for (const m of text.matchAll(/(`?)\b([a-z]+(?:-[a-z]+)+)\b(`?)/g)) {
    const [, open, word, close] = m;
    const parts = word.split("-");
    if (
      (open && close) ||
      TOOLS.has(parts.join("_")) ||
      (VERBS.has(parts[0]) && parts.length >= 3)
    )
      unknown.push(word);
  }
  const range =
    /\b([A-Z]+)-(\d+)\.(\d+)\b(?: to (?:([A-Z]+)-)?(?:(\d+)\.(\d+)))?/g;
  for (const m of text.matchAll(range)) {
    const [, prefix, layer, n, toPrefix, toLayer, toN] = m;
    const named = [`${prefix}-${layer}.${n}`];
    if (toN) named.push(`${toPrefix || prefix}-${toLayer}.${toN}`);
    for (const id of named) if (!ids.has(id)) unknown.push(id);
  }
  // A rule written loosely ("ELECT-2.x") names no rule.
  for (const [loose] of text.matchAll(/\b[A-Z]+-\d+\.[a-z]\b/g)) {
    unknown.push(loose);
  }
  return unknown;
}

// API-1.163
describe("the Shoresh skill", () => {
  const texts = skillTexts();
  const ids = new Set(protocolIndex().map((s) => s.id));

  it("namesOnlyRealToolsAndRules: every tool the skill names is in capabilities.js and every rule ID in the protocol", () => {
    expect(Object.keys(texts).length).toBeGreaterThan(1);
    for (const [file, text] of Object.entries(texts)) {
      expect([file, unknownNames(text, ids)]).toEqual([file, []]);
    }
  });

  it("catchesAMissingName: a misspelt tool, a tool's input that isn't on the list, a hyphenated tool, a rule ID or a range end that isn't there is named", () => {
    const known = new Set(["CORE-6.1", "CORE-1.1"]);
    expect(
      unknownNames(
        "Use `read_week_checks`, `open_questions`, `read_week_check`, `from_week`, `read-week-checks`, read-week-draft, `rainy-day` and a look-alike or one-off (CORE-6.1, CORE-9.99, CORE-1.1 to 1.99, ELECT-2.x).",
        known
      )
    ).toEqual([
      "read_week_check",
      "from_week",
      "read-week-checks",
      "read-week-draft",
      "rainy-day",
      "CORE-9.99",
      "CORE-1.99",
      "ELECT-2.x"
    ]);
  });

  it("listsOnlyRealFields: every field name the skill may name is one a tool really takes", () => {
    for (const field of FIELDS)
      expect([field, INPUTS.has(field)]).toEqual([field, true]);
  });

  it("isAnAgentSkill: SKILL.md's header has the open format's fields only, its name the folder's", () => {
    const folders = fs.readdirSync(SKILL);
    expect(folders).toEqual(["shoresh-camp-scheduling"]);
    const skill = texts[path.join("shoresh-camp-scheduling", "SKILL.md")];
    const [, header] = /^---\n([\s\S]*?)\n---\n/.exec(skill);
    const fields = [...header.matchAll(/^([a-z-]+):/gm)].map((m) => m[1]);
    expect(
      fields.filter(
        (f) =>
          ![
            "name",
            "description",
            "license",
            "compatibility",
            "metadata",
            "allowed-tools"
          ].includes(f)
      )
    ).toEqual([]);
    expect(/^name: (.+)$/m.exec(header)[1]).toBe("shoresh-camp-scheduling");
    const description = /^description: >-\n((?: {2}.*\n?)+)/m
      .exec(header)[1]
      .replace(/\s+/g, " ")
      .trim();
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
    // Kept small: SKILL.md under 500 lines, every file it points to one level down and there.
    expect(skill.split("\n").length).toBeLessThan(500);
    for (const [, link] of skill.matchAll(/\]\(([^)]+\.md)\)/g)) {
      expect([
        link,
        fs.existsSync(path.join(SKILL, "shoresh-camp-scheduling", link))
      ]).toEqual([link, true]);
    }
  });

  it("namesMadeUpCampsOnly: every camp a worked example names is marked made up", () => {
    for (const [file, text] of Object.entries(texts)) {
      // Camp Setup is a screen, not a camp.
      for (const [camp] of text.matchAll(
        /\bCamp (?!Setup)[A-Z]\w+(?: [A-Z]\w+)*/g
      )) {
        expect([file, camp, text.includes(`${camp} (made up)`)]).toEqual([
          file,
          camp,
          true
        ]);
      }
    }
  });
});
