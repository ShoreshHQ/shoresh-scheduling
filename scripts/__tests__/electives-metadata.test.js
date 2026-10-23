/**
 * The electives data (repo ADR 0018), checked from the metadata itself:
 * - the Shoresh Scheduler permission set opens every elective object and field (Greg, decision
 *   48.1: only admins use Shoresh, so there is no second, electives-only permission set);
 * - every lookup that matters refuses deleting what it points at (delete protection);
 * - nothing stores an opt-out (decision 48.3, amended 2026-10-22), and what a camper's record
 *   holds carries Salesforce's data classification;
 * - field history stays off on every elective object.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const OBJECTS = path.join(ROOT, "force-app/main/default/objects");
const PERMISSION_SETS = path.join(
  ROOT,
  "force-app/main/default/permissionsets"
);
const SCHEDULER = path.join(
  PERMISSION_SETS,
  "Shoresh_Scheduler.permissionset-meta.xml"
);

const ELECTIVE_OBJECTS = [
  "ElectiveSet__c",
  "Offering__c",
  "LinkedChoice__c",
  "LinkedChoiceTime__c",
  "Camper__c",
  "ElectiveRun__c",
  "Preference__c",
  "Assignment__c"
];

// Lookups that never protect anything: copy links, a new version's link back, and a user.
const NOT_RESTRICT = new Set([
  "ElectiveSet__c.CopiedFrom__c",
  "Offering__c.CopiedFrom__c",
  "LinkedChoice__c.CopiedFrom__c",
  "ElectiveRun__c.NewVersionOf__c",
  "ElectiveRun__c.FinalizedBy__c"
]);

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
}

function fieldsOf(object) {
  const dir = path.join(OBJECTS, object, "fields");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".field-meta.xml"))
    .map((f) => {
      const xml = fs.readFileSync(path.join(dir, f), "utf8");
      return {
        name: `${object}.${tag(xml, "fullName")}`,
        type: tag(xml, "type"),
        required: tag(xml, "required") === "true",
        deleteConstraint: tag(xml, "deleteConstraint"),
        classification: tag(xml, "securityClassification")
      };
    });
}

function granted() {
  const xml = fs.readFileSync(SCHEDULER, "utf8");
  const fields = new Map();
  for (const m of xml.matchAll(
    /<fieldPermissions>([\s\S]*?)<\/fieldPermissions>/g
  )) {
    fields.set(tag(m[1], "field"), {
      editable: tag(m[1], "editable") === "true",
      readable: tag(m[1], "readable") === "true"
    });
  }
  const objects = new Map();
  for (const m of xml.matchAll(
    /<objectPermissions>([\s\S]*?)<\/objectPermissions>/g
  )) {
    objects.set(tag(m[1], "object"), {
      create: tag(m[1], "allowCreate") === "true",
      read: tag(m[1], "allowRead") === "true",
      edit: tag(m[1], "allowEdit") === "true",
      del: tag(m[1], "allowDelete") === "true",
      viewAll: tag(m[1], "viewAllRecords") === "true",
      modifyAll: tag(m[1], "modifyAllRecords") === "true"
    });
  }
  return { fields, objects };
}

// Master-detail and required fields are always readable and editable; Salesforce refuses field
// permissions for them. Keys are filled by triggers and never set by a screen.
function needsPermission(field) {
  return (
    field.type !== "MasterDetail" &&
    !field.required &&
    !field.name.endsWith(".Key__c")
  );
}

describe("electives data", () => {
  it("has all eight objects", () => {
    for (const object of ELECTIVE_OBJECTS) {
      expect(fs.existsSync(path.join(OBJECTS, object))).toBe(true);
    }
  });

  it("opens every elective object fully to the Shoresh Scheduler permission set", () => {
    const { objects } = granted();
    for (const object of ELECTIVE_OBJECTS) {
      expect([object, objects.get(object)]).toEqual([
        object,
        {
          create: true,
          read: true,
          edit: true,
          del: true,
          viewAll: false,
          modifyAll: false
        }
      ]);
    }
  });

  it("lets the scheduler read and edit every elective field", () => {
    const { fields } = granted();
    const missing = ELECTIVE_OBJECTS.flatMap(fieldsOf)
      .filter(needsPermission)
      .map((f) => f.name)
      .concat(["Coverage__c.LinkedChoice__c"])
      .filter((name) => {
        const p = fields.get(name);
        return !p || !p.readable || !p.editable;
      });
    expect(missing).toEqual([]);
  });

  it("has no separate electives permission set (decision 48.1)", () => {
    expect(fs.readdirSync(PERMISSION_SETS)).toEqual([
      "Shoresh_Scheduler.permissionset-meta.xml"
    ]);
  });

  it("refuses deleting anything a set, offering, linked choice, run, choice or seat points at", () => {
    const loose = ELECTIVE_OBJECTS.flatMap(fieldsOf)
      .concat(fieldsOf("Coverage__c"))
      .filter((f) => f.type === "Lookup" && !NOT_RESTRICT.has(f.name))
      .filter((f) => f.deleteConstraint !== "Restrict")
      .map((f) => f.name);
    expect(loose).toEqual([]);
  });

  it("stores no opt-out anywhere (decision 48.3)", () => {
    const optOuts = fs
      .readdirSync(OBJECTS)
      .filter((o) => fs.existsSync(path.join(OBJECTS, o, "fields")))
      .flatMap(fieldsOf)
      .map((f) => f.name)
      .filter((name) => /opt.?out/i.test(name));
    expect(optOuts).toEqual([]);
  });

  it("classifies what a camper's record holds", () => {
    const byName = new Map(fieldsOf("Camper__c").map((f) => [f.name, f]));
    expect(byName.get("Camper__c.CamperNumber__c").classification).toBe(
      "Confidential"
    );
    expect(byName.get("Camper__c.ParentComments__c").classification).toBe(
      "Restricted"
    );
    const camper = fs.readFileSync(
      path.join(OBJECTS, "Camper__c/Camper__c.object-meta.xml"),
      "utf8"
    );
    expect(tag(camper, "securityClassification")).toBe("Confidential");
  });

  it("keeps field history off on every elective object", () => {
    for (const object of ELECTIVE_OBJECTS) {
      const xml = fs.readFileSync(
        path.join(OBJECTS, object, `${object}.object-meta.xml`),
        "utf8"
      );
      expect([object, tag(xml, "enableHistory")]).toEqual([object, "false"]);
    }
  });
});
