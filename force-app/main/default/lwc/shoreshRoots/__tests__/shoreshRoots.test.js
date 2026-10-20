import { createElement } from "lwc";
import ShoreshRoots from "c/shoreshRoots";
import { buildTerms } from "c/shoreshTerms";
import { setupProblems } from "c/shoreshSetupRules";
import { nsRecord } from "shoresh-jest/namespace";

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Division", singular: "Unit", plural: "Units", isCustom: true },
  {
    term: "Activity",
    singular: "Activity",
    plural: "Activities",
    isCustom: false
  },
  {
    term: "Location",
    singular: "Location",
    plural: "Locations",
    isCustom: false
  },
  {
    term: "TimeBlock",
    singular: "Time block",
    plural: "Time blocks",
    isCustom: false
  },
  { term: "Week", singular: "Week", plural: "Weeks", isCustom: false },
  {
    term: "FixedActivity",
    singular: "Fixed activity",
    plural: "Fixed activities",
    isCustom: false
  },
  { term: "Season", singular: "Season", plural: "Seasons", isCustom: false },
  {
    term: "RainPlan",
    singular: "Rain plan",
    plural: "Rain plans",
    isCustom: false
  }
]);

const bunks = (n) =>
  [...Array(n)].map((_, i) => ({ Id: `g${i}`, Name: `Bunk ${i + 1}` }));

const SETUP = {
  season: {
    Name: "Summer 2026",
    StartDate__c: "2026-06-29",
    EndDate__c: "2026-08-07"
  },
  weeks: [{ Name: "Week 1" }, { Name: "Week 2" }],
  programs: [
    {
      program: { Name: "Main" },
      timeBlocks: [{ Name: "Period 1" }, { Name: "Period 2" }],
      fixedActivities: [{ Name: "Flagpole" }, { Name: "Carpool" }],
      divisions: [
        { division: { Id: "d1", Name: "Juniors" }, groups: bunks(6) },
        { division: { Id: "d2", Name: "Seniors" }, groups: [] }
      ]
    }
  ],
  locations: [{ Id: "l1", Name: "Pool", GroupsThatFit__c: 1 }],
  activities: [
    { Name: "Swim", Location__c: "l1", GroupsAtOnce__c: 1 },
    { Name: "Soccer", Outdoor__c: true }
  ]
};

const flush = () => Promise.resolve();

async function render(setup = SETUP) {
  const element = createElement("c-shoresh-roots", { is: ShoreshRoots });
  element.setup = nsRecord(setup);
  element.terms = terms;
  element.problems = setupProblems(nsRecord(setup), terms);
  document.body.appendChild(element);
  await flush();
  return element;
}

const card = (element, key) =>
  element.shadowRoot.querySelector(`[data-card="${key}"]`);

describe("c-shoresh-roots", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("puts the cursor on its heading when the page opens it", async () => {
    const element = await render();
    element.focusHeading();
    expect(element.shadowRoot.activeElement).toBe(
      element.shadowRoot.querySelector("[data-heading]")
    );
  });

  it("shows the desktop's cards, in their places, in the camp's words", async () => {
    const element = await render();
    const cards = [...element.shadowRoot.querySelectorAll("[data-card]")].map(
      (c) => [
        c.dataset.card,
        c.querySelector(".roots-card-header span").textContent
      ]
    );
    expect(cards).toEqual([
      ["activities", "Activities"],
      ["groups", "Bunks"],
      ["divisions", "Units"],
      ["locations", "Locations"],
      ["timeBlocks", "Time blocks"],
      ["weeks", "Weeks"],
      ["fixedActivities", "Fixed activities"]
    ]);
    expect(card(element, "activities").className).toContain("roots-card_large");
    expect(card(element, "divisions").className).toContain("roots-card_small");
    expect(card(element, "fixedActivities").className).toContain(
      "roots-card_wide"
    );
  });

  it("counts what each card's screen lists, in green once something is there", async () => {
    const element = await render();
    const count = (key) =>
      element.shadowRoot.querySelector(`[data-count="${key}"]`);
    expect(count("activities").textContent).toBe("2");
    expect(count("groups").textContent).toBe("6");
    expect(count("divisions").textContent).toBe("2");
    expect(count("locations").textContent).toBe("1");
    expect(count("timeBlocks").textContent).toBe("2");
    expect(count("weeks").textContent).toBe("2");
    expect(count("fixedActivities").textContent).toBe("2");
    expect(card(element, "weeks").className).toContain("roots-card_small");
    expect(count("groups").className).toContain("roots-count_rooted");

    const empty = await render({ ...SETUP, locations: [] });
    const zero = empty.shadowRoot.querySelector('[data-count="locations"]');
    expect(zero.textContent).toBe("0");
    expect(zero.className).not.toContain("roots-count_rooted");
  });

  it("names up to four on the large cards, then how many more", async () => {
    const element = await render();
    const chips = [
      ...card(element, "groups").querySelectorAll(".roots-chip")
    ].map((c) => c.textContent);
    expect(chips).toEqual(["Bunk 1", "Bunk 2", "Bunk 3", "Bunk 4", "+2 more"]);
    expect(card(element, "divisions").querySelector(".roots-chip")).toBeNull();
  });

  it("names up to six fixed activities on the wide card", async () => {
    const element = await render();
    const chips = [
      ...card(element, "fixedActivities").querySelectorAll(".roots-chip")
    ].map((c) => c.textContent);
    expect(chips).toEqual(["Flagpole", "Carpool"]);
    expect(card(element, "fixedActivities").textContent).not.toContain(
      "Coming"
    );
  });

  it("the schedule door offers both schedules, side by side, by name", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    const door = element.shadowRoot.querySelector('[data-id="schedule-door"]');
    expect(door.textContent).toContain("Build or generate the schedule");
    expect(door.textContent).not.toContain("Coming");
    const ways = [...door.querySelectorAll("button")];
    expect(ways.map((b) => b.textContent.replace("→", "").trim())).toEqual([
      "Generated Schedule",
      "Manual Build"
    ]);
    ways.forEach((b) => b.click());
    expect(handler.mock.calls.map((c) => c[0].detail.screen)).toEqual([
      "generatedSchedule",
      "manualBuild"
    ]);
  });

  it("a camp with setup: the import recedes to Re-import last year, and still opens", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    const button = element.shadowRoot.querySelector(
      'lightning-button[data-id="import"]'
    );
    expect(button.label).toBe("Re-import last year");
    expect(button.variant).toBe("base");
    button.click();
    expect(handler.mock.calls[0][0].detail).toEqual({ screen: "import" });
  });

  it("an empty camp: Import last year is the first thing to do", async () => {
    const element = await render({
      season: SETUP.season,
      weeks: SETUP.weeks,
      programs: [{ program: { Name: "Main" } }],
      locations: [],
      activities: []
    });
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    const buttons = element.shadowRoot.querySelectorAll(
      'lightning-button[data-id="import"]'
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0].label).toBe("Import last year");
    expect(buttons[0].variant).toBe("brand");
    buttons[0].click();
    expect(handler.mock.calls[0][0].detail).toEqual({ screen: "import" });
  });

  it("each card opens its screen", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    card(element, "groups").click();
    card(element, "timeBlocks").click();
    card(element, "weeks").click();
    card(element, "fixedActivities").click();
    expect(handler.mock.calls.map((c) => c[0].detail.screen)).toEqual([
      "groups",
      "timeBlocks",
      "weeks",
      "fixedActivities"
    ]);
  });

  it("lists what needs attention alphabetically, each opening the screen that fixes it", async () => {
    const element = await render({ ...SETUP, weeks: [] });
    const rows = [...element.shadowRoot.querySelectorAll("[data-attention]")];
    expect(
      rows.map((r) => [
        r.querySelector(".roots-attention-name").textContent,
        r.querySelector(".roots-tag").textContent
      ])
    ).toEqual([
      ["Seniors", "Bunks"],
      ["Soccer", "Activities"],
      ["Summer 2026", "Weeks"]
    ]);
    expect(rows[1].querySelector(".roots-attention-why").textContent).toBe(
      "Outdoors and has no rain plan."
    );
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    rows.forEach((row) => row.click());
    expect(handler.mock.calls.map((c) => c[0].detail.screen)).toEqual([
      "groups",
      "activities",
      "weeks"
    ]);
  });

  it("says all clear when nothing needs attention", async () => {
    const element = createElement("c-shoresh-roots", { is: ShoreshRoots });
    element.setup = nsRecord(SETUP);
    element.terms = terms;
    element.problems = [];
    document.body.appendChild(element);
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="all-clear"]').textContent
    ).toContain("All clear");
  });

  it("shows the last import with Undo last import, which asks the page to undo it", async () => {
    const element = await render({
      ...SETUP,
      lastImport: {
        Id: "im1",
        Files__c: "maple-grove.xlsx",
        CreatedDate: "2027-06-20T14:00:00.000Z"
      }
    });
    const line = element.shadowRoot.querySelector('[data-id="last-import"]');
    expect(line.textContent).toContain("Last import: maple-grove.xlsx");
    expect(line.textContent).toContain(
      "Anything you have edited since stays as it is."
    );
    const handler = jest.fn();
    element.addEventListener("undoimport", handler);
    element.shadowRoot
      .querySelector('lightning-button[data-id="undo-import"]')
      .click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      importId: "im1",
      files: "maple-grove.xlsx"
    });
  });

  it("shows no last import when there is none", async () => {
    const element = await render();
    expect(
      element.shadowRoot.querySelector('[data-id="last-import"]')
    ).toBeNull();
  });
});

describe("Download worksheet", () => {
  it("saves every list and the extra sheets in one file", async () => {
    const XLSX = require("xlsx");
    window.XLSX = XLSX;
    const blobs = new Map();
    URL.createObjectURL = (blob) => {
      blobs.set("blob:test", blob);
      return "blob:test";
    };
    URL.revokeObjectURL = () => undefined;
    const saved = [];
    const spy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function click() {
        saved.push(this);
      });
    const element = await render({
      ...SETUP,
      season: { Id: "s1", Name: "Summer 2027" }
    });
    const button = element.shadowRoot.querySelector(
      'lightning-button[data-id="download-workbook"]'
    );
    // The desktop's word (RootsHomeScreen.jsx, ImportScreen.jsx: "Download worksheet").
    expect(button.label).toBe("Download worksheet");
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(saved).toHaveLength(1);
    expect(saved[0].download).toBe("Summer 2027 - worksheet.xlsx");
    const bytes = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.readAsArrayBuffer(blobs.get(saved[0].href));
    });
    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames).toContain("Runs in");
    spy.mockRestore();
    delete window.XLSX;
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });
});
