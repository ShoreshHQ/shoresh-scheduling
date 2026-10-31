/**
 * The API's access pieces (repo ADR 0024 choice 8; docs/protocol/api.md API-4.4), checked from
 * the permission sets themselves: one per capability and direction, plain-English names, each
 * reaching only what its capability needs, and none able to delete.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(
  __dirname,
  "../../force-app/main/default/permissionsets"
);

const PIECES = {
  Send_Divisions: ["Send divisions", "Division__c"],
  Send_Groups: ["Send groups", "Group__c"],
  Send_Activities: ["Send activities", "Activity__c"],
  Send_Campers: ["Send campers", "Camper__c"],
  Send_Camper_Groups: ["Send camper groups", "Preference__c"],
  Send_Elective_Choices: ["Send elective choices", "Preference__c"],
  Read_Group_Schedules: ["Read group schedules", null],
  Read_Activity_Schedules: ["Read activity schedules", null],
  Read_Elective_Offerings: ["Read elective offerings", null],
  Read_Elective_Seats: ["Read elective seats", null]
};

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
}

function read(name) {
  const xml = fs.readFileSync(
    path.join(DIR, `${name}.permissionset-meta.xml`),
    "utf8"
  );
  const blocks = (kind) =>
    [...xml.matchAll(new RegExp(`<${kind}>([\\s\\S]*?)</${kind}>`, "g"))].map(
      (m) => m[1]
    );
  return {
    xml,
    label: tag(xml, "label"),
    objects: blocks("objectPermissions").map((b) => ({
      object: tag(b, "object"),
      create: tag(b, "allowCreate") === "true",
      edit: tag(b, "allowEdit") === "true",
      del: tag(b, "allowDelete") === "true",
      all:
        tag(b, "viewAllRecords") === "true" ||
        tag(b, "modifyAllRecords") === "true"
    })),
    fields: blocks("fieldPermissions").map((b) => ({
      field: tag(b, "field"),
      editable: tag(b, "editable") === "true"
    }))
  };
}

describe("the API's access pieces", () => {
  // API-4.4
  it("has one permission set per capability and direction, named in plain English", () => {
    const onDisk = fs
      .readdirSync(DIR)
      .filter((f) => /^(Send|Read)_/.test(f))
      .map((f) => f.replace(".permissionset-meta.xml", ""))
      .sort();
    expect(onDisk).toEqual(Object.keys(PIECES).sort());
    for (const [name, [label]] of Object.entries(PIECES)) {
      expect([name, read(name).label]).toEqual([name, label]);
    }
  });

  // API-4.4
  it("lets a read piece change nothing and a send piece change only its one kind of record", () => {
    for (const [name, [, writes]] of Object.entries(PIECES)) {
      const set = read(name);
      const changed = set.objects
        .filter((o) => o.create || o.edit)
        .map((o) => o.object);
      expect([name, changed]).toEqual([name, writes ? [writes] : []]);
      const editableFields = set.fields
        .filter((f) => f.editable)
        .map((f) => f.field.split(".")[0]);
      expect([name, [...new Set(editableFields)]]).toEqual([
        name,
        writes ? [writes] : []
      ]);
    }
  });

  // API-4.4: nothing is deleted from outside, and no piece sees past sharing.
  it("lets no piece delete, or view or change all records", () => {
    for (const name of Object.keys(PIECES)) {
      const loose = read(name)
        .objects.filter((o) => o.del || o.all)
        .map((o) => o.object);
      expect([name, loose]).toEqual([name, []]);
    }
  });

  // API-4.4: no licence, so a camp can give it to an integration user.
  it("ties no piece to a licence", () => {
    for (const name of Object.keys(PIECES)) {
      expect([name, tag(read(name).xml, "license")]).toEqual([name, null]);
    }
  });

  it("keeps parent comments and hidden keys out of every piece", () => {
    for (const name of Object.keys(PIECES)) {
      const inside = read(name)
        .fields.map((f) => f.field)
        .filter((f) => /ParentComments__c|\.Key__c$/.test(f));
      expect([name, inside]).toEqual([name, []]);
    }
  });
  // API-4.7
  it("schedulerHoldsWhatEveryCapabilitySetGives: Shoresh Scheduler has every object and field access the capability sets give", () => {
    const scheduler = read("Shoresh_Scheduler");
    const objects = new Map(scheduler.objects.map((o) => [o.object, o]));
    const fields = new Map(scheduler.fields.map((f) => [f.field, f]));
    for (const name of Object.keys(PIECES)) {
      const piece = read(name);
      for (const o of piece.objects) {
        const has = objects.get(o.object);
        expect([name, o.object, !!has]).toEqual([name, o.object, true]);
        expect([name, o.object, has.create || !o.create]).toEqual([
          name,
          o.object,
          true
        ]);
        expect([name, o.object, has.edit || !o.edit]).toEqual([
          name,
          o.object,
          true
        ]);
      }
      for (const f of piece.fields) {
        const has = fields.get(f.field);
        expect([name, f.field, !!has && (has.editable || !f.editable)]).toEqual(
          [name, f.field, true]
        );
      }
    }
  });
});
