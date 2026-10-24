import { createElement } from "lwc";
import ShoreshCampLabels from "c/shoreshCampLabels";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import saveCampLabels from "@salesforce/apex/SeasonSetupController.saveCampLabels";
import campWordsBlockedReason from "@salesforce/apex/SeasonSetupController.campWordsBlockedReason";

jest.mock(
  "@salesforce/apex/SeasonSetupController.getLabels",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SeasonSetupController.campWordsBlockedReason",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SeasonSetupController.saveCampLabels",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const LABELS = [
  {
    term: "Group",
    modelSingular: "Group",
    modelPlural: "Groups",
    singular: "Bunk",
    plural: "Bunks",
    isCustom: true,
    labelId: "a01"
  },
  {
    term: "Division",
    modelSingular: "Division",
    modelPlural: "Divisions",
    singular: "Division",
    plural: "Divisions",
    isCustom: false,
    labelId: null
  },
  {
    term: "Elective",
    modelSingular: "Elective",
    modelPlural: "Electives",
    singular: "Elective",
    plural: "Electives",
    isCustom: false,
    labelId: null
  },
  {
    term: "ElectiveSet",
    modelSingular: "Elective set",
    modelPlural: "Elective sets",
    singular: "Chug",
    plural: "Chugim",
    isCustom: true,
    labelId: "a02"
  },
  {
    term: "Version",
    modelSingular: "Version",
    modelPlural: "Versions",
    singular: "Version",
    plural: "Versions",
    isCustom: false,
    labelId: null
  }
];

// Lets pending (mocked) server calls and re-renders finish before checking the screen.
const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(blockedReason = null) {
  getLabels.mockResolvedValue(LABELS);
  campWordsBlockedReason.mockResolvedValue(blockedReason);
  const element = createElement("c-shoresh-camp-labels", {
    is: ShoreshCampLabels
  });
  element.campId = "camp1";
  element.campName = "Camp Willow";
  document.body.appendChild(element);
  await flush();
  return element;
}

function input(element, term, field) {
  return element.shadowRoot.querySelector(
    `input[data-term="${term}"][data-field="${field}"]`
  );
}

describe("c-shoresh-camp-labels", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("shows one box per word: the camp's own dark, the standard one quiet in the box", async () => {
    const element = await render();
    expect(input(element, "Group", "singular").value).toBe("Bunk");
    expect(input(element, "Group", "singular").className).toContain(
      "word-box_own"
    );
    expect(input(element, "Division", "singular").value).toBe("");
    // The standard word shows, quietly, in the box until the camp types its own.
    expect(input(element, "Division", "singular").placeholder).toBe("Division");
    expect(input(element, "Division", "singular").className).not.toContain(
      "word-box_own"
    );
    // A standard word has no plural beside it.
    expect(input(element, "Division", "plural")).toBeNull();
    // Each box is named for screen readers.
    expect(input(element, "Group", "singular").getAttribute("aria-label")).toBe(
      "Group"
    );
    expect(input(element, "Group", "plural").getAttribute("aria-label")).toBe(
      "Group, more than one"
    );
    // The rail: how many words are the camp's own.
    expect(
      element.shadowRoot.querySelector('[data-id="count"]').textContent
    ).toBe("2 changed");
    expect(
      element.shadowRoot.querySelector("[data-heading]").textContent.trim()
    ).toBe("Camp words");
  });

  it("guesses the plural beside the camp's word, and keeps a plural typed over the guess", async () => {
    const element = await render();
    // Bunks is what the guess gives: shown as the guess, so it follows the word.
    expect(input(element, "Group", "plural").value).toBe("");
    expect(input(element, "Group", "plural").placeholder).toBe("Bunks");
    // Chugim is not: shown as typed.
    expect(input(element, "ElectiveSet", "plural").value).toBe("Chugim");
    expect(input(element, "ElectiveSet", "plural").className).toContain(
      "plural-box_typed"
    );
  });

  it("puts the words in sections, as the menu groups the screens", async () => {
    const element = await render();
    const sections = [
      ...element.shadowRoot.querySelectorAll("[data-section]")
    ].map((section) => ({
      title: section.querySelector("h3").textContent,
      terms: [...section.querySelectorAll("[data-term]")]
        .filter((el) => el.tagName === "LI")
        .map((el) => el.dataset.term)
    }));
    expect(sections).toEqual([
      { title: "Camp", terms: ["Group", "Division"] },
      { title: "Electives", terms: ["Elective", "ElectiveSet"] },
      { title: "Schedules", terms: ["Version"] }
    ]);
  });

  /** Types into a box, as a director would. */
  async function type(element, term, field, value) {
    const box = input(element, term, field);
    box.value = value;
    box.dispatchEvent(new CustomEvent("input"));
    await flush();
  }
  /** Leaves a box (the cursor goes elsewhere on the page). */
  function leave(element, term, field) {
    input(element, term, field).dispatchEvent(new CustomEvent("focusout"));
  }
  const savedMark = (element) =>
    element.shadowRoot
      .querySelector("c-shoresh-saved-mark")
      .shadowRoot.querySelector('[data-id="saved"]');

  it("has no Save or Cancel buttons: words save as you go", async () => {
    const element = await render();
    expect(element.shadowRoot.querySelectorAll("button").length).toBe(0);
  });

  it("saves what the scheduler typed when they leave the box, and says Saved quietly", async () => {
    saveCampLabels.mockResolvedValue();
    const element = await render();
    const saved = jest.fn();
    element.addEventListener("saved", saved);

    await type(element, "Division", "singular", "Unit");
    // Moving between boxes of one word saves each time something changed.
    leave(element, "Division", "singular");
    await flush();
    await type(element, "Division", "plural", "Units");
    await flush();
    expect(savedMark(element).textContent).toBe("");
    leave(element, "Division", "plural");
    await flush();

    expect(saveCampLabels).toHaveBeenCalledTimes(2);
    const sent = saveCampLabels.mock.calls[1][0];
    expect(sent.campId).toBe("camp1");
    expect(sent.labels.find((r) => r.term === "Division")).toMatchObject({
      singular: "Unit",
      plural: "Units"
    });
    expect(sent.labels.find((r) => r.term === "Group")).toMatchObject({
      singular: "Bunk",
      plural: "Bunks",
      labelId: "a01"
    });
    expect(saved).toHaveBeenCalledTimes(2);
    const mark = savedMark(element);
    expect(mark.getAttribute("role")).toBe("status");
    expect(mark.textContent).toContain("Saved");
  });

  it("leaving a box with nothing changed sends nothing; Enter saves too", async () => {
    saveCampLabels.mockResolvedValue();
    const element = await render();
    leave(element, "Group", "singular");
    await flush();
    expect(saveCampLabels).not.toHaveBeenCalled();
    await type(element, "Group", "singular", "Cabin");
    input(element, "Group", "singular").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter" })
    );
    await flush();
    expect(saveCampLabels).toHaveBeenCalledTimes(1);
  });

  it("saves one at a time, each with the words as they were then", async () => {
    let finish;
    saveCampLabels.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    saveCampLabels.mockResolvedValue();
    const element = await render();
    await type(element, "Group", "singular", "Cabin");
    leave(element, "Group", "singular");
    await type(element, "Group", "plural", "Cabinim");
    leave(element, "Group", "plural");
    await flush();
    expect(saveCampLabels).toHaveBeenCalledTimes(1);
    finish();
    await flush();
    expect(saveCampLabels).toHaveBeenCalledTimes(2);
    const words = (call) =>
      saveCampLabels.mock.calls[call][0].labels.find((r) => r.term === "Group");
    // The first went with the guess, the second with the plural typed over it.
    expect(words(0)).toMatchObject({ singular: "Cabin", plural: "Cabins" });
    expect(words(1)).toMatchObject({ singular: "Cabin", plural: "Cabinim" });
  });

  it("guesses as the word is typed, and sends the guess when no plural is typed", async () => {
    saveCampLabels.mockResolvedValue();
    const element = await render();
    await type(element, "Division", "singular", "Unit");
    expect(input(element, "Division", "plural").placeholder).toBe("Units");
    expect(
      element.shadowRoot.querySelector('[data-id="count"]').textContent
    ).toBe("3 changed");
    await type(element, "Division", "singular", "Edah");
    expect(input(element, "Division", "plural").placeholder).toBe("Edahs");
    leave(element, "Division", "singular");
    await flush();
    const sent = saveCampLabels.mock.calls[0][0].labels;
    expect(sent.find((r) => r.term === "Division")).toMatchObject({
      singular: "Edah",
      plural: "Edahs"
    });
    // A word left standard goes as blank: the server keeps the standard word.
    expect(sent.find((r) => r.term === "Version")).toMatchObject({
      singular: "",
      plural: ""
    });
    // Only what the server reads is sent.
    expect(Object.keys(sent[0]).sort()).toEqual([
      "labelId",
      "modelPlural",
      "modelSingular",
      "plural",
      "singular",
      "term"
    ]);
  });

  it("electives are a camp word too, the plural guessed and typed over (wiki decision 66)", async () => {
    saveCampLabels.mockResolvedValue();
    const element = await render();
    expect(input(element, "Elective", "singular").placeholder).toBe("Elective");
    await type(element, "Elective", "singular", "Chug");
    expect(input(element, "Elective", "plural").placeholder).toBe("Chugs");
    await type(element, "Elective", "plural", "Chugim");
    leave(element, "Elective", "plural");
    await flush();
    const sent = saveCampLabels.mock.calls[0][0].labels;
    expect(sent.find((r) => r.term === "Elective")).toMatchObject({
      singular: "Chug",
      plural: "Chugim"
    });
  });

  it("keeps a plural typed over the guess when the word changes after", async () => {
    saveCampLabels.mockResolvedValue();
    const element = await render();
    await type(element, "ElectiveSet", "singular", "Chugi");
    expect(input(element, "ElectiveSet", "plural").value).toBe("Chugim");
    leave(element, "ElectiveSet", "singular");
    await flush();
    expect(
      saveCampLabels.mock.calls[0][0].labels.find(
        (r) => r.term === "ElectiveSet"
      )
    ).toMatchObject({ singular: "Chugi", plural: "Chugim", labelId: "a02" });
  });

  it("clearing the word puts the standard word back, its plural with it", async () => {
    saveCampLabels.mockResolvedValue();
    const element = await render();
    await type(element, "ElectiveSet", "singular", "");
    expect(input(element, "ElectiveSet", "plural")).toBeNull();
    leave(element, "ElectiveSet", "singular");
    await flush();
    expect(
      saveCampLabels.mock.calls[0][0].labels.find(
        (r) => r.term === "ElectiveSet"
      )
    ).toMatchObject({ singular: "", plural: "", labelId: "a02" });
    // Typed again, the plural is the guess, not the one cleared.
    await type(element, "ElectiveSet", "singular", "Chug");
    expect(input(element, "ElectiveSet", "plural").value).toBe("");
    expect(input(element, "ElectiveSet", "plural").placeholder).toBe("Chugs");
  });

  it("a refusal shows under the box left, in camp words, and the typing stays to save again", async () => {
    saveCampLabels.mockRejectedValueOnce({
      body: {
        message:
          'Give "Division" both a singular and a plural word, or clear both.'
      }
    });
    saveCampLabels.mockResolvedValue();
    const element = await render();
    const saved = jest.fn();
    const failed = jest.fn();
    element.addEventListener("saved", saved);
    element.addEventListener("failed", failed);
    await type(element, "Division", "singular", "Unit");
    leave(element, "Division", "singular");
    await flush();
    const why = element.shadowRoot.querySelector(
      '[data-error="Division"][data-field-error="singular"]'
    );
    expect(why.textContent).toContain(
      "Camp words not saved. Your changes are still here."
    );
    expect(why.textContent).toContain("both a singular and a plural word");
    expect(why.getAttribute("role")).toBe("alert");
    expect(saved).not.toHaveBeenCalled();
    // The setup page hears why too, to say it at the top if camp words is no longer showing.
    expect(failed.mock.calls[0][0].detail.message).toBe(why.textContent.trim());
    expect(input(element, "Division", "singular").value).toBe("Unit");
    expect(savedMark(element).textContent).toBe("");
    // Fixing it and leaving again sends it, and the message goes.
    await type(element, "Division", "plural", "Units");
    leave(element, "Division", "plural");
    await flush();
    expect(saveCampLabels).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot.querySelector("[data-error]")).toBeNull();
  });

  it("explains, and blocks saving, when this person cannot change the camp words", async () => {
    const element = await render(
      "You can't edit this camp, so its words are view only."
    );
    expect(
      element.shadowRoot.querySelector('[data-id="read-only"]').textContent
    ).toContain("You can't edit this camp, so its words are view only.");
    expect(input(element, "Group", "singular").disabled).toBe(true);
    leave(element, "Group", "singular");
    await flush();
    expect(saveCampLabels).not.toHaveBeenCalled();
  });

  it("a word typed for the first time and then put back is removed: its new record is sent", async () => {
    saveCampLabels.mockResolvedValue();
    const element = await render();
    // Saved, the server now holds Unit as Division's record a03.
    getLabels.mockResolvedValue(
      LABELS.map((row) => {
        if (row.term !== "Division") {
          return row;
        }
        return {
          ...row,
          singular: "Unit",
          plural: "Units",
          isCustom: true,
          labelId: "a03"
        };
      })
    );
    await type(element, "Division", "singular", "Unit");
    leave(element, "Division", "singular");
    await flush();
    await type(element, "Division", "singular", "");
    leave(element, "Division", "singular");
    await flush();
    const division = (call) =>
      saveCampLabels.mock.calls[call][0].labels.find(
        (r) => r.term === "Division"
      );
    expect(division(0)).toMatchObject({ singular: "Unit", labelId: null });
    expect(division(1)).toMatchObject({
      singular: "",
      plural: "",
      labelId: "a03"
    });
    // What is on screen stays as typed.
    expect(input(element, "Division", "singular").value).toBe("");
  });

  it("is accessible", async () => {
    const element = await render();
    await expect(element).toBeAccessible();
  });

  it("focusHeading puts the cursor on the screen's heading", async () => {
    const element = await render();
    element.focusHeading();
    expect(element.shadowRoot.activeElement).toBe(
      element.shadowRoot.querySelector("[data-heading]")
    );
  });
});
