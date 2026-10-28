/**
 * The CORE protocol's data-model terms (docs/protocol/core.md, layer 1), checked from the
 * metadata itself: each record holds what the term's definition says it holds.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const OBJECTS = path.join(ROOT, "force-app/main/default/objects");

function field(object, name) {
  const file = path.join(OBJECTS, object, "fields", `${name}.field-meta.xml`);
  const xml = fs.readFileSync(file, "utf8");
  const tag = (t) => {
    const m = new RegExp(`<${t}>([^<]*)</${t}>`).exec(xml);
    return m ? m[1] : null;
  };
  const values = [
    ...xml.matchAll(/<value>\s*<fullName>([^<]*)<\/fullName>/g)
  ].map((m) => m[1]);
  return {
    type: tag("type"),
    referenceTo: tag("referenceTo"),
    required: tag("required") === "true",
    unique: tag("unique") === "true",
    values
  };
}

describe("CORE layer 1: terms in the data model", () => {
  // CORE-1.2
  it("CORE-1.2: a season has a start and end date, holds weeks, and can be history and copied", () => {
    expect(field("Season__c", "StartDate__c").type).toBe("Date");
    expect(field("Season__c", "EndDate__c").type).toBe("Date");
    expect(field("Week__c", "Season__c").referenceTo).toBe("Season__c");
    expect(field("Season__c", "Status__c").values).toContain("Finished");
    expect(field("Season__c", "CopiedFrom__c").referenceTo).toBe("Season__c");
  });

  // CORE-1.3
  it("CORE-1.3: a program has its own time blocks, its own divisions and its own days", () => {
    expect(field("TimeBlock__c", "Program__c")).toMatchObject({
      type: "MasterDetail",
      referenceTo: "Program__c"
    });
    expect(field("Division__c", "Program__c")).toMatchObject({
      type: "MasterDetail",
      referenceTo: "Program__c"
    });
    for (const day of [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday"
    ]) {
      expect(field("Program__c", `${day}__c`).type).toBe("Checkbox");
    }
  });

  // CORE-1.4
  it("CORE-1.4: a week is a dated stretch in a season, built and published per program", () => {
    expect(field("Week__c", "StartDate__c").type).toBe("Date");
    expect(field("Week__c", "EndDate__c").type).toBe("Date");
    expect(field("Week__c", "Season__c").referenceTo).toBe("Season__c");
    // What is built and published is one program's week.
    expect(field("Schedule__c", "Week__c").referenceTo).toBe("Week__c");
    expect(field("Schedule__c", "Program__c").referenceTo).toBe("Program__c");
  });

  // CORE-1.7
  it("CORE-1.7: a group is in exactly one division, at camp all day, mornings or afternoons", () => {
    expect(field("Group__c", "Division__c")).toMatchObject({
      type: "MasterDetail",
      referenceTo: "Division__c"
    });
    const availability = field("Group__c", "Availability__c");
    expect(availability.required).toBe(true);
    expect(availability.values).toEqual([
      "AllDay",
      "MorningOnly",
      "AfternoonOnly"
    ]);
  });

  // CORE-1.9
  it("CORE-1.9: a location carries a groups fit number", () => {
    expect(field("Location__c", "GroupsThatFit__c").type).toBe("Number");
    expect(field("Activity__c", "Location__c").referenceTo).toBe("Location__c");
  });

  // CORE-1.16
  it("CORE-1.16: of the camp's terms, only the special event is called an event", () => {
    const xml = fs.readFileSync(
      path.join(OBJECTS, "CampLabel__c/fields/ModelTerm__c.field-meta.xml"),
      "utf8"
    );
    const labels = [...xml.matchAll(/<label>([^<]*)<\/label>/g)].map(
      (m) => m[1]
    );
    expect(labels.filter((l) => /\bevents?\b/i.test(l))).toEqual([
      "Special event"
    ]);
  });

  // CORE-1.27
  it("CORE-1.27: a version is a saved copy of a program's week, with why it was saved", () => {
    expect(field("Schedule__c", "Status__c").values).toContain("Version");
    expect(field("Schedule__c", "VersionReason__c").values).toContain(
      "AutoSaved"
    );
    expect(field("Schedule__c", "SourceSchedule__c").referenceTo).toBe(
      "Schedule__c"
    );
  });

  // CORE-1.28
  it("CORE-1.28: one published version per program's week: the publish key is unique", () => {
    expect(field("Schedule__c", "Status__c").values).toContain("Published");
    expect(field("Schedule__c", "PublishKey__c")).toMatchObject({
      type: "Text",
      unique: true
    });
  });
});
