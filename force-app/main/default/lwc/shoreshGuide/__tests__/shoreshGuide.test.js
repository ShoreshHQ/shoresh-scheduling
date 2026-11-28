import { createElement } from "lwc";
import ShoreshGuide from "c/shoreshGuide";
import { buildTerms } from "c/shoreshTerms";

// Node's own file reading, required as the repo's other tests do (an import would read as an
// Aura library to the code analyzer).
const { readFileSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "../../../../../..");

function mount(terms) {
  const element = createElement("c-shoresh-guide", { is: ShoreshGuide });
  if (terms) element.terms = terms;
  document.body.appendChild(element);
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const text = (node) => node.textContent.replace(/\s+/g, " ").trim();

async function opened(terms) {
  const element = mount(terms);
  $(element, '[data-id="guide-toggle"]').click();
  await Promise.resolve();
  return element;
}

const clicks = (element, step) =>
  $$(element, `[data-step="${step}"] [data-path]`).map((path) =>
    [...path.querySelectorAll("[data-click]")].map((c) => c.textContent)
  );

afterEach(() => {
  while (document.body.firstChild) document.body.firstChild.remove();
});

describe("c-shoresh-guide (CORE-6.17)", () => {
  it("is one closed row until opened, and closes again", async () => {
    const element = mount();
    const toggle = $(element, '[data-id="guide-toggle"]');
    expect(text(toggle)).toBe("Getting started");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect($(element, '[data-id="guide-steps"]')).toBeNull();

    toggle.click();
    await Promise.resolve();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect($(element, '[data-id="guide-steps"]')).not.toBeNull();

    toggle.click();
    await Promise.resolve();
    expect($(element, '[data-id="guide-steps"]')).toBeNull();
  });

  it("lists the first steps in order, the admin's first", async () => {
    const element = await opened();
    const steps = $$(element, "[data-step]");
    expect(steps.map((s) => s.dataset.step)).toEqual([
      "people",
      "sample",
      "season",
      "week",
      "electives",
      "publish"
    ]);
    expect(text(steps[0].querySelector(".step-title"))).toBe(
      "Give people Shoresh"
    );
    expect(text(steps[0].querySelector('[data-id="who"]'))).toBe(
      "Salesforce admin"
    );
    expect(
      steps.slice(1).map((s) => s.querySelector('[data-id="who"]'))
    ).toEqual([null, null, null, null, null]);
  });

  it("gives the admin's exact Salesforce clicks for the Shoresh Scheduler permission set", async () => {
    const element = await opened();
    expect(clicks(element, "people")).toEqual([
      [
        "Setup",
        "Users",
        "The person's name",
        "Permission Set Assignments",
        "Edit Assignments"
      ],
      ["Shoresh Scheduler", "Add", "Save"]
    ]);
  });

  it("names the permission set exactly as the package does", () => {
    const meta = readFileSync(
      join(
        ROOT,
        "force-app/main/default/permissionsets/Shoresh_Scheduler.permissionset-meta.xml"
      ),
      "utf8"
    );
    expect(meta).toContain("<label>Shoresh Scheduler</label>");
  });

  it("offers the sample camp, its electives and its choices to download", async () => {
    const element = await opened();
    const electives = $(element, '[data-id="download-sample-electives"]');
    expect(electives.getAttribute("download")).toBe(
      "Sample electives (made up).csv"
    );
    expect(electives.getAttribute("href")).toMatch(
      /ShoreshSampleCamp\/sample-electives\.csv$/
    );
    const camp = $(element, '[data-id="download-sample-camp"]');
    const choices = $(element, '[data-id="download-sample-choices"]');
    expect(camp.getAttribute("download")).toBe("Sample camp (made up).xlsx");
    expect(camp.getAttribute("href")).toMatch(
      /ShoreshSampleCamp\/sample-camp\.xlsx$/
    );
    expect(choices.getAttribute("download")).toBe(
      "Sample choices (made up).csv"
    );
    expect(choices.getAttribute("href")).toMatch(
      /ShoreshSampleCamp\/sample-choices\.csv$/
    );
  });

  it("the season, week, electives and publish steps click what the screens say", async () => {
    const element = await opened();
    expect(clicks(element, "season")).toEqual([
      ["▾", "New season", "Create season"],
      ["Roots", "Import last year", "Sample camp (made up).xlsx"]
    ]);
    expect(clicks(element, "week")).toEqual([
      ["Generated Schedule", "Generate a schedule"]
    ]);
    expect(clicks(element, "electives")).toEqual([
      ["Electives", "Import a list", "Sample electives (made up).csv"],
      [
        "Elective seats",
        "Build",
        "Import choices",
        "Sample choices (made up).csv",
        "Assign seats",
        "Finalize"
      ]
    ]);
    expect(clicks(element, "publish")).toEqual([
      ["Generated Schedule", "Publish"]
    ]);
  });

  it("says electives, seasons, weeks and seats in the camp's own words", async () => {
    const terms = buildTerms([
      { term: "Elective", singular: "Chug", plural: "Chugim", isCustom: true },
      { term: "Season", singular: "Summer", plural: "Summers", isCustom: true },
      { term: "Week", singular: "Session", plural: "Sessions", isCustom: true },
      { term: "Seats", singular: "Spot", plural: "Spots", isCustom: true }
    ]);
    const element = await opened(terms);
    const title = (step) =>
      text($(element, `[data-step="${step}"] .step-title`));
    expect(title("electives")).toBe("Chugim");
    expect(title("season")).toBe("A Summer");
    expect(title("week")).toBe("Build a Session");
    expect(clicks(element, "season")[0]).toEqual([
      "▾",
      "New Summer",
      "Create Summer"
    ]);
    expect(clicks(element, "electives")[0][0]).toBe("Chugim");
    expect(clicks(element, "electives")[1]).toContain("Assign Spots");
  });

  it("every button it names is a button the screens really have", () => {
    const read = (file) =>
      readFileSync(join(ROOT, "force-app/main/default/lwc", file), "utf8");
    const has = (file, words) => expect(read(file)).toContain(words);
    has(
      "shoreshCampSetup/shoreshCampSetup.js",
      'newSeason: `New ${t.sIn("Season")}`'
    );
    has(
      "shoreshCampSetup/shoreshCampSetup.js",
      'createSeason: `Create ${t.sIn("Season")}`'
    );
    has(
      "shoreshCampSetup/shoreshCampSetup.html",
      "alternative-text={labels.seasonActions}"
    );
    has(
      "shoreshGeneratedSchedule/shoreshGeneratedSchedule.js",
      '[ACTION.GENERATE]: "Generate a schedule"'
    );
    has("shoreshListImport/shoreshListImport.js", '"Import a list"');
    has("shoreshElectiveSeats/shoreshElectiveSeats.html", 'label="Build"');
    has(
      "shoreshElectiveSeats/shoreshElectiveSeats.html",
      "<span>Import choices</span>"
    );
    has(
      "shoreshElectiveSeats/shoreshElectiveSeats.js",
      '"Finalize" : `Assign ${this.t.pIn("Seats")}`'
    );
    has("shoreshPublish/shoreshPublish.js", 'confirmLabel: "Publish"');
  });

  it("has no sentences: every step is a short name and its clicks", async () => {
    const element = await opened();
    $$(element, ".step-title").forEach((title) => {
      expect(text(title)).not.toMatch(/[.!?]$/);
      expect(text(title).split(" ").length).toBeLessThanOrEqual(5);
    });
    expect($$(element, "p:not([data-path])")).toEqual([]);
  });

  it("is accessible open and closed", async () => {
    const element = mount();
    await expect(element).toBeAccessible();
    $(element, '[data-id="guide-toggle"]').click();
    await Promise.resolve();
    await expect(element).toBeAccessible();
  });

  it("its static resource's description fits Salesforce's 255 characters", () => {
    const meta = readFileSync(
      join(
        ROOT,
        "force-app/main/default/staticresources/ShoreshSampleCamp.resource-meta.xml"
      ),
      "utf8"
    );
    const description = /<description>([\s\S]*)<\/description>/.exec(meta)[1];
    expect(description.length).toBeLessThanOrEqual(255);
  });

  it("the downloads are the docs' sample files, byte for byte", () => {
    const pairs = [
      [
        "docs/samples/import/maple-grove-2026-all-camp.xlsx",
        "sample-camp.xlsx"
      ],
      ["docs/samples/electives/chugim-electives.csv", "sample-electives.csv"],
      ["docs/samples/electives/chugim-choices.csv", "sample-choices.csv"]
    ];
    pairs.forEach(([doc, resource]) => {
      const a = readFileSync(join(ROOT, doc));
      const b = readFileSync(
        join(
          ROOT,
          "force-app/main/default/staticresources/ShoreshSampleCamp",
          resource
        )
      );
      expect(b.equals(a)).toBe(true);
    });
  });
});
