#!/usr/bin/env node
/**
 * Styling inside Salesforce's fields (ADR 0015 choice 11). A component's own CSS can't reach
 * inside Salesforce's components (lightning-input, lightning-combobox and the rest); only a
 * stylesheet the page loads for the whole page (a static resource, loadStyle) can, by naming
 * SLDS classes such as .slds-input. How Salesforce builds its fields inside isn't supported and
 * may change, so one stylesheet only may do it: ShoreshTable.css, the setup tables' fields read
 * as words at rest, which changes looks only and falls back to ordinary boxes. Any other
 * stylesheet among the static resources that names an SLDS class fails here, and so does a
 * light DOM component's (renderMode "light"), whose CSS isn't kept to the component either.
 *
 * Usage: node scripts/salesforce-insides.js   (exit 1, listing each one, if any is found)
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const RESOURCES = "force-app/main/default/staticresources";
const COMPONENTS = "force-app/main/default/lwc";
// An SLDS class however it is written (.slds-input, input.slds-input) or matched by name
// ([class*="slds-input"]); Salesforce's supported styling hooks (--slds-c-*) are no class.
const SLDS_CLASS = /\.slds-[\w-]|\[\s*class\s*[~|^$*]?=\s*["']?[^\]]*slds-/;
// The one exception (ADR 0015 choice 11).
const ALLOWED = new Set([`${RESOURCES}/ShoreshTable.css`]);

function cssFiles(dir) {
  // In name order, so every machine lists them the same way.
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return cssFiles(full);
    }
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

/** A light DOM component's stylesheets: its CSS reaches the whole page around it. */
function lightComponentCss(root) {
  const dir = path.join(root, COMPONENTS);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name))
    .filter((bundle) => {
      const js = path.join(bundle, `${path.basename(bundle)}.js`);
      return (
        fs.existsSync(js) &&
        /renderMode\s*=\s*["']light["']/.test(fs.readFileSync(js, "utf8"))
      );
    })
    .flatMap((bundle) => cssFiles(bundle));
}

/** Each "file:line: selector" naming an SLDS class, outside the one allowed stylesheet. */
function findInsides(root = ROOT) {
  const found = [];
  const dir = path.join(root, RESOURCES);
  const files = [
    ...(fs.existsSync(dir) ? cssFiles(dir) : []),
    ...lightComponentCss(root)
  ];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (ALLOWED.has(rel)) {
      continue;
    }
    // Comments blanked, keeping the line breaks so line numbers stay true.
    const text = fs
      .readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    text.split("\n").forEach((line, i) => {
      if (SLDS_CLASS.test(line)) {
        found.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  return found;
}

module.exports = { findInsides, ALLOWED };

if (require.main === module) {
  const found = findInsides();
  if (found.length) {
    console.error(
      "Only ShoreshTable.css may style inside Salesforce's fields (ADR 0015 choice 11). Found:"
    );
    found.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log(
    "Salesforce-insides check passed: only ShoreshTable.css styles inside Salesforce's fields."
  );
}
