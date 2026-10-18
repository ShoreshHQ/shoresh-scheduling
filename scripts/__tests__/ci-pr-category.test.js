const { categorize } = require("../ci-pr-category");

const category = (files) => categorize(files).category;

describe("ci-pr-category", () => {
  it("docs: files the test org never sees", () => {
    expect(
      category([
        "docs/ci-setup.md",
        "README.md",
        "CLAUDE.md",
        ".claude/agents/x.md",
        "prototypes/a/b.cls",
        "jest/namespace.js"
      ])
    ).toBe("docs");
  });

  it("screen: LWC bundles and static resources, with or without docs", () => {
    expect(
      category(["force-app/main/default/lwc/campSetup/campSetup.js"])
    ).toBe("screen");
    expect(
      category([
        "force-app/main/default/lwc/campSetup/__tests__/campSetup.test.js",
        "docs/a.md"
      ])
    ).toBe("screen");
    expect(
      category([
        "force-app/main/default/staticresources/SheetJS.resource-meta.xml"
      ])
    ).toBe("screen");
  });

  it("full: Apex, objects, fields, permission sets, tabs, apps", () => {
    for (const f of [
      "force-app/main/default/classes/Scheduler.cls",
      "force-app/main/default/triggers/WeekTrigger.trigger",
      "force-app/main/default/objects/Week__c/fields/StartDate__c.field-meta.xml",
      "force-app/main/default/permissionsets/Shoresh.permissionset-meta.xml",
      "force-app/main/default/tabs/Camp__c.tab-meta.xml",
      "force-app/main/default/applications/Shoresh.app-meta.xml",
      "force-app/main/default/flows/X.flow-meta.xml",
      "force-app/main/default/customMetadata/X.md-meta.xml"
    ]) {
      expect(category(["force-app/main/default/lwc/a/a.js", f])).toBe("full");
    }
  });

  it("full: CI, scripts, project and org config", () => {
    for (const f of [
      ".github/workflows/ci.yml",
      "scripts/run-apex-tests.mjs",
      "sfdx-project.json",
      "package.json",
      "package-lock.json",
      "config/project-scratch-def.json",
      ".forceignore"
    ]) {
      expect(category(["docs/a.md", f])).toBe("full");
    }
  });

  it("full when in doubt: unknown paths and an empty list", () => {
    expect(category(["something-new.txt"])).toBe("full");
    expect(category(["force-app/main/default/lwc.cls"])).toBe("full");
    expect(category([])).toBe("full");
  });

  it("names what made it full", () => {
    expect(categorize(["docs/a.md", "scripts/x.js"]).reason).toContain(
      "scripts/x.js"
    );
  });
});
