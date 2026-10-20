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
    const section = $(element, "same-location");
    expect(section.getAttribute("role")).toBe("dialog");
    expect(section.getAttribute("aria-modal")).toBe("true");
    expect(section.getAttribute("aria-labelledby")).toBeTruthy();
    // One word for the idea: the camp's "Bunks that fit", in the list and on the number.
    expect($(element, "keep").options.map((o) => o.label)).toEqual([
      "Pool · Bunks that fit: 1 · 2 activities here",
      "pool  · Bunks that fit: 3 · 2 activities here",
      "POOL · Bunks that fit: 2 · 0 activities here"
    ]);
    // Most activities first, then the most that fit; groups that fit start at the most.
    expect($(element, "keep").value).toBe("l2");
    expect($(element, "fits").value).toBe(3);
    expect($(element, "fits").label).toBe("Bunks that fit");
  });

  it("starts on the choice to keep; a place with no number shows a dash, and the number starts at 1 or more", async () => {
    const focus = jest.spyOn(HTMLElement.prototype, "focus");
    const element = render({
      places: [
        { id: "l1", name: "Pool", activities: 0 },
        { id: "l2", name: "pool", fits: 0, activities: 0 }
      ]
    });
    await flush();
    const focused = focus.mock.contexts.map((el) => el.dataset.id);
    focus.mockRestore();
    expect(focused).toContain("keep");
    expect($(element, "keep").options[0].label).toBe(
      "Pool · Bunks that fit: — · 0 activities here"
    );
    expect($(element, "fits").value).toBe(1);
    // A blank number is sent as nothing (and the field refuses it).
    $(element, "fits").dispatchEvent(
      new CustomEvent("change", { detail: { value: "" } })
    );
    const merge = jest.fn();
    element.addEventListener("merge", merge);
    $(element, "fits").reportValidity = () => true;
    $(element, "merge").click();
    expect(merge.mock.calls[0][0].detail.groupsThatFit).toBeNull();
  });

  it("asked again after a refusal, the director's choice and number stay", async () => {
    const element = render();
    await flush();
    $(element, "keep").dispatchEvent(
      new CustomEvent("change", { detail: { value: "l3" } })
    );
    $(element, "fits").dispatchEvent(
      new CustomEvent("change", { detail: { value: "2" } })
    );
    element.places = [...PLACES];
    await flush();
    expect($(element, "keep").value).toBe("l3");
    expect($(element, "fits").value).toBe(2);
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

  it("while a merge is being made nothing more is sent, and the buttons keep the focus", async () => {
    const element = render({ busy: true });
    const close = jest.fn();
    const merge = jest.fn();
    element.addEventListener("close", close);
    element.addEventListener("merge", merge);
    await flush();
    $(element, "same-location").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    $(element, "merge").click();
    $(element, "keep-separate").click();
    expect(close).not.toHaveBeenCalled();
    expect(merge).not.toHaveBeenCalled();
    // aria-disabled, not disabled: a focused button that is disabled drops the focus.
    expect($(element, "merge").disabled).toBe(false);
    expect($(element, "merge").getAttribute("aria-disabled")).toBe("true");
  });

  it("Shift+Tab wraps backwards inside the question", async () => {
    const element = render();
    await flush();
    const keep = $(element, "keep");
    keep.focus = jest.fn();
    const merge = $(element, "merge");
    merge.focus = jest.fn();
    // From the first stop, Shift+Tab goes to the last.
    Object.defineProperty(element.shadowRoot, "activeElement", {
      configurable: true,
      get: () => keep
    });
    const back = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    $(element, "same-location").dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(merge.focus).toHaveBeenCalled();
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

  it("shows why a merge was refused, and takes the focus there", async () => {
    const element = render();
    await flush();
    const focus = jest.spyOn(HTMLElement.prototype, "focus");
    element.error = '"Pool" fits 1 Bunk at once …';
    await flush();
    const focused = focus.mock.contexts.map((el) => el.dataset.id);
    focus.mockRestore();
    expect(focused).toContain("refusal");
    expect($(element, "refusal").getAttribute("role")).toBe("alert");
    // The icon adds no words of its own ("Refused"): the reason follows it.
    expect(
      $(element, "refusal").querySelector("lightning-icon").alternativeText
    ).toBe("");
    expect($(element, "refusal-words").textContent.trim()).toBe(
      '"Pool" fits 1 Bunk at once …'
    );
  });
});
