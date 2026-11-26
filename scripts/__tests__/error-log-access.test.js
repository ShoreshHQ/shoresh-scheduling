/**
 * Who reads the Error Log (CORE-6.15, ADR 0030): only the permission set See error details,
 * read only, for a camp's admin. Every other permission set leaves it out, so a support code's
 * detail never reaches staff or an outside system.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(
  __dirname,
  "../../force-app/main/default/permissionsets"
);

describe("the Error Log's readers", () => {
  // CORE-6.15
  it("only See error details grants the Error Log (CORE-6.15), and only to read", () => {
    const granting = fs
      .readdirSync(DIR)
      .filter((f) =>
        fs.readFileSync(path.join(DIR, f), "utf8").includes("ErrorLog__c")
      );
    expect(granting).toEqual(["See_Error_Details.permissionset-meta.xml"]);
    const xml = fs.readFileSync(path.join(DIR, granting[0]), "utf8");
    for (const allowed of [
      "allowCreate",
      "allowEdit",
      "allowDelete",
      "modifyAllRecords",
      "viewAllRecords",
      "editable"
    ]) {
      expect([allowed, xml.includes(`<${allowed}>true`)]).toEqual([
        allowed,
        false
      ]);
    }
    expect(xml).toContain("<field>ErrorLog__c.Detail__c</field>");
    expect(xml).toContain("<field>ErrorLog__c.Person__c</field>");
  });
});
