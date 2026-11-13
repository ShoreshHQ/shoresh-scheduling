const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { findInsides } = require("../salesforce-insides");

// ADR 0015 choice 11 (2026-11-13): only ShoreshTable.css styles inside Salesforce's fields.
describe("salesforce-insides", () => {
  let root;
  const write = (rel, text) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "insides-"));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const RES = "force-app/main/default/staticresources";

  it("the repo as it is passes: ShoreshTable.css alone", () => {
    expect(findInsides()).toEqual([]);
  });

  it("ShoreshTable.css may; any other stylesheet naming an SLDS class fails, with its line", () => {
    write(
      `${RES}/ShoreshTable.css`,
      ".shoresh-cell .slds-input { color: red; }\n"
    );
    write(
      `${RES}/ShoreshDateBox.css`,
      "/* .slds-input in a comment is fine */\n.shoresh-date .slds-button_icon {\n  width: 1.5rem;\n}\n"
    );
    write(`${RES}/Nested/inner.css`, "a > .slds-select { border: 0; }\n");
    expect(findInsides(root)).toEqual([
      `${RES}/Nested/inner.css:1: a > .slds-select { border: 0; }`,
      `${RES}/ShoreshDateBox.css:2: .shoresh-date .slds-button_icon {`
    ]);
  });

  it("an SLDS class after an element name, or matched by name, fails too", () => {
    write(
      `${RES}/Other.css`,
      'input.slds-input { color: red; }\n[class*="slds-input"] { border: 0; }\n[class^=slds-] { x: y; }\n'
    );
    expect(findInsides(root)).toEqual([
      `${RES}/Other.css:1: input.slds-input { color: red; }`,
      `${RES}/Other.css:2: [class*="slds-input"] { border: 0; }`,
      `${RES}/Other.css:3: [class^=slds-] { x: y; }`
    ]);
  });

  it("a light DOM component's CSS reaches the page too, so it is checked; a shadow one's isn't", () => {
    const LWC = "force-app/main/default/lwc";
    write(
      `${LWC}/lightOne/lightOne.js`,
      'export default class LightOne { static renderMode = "light"; }\n'
    );
    write(
      `${LWC}/lightOne/lightOne.css`,
      "lightning-input .slds-input { x: y; }\n"
    );
    write(
      `${LWC}/shadowOne/shadowOne.js`,
      "export default class ShadowOne {}\n"
    );
    write(`${LWC}/shadowOne/shadowOne.css`, ".slds-box { padding: 0; }\n");
    expect(findInsides(root)).toEqual([
      `${LWC}/lightOne/lightOne.css:1: lightning-input .slds-input { x: y; }`
    ]);
  });

  it("Salesforce's supported styling hooks and our own classes are fine", () => {
    write(
      `${RES}/ShoreshPrint.css`,
      ".grid { --slds-c-input-color-border: transparent; color: var(--slds-g-color-error-1); }\n"
    );
    expect(findInsides(root)).toEqual([]);
  });
});
