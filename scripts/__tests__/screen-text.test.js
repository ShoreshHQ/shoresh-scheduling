/**
 * CORE-6.6: screen text never shows a record Id or an API field name (`__c`). Read from the
 * screens' templates (their text and the attributes a person sees or hears) and the engine's
 * words file (the sentences it shows), so a machine name can't reach a camp director.
 */
const fs = require("fs");
const path = require("path");

const LWC = path.resolve(__dirname, "../../force-app/main/default/lwc");

// A Salesforce record Id: 15 or 18 letters and digits, starting with a key prefix
// (three characters, the first a digit or a lowercase letter followed by a digit).
const RECORD_ID = /\b[0-9a-z][0-9][0-9A-Za-z]{13}(?:[0-9A-Za-z]{3})?\b/;
const FIELD_NAME = /\w__c\b/i;
const SEEN_ATTRIBUTES = [
  "title",
  "label",
  "aria-label",
  "alternative-text",
  "placeholder",
  "message"
];

function files(dir, test) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : files(full, test);
    }
    return test(entry.name) ? [full] : [];
  });
}

/** What a template shows: its text between tags and its seen attributes, bindings left out. */
function templateText(html) {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const texts = [...noComments.matchAll(/>([^<]+)</g)].map((m) => m[1]);
  const attrs = SEEN_ATTRIBUTES.flatMap((name) =>
    [...noComments.matchAll(new RegExp(`\\s${name}="([^"]*)"`, "g"))].map(
      (m) => m[1]
    )
  );
  return [...texts, ...attrs]
    .map((t) => t.replace(/\{[^}]*\}/g, " ").trim())
    .filter(Boolean);
}

/** The string and template literals a words file returns, ${...} parts left out. */
function literals(js) {
  const noComments = js
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return [...noComments.matchAll(/"([^"\n]*)"|`([^`]*)`/g)]
    .map((m) => (m[1] !== undefined ? m[1] : m[2]))
    .map((t) => t.replace(/\$\{[^}]*\}/g, " "));
}

function hits(texts) {
  return texts.filter((t) => RECORD_ID.test(t) || FIELD_NAME.test(t));
}

describe("CORE-6.6: no record Ids or field names on screen", () => {
  it("CORE-6.6: the checks find an Id and a field name, and pass plain words", () => {
    expect(hits(["Bunk 3 · a0B5e00000AbCdE"])).toHaveLength(1);
    expect(hits(["Set Priority__c first"])).toHaveLength(1);
    expect(hits(["No activity fits here", "Period 2"])).toHaveLength(0);
    expect(templateText('<p title="x {a}">Hi {b}</p>')).toEqual(["Hi", "x"]);
  });

  const templates = files(LWC, (name) => name.endsWith(".html"));

  it.each(templates.map((f) => [path.relative(LWC, f), f]))(
    "CORE-6.6: %s shows no record Id or field name",
    (name, file) => {
      expect(hits(templateText(fs.readFileSync(file, "utf8")))).toEqual([]);
    }
  );

  it("CORE-6.6: the engine's words show no record Id or field name", () => {
    const words = fs.readFileSync(
      path.join(LWC, "shoreshEngine/words.js"),
      "utf8"
    );
    expect(hits(literals(words))).toEqual([]);
  });
});
