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
  const button = $$(element, `[data-card="${cardId}"] lightning-button`).find(
    (b) => b.dataset.key === `${cardId}::${value}`
  );
  button.click();
  await flush();
}

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

  it("starts with the drop area, and says what it reads", async () => {
    const element = await render();
    expect($(element, '[data-id="drop"]').textContent).toContain(
      "Drop schedule here"
    );
    expect($(element, '[data-id="drop"]').textContent).toContain(
      ".xlsx · .xls · .csv"
    ); // The hidden file input is named, and the button is its only tab stop.
    const input = $(element, 'input[data-id="files"]');
    expect(input.getAttribute("aria-label")).toBe("Choose files");
    expect(input.getAttribute("tabindex")).toBe("-1");
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

  it("goes from the files to what was found, to the questions, to the save and its summary", async () => {
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);

    // What was found: nothing added yet.
    expect($(element, '[data-id="found"]').textContent).toContain(
      "Found in the file. Nothing added yet."
    );
    expect(
      $(
        element,
        'lightning-combobox[data-file="maple-grove-2026-all-camp.xlsx"]'
      ).value
    ).toBe("allCamp");
    const fixed = $(element, '[data-list="fixedActivities"]');
    expect(fixed.textContent).toContain("Lunch");
    expect($(element, '[data-list="noted"]').textContent).toContain("Chugim");

    // The similar names must be answered before the review.
    const review = $(element, 'lightning-button[data-id="review"]');
    expect(review.disabled).toBe(true);
    expect(review.label).toBe("Answer the choice above first");
    const similar = $(element, '[data-id="similar"] [data-card]').dataset.card;
    await answer(element, similar, "a");
    expect($(element, 'lightning-button[data-id="review"]').disabled).toBe(
      false
    );
    $(element, 'lightning-button[data-id="review"]').click();
    await flush();

    // The questions: every one needs an answer before saving.
    expect($(element, '[data-id="progress"]').textContent).toContain(
      "0 of 1 questions answered"
    );
    const save = () => $(element, 'lightning-button[data-id="save"]');
    expect(save().disabled).toBe(true);
    expect(save().label).toBe("1 question left");
    await answer(element, "kind|Library time", "recurring");
    expect($(element, '[data-id="progress"]').textContent).toContain(
      "1 of 1 questions answered"
    );
    expect(save().disabled).toBe(false);
    expect(save().label).toBe("Use this setup");

    const imported = jest.fn();
    element.addEventListener("imported", imported);
    save().click();
    await flush();
    await flush();
    const plan = JSON.parse(saveSetup.mock.calls[0][0].plan);
    expect(plan.seasonId).toBe("se1");
    expect(plan.groups).toHaveLength(6);
    expect(plan.activities.map((a) => a.name)).not.toContain("Musik");
    expect(imported).toHaveBeenCalled();

    // The summary.
    expect($(element, '[data-id="done"]').textContent).toContain(
      "Imported from maple-grove-2026-all-camp.xlsx."
    );
    expect($(element, '[data-id="added"]').textContent).toContain("6 groups");
    expect($(element, '[data-id="noted"]').textContent).toContain("Zoo trip");
  });

  it("keeps the cursor on the way: next question, Save, then the summary; and says what happens", async () => {
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
      const similar = $(element, '[data-id="similar"] [data-card]').dataset
        .card;
      await answer(element, similar, "a");
      // The only preview question answered: on to the step's main button.
      expect(focused.pop().dataset.id).toBe("review");
      // Change opens the card again, with the cursor on its first choice.
      $(
        element,
        `[data-card="${similar}"] lightning-button[data-id="${similar}"]`
      ).click();
      await flush();
      expect(focused.pop().closest("[data-card]").dataset.card).toBe(similar);
      await answer(element, similar, "a");
      $(element, 'lightning-button[data-id="review"]').click();
      await flush();
      expect(focused.pop().hasAttribute("data-heading")).toBe(true);
      await answer(element, "kind|Library time", "recurring");
      expect(focused.pop().dataset.id).toBe("save");
      $(element, 'lightning-button[data-id="save"]').click();
      await flush();
      await flush();
      expect(focused.pop().dataset.id).toBe("done");
      expect(status().textContent.trim()).toBe(
        "Imported from maple-grove-2026-all-camp.xlsx."
      );
      expect($(element, 'lightning-button[data-id="continue"]').label).toBe(
        "Back to Roots"
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("puts the cursor on its heading when the page opens it", async () => {
    const element = await render();
    element.focusHeading();
    expect(element.shadowRoot.activeElement).toBe($(element, "[data-heading]"));
  });

  it("lists what was left out for now after saving", async () => {
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
    const similar = $(element, '[data-id="similar"] [data-card]').dataset.card;
    await answer(element, similar, "leaveOut");
    $(element, 'lightning-button[data-id="review"]').click();
    await flush();
    await answer(element, "kind|Library time", "leaveOut");
    $(element, 'lightning-button[data-id="save"]').click();
    await flush();
    await flush();
    const leftOut = $(element, '[data-id="left-out"]').textContent;
    expect(leftOut).toContain("Music and Musik");
    expect(leftOut).toContain("Library time");
  });

  it("asks which file is right where two files disagree", async () => {
    const element = await render();
    await choose(element, [
      "maple-grove-2026-all-camp.xlsx",
      "Maple Grove 2026 - Bunk 3.csv"
    ]);
    const similar = $(element, '[data-id="similar"] [data-card]').dataset.card;
    await answer(element, similar, "a");
    $(element, 'lightning-button[data-id="review"]').click();
    await flush();
    const card = $$(element, "[data-card]").find((c) =>
      c.dataset.card.startsWith("cross|")
    );
    expect(card.textContent).toContain(
      "The files disagree about Bunk 3, Tuesday, Period 2. Which is right?"
    );
  });

  it("shows a save the server refused, and stays on the questions", async () => {
    saveSetup.mockRejectedValue({
      body: { message: "Two things at Lunch for Bunk 1." }
    });
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
    await answer(
      element,
      $(element, '[data-id="similar"] [data-card]').dataset.card,
      "a"
    );
    $(element, 'lightning-button[data-id="review"]').click();
    await flush();
    await answer(element, "kind|Library time", "activity");
    $(element, 'lightning-button[data-id="save"]').click();
    await flush();
    await flush();
    expect($(element, '[data-id="error"]').textContent).toBe(
      "Nothing was saved, and your answers are still here. Two things at Lunch for Bunk 1."
    );
    expect($(element, 'lightning-button[data-id="save"]')).not.toBeNull();
  });

  it("a changed answer can be taken back", async () => {
    const element = await render();
    await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
    const id = $(element, '[data-id="similar"] [data-card]').dataset.card;
    await answer(element, id, "a");
    expect($(element, `[data-card="${id}"]`).textContent).toContain(
      "✓ Same: call it"
    );
    $(element, `[data-card="${id}"] lightning-button[data-id="${id}"]`).click();
    await flush();
    expect($(element, 'lightning-button[data-id="review"]').disabled).toBe(
      true
    );
  });

  it("Use this setup waits for the choices on the preview too", async () => {
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
    expect($(element, 'lightning-button[data-id="review"]').disabled).toBe(
      true
    );
    // Even if the review were reached, the save waits.
    $(element, 'lightning-button[data-id="review"]').click();
    await flush();
    const save = $(element, 'lightning-button[data-id="save"]');
    expect(save === null || save.disabled).toBe(true);
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

    it("answers from an earlier import are filled in, marked remembered, and can be changed", async () => {
      getAnswers.mockResolvedValue([
        { key: "similar|activity|music|musik|Music|Musik", answer: "a" },
        { key: "kind|Library time", answer: "recurring" }
      ]);
      const element = await renderWith(WITH_WEEK);
      await choose(element, ["maple-grove-2026-all-camp.xlsx"]);
      expect(getAnswers).toHaveBeenCalledWith({ campId: "c1" });
      expect($(element, 'lightning-button[data-id="review"]').disabled).toBe(
        false
      );
      $(element, 'lightning-button[data-id="review"]').click();
      await flush();
      expect($(element, '[data-id="remembered"]').textContent).toBe(
        "2 answers remembered from an earlier import. Change any of them below."
      );
      expect(
        $(element, '[data-card="kind|Library time"]').textContent
      ).toContain("Remembered");
      expect($(element, 'lightning-button[data-id="save"]').label).toBe(
        "Use this setup"
      );
    });

    it("a place ticked at an earlier import is ticked again and marked remembered", async () => {
      getAnswers.mockResolvedValue([{ key: "place|Pool", answer: "add" }]);
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
      expect(pool.textContent).toContain("Remembered");
      const artRoom = $(element, '[data-place="place|Art room"]');
      expect(artRoom.querySelector("lightning-input").checked).toBe(false);
      expect(artRoom.textContent).not.toContain("Remembered");
      // Headed in the camp's word, with what it was named with in plain text: no help icon.
      const places = $(element, '[data-id="places"]');
      expect(places.querySelector(".import-section-label").textContent).toBe(
        "Locations"
      );
      expect(pool.querySelector("lightning-input").fieldLevelHelp).toBeFalsy();
      expect(pool.textContent).toContain("Swim");
      expect(places.querySelector("p")).toBeNull();
    });

    it("the summary says where last year's schedule went, and the import can be undone", async () => {
      getAnswers.mockResolvedValue([
        { key: "similar|activity|music|musik|Music|Musik", answer: "a" },
        { key: "kind|Library time", answer: "recurring" }
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
      $(element, 'lightning-button[data-id="review"]').click();
      await flush();
      $(element, 'lightning-button[data-id="save"]').click();
      await flush();
      const plan = JSON.parse(saveSetup.mock.calls[0][0].plan);
      expect(plan.versions).toHaveLength(1);
      expect(plan.remember.map((r) => r.key)).toContain("kind|Library time");
      expect($(element, '[data-id="version"]').textContent).toContain(
        "Imported from maple-grove-2026-all-camp.xlsx, for Week 1 (Main): open it on Schedules."
      );
      $(element, 'lightning-button[data-id="undo"]').click();
      await flush();
      expect(undoImport).toHaveBeenCalledWith({ importId: "im1" });
      expect($(element, '[data-id="undone"]').textContent).toBe(
        "Import undone. Removed 30 things it added."
      );
      expect($(element, 'lightning-button[data-id="undo"]')).toBeNull();
    });
  });
});
