const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
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

  it("full: look-alike paths inside force-app, scripts or .github", () => {
    for (const f of [
      "force-app/main/default/classes/docs/X.cls",
      "nested/docs/x.cls",
      "force-app/main/default/classes/README.md",
      "force-app/main/default/classes/lwc/X.cls",
      "force-app/main/default/objects/lwc/fields/X__c.field-meta.xml",
      "force-app/main/default/classes/jest/X.cls",
      "force-app/main/default/classes/NOTICE",
      "force-app/prototypes/X.cls",
      "scripts/jest.config.js",
      "NOTICE.cls",
      "jest.config.js.cls",
      "scripts/.claude/x.js",
      "scripts/x.md.js",
      ".github/pull_request_template.md"
    ]) {
      expect([f, category([f])]).toEqual([f, "full"]);
    }
  });
});

describe("ci-pr-category, run on a git repository", () => {
  const script = path.join(__dirname, "..", "ci-pr-category.js");
  let dir;
  const git = (...args) =>
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
      { cwd: dir, stdio: "pipe" }
    );
  const write = (f, text = "x") => {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  };
  const run = (base) =>
    execFileSync("node", [script, base], {
      cwd: dir,
      encoding: "utf8",
      stdio: "pipe"
    });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-pr-category-"));
    git("init", "-q", "-b", "main");
    write("force-app/main/default/classes/A.cls", "class A {}");
    git("add", "-A");
    git("commit", "-qm", "base");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("switch", "-qc", "pr");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("an unknown base branch gives full", () => {
    write("docs/a.md");
    git("add", "-A");
    git("commit", "-qm", "docs");
    expect(run("no-such-branch")).toMatch(
      /^category=full\nreason=could not list the changed files/
    );
  });

  it("only what the pull request changed counts, not later changes on the base", () => {
    write("docs/a.md");
    git("add", "-A");
    git("commit", "-qm", "docs");
    git("switch", "-q", "main");
    write("force-app/main/default/classes/B.cls", "class B {}");
    git("add", "-A");
    git("commit", "-qm", "apex on main");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
    git("switch", "-q", "pr");
    expect(run("main")).toMatch(/^category=docs\n/);
  });

  it("moving an Apex class into docs/ counts the class it moved", () => {
    fs.mkdirSync(path.join(dir, "docs"));
    git("mv", "force-app/main/default/classes/A.cls", "docs/A.cls");
    git("commit", "-qm", "move");
    expect(run("main")).toMatch(
      /^category=full\nreason=.*force-app\/main\/default\/classes\/A\.cls/
    );
  });
});
