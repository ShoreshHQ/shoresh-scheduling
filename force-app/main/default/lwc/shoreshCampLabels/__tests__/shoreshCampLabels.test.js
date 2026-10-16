import { createElement } from "lwc";
import ShoreshCampLabels from "c/shoreshCampLabels";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import saveCampLabels from "@salesforce/apex/SeasonSetupController.saveCampLabels";
import canEditCampWords from "@salesforce/apex/SeasonSetupController.canEditCampWords";

jest.mock(
  "@salesforce/apex/SeasonSetupController.getLabels",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SeasonSetupController.canEditCampWords",
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

async function render(canEdit = true) {
  getLabels.mockResolvedValue(LABELS);
  canEditCampWords.mockResolvedValue(canEdit);
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

  it("saves what the scheduler typed", async () => {
    saveCampLabels.mockResolvedValue();
    const element = await render();
    const saved = jest.fn();
    element.addEventListener("saved", saved);

    const singular = input(element, "Division", "singular");
    singular.value = "Unit";
    singular.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Unit" } })
    );
    const plural = input(element, "Division", "plural");
    plural.value = "Units";
    plural.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Units" } })
    );
    await flush();

    [...element.shadowRoot.querySelectorAll("lightning-button")]
      .find((b) => b.label === "Save words")
      .click();
    await flush();

    const sent = saveCampLabels.mock.calls[0][0];
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
    expect(saved).toHaveBeenCalled();
  });

  it("shows the reason when saving fails and stays open", async () => {
    saveCampLabels.mockRejectedValue({
      body: {
        message: 'Give "Week" both a singular and a plural word, or clear both.'
      }
    });
    const element = await render();
    const saved = jest.fn();
    element.addEventListener("saved", saved);
    [...element.shadowRoot.querySelectorAll("lightning-button")]
      .find((b) => b.label === "Save words")
      .click();
    await flush();
    expect(element.shadowRoot.textContent).toContain(
      "both a singular and a plural word"
    );
    expect(saved).not.toHaveBeenCalled();
  });

  it("explains, and blocks saving, when this person cannot change the camp words", async () => {
    const element = await render(false);
    expect(
      element.shadowRoot.querySelector('[data-id="read-only"]').textContent
    ).toContain("You don't have access to change these words.");
    expect(input(element, "Group", "singular").disabled).toBe(true);
    const save = [
      ...element.shadowRoot.querySelectorAll("lightning-button")
    ].find((b) => b.label === "Save words");
    expect(save.disabled).toBe(true);
  });
});
