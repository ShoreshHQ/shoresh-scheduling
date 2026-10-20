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
    `lightning-input[data-term="${term}"][data-field="${field}"]`
  );
}

describe("c-shoresh-camp-labels", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("shows the camp words already chosen and leaves the others blank", async () => {
    const element = await render();
    expect(input(element, "Group", "singular").value).toBe("Bunk");
    expect(input(element, "Division", "singular").value).toBe("");
    expect(element.shadowRoot.textContent).toContain("Words Camp Willow uses");
  });

  /** Types into a box, as a director would. */
  function type(element, term, field, value) {
    const box = input(element, term, field);
    box.value = value;
    box.dispatchEvent(new CustomEvent("change", { detail: { value } }));
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
    expect(element.shadowRoot.querySelectorAll("lightning-button").length).toBe(
      0
    );
  });

  it("saves what the scheduler typed when they leave the box, and says Saved quietly", async () => {
    saveCampLabels.mockResolvedValue();
    const element = await render();
    const saved = jest.fn();
    element.addEventListener("saved", saved);

    type(element, "Division", "singular", "Unit");
    // Moving between boxes of one word saves each time something changed.
    leave(element, "Division", "singular");
    await flush();
    type(element, "Division", "plural", "Units");
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
    type(element, "Group", "singular", "Cabin");
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
    type(element, "Group", "singular", "Cabin");
    leave(element, "Group", "singular");
    type(element, "Group", "plural", "Cabins");
    leave(element, "Group", "plural");
    await flush();
    expect(saveCampLabels).toHaveBeenCalledTimes(1);
    finish();
    await flush();
    expect(saveCampLabels).toHaveBeenCalledTimes(2);
    const words = (call) =>
      saveCampLabels.mock.calls[call][0].labels.find((r) => r.term === "Group");
    expect(words(0)).toMatchObject({ singular: "Cabin", plural: "Bunks" });
    expect(words(1)).toMatchObject({ singular: "Cabin", plural: "Cabins" });
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
    element.addEventListener("saved", saved);
    type(element, "Division", "singular", "Unit");
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
    expect(input(element, "Division", "singular").value).toBe("Unit");
    expect(savedMark(element).textContent).toBe("");
    // Fixing it and leaving again sends it, and the message goes.
    type(element, "Division", "plural", "Units");
    leave(element, "Division", "plural");
    await flush();
    expect(saveCampLabels).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot.querySelector("[data-error]")).toBeNull();
  });

  it("explains, and blocks saving, when this person cannot change the camp words", async () => {
    const element = await render(
      "Your Salesforce admin has limited who can change this camp."
    );
    expect(
      element.shadowRoot.querySelector('[data-id="read-only"]').textContent
    ).toContain("Your Salesforce admin has limited who can change this camp.");
    expect(input(element, "Group", "singular").disabled).toBe(true);
    leave(element, "Group", "singular");
    await flush();
    expect(saveCampLabels).not.toHaveBeenCalled();
  });

  it("focusHeading puts the cursor on the screen's heading", async () => {
    const element = await render();
    element.focusHeading();
    expect(element.shadowRoot.activeElement).toBe(
      element.shadowRoot.querySelector("[data-heading]")
    );
  });
});
