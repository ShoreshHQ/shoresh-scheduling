import { createElement } from "lwc";
import { readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import ShoreshImport from "c/shoreshImport";
import saveSetup from "@salesforce/apex/ImportController.saveSetup";
import getAnswers from "@salesforce/apex/ImportController.getAnswers";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import LightningConfirm from "lightning/confirm";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

jest.mock(
  "@salesforce/apex/ImportController.saveSetup",
  () => ({ default: jest.fn() }),
  {
    virtual: true
  }
);

jest.mock(
  "@salesforce/apex/ImportController.getAnswers",
  () => ({ default: jest.fn() }),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ImportController.undoImport",
  () => ({ default: jest.fn() }),
  {
    virtual: true
  }
);

const SAMPLES = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
  "docs",
  "samples",
  "import"
);
const SETUP = {
  season: { Id: "se1", Name: "Summer 2027" },
  weeks: [],
  programs: [],
  activities: [],
  locations: []
};

/** A file as the browser hands it over (from the samples, or the text given). */
function file(name, text) {
  const bytes =
    text === undefined
      ? readFileSync(join(SAMPLES, name))
      : Buffer.from(text, "utf8");
  return {
    name,
    text: () => Promise.resolve(bytes.toString("utf8")),
    arrayBuffer: () =>
      Promise.resolve(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        )
      )
  };
}

// Lets the screen's promises (reading files, saving) settle, as the other screen tests do.
const flush = () =>
  [...Array(20)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render() {
  const element = createElement("c-shoresh-import", { is: ShoreshImport });
  element.setup = nsRecord(SETUP);
  element.terms = buildTerms([]);
  document.body.appendChild(element);
  await flush();
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

async function choose(element, names, texts = {}) {
  const input = $(element, 'input[data-id="files"]');
  Object.defineProperty(input, "files", {
    value: names.map((name) => file(name, texts[name])),
    configurable: true
  });
  input.dispatchEvent(new CustomEvent("change"));
  await flush();
}

async function answer(element, cardId, value) {
  const button = $$(element, `[data-card="${cardId}"] button`).find(
    (b) => b.dataset.key === `${cardId}::${value}`
  );
  button.click();
  await flush();
}

/** The first question about similar names (the file's names come first). */
const similarId = (element) =>
  $$(element, "[data-card]").find((c) => c.dataset.card.startsWith("similar|"))
    .dataset.card;

const add = (element) => $(element, 'button[data-id="save"]');

describe("c-shoresh-import", () => {
  beforeEach(() => {
    window.XLSX = XLSX;
    saveSetup.mockResolvedValue({
      added: {
        Program: 1,
        TimeBlock: 7,
        Division: 2,
        Group: 6,
        Activity: 7,
        FixedActivity: 1,
        RecurringActivity: 2
      },
      changed: {}
    });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("starts with the drop well, and says what it reads", async () => {
    const element = await render();
    const drop = $(element, '[data-id="drop"]');
    expect(drop.textContent).toContain("Drop last year's files");
    expect(drop.textContent).toContain(".xlsx · .xls · .csv");
    // The rail: the way back to Roots and the screen's name; nothing to add yet.
    expect($(element, '[data-id="close"]').getAttribute("aria-label")).toBe(
      "Back to Roots"
    );
    expect($(element, "[data-heading]").textContent.trim()).toBe(
      "Import last year"
    );
    expect(add(element)).toBeNull();
    // The hidden file input is named, and Choose files is its only tab stop.
    const input = $(element, 'input[data-id="files"]');
    expect(input.getAttribute("aria-label")).toBe("Choose files");
    expect(input.getAttribute("tabindex")).toBe("-1");
    expect($(element, 'button[data-id="choose"]').textContent.trim()).toBe(
      "Choose files"
    );
  });

  it("refuses a file it cannot read, and adds nothing", async () => {
    const element = await render();
    const input = $(element, 'input[data-id="files"]');
    Object.defineProperty(input, "files", {
      value: [{ name: "schedule.pdf" }],
      configurable: true
    });
    input.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect($(element, '[data-id="error"]').textContent).toBe(
      "schedule.pdf: Shoresh reads Excel (.xlsx, .xls) and CSV files. Nothing was imported."
    );
  });

  it("one page: the questions first, then what comes in as counts; Add says how many, then the summary", async () => {
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);

    // The rail names the file.
    expect($(element, '[data-id="file-name"]').textContent).toContain(
      "maple-grove-2026-all-camp.xlsx"
    );
    // Check these first: every question on the one page, the file's names first, each marked
    // until it is answered.
    const questions = $(element, '[data-id="questions"]');
    expect(questions.querySelector("h3").textContent).toContain(
      "Check these first"
    );
    const rows = $$(element, '[data-id="questions"] [data-card]');
    // Library time (all of Juniors on Wednesday) is recurring (rule 7, Greg 2026-10-27), not asked.
    expect(rows.map((r) => r.dataset.card)).toEqual([similarId(element)]);
    expect(questions.querySelector("h3").textContent).toContain("1");
    // What Shoresh chose itself (the program, each bunk's unit) is listed below, changeable,
    // not asked.
    expect(
      $(element, '[data-id="program-choices"] lightning-combobox').value
    ).toBeTruthy();
    expect(
      $$(element, '[data-id="unit-choices"] lightning-combobox')
    ).toHaveLength(6);
    rows.forEach((row) =>
      expect(row.querySelector(".corner .shoresh-look-mark")).not.toBeNull()
    );
    // The file's layout, changeable, in the Files section.
    expect(
      $(
        element,
        'lightning-combobox[data-file="maple-grove-2026-all-camp.xlsx"]'
      ).value
    ).toBe("allCamp");
    // Noted, not set up yet: dashed.
    const noted = $(element, '[data-id="not-set-up"]');
    expect(noted.textContent).toContain("Field day");
    expect(noted.textContent).not.toContain("Chugim");
    expect(noted.querySelector(".chip_dashed")).not.toBeNull();
    // Chugim is read as an elective set (slice E9): said, not asked, with its one escape.
    const electives = $(element, '[data-id="electives"]');
    const chugim = electives.querySelector('[data-card="elective|Chugim"]');
    expect(chugim.textContent).toContain(
      "Read as electives: Tuesday, Period 6, every group."
    );
    expect(chugim.textContent).toContain(
      "No choices in the file: add them later."
    );
    expect(
      chugim.querySelector('button[aria-pressed="true"]').textContent.trim()
    ).toBe("Electives");
    expect(chugim.querySelector(".corner")).toBeNull();

    // Every question needs an answer before Add.
    expect(add(element).disabled).toBe(true);
    expect(add(element).textContent.trim()).toBe("1 question left");
    await answer(element, similarId(element), "a");
    // Answered: the choice is pressed and raised, and the row loses its mark.
    const similar = $(element, `[data-card="${similarId(element)}"]`);
    const pressed = similar.querySelector('button[aria-pressed="true"]');
    expect(pressed.textContent).toContain("Same: call it");
    expect(pressed.classList).toContain("shoresh-raised");
    expect(similar.querySelector(".corner")).toBeNull();

    // Comes in: a count per kind, and Add says the total.
    const tiles = $$(element, "[data-tile]");
    const count = (kind) =>
      Number(
        tiles.find((x) => x.dataset.tile === kind).querySelector("b")
          .textContent
      );
    expect(count("Group")).toBe(6);
    expect(tiles.find((x) => x.dataset.tile === "Group").textContent).toContain(
      "Groups"
    );
    const sum = tiles.reduce(
      (n, x) => n + Number(x.querySelector("b").textContent),
      0
    );
    expect(add(element).disabled).toBe(false);
    expect(add(element).textContent.trim()).toBe(`Add ${sum}`);

    const imported = jest.fn();
    element.addEventListener("imported", imported);
    add(element).click();
    await flush();
    await flush();
    const plan = JSON.parse(saveSetup.mock.calls[0][0].plan);
    expect(plan.seasonId).toBe("se1");
    expect(plan.groups).toHaveLength(6);
    expect(plan.activities.map((a) => a.name)).not.toContain("Musik");
    expect(imported).toHaveBeenCalled();

    // Done: what was added as counts, Undo and Done on the rail.
    const added = $(element, '[data-id="added"]');
    expect(added.querySelector("h3").textContent).toContain("Added");
    expect(added.querySelector("h3").textContent).toContain("26");
    expect(
      added.querySelector('[data-tile="Group"] .slds-assistive-text')
        .textContent
    ).toBe("6 groups");
    expect($(element, '[data-id="noted"]').textContent).toContain("Zoo trip");
    expect($(element, 'button[data-id="continue"]').textContent.trim()).toBe(
      "Done"
    );
    expect($(element, 'button[data-id="save"]')).toBeNull();
  });

  it("electives read from the file: counted in Comes in, and Not electives takes the set away", async () => {
    // One bunk's week, CSV, with a list of choices held on Tuesday Periods 1 and 2.
    const rows = [
      "Time,Monday,Tuesday,Wednesday,Thursday,Friday",
      'Period 1 9:00-9:45,Swim,"Hiking, Fishing, Kayaking",Art,Swim,Art',
      'Period 2 9:50-10:35,Art,"Hiking, Fishing, Kayaking",Swim,Art,Swim'
    ].join("\n");
    const element = await render();
    await choose(element, ["Camp - Bunk 1.csv"], { "Camp - Bunk 1.csv": rows });
    const name = "Electives (Fishing, Hiking, Kayaking)";
    const row = $(
      element,
      `[data-id="electives"] [data-card="elective|${name}"]`
    );
    expect(row.textContent).toContain(
      "Read as electives: Tuesday, Period 1 and Period 2, every group."
    );
    expect(row.textContent).toContain(
      "3 choices proposed: Fishing, Hiking, and Kayaking. Each choice taken as a set across Period 1 and Period 2 on Tuesday."
    );
    // Not a question: nothing in Check these first is about it.
    expect(
      $$(element, '[data-id="questions"] [data-card]').some((r) =>
        r.dataset.card.startsWith("elective|")
      )
    ).toBe(false);
    const tile = (kind) =>
      $$(element, "[data-tile]").find((x) => x.dataset.tile === kind);
    expect(tile("ElectiveSet").textContent).toContain("1");
    expect(tile("Offering").textContent).toContain("3");
    expect(tile("LinkedChoice").textContent).toContain("3");

    await answer(element, `elective|${name}`, "not");
    const pressed = $(
      element,
      `[data-card="elective|${name}"] button[aria-pressed="true"]`
    );
    expect(pressed.textContent).toContain("Not electives");
    // The cursor stays on the choice pressed.
    expect(element.shadowRoot.activeElement).toBe(pressed);
    expect(tile("ElectiveSet")).toBeUndefined();
    expect(tile("LinkedChoice")).toBeUndefined();
  });

  it("a count opens into its names, and closes again", async () => {
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
    expect($(element, '[data-id="names"]')).toBeNull();
    const groups = $(element, 'button[data-tile="Group"]');
    expect(groups.getAttribute("aria-expanded")).toBe("false");
    groups.click();
    await flush();
    expect(groups.getAttribute("aria-expanded")).toBe("true");
    const names = $(element, '[data-id="names"]');
    expect(names.getAttribute("aria-label")).toBe("Groups");
    expect(names.querySelectorAll("li")).toHaveLength(6);
    groups.click();
    await flush();
    expect($(element, '[data-id="names"]')).toBeNull();
  });

  it("keeps the cursor on the way: the first question, the choice pressed, Add, then the summary; and says what happens", async () => {
    const focused = [];
    const spy = jest
      .spyOn(HTMLElement.prototype, "focus")
      .mockImplementation(function record() {
        focused.push(this);
      });
    try {
      const element = await render();
      await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
      const status = () => $(element, '[data-id="status"]');
      expect(status().getAttribute("role")).toBe("status");
      // The files read: to the first question's first choice.
      expect(focused.pop().closest("[data-card]").dataset.card).toBe(
        similarId(element)
      );
      // A choice keeps the cursor: it stays, pressed.
      await answer(element, similarId(element), "a");
      const kept = focused.pop();
      expect(kept.dataset.key).toBe(`${similarId(element)}::a`);
      expect(kept.getAttribute("aria-pressed")).toBe("true");
      // Another choice in the same row changes the answer.
      await answer(element, similarId(element), "b");
      expect(focused.pop().dataset.key).toBe(`${similarId(element)}::b`);
      add(element).click();
      await flush();
      await flush();
      expect(focused.pop().dataset.id).toBe("done");
      expect(status().textContent.trim()).toBe(
        "Imported from maple-grove-2026-all-camp.xlsx."
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("is accessible at each step: the drop well, the one page, and done", async () => {
    const element = await render();
    await expect(element).toBeAccessible();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
    $(element, 'button[data-tile="Group"]').click();
    await flush();
    await expect(element).toBeAccessible();
    await answer(element, similarId(element), "a");
    add(element).click();
    await flush();
    await flush();
    await expect(element).toBeAccessible();
  });

  it("puts the cursor on its heading when the page opens it", async () => {
    const element = await render();
    element.focusHeading();
    expect(element.shadowRoot.activeElement).toBe($(element, "[data-heading]"));
  });

  it("Start again goes back to the drop well, with nothing kept", async () => {
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
    $(element, 'button[data-id="start-again"]').click();
    await flush();
    expect($(element, '[data-id="drop"]')).not.toBeNull();
    expect($(element, "[data-card]")).toBeNull();
    expect($(element, '[data-id="file-name"]')).toBeNull();
  });

  it("lists what was left out for now after saving", async () => {
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
    await answer(element, similarId(element), "leaveOut");
    add(element).click();
    await flush();
    await flush();
    const leftOut = $(element, '[data-id="left-out"]').textContent;
    expect(leftOut).toContain("Music and Musik");
  });

  it("asks which file is right where two files disagree", async () => {
    const element = await render();
    await choose(element, [
      "maple-grove-2026-all-camp.xlsx",
      "Maple Grove 2026 - Bunk 3.csv"
    ]);
    expect($(element, '[data-id="file-name"]').textContent).toContain("+ 1");
    const card = $$(element, "[data-card]").find((c) =>
      c.dataset.card.startsWith("cross|")
    );
    expect(card.textContent).toContain(
      "The files disagree about Bunk 3, Tuesday, Period 2. Which is right?"
    );
  });

  it("shows a save the server refused, and stays on the page", async () => {
    saveSetup.mockRejectedValue({
      body: { message: "Two things at Lunch for Bunk 1." }
    });
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
    await answer(element, similarId(element), "a");
    add(element).click();
    await flush();
    await flush();
    expect($(element, '[data-id="error"]').textContent).toBe(
      "Nothing was saved, and your answers are still here. Two things at Lunch for Bunk 1."
    );
    expect(add(element)).not.toBeNull();
  });

  it("a choice's reason is in its words for screen readers and its tooltip", async () => {
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
    const id = similarId(element);
    const leave = $(
      element,
      `[data-card="${id}"] button[data-key="${id}::leaveOut"]`
    );
    expect(leave.getAttribute("title")).toBe("Neither is added this time.");
    expect(leave.querySelector(".slds-assistive-text").textContent).toContain(
      "Neither is added this time."
    );
  });

  it("Add waits for the program and division choices too", async () => {
    const element = createElement("c-shoresh-import", { is: ShoreshImport });
    element.setup = nsRecord({
      ...SETUP,
      programs: [
        {
          program: {
            Id: "p1",
            Name: "Main",
            Monday__c: true,
            Tuesday__c: true,
            Wednesday__c: true,
            Thursday__c: true,
            Friday__c: true
          },
          timeBlocks: [],
          divisions: [
            { division: { Id: "d1", Name: "Juniors" }, groups: [] },
            { division: { Id: "d2", Name: "Seniors" }, groups: [] }
          ],
          fixedActivities: [],
          recurringActivities: []
        }
      ]
    });
    element.terms = buildTerms([]);
    document.body.appendChild(element);
    await flush();
    await choose(element, ["Maple Grove 2026 - Bunk 1.csv"]);
    const choice = $(element, 'lightning-combobox[data-id="division|Bunk 1"]');
    expect(choice.value).toBeNull();
    // The dropdown sits in its question's row, marked until it is chosen.
    const row = choice.closest("[data-card]");
    expect(row.querySelector(".corner")).not.toBeNull();
    expect(add(element).disabled).toBe(true);
  });

  describe("part 2: version, remembered answers, undo", () => {
    const WITH_WEEK = {
      ...SETUP,
      season: { Id: "se1", Name: "Summer 2027", Camp__c: "c1" },
      weeks: [
        {
          Id: "w1",
          Name: "Week 1",
          StartDate__c: "2027-06-28",
          EndDate__c: "2027-07-02"
        }
      ]
    };

    async function renderWith(setup) {
      const element = createElement("c-shoresh-import", { is: ShoreshImport });
      element.setup = nsRecord(setup);
      element.terms = buildTerms([]);
      document.body.appendChild(element);
      await flush();
      return element;
    }

    // MEMO-6.1
    it("answers from an earlier import are filled in, marked remembered, and can be changed", async () => {
      const music = "similar|activity|music|musik|Music|Musik";
      getAnswers.mockResolvedValue([
        {
          key: music,
          answer: "a",
          byYou: true,
          byName: "Greg",
          answeredOn: "2026-07-03"
        }
      ]);
      const element = await renderWith(WITH_WEEK);
      await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
      expect(getAnswers).toHaveBeenCalledWith({ campId: "c1" });
      const similar = $(element, `[data-card="${music}"]`);
      expect(similar.querySelector(".tag").textContent).toBe(
        "Remembered from your answer on 3 Jul"
      );
      expect(similar.querySelector(".corner")).toBeNull();
      // Changed by pressing another choice in the row: no longer the remembered one.
      await answer(element, music, "b");
      expect($(element, `[data-card="${music}"]`).textContent).not.toContain(
        "Remembered"
      );
      expect(add(element).disabled).toBe(false);
      expect(add(element).textContent.trim()).toMatch(/^Add \d+$/);
    });

    it("a place ticked at an earlier import is ticked again and marked remembered", async () => {
      getAnswers.mockResolvedValue([
        {
          key: "place|Pool",
          answer: "add",
          byYou: false,
          byName: "",
          answeredOn: "2026-10-26"
        }
      ]);
      const element = await renderWith(WITH_WEEK);
      const rows = [
        "Time,Bunk 1,Bunk 2",
        "9:00-9:45,Swim (Pool),Art (Art room)",
        "12:00-12:45,Lunch,Lunch"
      ].join("\n");
      await choose(element, ["Monday.csv", "Tuesday.csv"], {
        "Monday.csv": rows,
        "Tuesday.csv": rows
      });
      const pool = $(element, '[data-place="place|Pool"]');
      expect(pool.querySelector("lightning-input").checked).toBe(true);
      expect(pool.querySelector(".tag").textContent).toBe(
        "Remembered from a former user's answer on 26 Oct"
      );
      const artRoom = $(element, '[data-place="place|Art room"]');
      expect(artRoom.querySelector("lightning-input").checked).toBe(false);
      expect(artRoom.textContent).not.toContain("Remembered");
      // Headed in the camp's word, with what it was named with in plain text: no help icon.
      const places = $(element, '[data-id="places"]');
      expect(places.querySelector("h3").textContent.trim()).toBe("Locations");
      expect(pool.querySelector("lightning-input").fieldLevelHelp).toBeFalsy();
      expect(pool.textContent).toContain("Swim");
      expect(places.querySelector("p")).toBeNull();
    });

    it("a place deleted before is not brought back silently: it is listed with Bring back", async () => {
      // Deleted on the Locations screen after an earlier import that ticked it.
      getAnswers.mockResolvedValue([
        { key: "place|Pool", answer: "add" },
        { key: "deleted|Location||Pool", answer: "deleted" }
      ]);
      const element = await renderWith(WITH_WEEK);
      const rows = [
        "Time,Bunk 1,Bunk 2",
        "9:00-9:45,Swim (Pool),Art (Art room)",
        "12:00-12:45,Lunch,Lunch"
      ].join("\n");
      await choose(element, ["Monday.csv", "Tuesday.csv"], {
        "Monday.csv": rows,
        "Tuesday.csv": rows
      });
      expect($(element, '[data-place="place|Pool"]')).toBeNull();
      const deleted = $(element, '[data-id="not-set-up"]');
      expect(deleted.querySelector("h3").textContent).toContain(
        "Not set up yet"
      );
      const row = deleted.querySelector(
        '[data-deleted="deleted|Location||Pool"]'
      );
      expect(row.textContent).toContain("Deleted before: Pool");
      expect(row.textContent).toContain("location");
      const button = row.querySelector("button");
      expect(button.getAttribute("aria-label")).toBe(
        "Bring back Pool, location"
      );
      button.click();
      await flush();
      expect($(element, "[data-deleted]")).toBeNull();
      const pool = $(element, '[data-place="place|Pool"]');
      expect(pool.querySelector("lightning-input").checked).toBe(true);
    });

    it("Bring back keeps the cursor on the way: the next Bring back, then the question it opens", async () => {
      const focused = [];
      const spy = jest
        .spyOn(HTMLElement.prototype, "focus")
        .mockImplementation(function record() {
          focused.push(this);
        });
      try {
        getAnswers.mockResolvedValue([
          { key: "deleted|Location||Pool", answer: "deleted" },
          { key: "deleted|Group|Main|Bunk 2", answer: "deleted" },
          { key: "deleted|Activity||Art", answer: "deleted" }
        ]);
        const element = await renderWith({
          ...WITH_WEEK,
          programs: [
            {
              program: {
                Id: "p1",
                Name: "Main",
                Monday__c: true,
                Tuesday__c: true,
                Wednesday__c: true,
                Thursday__c: true,
                Friday__c: true
              },
              timeBlocks: [],
              divisions: [
                {
                  division: { Id: "d1", Name: "Juniors" },
                  groups: [{ Id: "g1", Name: "Bunk 1" }]
                },
                { division: { Id: "d2", Name: "Seniors" }, groups: [] }
              ],
              fixedActivities: [],
              recurringActivities: []
            }
          ]
        });
        const rows = [
          "Time,Bunk 1,Bunk 2",
          "9:00-9:45,Swim (Pool),Art",
          "10:00-10:45,Art,Swim (Pool)",
          "12:00-12:45,Lunch,Lunch"
        ].join("\n");
        await choose(element, ["Monday.csv", "Tuesday.csv"], {
          "Monday.csv": rows,
          "Tuesday.csv": rows
        });
        const bringBack = (key) => $(element, `[data-deleted="${key}"] button`);
        // The clicked button is gone with the item (WCAG 2.4.3). The last one: the one before it.
        bringBack("deleted|Location||Pool").click();
        await flush();
        expect(focused.pop()).toBe(bringBack("deleted|Group|Main|Bunk 2"));
        // Art comes back as an activity, with nothing to ask: on to the next Bring back.
        bringBack("deleted|Activity||Art").click();
        await flush();
        expect(focused.pop()).toBe(bringBack("deleted|Group|Main|Bunk 2"));
        // Bunk 2 back opens its division, the question that takes the cursor.
        bringBack("deleted|Group|Main|Bunk 2").click();
        await flush();
        expect(focused.pop()).toBe(
          $(element, 'lightning-combobox[data-id="division|Bunk 2"]')
        );
        expect($(element, "[data-deleted]")).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });

    it("an activity deleted before is left out until Bring back", async () => {
      getAnswers.mockResolvedValue([
        { key: "deleted|Activity||Art", answer: "deleted" }
      ]);
      const element = await renderWith(WITH_WEEK);
      // Art for everyone at 9:00, and once more for Bunk 2 on Tuesday: a question once back.
      const rows = (bunk2) =>
        [
          "Time,Bunk 1,Bunk 2",
          "9:00-9:45,Art,Art",
          "10:00-10:45,Lunch,Lunch",
          `11:00-11:45,Swim,${bunk2}`
        ].join("\n");
      await choose(element, ["Monday.csv", "Tuesday.csv"], {
        "Monday.csv": rows("Swim"),
        "Tuesday.csv": rows("Art")
      });
      expect(
        $(element, '[data-deleted="deleted|Activity||Art"]').textContent
      ).toContain("Art");
      const focus = jest.spyOn(HTMLElement.prototype, "focus");
      try {
        $(element, '[data-deleted="deleted|Activity||Art"] button').click();
        await flush();
        expect($(element, "[data-deleted]")).toBeNull();
        // Art back opens its question (set time or activity?), on the same page: the cursor
        // goes to its first choice.
        expect(
          focus.mock.contexts.pop().closest("[data-card]").dataset.card
        ).toBe("kind|Art");
      } finally {
        focus.mockRestore();
      }
    });

    it("the summary says where last year's schedule went, and the import can be undone", async () => {
      getAnswers.mockResolvedValue([
        { key: "similar|activity|music|musik|Music|Musik", answer: "a" }
      ]);
      saveSetup.mockResolvedValue({
        added: { Version: 1 },
        changed: {},
        importId: "im1"
      });
      undoImport.mockResolvedValue({
        removed: 30,
        restored: 0,
        keptEdited: [],
        keptInUse: []
      });
      LightningConfirm.open = jest.fn().mockResolvedValue(true);
      const element = await renderWith(WITH_WEEK);
      await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
      add(element).click();
      await flush();
      const plan = JSON.parse(saveSetup.mock.calls[0][0].plan);
      expect(plan.versions).toHaveLength(1);
      expect(plan.remember.map((r) => r.key)).toContain(
        "similar|activity|music|musik|Music|Musik"
      );
      const version = $(element, '[data-id="version"]');
      expect(version.textContent).toContain(
        "Imported from maple-grove-2026-all-camp.xlsx"
      );
      expect(version.textContent).toContain("Week 1 (Main)");
      expect(version.textContent).toContain("Open it on Saved versions");
      // Last year's schedule drawn small beside its words, hidden from screen readers.
      const mini = version.querySelector(".mini");
      expect(mini.getAttribute("aria-hidden")).toBe("true");
      expect(mini.querySelectorAll(".mini-cell").length).toBeGreaterThan(0);
      $(element, 'button[data-id="undo"]').click();
      await flush();
      expect(undoImport).toHaveBeenCalledWith({ importId: "im1" });
      expect($(element, '[data-id="undone"]').textContent).toBe(
        "Import undone. Removed 30 things it added."
      );
      expect($(element, 'button[data-id="undo"]')).toBeNull();
    });
  });
});
