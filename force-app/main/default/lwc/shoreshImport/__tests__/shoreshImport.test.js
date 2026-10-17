import { createElement } from "lwc";
import { readFileSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";
import ShoreshImport from "c/shoreshImport";
import saveSetup from "@salesforce/apex/ImportController.saveSetup";
import { buildTerms } from "c/shoreshTerms";

jest.mock(
  "@salesforce/apex/ImportController.saveSetup",
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

/** A file as the browser hands it over. */
function file(name) {
  const bytes = readFileSync(join(SAMPLES, name));
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
  element.setup = SETUP;
  element.terms = buildTerms([]);
  document.body.appendChild(element);
  await flush();
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

async function choose(element, names) {
  const input = $(element, 'input[data-id="files"]');
  Object.defineProperty(input, "files", {
    value: names.map(file),
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
      "Two things at Lunch for Bunk 1."
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
});
