const fs = require("fs");
const path = require("path");
const { select, EXAMPLES_READ_BY } = require("../ci-apex-tests");

const DIR = "force-app/main/default/classes";

// A small camp of classes: electives on one side, the week editor on the other.
const CLASSES = {
  ElectiveClear: "public class ElectiveClear { }",
  AgentElectives:
    "public class AgentElectives { void a() { ElectiveClear.run(); } }",
  ElectiveClearTest:
    "@IsTest private class ElectiveClearTest { @IsTest static void t() { new ElectiveClear(); } }",
  AgentElectivesTest:
    "@IsTest private class AgentElectivesTest { @IsTest static void t() { agentelectives.go(); } }",
  AgentCell: "public class AgentCell { }",
  AgentCellTest:
    "@IsTest private class AgentCellTest { @IsTest static void t() { AgentCell c; } }",
  // Names in comments and strings are not uses.
  UnrelatedTest:
    "@IsTest private class UnrelatedTest { // ElectiveClear\n @IsTest static void t() { String s = 'AgentElectives'; } }",
  ShoreshTestData: "@IsTest public class ShoreshTestData { }",
  CellExamplesTest:
    "@IsTest private class CellExamplesTest { @IsTest static void t() { } }"
};

describe("ci-apex-tests", () => {
  it("an electives change runs the tests that reach it, directly or through other classes", () => {
    const r = select([`${DIR}/ElectiveClear.cls`], CLASSES);
    expect(r.tests).toEqual(["AgentElectivesTest", "ElectiveClearTest"]);
    expect(r.why).toContain(
      "AgentElectivesTest <- AgentElectives <- ElectiveClear"
    );
  });

  it("a changed test class runs itself; docs and plain screens add nothing", () => {
    expect(
      select(
        [
          `${DIR}/AgentCellTest.cls`,
          `${DIR}/AgentCellTest.cls-meta.xml`,
          "docs/ci-setup.md",
          "force-app/main/default/lwc/campSetupGrid/campSetupGrid.js"
        ],
        CLASSES
      ).tests
    ).toEqual(["AgentCellTest"]);
  });

  it("a screen Apex repeats runs its Apex class's tests", () => {
    expect(
      select(
        ["force-app/main/default/lwc/shoreshWeekEditor/shoreshWeekEditor.js"],
        CLASSES
      ).tests
    ).toEqual(["AgentCellTest"]);
  });

  it("shared examples run the Apex test that reads them, and only it; other static resources add nothing", () => {
    for (const f of [
      "force-app/main/default/staticresources/ShoreshCellExamples.json",
      "force-app/main/default/staticresources/ShoreshCellExamples.resource-meta.xml"
    ]) {
      const r = select([f], CLASSES);
      expect([r.tests, r.reason]).toEqual([
        ["CellExamplesTest"],
        "1 test class reach CellExamplesTest"
      ]);
    }
    expect(
      select(
        ["force-app/main/default/staticresources/ShoreshConnect/manifest.json"],
        CLASSES
      ).tests
    ).toEqual([]);
  });

  it("names every Apex class that reads a static resource, by the resource it reads", () => {
    const dir = path.join(__dirname, "../../", DIR);
    const read = {};
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".cls"))) {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      for (const m of source.matchAll(
        /FROM\s+StaticResource\s+WHERE\s+Name\s*=\s*'(\w+)'/gi
      )) {
        read[m[1]] = file.slice(0, -4);
      }
    }
    expect(Object.keys(read).length).toBeGreaterThan(0);
    expect(read).toEqual(EXAMPLES_READ_BY);
  });

  it("a test data builder runs everything", () => {
    const r = select(
      [`${DIR}/ElectiveClear.cls`, `${DIR}/ShoreshTestData.cls`],
      CLASSES
    );
    expect(r.tests).toBe("all");
    expect(r.reason).toContain("ShoreshTestData");
  });

  it.each([
    "force-app/main/default/triggers/WeekTrigger.trigger",
    "force-app/main/default/objects/Week__c/fields/StartDate__c.field-meta.xml",
    "force-app/main/default/permissionsets/Shoresh_Scheduler.permissionset-meta.xml",
    "sfdx-project.json",
    ".github/workflows/ci.yml",
    "scripts/ci-apex-tests.js",
    "package.json"
  ])("%s runs everything", (file) => {
    expect(select([`${DIR}/AgentCell.cls`, file], CLASSES).tests).toBe("all");
  });

  it("no changed files runs everything", () => {
    expect(select([], CLASSES).tests).toBe("all");
  });

  it("more than 40 test classes runs everything", () => {
    const many = { Core: "public class Core { }" };
    for (let i = 0; i < 41; i++) {
      many[`T${i}Test`] =
        `@IsTest private class T${i}Test { @IsTest static void t() { Core c; } }`;
    }
    const r = select([`${DIR}/Core.cls`], many);
    expect(r.tests).toBe("all");
    expect(r.reason).toContain("41 test classes");
  });
});
