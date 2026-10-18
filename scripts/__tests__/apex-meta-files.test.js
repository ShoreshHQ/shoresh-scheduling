const fs = require("fs");
const os = require("os");
const path = require("path");
const { check } = require("../apex-meta-files");

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apex-meta-"));
  for (const file of files) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "");
  }
  return root;
}

const CLASSES = "force-app/main/default/classes";
const TRIGGERS = "force-app/main/default/triggers";

describe("Apex -meta.xml check", () => {
  it("passes when every class and trigger has its -meta.xml", () => {
    const root = repo([
      `${CLASSES}/Weeks.cls`,
      `${CLASSES}/Weeks.cls-meta.xml`,
      `${TRIGGERS}/WeekTrigger.trigger`,
      `${TRIGGERS}/WeekTrigger.trigger-meta.xml`
    ]);
    expect(check(root)).toEqual({ missing: [], orphans: [] });
  });

  it("finds a class added without its -meta.xml (#55)", () => {
    const root = repo([
      `${CLASSES}/Weeks.cls`,
      `${CLASSES}/Weeks.cls-meta.xml`,
      `${CLASSES}/OtherProgramUse.cls`,
      `${TRIGGERS}/WeekTrigger.trigger`
    ]);
    expect(check(root).missing).toEqual([
      `${CLASSES}/OtherProgramUse.cls`,
      `${TRIGGERS}/WeekTrigger.trigger`
    ]);
  });

  it("finds a -meta.xml left behind by a deleted or renamed class", () => {
    const root = repo([
      `${CLASSES}/Targets.cls-meta.xml`,
      `${TRIGGERS}/OldTrigger.trigger-meta.xml`
    ]);
    expect(check(root)).toEqual({
      missing: [],
      orphans: [
        `${CLASSES}/Targets.cls-meta.xml`,
        `${TRIGGERS}/OldTrigger.trigger-meta.xml`
      ]
    });
  });

  it("passes on this repository", () => {
    expect(check()).toEqual({ missing: [], orphans: [] });
  });
});
