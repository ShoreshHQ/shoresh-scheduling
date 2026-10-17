import { createElement } from "lwc";
import ShoreshBuildPalette from "c/shoreshBuildPalette";

const NEEDED = [
  { id: "a3", name: "Soccer", label: "1 placed (needs 4–6)", over: false }
];
const PLACED = [
  { id: "a1", name: "Swim", label: "3 placed (needs 1–2)", over: true },
  { id: "a2", name: "Boating", label: "0 placed", over: false }
];

function render(props = {}) {
  const element = createElement("c-shoresh-build-palette", {
    is: ShoreshBuildPalette
  });
  Object.assign(element, {
    stillNeeded: NEEDED,
    placed: PLACED,
    heading: "Activities",
    ...props
  });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

describe("c-shoresh-build-palette", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("lists what is still needed first, then the rest, with counts", () => {
    const element = render();
    expect(
      qa(element, '[data-id="palette-needed"] .chip-name').map(
        (n) => n.textContent
      )
    ).toEqual(["Soccer"]);
    expect(
      qa(element, '[data-id="palette-placed"] .chip-count').map((n) =>
        n.textContent.trim()
      )
    ).toEqual(["3 placed (needs 1–2)", "0 placed"]);
    expect(q(element, ".zone-line")).not.toBeNull();
    // Over its weekly limit: the bronze dot, never blocked.
    const swim = q(element, 'button[data-id="a1"]');
    expect(swim.querySelector(".dot")).not.toBeNull();
    expect(swim.getAttribute("draggable")).toBe("true");
    expect(
      q(element, '[data-id="palette-filter"]').getAttribute("aria-label")
    ).toBe("Filter activities");
  });

  it("picks an activity, drags one, takes a dropped placement, and filters", () => {
    const element = render({ pickedId: "a2" });
    const picks = jest.fn();
    const drags = jest.fn();
    const removes = jest.fn();
    const filters = jest.fn();
    element.addEventListener("pickactivity", picks);
    element.addEventListener("activitydragstart", drags);
    element.addEventListener("removedrop", removes);
    element.addEventListener("filter", filters);
    expect(
      q(element, 'button[data-id="a2"]').getAttribute("aria-pressed")
    ).toBe("true");
    q(element, 'button[data-id="a3"]').click();
    expect(picks.mock.calls[0][0].detail).toEqual({ id: "a3" });
    q(element, 'button[data-id="a1"]').dispatchEvent(
      new CustomEvent("dragstart")
    );
    expect(drags.mock.calls[0][0].detail).toEqual({ id: "a1" });
    q(element, '[data-id="palette"]').dispatchEvent(new CustomEvent("drop"));
    expect(removes).toHaveBeenCalled();
    const input = q(element, '[data-id="palette-filter"]');
    input.value = "sw";
    input.dispatchEvent(new CustomEvent("input"));
    expect(filters.mock.calls[0][0].detail).toEqual({ value: "sw" });
  });

  it("says No matches when the filter finds nothing", () => {
    const element = render({ stillNeeded: [], placed: [] });
    expect(q(element, ".no-matches").textContent).toBe("No matches");
  });
});
