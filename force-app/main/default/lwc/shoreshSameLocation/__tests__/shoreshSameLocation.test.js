import { createElement } from "lwc";
import ShoreshSameLocation from "c/shoreshSameLocation";
import { buildTerms } from "c/shoreshTerms";

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  {
    term: "Activity",
    singular: "Activity",
    plural: "Activities",
    isCustom: false
  },
  {
    term: "GroupsThatFit",
    singular: "Bunks that fit",
    plural: "Bunks that fit",
    isCustom: true
  }
]);

const PLACES = [
  { id: "l1", name: "Pool", fits: 1, activities: 2 },
  { id: "l2", name: "pool ", fits: 3, activities: 2 },
  { id: "l3", name: "POOL", fits: 2, activities: 0 }
];

const flush = () => Promise.resolve();

function render(props = {}) {
  const element = createElement("c-shoresh-same-location", {
    is: ShoreshSameLocation
  });
  Object.assign(element, { terms, places: PLACES, ...props });
  document.body.appendChild(element);
  return element;
}

const $ = (element, id) =>
  element.shadowRoot.querySelector(`[data-id="${id}"]`);

describe("c-shoresh-same-location", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("asks which place to keep, each with what fits and happens there", async () => {
    const element = render();
    await flush();
    expect($(element, "same-location").textContent).toContain("Same location?");
    expect($(element, "keep").options.map((o) => o.label)).toEqual([
      "Pool · 1 Bunk at once · 2 activities here",
      "pool  · 3 Bunks at once · 2 activities here",
      "POOL · 2 Bunks at once · 0 activities here"
    ]);
    // Most activities first, then the most that fit; groups that fit start at the most.
    expect($(element, "keep").value).toBe("l2");
    expect($(element, "fits").value).toBe(3);
    expect($(element, "fits").label).toBe("Bunks that fit");
  });

  it("Merge keeps the chosen place and the number typed", async () => {
    const element = render();
    const merge = jest.fn();
    element.addEventListener("merge", merge);
    await flush();
    $(element, "keep").dispatchEvent(
      new CustomEvent("change", { detail: { value: "l1" } })
    );
    $(element, "fits").dispatchEvent(
      new CustomEvent("change", { detail: { value: "2" } })
    );
    $(element, "fits").reportValidity = () => true;
    await flush();
    $(element, "merge").click();
    expect(merge.mock.calls[0][0].detail).toEqual({
      keepId: "l1",
      otherIds: ["l2", "l3"],
      groupsThatFit: 2
    });
  });

  it("a blank number is not merged", async () => {
    const element = render();
    const merge = jest.fn();
    element.addEventListener("merge", merge);
    await flush();
    $(element, "fits").reportValidity = () => false;
    $(element, "merge").click();
    expect(merge).not.toHaveBeenCalled();
  });

  it("Keep separate and Escape leave the places as they are", async () => {
    const element = render();
    const close = jest.fn();
    element.addEventListener("close", close);
    await flush();
    $(element, "keep-separate").click();
    $(element, "same-location").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("Tab stays inside the question", async () => {
    const element = render();
    await flush();
    const merge = $(element, "merge");
    merge.focus();
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true
    });
    const keep = $(element, "keep");
    keep.focus = jest.fn();
    merge.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(keep.focus).toHaveBeenCalled();
  });

  it("shows why a merge was refused", async () => {
    const element = render({ error: '"Pool" fits 1 Bunk at once …' });
    await flush();
    expect($(element, "refusal").textContent.trim()).toBe(
      '"Pool" fits 1 Bunk at once …'
    );
  });
});
