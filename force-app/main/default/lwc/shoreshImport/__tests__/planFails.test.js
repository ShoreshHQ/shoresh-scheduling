import { createElement } from "lwc";
import { readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import ShoreshImport from "c/shoreshImport";
import { planFor } from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

// The plan Add would save is worked out by the engine; here it fails as a bug in it would.
jest.mock("c/shoreshImportEngine", () => {
  const actual = jest.requireActual("c/shoreshImportEngine");
  return { ...actual, planFor: jest.fn(actual.planFor) };
});
[
  "saveSetup",
  "getAnswers",
  "getImported",
  "getOpenFiles",
  "undoImport"
].forEach((name) =>
  jest.mock(
    `@salesforce/apex/ImportController.${name}`,
    () => ({ default: jest.fn(() => Promise.resolve(null)) }),
    { virtual: true }
  )
);

const SAMPLES = join(__dirname, "..", "..", "..", "..", "..", "..", "docs");
const SETUP = {
  season: { Id: "se1", Name: "Summer 2027" },
  weeks: [],
  programs: [],
  activities: [],
  locations: []
};

const flush = () =>
  [...Array(20)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

const $ = (element, selector) => element.shadowRoot.querySelector(selector);

async function chooseSample(element) {
  const bytes = readFileSync(
    join(SAMPLES, "samples", "import", "maple-grove-2026-all-camp.xlsx")
  );
  const input = $(element, 'input[data-id="files"]');
  Object.defineProperty(input, "files", {
    value: [
      {
        name: "maple-grove-2026-all-camp.xlsx",
        arrayBuffer: () =>
          Promise.resolve(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength
            )
          )
      }
    ],
    configurable: true
  });
  input.dispatchEvent(new CustomEvent("change"));
  await flush();
}

describe("c-shoresh-import: the plan Add would save can't be worked out", () => {
  beforeEach(() => {
    window.XLSX = XLSX;
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.restoreAllMocks();
  });

  it("INGEST-5.5: Add is off with the reason and a support code, never greyed with none", async () => {
    planFor.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined");
    });
    const element = createElement("c-shoresh-import", { is: ShoreshImport });
    element.setup = nsRecord(SETUP);
    element.terms = buildTerms([]);
    document.body.appendChild(element);
    await flush();
    await chooseSample(element);

    expect($(element, 'button[data-id="save"]').disabled).toBe(true);
    expect($(element, '[data-id="error"]').textContent).toMatch(
      /^This file can't be added yet\. Try again\. For support: [A-Z0-9]{3}-[A-Z0-9]{3}\.$/
    );
  });
});
