import { createElement } from "lwc";
import ShoreshBuildPalette from "c/shoreshBuildPalette";

// From the week editor's counts.js: Soccer under its goal first, then Swim (over) and Boating.
const TILES = [
  {
    id: "a3",
    name: "Soccer",
    under: true,
    over: false,
    words: "1 of 4",
    said: "Soccer, 1 of 4"
  },
  {
    id: "a1",
    name: "Swim",
    under: false,
    over: true,
    words: "3 of 2",
    said: "Swim, 3 of 2, Over its weekly limit"
  },
  {
    id: "a2",
    name: "Boating",
    under: false,
    over: false,
    words: "0 placed",
    said: "Boating, 0 placed"
  }
];

function render(props = {}) {
  const element = createElement("c-shoresh-build-palette", {
    is: ShoreshBuildPalette
  });
  Object.assign(element, {
    tiles: TILES,
    under: 3,
    columns: 7,
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
const flush = () => Promise.resolve();

describe("c-shoresh-build-palette (the drawer)", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("says N under in the time column, then one tile per activity on the grid's columns, its name only", () => {
    const element = render();
    expect(q(element, '[data-id="drawer-under"]').textContent).toBe("3under");
    expect(
      q(element, '[data-id="drawer-tiles"]').getAttribute("style")
    ).toContain("grid-template-columns: repeat(7, minmax(0, 1fr))");
    expect(qa(element, ".tile-name").map((n) => n.textContent)).toEqual([
      "Soccer",
      "Swim",
      "Boating"
    ]);
    // At rest, no numbers on a tile (decision 41); a screen reader hears them always.
    expect(qa(element, '[data-id="tile-words"]')).toEqual([]);
    expect(q(element, 'button[data-id="a3"]').getAttribute("aria-label")).toBe(
      "Soccer, 1 of 4"
    );
    expect(q(element, 'button[data-id="a1"]').getAttribute("draggable")).toBe(
      "true"
    );
    expect(
      q(element, '[data-id="palette-filter"]').getAttribute("aria-label")
    ).toBe("Filter activities");
  });

  it("an over-scheduled tile carries the needs-a-look corner, and only it", () => {
    const element = render();
    expect(
      q(element, 'button[data-id="a1"]').querySelector(".shoresh-look-mark")
    ).not.toBeNull();
    expect(
      q(element, 'button[data-id="a3"]').querySelector(".shoresh-look-mark")
    ).toBeNull();
  });

  it("on hover or focus a tile shows placed of goal, and says which activity to outline", async () => {
    const element = render();
    const hovers = jest.fn();
    element.addEventListener("tilehover", hovers);
    const soccer = q(element, 'button[data-id="a3"]');
    soccer.dispatchEvent(new CustomEvent("mouseenter"));
    await flush();
    expect(soccer.querySelector('[data-id="tile-words"]').textContent).toBe(
      "1 of 4"
    );
    soccer.dispatchEvent(new CustomEvent("mouseleave"));
    await flush();
    expect(soccer.querySelector('[data-id="tile-words"]')).toBeNull();
    const swim = q(element, 'button[data-id="a1"]');
    swim.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(swim.querySelector('[data-id="tile-words"]').textContent).toBe(
      "3 of 2"
    );
    expect(hovers.mock.calls.map((c) => c[0].detail.id)).toEqual([
      "a3",
      null,
      "a1"
    ]);
  });

  it("a held tile is pressed, outlined, and keeps its numbers showing", () => {
    const element = render({ pickedId: "a2" });
    const boating = q(element, 'button[data-id="a2"]');
    expect(boating.getAttribute("aria-pressed")).toBe("true");
    expect(boating.className).toContain("tile_held");
    expect(boating.querySelector('[data-id="tile-words"]').textContent).toBe(
      "0 placed"
    );
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
    const element = render({ tiles: [], filter: "zz" });
    expect(q(element, ".no-matches").textContent).toBe("No matches");
    // A camp with no activities and nothing typed says nothing.
    const empty = render({ tiles: [] });
    expect(q(empty, ".no-matches")).toBeNull();
  });

  it("Ctrl+Z or Cmd+Shift+Z in Filter stays in the box: no schedule Undo around it", () => {
    const element = render();
    const outside = jest.fn();
    element.addEventListener("keydown", outside);
    const filter = q(element, '[data-id="palette-filter"]');
    const press = (key, extra) =>
      filter.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          composed: true,
          ...extra
        })
      );
    press("z", { ctrlKey: true });
    press("Z", { metaKey: true, shiftKey: true });
    press("y", { ctrlKey: true });
    expect(outside).not.toHaveBeenCalled();
    press("s");
    expect(outside).toHaveBeenCalledTimes(1);
  });

  it("is accessible", async () => {
    const element = render({ pickedId: "a1" });
    await expect(element).toBeAccessible();
  });
});
