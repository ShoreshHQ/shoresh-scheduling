/**
 * Every class a screen calls (an @AuraEnabled method) is opened to staff by the Shoresh Scheduler
 * permission set. A class left out works for the org admin and in Apex tests (Apex calling Apex
 * skips the class access check) but fails for a director with only the permission set: "Looks
 * right" on a guessed rule failed that way when SetupGuessesController was missing (#109).
 */
const fs = require("fs");
const path = require("path");
const { codeOf } = require("../apex-name-clash");

const ROOT = path.resolve(__dirname, "../..");
const CLASSES = path.join(ROOT, "force-app/main/default/classes");
const PERMISSION_SET = path.join(
  ROOT,
  "force-app/main/default/permissionsets/Shoresh_Scheduler.permissionset-meta.xml"
);
// An @AuraEnabled method (not a property or field): annotation, modifiers, type, name, "(".
const AURA_METHOD =
  /@AuraEnabled\s*(?:\([^)]*\))?\s*(?:(?:public|global|static)\s+)+[\w.<>,\s]+?\s+\w+\s*\(/i;

function screenClasses() {
  return fs
    .readdirSync(CLASSES)
    .filter((f) => f.endsWith(".cls"))
    .filter((f) =>
      AURA_METHOD.test(codeOf(fs.readFileSync(path.join(CLASSES, f), "utf8")))
    )
    .map((f) => f.replace(/\.cls$/, ""))
    .sort();
}

function openedClasses() {
  const xml = fs.readFileSync(PERMISSION_SET, "utf8");
  return [...xml.matchAll(/<apexClass>\s*(\w+)\s*<\/apexClass>/g)].map(
    (m) => m[1]
  );
}

describe("Shoresh Scheduler permission set", () => {
  it("finds the classes screens call", () => {
    expect(screenClasses()).toContain("SetupGuessesController");
  });

  it("opens every class a screen calls", () => {
    const opened = new Set(openedClasses());
    expect(screenClasses().filter((c) => !opened.has(c))).toEqual([]);
  });
});
